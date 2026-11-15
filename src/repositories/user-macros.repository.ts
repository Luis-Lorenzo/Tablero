const CARAS_VALIDAS = new Set([4, 6, 8, 10, 12, 20, 100]);

export interface GrupoDadoMacro {
  id: string;
  cantidad: number;
  caras: number;
}

export interface MacroTiradaPersistida {
  id: string;
  nombre: string;
  icono: string;
  grupos: GrupoDadoMacro[];
  bonificador: number;
}

export function sanitizarMacros(raw: unknown): MacroTiradaPersistida[] {
  if (!Array.isArray(raw)) return [];
  const resultado: MacroTiradaPersistida[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string" || !obj.id.trim()) continue;
    if (!Array.isArray(obj.grupos)) continue;

    const grupos: GrupoDadoMacro[] = [];
    for (const g of obj.grupos) {
      if (!g || typeof g !== "object") continue;
      const gObj = g as Record<string, unknown>;
      const cantidad =
        typeof gObj.cantidad === "number" && Number.isFinite(gObj.cantidad)
          ? Math.max(1, Math.min(20, Math.round(gObj.cantidad)))
          : 1;
      const caras =
        typeof gObj.caras === "number" && CARAS_VALIDAS.has(gObj.caras)
          ? gObj.caras
          : 20;
      const gId =
        typeof gObj.id === "string" && gObj.id.trim()
          ? gObj.id.trim().slice(0, 64)
          : `g-${grupos.length + 1}`;
      grupos.push({ id: gId, cantidad, caras });
      if (grupos.length >= 10) break;
    }

    if (grupos.length === 0) continue;

    const bonificador =
      typeof obj.bonificador === "number" && Number.isFinite(obj.bonificador)
        ? Math.max(-99, Math.min(99, Math.round(obj.bonificador)))
        : 0;
    const nombre =
      typeof obj.nombre === "string" ? obj.nombre.trim().slice(0, 36) : "";
    const icono =
      typeof obj.icono === "string" && obj.icono.trim()
        ? obj.icono.trim().slice(0, 32)
        : "Swords";

    resultado.push({
      id: obj.id.trim().slice(0, 64),
      nombre: nombre || "Macro",
      icono,
      grupos,
      bonificador
    });
    if (resultado.length >= 50) break;
  }

  return resultado;
}

export interface UserMacrosRepository {
  getMacros(userId: string): Promise<MacroTiradaPersistida[]>;
  saveMacros(userId: string, macros: MacroTiradaPersistida[]): Promise<void>;
}

export class MemoryUserMacrosRepository implements UserMacrosRepository {
  private readonly porUsuario = new Map<string, MacroTiradaPersistida[]>();

  async getMacros(userId: string): Promise<MacroTiradaPersistida[]> {
    return this.porUsuario.get(userId) ?? [];
  }

  async saveMacros(
    userId: string,
    macros: MacroTiradaPersistida[]
  ): Promise<void> {
    this.porUsuario.set(userId, sanitizarMacros(macros));
  }
}
