import { randomUUID } from "node:crypto";

/**
 * Metadatos de un archivo subido por un usuario. Los bytes viven en el almacén
 * de objetos (R2) bajo `clave`; aquí solo se guarda lo necesario para listar y
 * servir el archivo.
 */
export interface Archivo {
  id: string;
  ownerId: string;
  /** Nombre original, ya saneado, para mostrar y descargar. */
  nombre: string;
  /** Clave en el almacén de objetos. */
  clave: string;
  /** Tipo MIME. */
  tipo: string;
  /** Tamaño en bytes. */
  tamano: number;
  createdAt: Date;
}

export interface ArchivoRepository {
  /** Archivos de un usuario, los más recientes primero. */
  listByOwner(ownerId: string): Promise<Archivo[]>;
  findById(id: string): Promise<Archivo | undefined>;
  save(archivo: Archivo): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createArchivo(input: {
  ownerId: string;
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
    nombre: input.nombre,
    clave: input.clave,
    tipo: input.tipo,
    tamano: input.tamano,
    createdAt: input.createdAt ?? new Date()
  };
}

/** Repositorio en memoria: solo para desarrollo y pruebas. */
export class MemoryArchivoRepository implements ArchivoRepository {
  private readonly archivos = new Map<string, Archivo>();

  async listByOwner(ownerId: string): Promise<Archivo[]> {
    return [...this.archivos.values()]
      .filter(archivo => archivo.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clonar);
  }

  async findById(id: string): Promise<Archivo | undefined> {
    const archivo = this.archivos.get(id);
    return archivo ? clonar(archivo) : undefined;
  }

  async save(archivo: Archivo): Promise<void> {
    this.archivos.set(archivo.id, clonar(archivo));
  }

  async delete(id: string): Promise<void> {
    this.archivos.delete(id);
  }
}

function clonar(archivo: Archivo): Archivo {
  return { ...archivo, createdAt: new Date(archivo.createdAt) };
}
