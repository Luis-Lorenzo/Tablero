import type { ObjetoMochila } from "./tipos";

export const EMOJIS_OBJETO_SUGERIDOS = [
  "🧪",
  "⚔️",
  "🛡️",
  "🏹",
  "📜",
  "🔑",
  "💎",
  "💍",
  "🕯️",
  "🍖",
  "🧭",
  "🪶",
  "💀",
  "🔮",
  "🧿",
  "🧰",
  "💣",
  "🪓",
  "🪙",
  "🎒"
] as const;

export function formatearDivisaCompacta(valor: number): string {
  const n = Math.max(0, Math.trunc(valor));
  if (n < 1_000_000) return String(n);
  const millones = Math.floor((n / 1_000_000) * 10) / 10;
  return `${Number.isInteger(millones) ? millones.toFixed(0) : millones.toFixed(1)}M`;
}

function ajustarColorHex(hex: string, factor: number): string {
  const limpio = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return hex;
  const r = parseInt(limpio.slice(0, 2), 16);
  const g = parseInt(limpio.slice(2, 4), 16);
  const b = parseInt(limpio.slice(4, 6), 16);
  const calc = (c: number) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(factor >= 0 ? c + (255 - c) * factor : c * (1 + factor))
      )
    );
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(calc(r))}${toHex(calc(g))}${toHex(calc(b))}`;
}

/**
 * Icono pixel retro de monedas amontonadas (cuadrícula 16x16).
 */
export function IconoMonedasPixel({
  size = 28,
  color
}: {
  size?: number;
  color?: string;
}) {
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : null;
  const fillBase = base ?? "#f7d060";
  const fillBrillo = base ? ajustarColorHex(base, 0.52) : "#fff3b0";
  const fillMedio = base ? ajustarColorHex(base, -0.28) : "#c9851e";
  const fillOscuro = base ? ajustarColorHex(base, -0.52) : "#8f5710";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* Contorno / sombra base */}
      <rect x="3" y="2" width="6" height="1" fill="#181020" />
      <rect x="2" y="3" width="1" height="4" fill="#181020" />
      <rect x="9" y="3" width="1" height="3" fill="#181020" />
      <rect x="8" y="5" width="5" height="1" fill="#181020" />
      <rect x="13" y="6" width="1" height="6" fill="#181020" />
      <rect x="1" y="7" width="1" height="6" fill="#181020" />
      <rect x="2" y="13" width="6" height="1" fill="#181020" />
      <rect x="8" y="12" width="5" height="1" fill="#181020" />

      {/* Pila trasera izquierda (alta) */}
      <rect x="3" y="3" width="6" height="2" fill={fillBase} />
      <rect x="4" y="3" width="3" height="1" fill={fillBrillo} />
      <rect x="3" y="5" width="6" height="1" fill={fillMedio} />
      <rect x="3" y="6" width="6" height="1" fill={fillBase} />
      <rect x="3" y="7" width="5" height="1" fill={fillOscuro} />

      {/* Pila delantera derecha */}
      <rect x="8" y="6" width="5" height="2" fill={fillBase} />
      <rect x="9" y="6" width="2" height="1" fill={fillBrillo} />
      <rect x="8" y="8" width="5" height="1" fill={fillMedio} />
      <rect x="8" y="9" width="5" height="1" fill={fillBase} />
      <rect x="8" y="10" width="5" height="1" fill={fillMedio} />
      <rect x="8" y="11" width="5" height="1" fill={fillOscuro} />

      {/* Pila delantera izquierda */}
      <rect x="2" y="8" width="6" height="2" fill={fillBase} />
      <rect x="3" y="8" width="3" height="1" fill={fillBrillo} />
      <rect x="2" y="10" width="6" height="1" fill={fillMedio} />
      <rect x="2" y="11" width="6" height="1" fill={fillBase} />
      <rect x="2" y="12" width="6" height="1" fill={fillOscuro} />
    </svg>
  );
}

/**
 * Icono pixel retro de mochila de aventurero (cuadrícula 16x16).
 */
export function IconoMochilaPixel({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* Asa superior */}
      <rect x="6" y="1" width="4" height="1" fill="#181020" />
      <rect x="5" y="2" width="1" height="2" fill="#181020" />
      <rect x="10" y="2" width="1" height="2" fill="#181020" />
      <rect x="6" y="2" width="4" height="1" fill="#7c4f2b" />

      {/* Cuerpo principal */}
      <rect x="3" y="3" width="10" height="1" fill="#181020" />
      <rect x="2" y="4" width="1" height="10" fill="#181020" />
      <rect x="13" y="4" width="1" height="10" fill="#181020" />
      <rect x="3" y="14" width="10" height="1" fill="#181020" />

      {/* Cuero base */}
      <rect x="3" y="4" width="10" height="10" fill="#8c542b" />
      {/* Solapa superior */}
      <rect x="3" y="4" width="10" height="4" fill="#a86a3a" />
      <rect x="4" y="4" width="8" height="1" fill="#c48550" />
      <rect x="3" y="8" width="10" height="1" fill="#4f2d16" />

      {/* Correas y hebilla dorada */}
      <rect x="5" y="4" width="1" height="6" fill="#5e361a" />
      <rect x="10" y="4" width="1" height="6" fill="#5e361a" />
      <rect x="5" y="8" width="1" height="2" fill="#e8c56a" />
      <rect x="10" y="8" width="1" height="2" fill="#e8c56a" />

      {/* Bolsillo frontal */}
      <rect x="4" y="10" width="8" height="3" fill="#704120" />
      <rect x="5" y="10" width="6" height="1" fill="#9c6134" />
      <rect x="7" y="11" width="2" height="1" fill="#e8c56a" />
    </svg>
  );
}

/**
 * Icono pixel-retro de billete para el resumen económico del Máster.
 */
export function IconoBilletePixel({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* Contorno */}
      <rect x="1" y="4" width="14" height="1" fill="#181020" />
      <rect x="1" y="11" width="14" height="1" fill="#181020" />
      <rect x="1" y="5" width="1" height="6" fill="#181020" />
      <rect x="14" y="5" width="1" height="6" fill="#181020" />
      {/* Papel verde */}
      <rect x="2" y="5" width="12" height="6" fill="#4f9d58" />
      <rect x="3" y="6" width="10" height="4" fill="#68ba6f" />
      {/* Esquinas */}
      <rect x="2" y="5" width="2" height="1" fill="#a8e29b" />
      <rect x="12" y="5" width="2" height="1" fill="#a8e29b" />
      <rect x="2" y="10" width="2" height="1" fill="#35753d" />
      <rect x="12" y="10" width="2" height="1" fill="#35753d" />
      {/* Medallón central */}
      <rect x="6" y="6" width="4" height="4" fill="#35753d" />
      <rect x="7" y="7" width="2" height="2" fill="#e8c56a" />
    </svg>
  );
}

/**
 * Icono pixel-retro de lupa para inspeccionar mochilas y objetos de jugadores.
 */
export function IconoLupaPixel({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* Aro superior e inferior */}
      <rect x="4" y="2" width="5" height="1" fill="#181020" />
      <rect x="4" y="9" width="5" height="1" fill="#181020" />
      <rect x="2" y="4" width="1" height="4" fill="#181020" />
      <rect x="10" y="4" width="1" height="4" fill="#181020" />
      <rect x="3" y="3" width="1" height="1" fill="#181020" />
      <rect x="9" y="3" width="1" height="1" fill="#181020" />
      <rect x="3" y="8" width="1" height="1" fill="#181020" />
      <rect x="9" y="8" width="1" height="1" fill="#181020" />
      {/* Marco dorado */}
      <rect x="4" y="3" width="5" height="1" fill="#e8c56a" />
      <rect x="4" y="8" width="5" height="1" fill="#c79535" />
      <rect x="3" y="4" width="1" height="4" fill="#e8c56a" />
      <rect x="9" y="4" width="1" height="4" fill="#c79535" />
      {/* Cristal */}
      <rect x="4" y="4" width="5" height="4" fill="#9fdcff" />
      <rect x="5" y="4" width="2" height="2" fill="#e0f6ff" />
      {/* Mango */}
      <rect x="10" y="9" width="2" height="2" fill="#181020" />
      <rect x="11" y="10" width="2" height="2" fill="#8c542b" />
      <rect x="12" y="11" width="2" height="2" fill="#6b3e1e" />
      <rect x="13" y="12" width="2" height="2" fill="#181020" />
    </svg>
  );
}

/**
 * Recorta y comprime una imagen subida a formato cuadrado 1:1 ligero (256x256).
 */
export async function recortarImagenCuadrada(archivo: File): Promise<File> {
  try {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("No se pudo leer la imagen"));
        el.src = url;
      });
      const lado = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - lado) / 2));
      const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - lado) / 2));

      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return archivo;

      ctx.drawImage(img, sx, sy, lado, lado, 0, 0, 256, 256);

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, "image/webp", 0.86)
      );
      if (!blob) return archivo;

      const base = archivo.name.replace(/\.[^.]+$/, "");
      return new File([blob], `mochila-${base}.webp`, { type: "image/webp" });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return archivo;
  }
}

const STORAGE_DIVISA_KEY = "tablero_preview_divisa_v1";
const STORAGE_MOCHILA_KEY = "tablero_preview_mochila_v1";

export function cargarDivisaLocal(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_DIVISA_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  } catch {
    return 0;
  }
}

export function guardarDivisaLocal(valor: number): void {
  try {
    window.localStorage.setItem(STORAGE_DIVISA_KEY, String(Math.max(0, Math.trunc(valor))));
  } catch {
    // Silencioso en preview
  }
}

export function cargarMochilaLocal(): ObjetoMochila[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_MOCHILA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function guardarMochilaLocal(mochila: ObjetoMochila[]): void {
  try {
    window.localStorage.setItem(STORAGE_MOCHILA_KEY, JSON.stringify(mochila));
  } catch {
    // Silencioso en preview
  }
}
