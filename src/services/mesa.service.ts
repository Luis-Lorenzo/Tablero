import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import {
  nombreDeUsuario,
  type User,
  type UserRepository
} from "../repositories/user.repository.js";
import { createMesa, type EstadoMesa, type Mesa, type MesaRepository } from "../repositories/mesa.repository.js";

/** Cuántos jugadores caben en una mesa (el anfitrión no ocupa plaza). */
export const MESA_MAX_JUGADORES = 6;

/** Cuántas mesas se ven en la cuadrícula de la recepción. */
export const MESAS_EN_INICIO = 4;

/** Parte visible del correo: lo que hay antes de la @. */
export function nombreVisible(email: string): string {
  const corte = email.indexOf("@");
  return corte === -1 ? email : email.slice(0, corte);
}

export interface MesaJugador {
  id: string;
  name: string;
}

export interface MesaVista {
  id: string;
  hostId: string;
  hostName: string;
  players: MesaJugador[];
  /** Jugador con una cesión de mando pendiente de aceptar, o null. */
  pendingHostId: string | null;
  /** Si el máster ya ha empezado la partida. */
  estado: EstadoMesa;
  createdAt: Date;
}

/**
 * Coloca las mesas en la cuadrícula de la recepción: siempre MESAS_EN_INICIO
 * huecos, con las mesas pegadas al final (la más nueva abajo a la derecha) y
 * los huecos libres al principio.
 */
export function colocarMesasDelInicio(
  mesas: readonly Mesa[],
  huecos: number = MESAS_EN_INICIO
): Array<Mesa | null> {
  const recientes = [...mesas]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-huecos);

  const vacios = Array<Mesa | null>(huecos - recientes.length).fill(null);
  return [...vacios, ...recientes];
}

export class MesaService {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly users: UserRepository,
    private readonly logger: Logger
  ) {}

  async inicio(): Promise<Array<MesaVista | null>> {
    const mesas = await this.mesas.list(MESAS_EN_INICIO);
    const huecos = colocarMesasDelInicio(mesas);

    const presentes = huecos.filter((mesa): mesa is Mesa => mesa !== null);
    const porId = new Map((await this.vistas(presentes)).map(vista => [vista.id, vista]));

    return huecos.map(mesa => (mesa ? porId.get(mesa.id)! : null));
  }

  async listar(busqueda?: string): Promise<MesaVista[]> {
    const mesas = await this.mesas.list();
    const vistas = await this.vistas(mesas);
    vistas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const texto = busqueda?.trim().toLowerCase();
    if (!texto) return vistas;

    return vistas.filter(vista => vista.hostName.toLowerCase().includes(texto));
  }

  async crear(actor: User): Promise<{ mesa: MesaVista; creada: boolean }> {
    const actual = await this.mesaDeAnfitrion(actor.id);
    if (actual) {
      return { mesa: await this.vista(actual), creada: false };
    }

    const mesa = createMesa(actor.id);
    await this.mesas.save(mesa);
    this.logger.info("Mesa creada", { mesaId: mesa.id, hostId: actor.id });

    return { mesa: await this.vista(mesa), creada: true };
  }

  async unirse(actor: User, mesaId: string): Promise<MesaVista> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.hostId === actor.id || mesa.players.includes(actor.id)) {
      return this.vista(mesa);
    }

    if (mesa.expulsados.includes(actor.id)) {
      throw errors.mesaBanned();
    }

    if (mesa.players.length >= MESA_MAX_JUGADORES) {
      throw errors.mesaFull();
    }

    await this.salirDeOtras(actor.id, mesa.id);

    mesa.players = [...mesa.players, actor.id];
    await this.mesas.save(mesa);

    this.logger.info("Jugador unido a la mesa", { mesaId: mesa.id, playerId: actor.id });

    return this.vista(mesa);
  }

  /**
   * El máster (anfitrión) empieza la partida. No hace falta un mínimo de
   * jugadores: se permite empezar solo para poder probar la sala.
   */
  async iniciar(actor: User, mesaId: string): Promise<MesaVista> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.hostId !== actor.id) throw errors.mesaForbidden();

    if (mesa.estado !== "EN_CURSO") {
      mesa.estado = "EN_CURSO";
      await this.mesas.save(mesa);
      this.logger.info("Partida iniciada", { mesaId, hostId: actor.id });
    }

    return this.vista(mesa);
  }

  /** El máster devuelve la mesa a la sala de espera. */
  async terminar(actor: User, mesaId: string): Promise<MesaVista> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.hostId !== actor.id) throw errors.mesaForbidden();

    if (mesa.estado !== "ESPERA") {
      mesa.estado = "ESPERA";
      await this.mesas.save(mesa);
      this.logger.info("Partida terminada", { mesaId, hostId: actor.id });
    }

    return this.vista(mesa);
  }

  /** Un jugador abandona la mesa en la que está (el anfitrión debe cerrarla). */
  async abandonar(actor: User, mesaId: string): Promise<void> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.hostId === actor.id) {
      throw errors.mesaForbidden();
    }

    if (!mesa.players.includes(actor.id)) {
      return;
    }

    mesa.players = mesa.players.filter(id => id !== actor.id);
    if (mesa.pendingHostId === actor.id) {
      mesa.pendingHostId = null;
    }
    await this.mesas.save(mesa);
    this.logger.info("Jugador abandona la mesa", { mesaId, playerId: actor.id });
  }

  /** El anfitrión (o un administrador) expulsa a un jugador y le bloquea el reingreso. */
  async expulsar(actor: User, mesaId: string, playerId: string): Promise<void> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    this.exigirAnfitrionOAdmin(actor, mesa);

    if (!mesa.players.includes(playerId)) {
      throw errors.invalidRequest();
    }

    mesa.players = mesa.players.filter(id => id !== playerId);
    if (!mesa.expulsados.includes(playerId)) {
      mesa.expulsados = [...mesa.expulsados, playerId];
    }
    if (mesa.pendingHostId === playerId) {
      mesa.pendingHostId = null;
    }
    await this.mesas.save(mesa);
    this.logger.info("Jugador expulsado", {
      mesaId,
      actorId: actor.id,
      playerId
    });
  }

  /** Ofrece el mando a un jugador; debe aceptarlo para que el cambio se aplique. */
  async solicitarCesion(actor: User, mesaId: string, playerId: string): Promise<void> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    this.exigirAnfitrionOAdmin(actor, mesa);

    if (!mesa.players.includes(playerId)) {
      throw errors.invalidRequest();
    }

    mesa.pendingHostId = playerId;
    await this.mesas.save(mesa);
    this.logger.info("Cesión de mando solicitada", {
      mesaId,
      actorId: actor.id,
      playerId
    });
  }

  /** El jugador elegido acepta el mando: pasa a ser anfitrión y el anterior, jugador. */
  async aceptarCesion(actor: User, mesaId: string): Promise<void> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.pendingHostId !== actor.id) {
      throw errors.mesaForbidden();
    }

    const anterior = mesa.hostId;
    mesa.hostId = actor.id;
    mesa.players = mesa.players.filter(id => id !== actor.id);
    if (!mesa.players.includes(anterior)) {
      mesa.players = [...mesa.players, anterior];
    }
    mesa.pendingHostId = null;
    await this.mesas.save(mesa);
    this.logger.info("Cesión de mando aceptada", {
      mesaId,
      nuevoAnfitrion: actor.id,
      anterior
    });
  }

  /** El jugador elegido rechaza el mando. */
  async rechazarCesion(actor: User, mesaId: string): Promise<void> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.pendingHostId !== actor.id) {
      throw errors.mesaForbidden();
    }

    mesa.pendingHostId = null;
    await this.mesas.save(mesa);
    this.logger.info("Cesión de mando rechazada", { mesaId, playerId: actor.id });
  }

  async cerrar(actor: User, mesaId: string): Promise<void> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (mesa.hostId !== actor.id) throw errors.forbidden();

    await this.mesas.delete(mesaId);
    this.logger.info("Mesa cerrada", { mesaId, hostId: actor.id });
  }

  private async mesaDeAnfitrion(hostId: string): Promise<Mesa | undefined> {
    return (await this.mesas.list()).find(mesa => mesa.hostId === hostId);
  }

  /** Devuelve una mesa concreta o lanza 404. */
  async obtener(mesaId: string): Promise<MesaVista> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();
    return this.vista(mesa);
  }

  /** La mesa que aloja el usuario, o null si no es anfitrión de ninguna. */
  async mia(actor: User): Promise<MesaVista | null> {
    const mesa = await this.mesaDeAnfitrion(actor.id);
    return mesa ? this.vista(mesa) : null;
  }

  /** La mesa en la que al usuario le han ofrecido el mando, o null. */
  async pendienteDe(actor: User): Promise<MesaVista | null> {
    const mesa = (await this.mesas.list()).find(
      candidata => candidata.pendingHostId === actor.id
    );
    return mesa ? this.vista(mesa) : null;
  }

  private exigirAnfitrionOAdmin(actor: User, mesa: Mesa): void {
    // Un administrador es omnipotente, pero pierde el mando de una mesa en
    // cuanto pasa a ser jugador de ella (por ejemplo, tras cederla a otro).
    const esAdminLibre = actor.role === "ADMIN" && !mesa.players.includes(actor.id);
    if (mesa.hostId !== actor.id && !esAdminLibre) {
      throw errors.mesaForbidden();
    }
  }

  private async salirDeOtras(playerId: string, excepto: string): Promise<void> {
    const otras = (await this.mesas.list()).filter(
      mesa => mesa.id !== excepto && mesa.players.includes(playerId)
    );

    for (const mesa of otras) {
      mesa.players = mesa.players.filter(id => id !== playerId);
      await this.mesas.save(mesa);
    }
  }

  private async vista(mesa: Mesa): Promise<MesaVista> {
    const [unica] = await this.vistas([mesa]);
    return unica;
  }

  /**
   * Compone varias mesas a la vez cargando todos los nombres implicados en una
   * única consulta (`findManyByIds`) en lugar de preguntar usuario a usuario.
   */
  private async vistas(mesas: readonly Mesa[]): Promise<MesaVista[]> {
    if (mesas.length === 0) {
      return [];
    }

    const ids = new Set<string>();
    for (const mesa of mesas) {
      ids.add(mesa.hostId);
      for (const jugador of mesa.players) ids.add(jugador);
    }

    const usuarios = await this.users.findManyByIds([...ids]);
    const nombres = new Map(
      usuarios.map(user => [user.id, nombreDeUsuario(user)])
    );

    return mesas.map(mesa => ({
      id: mesa.id,
      hostId: mesa.hostId,
      hostName: nombres.get(mesa.hostId) ?? "desconocido",
      players: mesa.players.map(id => ({
        id,
        name: nombres.get(id) ?? "desconocido"
      })),
      pendingHostId: mesa.pendingHostId,
      estado: mesa.estado,
      createdAt: mesa.createdAt
    }));
  }
}
