import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import {
  nombreDeUsuario,
  type User,
  type UserRepository
} from "../repositories/user.repository.js";
import { createMesa, type Mesa, type MesaRepository } from "../repositories/mesa.repository.js";

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

    if (mesa.players.length >= MESA_MAX_JUGADORES) {
      throw errors.mesaFull();
    }

    await this.salirDeOtras(actor.id, mesa.id);

    mesa.players = [...mesa.players, actor.id];
    await this.mesas.save(mesa);

    this.logger.info("Jugador unido a la mesa", { mesaId: mesa.id, playerId: actor.id });

    return this.vista(mesa);
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
      createdAt: mesa.createdAt
    }));
  }
}
