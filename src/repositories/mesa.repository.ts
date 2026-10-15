export interface Mesa {
  id: string;
  hostId: string;
  /** Ids de los jugadores (el anfitrión no está en esta lista). */
  players: string[];
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
    this.mesas.set(mesa.id, { ...mesa, players: [...mesa.players] });
  }

  async delete(id: string) {
    this.mesas.delete(id);
  }
}
