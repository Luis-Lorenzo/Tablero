export interface MensajeChat {
  id: string;
  mesaId: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  destinatarioId: string | null;
  destinatarioNombre: string | null;
  destinatarioIds?: string[];
  destinatarioNombres?: string[];
  createdAt: string;
}

export interface ChatRepository {
  listByMesa(mesaId: string, limit: number): Promise<MensajeChat[]>;
  save(mensaje: MensajeChat, maxPorMesa: number): Promise<void>;
}

export class MemoryChatRepository implements ChatRepository {
  private readonly historial = new Map<string, MensajeChat[]>();

  async listByMesa(mesaId: string, limit: number): Promise<MensajeChat[]> {
    const lista = this.historial.get(mesaId) ?? [];
    if (limit <= 0) return [];
    return lista.slice(-limit);
  }

  async save(mensaje: MensajeChat, maxPorMesa: number): Promise<void> {
    const lista = this.historial.get(mensaje.mesaId) ?? [];
    lista.push(mensaje);
    if (lista.length > maxPorMesa) {
      lista.splice(0, lista.length - maxPorMesa);
    }
    this.historial.set(mensaje.mesaId, lista);
  }
}
