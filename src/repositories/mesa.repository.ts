/** ESPERA: la mesa está en la recepción; EN_CURSO: el máster ya la ha empezado. */
export type EstadoMesa = "ESPERA" | "EN_CURSO";

export interface ImagenMesa {
  id: string;
  titulo: string | null;
}

export interface DivisaConfig {
  id: string;
  nombre: string;
  color: string;
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const MAX_DIVISAS_MESA = 12;

export function sanitizarDivisasConfig(raw: unknown): DivisaConfig[] {
  if (!Array.isArray(raw)) return [];
  const limpias: DivisaConfig[] = [];
  const vistos = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const rawId = typeof obj.id === "string" ? obj.id.trim() : "";
    const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!id || vistos.has(id)) continue;

    const rawNombre = typeof obj.nombre === "string" ? obj.nombre.trim() : "";
    const nombre = rawNombre.slice(0, 24) || "Divisa";

    const rawColor = typeof obj.color === "string" ? obj.color.trim() : "";
    const color = HEX_COLOR_RE.test(rawColor) ? rawColor : "#e8c56a";

    vistos.add(id);
    limpias.push({ id, nombre, color });
    if (limpias.length >= MAX_DIVISAS_MESA) break;
  }

  return limpias;
}

export function resolverDivisasConfig(mesa: {
  divisaNombre?: string;
  divisasConfig?: DivisaConfig[];
}): DivisaConfig[] {
  if (Array.isArray(mesa.divisasConfig) && mesa.divisasConfig.length > 0) {
    return mesa.divisasConfig.map(d => ({ ...d }));
  }
  return [
    {
      id: "principal",
      nombre: mesa.divisaNombre?.trim() || "Divisa",
      color: "#e8c56a"
    }
  ];
}

export interface Mesa {
  id: string;
  hostId: string;
  /** Ids de los jugadores (el anfitrión no está en esta lista). */
  players: string[];
  /** Jugadores expulsados: no pueden volver a unirse a esta mesa. */
  expulsados: string[];
  /**
   * Jugador al que el anfitrión ha ofrecido el mando y todavía no ha respondido.
   * `null` cuando no hay ninguna cesión pendiente.
   */
  pendingHostId: string | null;
  /** Si el máster ya ha empezado la partida. */
  estado: EstadoMesa;
  colores: Record<string, string>;
  apodos?: Record<string, string>;
  /** Imagen fijada por el máster en la pizarra de la sala (Opción B). */
  imagenEscena?: ImagenMesa | null;
  /** Imagen proyectada por el máster a toda la pantalla (Opción A). */
  imagenProyectada?: ImagenMesa | null;
  /** Nombre configurable de la moneda de la mesa (por defecto "Divisa"). */
  divisaNombre?: string;
  /** Configuración de múltiples divisas de la mesa. */
  divisasConfig?: DivisaConfig[];
  createdAt: Date;
}

export interface MesaRepository {
  findById(id: string): Promise<Mesa | undefined>;
  /**
   * Devuelve las mesas de más antigua a más reciente. Con `limite` devuelve
   * solo las N más recientes (y no todas), que es lo único que necesita la
   * cuadrícula de la recepción.
   */
  list(limite?: number): Promise<Mesa[]>;
  save(mesa: Mesa): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createMesa(hostId: string): Mesa {
  return {
    id: crypto.randomUUID(),
    hostId,
    players: [],
    expulsados: [],
    pendingHostId: null,
    estado: "ESPERA",
    colores: {},
    apodos: {},
    imagenEscena: null,
    imagenProyectada: null,
    createdAt: new Date()
  };
}

export class MemoryMesaRepository implements MesaRepository {
  private mesas = new Map<string, Mesa>();

  async findById(id: string) {
    return this.mesas.get(id);
  }

  async list(limite?: number) {
    const ordenadas = [...this.mesas.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    if (limite === undefined) return ordenadas;
    if (limite <= 0) return [];
    return ordenadas.slice(-limite);
  }

  async save(mesa: Mesa) {
    this.mesas.set(mesa.id, {
      ...mesa,
      players: [...(mesa.players ?? [])],
      expulsados: [...(mesa.expulsados ?? [])],
      pendingHostId: mesa.pendingHostId ?? null,
      estado: mesa.estado ?? "ESPERA",
      colores: { ...(mesa.colores ?? {}) },
      apodos: { ...(mesa.apodos ?? {}) },
      imagenEscena: mesa.imagenEscena ?? null,
      imagenProyectada: mesa.imagenProyectada ?? null,
      ...(mesa.divisasConfig
        ? { divisasConfig: mesa.divisasConfig.map(d => ({ ...d })) }
        : {})
    });
  }

  async delete(id: string) {
    this.mesas.delete(id);
  }
}
