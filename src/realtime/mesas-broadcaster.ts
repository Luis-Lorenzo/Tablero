import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { Store } from "express-session";
import { WebSocket, WebSocketServer } from "ws";
import type { AppConfig } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import { createSessionMiddleware } from "../lib/session.js";
import type {
  User,
  UserRepository
} from "../repositories/user.repository.js";
import type { MesasNotifier } from "./mesas-notifier.js";

const RUTA = "/ws";
const LATIDO_MS = 30_000;

/** Petición de upgrade con la sesión ya cargada por el middleware. */
interface PeticionConSesion extends IncomingMessage {
  session?: { userId?: string };
}

/** El middleware de sesión, visto como algo que solo nos interesa por `req`. */
type ParserSesion = (
  req: IncomingMessage,
  res: Record<string, never>,
  next: (error?: unknown) => void
) => void;

interface Dependencias {
  config: AppConfig;
  logger: Logger;
  sessionStore: Store;
  userRepository: UserRepository;
}

/**
 * Canal en vivo de la recepción sobre WebSocket.
 *
 * Comparte el servidor HTTP de Express y reutiliza el middleware de sesión para
 * reconocer la cookie httpOnly en el `upgrade` (que no pasa por los middlewares
 * de Express). Solo emite una señal de invalidación: los datos siguen viniendo
 * por REST.
 */
export class MesasBroadcaster implements MesasNotifier {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly parser: ParserSesion;
  private readonly vivos = new Set<WebSocket>();
  private readonly temporizador: NodeJS.Timeout;

  constructor(private readonly deps: Dependencias) {
    this.parser = createSessionMiddleware(
      deps.config.sessionSecret,
      deps.config.isProduction,
      deps.sessionStore
    ) as unknown as ParserSesion;

    this.wss.on("connection", socket => {
      this.vivos.add(socket);
      socket.on("pong", () => this.vivos.add(socket));
      socket.on("close", () => this.vivos.delete(socket));
      socket.on("error", error =>
        deps.logger.warn("Error en el canal en vivo", { message: error.message })
      );
    });

    this.temporizador = setInterval(() => this.latido(), LATIDO_MS);
    this.temporizador.unref();
  }

  /** Engancha el canal al servidor HTTP compartido con Express. */
  attach(server: Server): void {
    server.on("upgrade", (req, socket, head) => {
      void this.alUpgrade(req, socket, head);
    });
  }

  /** Señal de invalidación: no lleva datos, solo "vuelve a mirar". */
  notificarCambio(): void {
    const mensaje = JSON.stringify({ type: "mesas:changed" });

    for (const cliente of this.wss.clients) {
      if (cliente.readyState === WebSocket.OPEN) {
        cliente.send(mensaje);
      }
    }
  }

  /** Cierra el canal y libera el temporizador de latidos. */
  async close(): Promise<void> {
    clearInterval(this.temporizador);

    for (const cliente of this.wss.clients) {
      cliente.terminate();
    }

    await new Promise<void>(resolve => this.wss.close(() => resolve()));
  }

  private async alUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): Promise<void> {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    if (pathname !== RUTA) {
      // Otra ruta de upgrade: no es asunto nuestro.
      socket.destroy();
      return;
    }

    let usuario: User | undefined;
    try {
      usuario = await this.usuarioDe(req as PeticionConSesion);
    } catch (error) {
      this.deps.logger.warn("No se pudo leer la sesión del canal en vivo", {
        message: error instanceof Error ? error.message : String(error)
      });
    }

    if (!usuario) {
      this.rechazar(socket);
      return;
    }

    this.wss.handleUpgrade(req, socket, head, ws => {
      this.wss.emit("connection", ws, req);
    });
  }

  /** Ejecuta el middleware de sesión sobre la petición y resuelve el usuario. */
  private usuarioDe(req: PeticionConSesion): Promise<User | undefined> {
    return new Promise((resolve, reject) => {
      this.parser(req, {}, error => {
        if (error) {
          reject(error);
          return;
        }

        const userId = req.session?.userId;
        if (!userId) {
          resolve(undefined);
          return;
        }

        this.deps.userRepository.findById(userId).then(user => {
          resolve(
            user && !user.deleted && user.status === "ACTIVE" ? user : undefined
          );
        }, reject);
      });
    });
  }

  private rechazar(socket: Duplex): void {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }

  /** Ping a todos; quien no respondió al anterior se considera caído. */
  private latido(): void {
    for (const cliente of this.wss.clients) {
      if (!this.vivos.has(cliente)) {
        cliente.terminate();
        continue;
      }

      this.vivos.delete(cliente);
      cliente.ping();
    }
  }
}
