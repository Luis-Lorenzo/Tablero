export type ElementoMesaPersistido = Record<string, unknown>;

export interface MesaEstadoRepository {
  getElementos(mesaId: string, userId: string): Promise<ElementoMesaPersistido[]>;
  saveElementos(
    mesaId: string,
    userId: string,
    elementos: ElementoMesaPersistido[]
  ): Promise<void>;
}

/**
 * Elimina campos locales efímeros (base64 / blob URLs) para no almacenar
 * binarios en PostgreSQL.
 */
export function sanitizarElementosMesa(raw: unknown): ElementoMesaPersistido[] {
  if (!Array.isArray(raw)) return [];
  const limpios: ElementoMesaPersistido[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const copia = { ...(item as Record<string, unknown>) };
    delete copia.contenidoLocal;
    if (typeof copia.id === "string" && typeof copia.tipo === "string") {
      limpios.push(copia);
    }
  }

  return limpios;
}

/** Repositorio en memoria: para desarrollo sin BD y pruebas. */
export class MemoryMesaEstadoRepository implements MesaEstadoRepository {
  private readonly estados = new Map<string, ElementoMesaPersistido[]>();

  private clave(mesaId: string, userId: string): string {
    return `${mesaId}:${userId}`;
  }

  async getElementos(
    mesaId: string,
    userId: string
  ): Promise<ElementoMesaPersistido[]> {
    const lista = this.estados.get(this.clave(mesaId, userId));
    return lista ? lista.map(item => ({ ...item })) : [];
  }

  async saveElementos(
    mesaId: string,
    userId: string,
    elementos: ElementoMesaPersistido[]
  ): Promise<void> {
    this.estados.set(
      this.clave(mesaId, userId),
      sanitizarElementosMesa(elementos)
    );
  }
}
