import {
  sanitizarMacros,
  type MacroTiradaPersistida
} from "./user-macros.repository.js";

export type ElementoMesaPersistido = Record<string, unknown>;

export function sanitizarMacroOpcional(raw: unknown): MacroTiradaPersistida | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return sanitizarMacros([raw])[0];
}

export interface ObjetoMochilaPersistido {
  id: string;
  nombre: string;
  descripcion: string;
  cantidad: number;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
  macro?: MacroTiradaPersistida;
}

export interface EstadoJugadorMesa {
  elementos: ElementoMesaPersistido[];
  divisa: number;
  divisasSaldos?: Record<string, number>;
  mochila: ObjetoMochilaPersistido[];
}

export interface MesaEstadoRepository {
  getElementos(mesaId: string, userId: string): Promise<ElementoMesaPersistido[]>;
  saveElementos(
    mesaId: string,
    userId: string,
    elementos: ElementoMesaPersistido[]
  ): Promise<void>;
  getEstadoCompleto?(mesaId: string, userId: string): Promise<EstadoJugadorMesa>;
  getEstadosPorMesa?(
    mesaId: string,
    userIds: string[]
  ): Promise<Map<string, EstadoJugadorMesa>>;
  saveDivisa?(mesaId: string, userId: string, divisa: number): Promise<number>;
  saveDivisaSaldo?(
    mesaId: string,
    userId: string,
    divisaId: string,
    divisa: number
  ): Promise<{ divisa: number; divisasSaldos: Record<string, number> }>;
  saveMochila?(
    mesaId: string,
    userId: string,
    mochila: ObjetoMochilaPersistido[]
  ): Promise<void>;
}

const MAX_DIVISA = 999_999_999_999;

export function sanitizarDivisa(raw: unknown): number {
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(MAX_DIVISA, Math.trunc(parsed)));
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_DIVISA, Math.trunc(raw)));
}

export function sanitizarDivisaId(raw: unknown): string {
  if (typeof raw !== "string") return "principal";
  const limpio = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return limpio || "principal";
}

export function sanitizarDivisasSaldos(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const resultado: Record<string, number> = {};
  for (const [clave, valor] of Object.entries(raw as Record<string, unknown>)) {
    const id = clave.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!id) continue;
    resultado[id] = sanitizarDivisa(valor);
  }
  return resultado;
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
    for (const campo of ["url", "imagenUrl", "imagenLocal"] as const) {
      const valor = copia[campo];
      if (typeof valor === "string" && valor.trimStart().toLowerCase().startsWith("data:")) {
        delete copia[campo];
      }
    }
    if (copia.tipo === "objeto" && "macro" in copia) {
      const macro = sanitizarMacroOpcional(copia.macro);
      if (macro) {
        copia.macro = macro;
      } else {
        delete copia.macro;
      }
    }
    if (typeof copia.id === "string" && typeof copia.tipo === "string") {
      limpios.push(copia);
    }
  }

  return limpios;
}

export function sanitizarMochila(raw: unknown): ObjetoMochilaPersistido[] {
  if (!Array.isArray(raw)) return [];
  const limpios: ObjetoMochilaPersistido[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim().slice(0, 80) : "";
    const nombre = typeof obj.nombre === "string" ? obj.nombre.trim().slice(0, 60) : "";
    if (!id || !nombre) continue;

    const descripcion =
      typeof obj.descripcion === "string" ? obj.descripcion.slice(0, 1000) : "";
    const cantidadBruta =
      typeof obj.cantidad === "number" && Number.isFinite(obj.cantidad)
        ? Math.trunc(obj.cantidad)
        : 1;
    const cantidad = Math.max(1, Math.min(9999, cantidadBruta));
    const emoji =
      typeof obj.emoji === "string" && obj.emoji.trim()
        ? obj.emoji.trim().slice(0, 16)
        : undefined;
    const archivoId =
      typeof obj.archivoId === "string" && obj.archivoId.trim()
        ? obj.archivoId.trim().slice(0, 80)
        : undefined;
    const archivoNombre =
      typeof obj.archivoNombre === "string" && obj.archivoNombre.trim()
        ? obj.archivoNombre.trim().slice(0, 120)
        : undefined;
    const macro = sanitizarMacroOpcional(obj.macro);

    limpios.push({
      id,
      nombre,
      descripcion,
      cantidad,
      ...(emoji ? { emoji } : {}),
      ...(archivoId ? { archivoId } : {}),
      ...(archivoNombre ? { archivoNombre } : {}),
      ...(macro ? { macro } : {})
    });
    if (limpios.length >= 120) break;
  }

  return limpios;
}

/** Repositorio en memoria: para desarrollo sin BD y pruebas. */
export class MemoryMesaEstadoRepository implements MesaEstadoRepository {
  private readonly estados = new Map<string, ElementoMesaPersistido[]>();
  private readonly divisas = new Map<string, number>();
  private readonly divisasSaldos = new Map<string, Record<string, number>>();
  private readonly mochilas = new Map<string, ObjetoMochilaPersistido[]>();

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

  async getEstadoCompleto(mesaId: string, userId: string): Promise<EstadoJugadorMesa> {
    const k = this.clave(mesaId, userId);
    const elementos = await this.getElementos(mesaId, userId);
    const divisa = this.divisas.get(k) ?? 0;
    const saldos = { ...(this.divisasSaldos.get(k) ?? {}) };
    if (saldos.principal === undefined && divisa > 0) {
      saldos.principal = divisa;
    }
    const mochila = (this.mochilas.get(k) ?? []).map(item => ({ ...item }));
    return { elementos, divisa, divisasSaldos: saldos, mochila };
  }

  async getEstadosPorMesa(
    mesaId: string,
    userIds: string[]
  ): Promise<Map<string, EstadoJugadorMesa>> {
    const mapa = new Map<string, EstadoJugadorMesa>();
    for (const userId of userIds) {
      mapa.set(userId, await this.getEstadoCompleto(mesaId, userId));
    }
    return mapa;
  }

  async saveDivisa(mesaId: string, userId: string, divisa: number): Promise<number> {
    const k = this.clave(mesaId, userId);
    const limpia = sanitizarDivisa(divisa);
    this.divisas.set(k, limpia);
    const saldos = { ...(this.divisasSaldos.get(k) ?? {}) };
    saldos.principal = limpia;
    this.divisasSaldos.set(k, saldos);
    return limpia;
  }

  async saveDivisaSaldo(
    mesaId: string,
    userId: string,
    divisaId: string,
    divisa: number
  ): Promise<{ divisa: number; divisasSaldos: Record<string, number> }> {
    const k = this.clave(mesaId, userId);
    const id = sanitizarDivisaId(divisaId);
    const limpia = sanitizarDivisa(divisa);
    const saldos = { ...(this.divisasSaldos.get(k) ?? {}) };
    saldos[id] = limpia;
    this.divisasSaldos.set(k, saldos);
    if (id === "principal") {
      this.divisas.set(k, limpia);
    }
    return {
      divisa: this.divisas.get(k) ?? 0,
      divisasSaldos: { ...saldos }
    };
  }

  async saveMochila(
    mesaId: string,
    userId: string,
    mochila: ObjetoMochilaPersistido[]
  ): Promise<void> {
    this.mochilas.set(this.clave(mesaId, userId), sanitizarMochila(mochila));
  }
}
