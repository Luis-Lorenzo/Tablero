export interface Mesa {
  id: string;
  hostId: string;
  /** Ids de los jugadores (el anfitrión no está en esta lista). */
  players: string[];
  createdAt: Date;
}

export interface MesaRepository {
  findById(id: string): Promise<Mesa | undefined>;
  list(): Promise<Mesa[]>;
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

  async list() {
    return [...this.mesas.values()];
  }

  async save(mesa: Mesa) {
    this.mesas.set(mesa.id, { ...mesa, players: [...mesa.players] });
  }

  async delete(id: string) {
    this.mesas.delete(id);
  }
}
