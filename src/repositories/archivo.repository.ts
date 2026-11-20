import { randomUUID } from "node:crypto";

/**
 * Metadatos de un archivo subido por un usuario. Los bytes viven en el almacén
 * de objetos (R2) bajo `clave`; aquí solo se guarda lo necesario para listar y
 * servir el archivo.
 */
export interface Archivo {
  id: string;
  ownerId: string;
  /** Si está definido, el archivo pertenece a esa mesa y se borra al cerrarla; si es null/undefined, es personal de la cuenta (recepción). */
  mesaId?: string | null;
  /** Nombre original, ya saneado, para mostrar y descargar. */
  nombre: string;
  /** Clave en el almacén de objetos. */
  clave: string;
  /** Tipo MIME. */
  tipo: string;
  /** Tamaño en bytes. */
  tamano: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ArchivoRepository {
  /**
   * Archivos de un usuario, los más recientes primero.
   * - Sin `mesaId`: solo los personales de la cuenta (`mesaId == null`).
   * - Con `mesaId`: los personales de la cuenta más los de esa mesa.
   */
  listByOwner(ownerId: string, mesaId?: string): Promise<Archivo[]>;
  listByMesa?(mesaId: string): Promise<Archivo[]>;
  findById(id: string): Promise<Archivo | undefined>;
  countByClave(clave: string): Promise<number>;
  save(archivo: Archivo): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByMesa?(mesaId: string): Promise<Archivo[]>;
}

export function createArchivo(input: {
  ownerId: string;
  mesaId?: string | null;
  nombre: string;
  clave: string;
  tipo: string;
  tamano: number;
  id?: string;
  createdAt?: Date;
}): Archivo {
  return {
    id: input.id ?? randomUUID(),
    ownerId: input.ownerId,
    ...(input.mesaId !== undefined ? { mesaId: input.mesaId } : {}),
    nombre: input.nombre,
    clave: input.clave,
    tipo: input.tipo,
    tamano: input.tamano,
    createdAt: input.createdAt ?? new Date(),
    updatedAt: input.createdAt ?? new Date()
  };
}

/** Repositorio en memoria: solo para desarrollo y pruebas. */
export class MemoryArchivoRepository implements ArchivoRepository {
  private readonly archivos = new Map<string, Archivo>();

  async listByOwner(ownerId: string, mesaId?: string): Promise<Archivo[]> {
    return [...this.archivos.values()]
      .filter(archivo => {
        if (archivo.ownerId !== ownerId) return false;
        if (!mesaId) return !archivo.mesaId;
        return !archivo.mesaId || archivo.mesaId === mesaId;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clonar);
  }

  async listByMesa(mesaId: string): Promise<Archivo[]> {
    return [...this.archivos.values()]
      .filter(archivo => archivo.mesaId === mesaId)
      .map(clonar);
  }

  async findById(id: string): Promise<Archivo | undefined> {
    const archivo = this.archivos.get(id);
    return archivo ? clonar(archivo) : undefined;
  }

  async countByClave(clave: string): Promise<number> {
    let total = 0;
    for (const archivo of this.archivos.values()) {
      if (archivo.clave === clave) total += 1;
    }
    return total;
  }

  async save(archivo: Archivo): Promise<void> {
    this.archivos.set(archivo.id, clonar(archivo));
  }

  async delete(id: string): Promise<void> {
    this.archivos.delete(id);
  }

  async deleteByMesa(mesaId: string): Promise<Archivo[]> {
    const borrados: Archivo[] = [];
    for (const [id, archivo] of this.archivos.entries()) {
      if (archivo.mesaId === mesaId) {
        borrados.push(clonar(archivo));
        this.archivos.delete(id);
      }
    }
    return borrados;
  }
}

function clonar(archivo: Archivo): Archivo {
  const createdAt = new Date(archivo.createdAt);
  const updatedAt = new Date(archivo.updatedAt ?? archivo.createdAt);
  return { ...archivo, createdAt, updatedAt };
}
