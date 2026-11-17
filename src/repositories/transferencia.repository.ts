import type { VistaArchivo } from "../lib/archivos.js";

export interface PositTransferido {
  texto: string;
  color: string;
  giro: number;
}

export interface ArchivoTransferidoMeta {
  id: string;
  nombre: string;
  tipo: string;
  vista: VistaArchivo;
  tamano: number;
}

export interface ObjetoTransferido {
  idOrigen?: string;
  nombre: string;
  descripcion: string;
  cantidad: number;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
}

export type Transferencia =
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "posit";
      posit: PositTransferido;
      createdAt: Date;
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "archivo";
      archivo: ArchivoTransferidoMeta;
      createdAt: Date;
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "objeto";
      objeto: ObjetoTransferido;
      createdAt: Date;
    };

export interface TransferenciaRepository {
  create(transferencia: Transferencia): Promise<void>;
  findById(id: string): Promise<Transferencia | undefined>;
  listPendientes(mesaId: string, receptorId: string): Promise<Transferencia[]>;
  deleteById(id: string): Promise<void>;
}

export class MemoryTransferenciaRepository implements TransferenciaRepository {
  private readonly pendientes = new Map<string, Transferencia>();

  async create(transferencia: Transferencia): Promise<void> {
    this.pendientes.set(transferencia.id, transferencia);
  }

  async findById(id: string): Promise<Transferencia | undefined> {
    return this.pendientes.get(id);
  }

  async listPendientes(mesaId: string, receptorId: string): Promise<Transferencia[]> {
    return Array.from(this.pendientes.values())
      .filter(t => t.mesaId === mesaId && t.receptorId === receptorId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async deleteById(id: string): Promise<void> {
    this.pendientes.delete(id);
  }
}
