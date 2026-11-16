export interface TamanoImagenEscena {
  w: number;
  h: number;
}

export interface PizarraEstadoPersistido {
  posits: unknown[];
  trazos: unknown[];
  documentos: unknown[];
  trazosEscena: unknown[];
  positsEscena: unknown[];
  docsEscena: unknown[];
  tamanoImagenesEscena: Record<string, TamanoImagenEscena>;
  congelada: boolean;
  objetos?: Array<Record<string, unknown>>;
}

export function crearPizarraEstadoVacio(): PizarraEstadoPersistido {
  return {
    posits: [],
    trazos: [],
    documentos: [],
    trazosEscena: [],
    positsEscena: [],
    docsEscena: [],
    tamanoImagenesEscena: {},
    congelada: false,
    objetos: []
  };
}

function sanitizarDocumentosLista(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object")
    .map(doc => {
      const copia = { ...doc };
      delete copia.url;
      return copia;
    });
}

function sanitizarTamanos(raw: unknown): Record<string, TamanoImagenEscena> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const resultado: Record<string, TamanoImagenEscena> = {};
  for (const [clave, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!valor || typeof valor !== "object") continue;
    const { w, h } = valor as { w?: unknown; h?: unknown };
    if (
      typeof w === "number" &&
      Number.isFinite(w) &&
      typeof h === "number" &&
      Number.isFinite(h)
    ) {
      resultado[clave] = { w, h };
    }
  }
  return resultado;
}

function sanitizarObjetosPizarra(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  const limpios: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const copia = { ...(item as Record<string, unknown>) };
    delete copia.contenidoLocal;
    delete copia.url;
    if (typeof copia.id === "string" && copia.id.trim()) {
      limpios.push(copia);
    }
    if (limpios.length >= 200) break;
  }
  return limpios;
}

export function sanitizarPizarraEstado(raw: unknown): PizarraEstadoPersistido {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return crearPizarraEstadoVacio();
  }
  const obj = raw as Record<string, unknown>;
  return {
    posits: Array.isArray(obj.posits) ? obj.posits : [],
    trazos: Array.isArray(obj.trazos) ? obj.trazos : [],
    documentos: sanitizarDocumentosLista(obj.documentos),
    trazosEscena: Array.isArray(obj.trazosEscena) ? obj.trazosEscena : [],
    positsEscena: Array.isArray(obj.positsEscena) ? obj.positsEscena : [],
    docsEscena: sanitizarDocumentosLista(obj.docsEscena),
    tamanoImagenesEscena: sanitizarTamanos(obj.tamanoImagenesEscena),
    congelada: Boolean(obj.congelada),
    objetos: sanitizarObjetosPizarra(obj.objetos)
  };
}

export interface PizarraEstadoRepository {
  getEstado(mesaId: string): Promise<PizarraEstadoPersistido>;
  saveEstado(mesaId: string, estado: PizarraEstadoPersistido): Promise<void>;
}

export class MemoryPizarraEstadoRepository implements PizarraEstadoRepository {
  private readonly porMesa = new Map<string, PizarraEstadoPersistido>();

  async getEstado(mesaId: string): Promise<PizarraEstadoPersistido> {
    return this.porMesa.get(mesaId) ?? crearPizarraEstadoVacio();
  }

  async saveEstado(mesaId: string, estado: PizarraEstadoPersistido): Promise<void> {
    this.porMesa.set(mesaId, sanitizarPizarraEstado(estado));
  }
}
