import {
  CALIBRACION_INICIAL,
  JUGADORES_INICIALES,
  POSITS_INICIALES
} from "./datos";
import type {
  Calibracion,
  DocumentoMesa,
  ImagenEscenaPreview,
  JugadorPreview,
  PositPreview,
  Punto,
  QuadMapa,
  RectPizarra,
  TrazoPizarra
} from "./tipos";

/**
 * Persistencia de la preview en `localStorage`. En la versión real esto vivirá
 * en PostgreSQL (estado de la partida) y en R2 (archivos); aquí basta para no
 * perder el trabajo de calibración entre recargas.
 */

const CLAVE_CALIBRACION = "pocketrol.preview.calibracion.v1";
// v2: los jugadores pasan a ir en orden de llegada (Aria, Celeste, Elena,
// Borin, Dorian, Fenrir). La lista guardada por la v1 traía otro orden.
const CLAVE_JUGADORES = "pocketrol.preview.jugadores.v2";
export const CLAVE_POSITS = "pocketrol.preview.posits.v1";
const CLAVE_POSITS_MESA = "pocketrol.mesa.posits.v1";
const CLAVE_DOCS_MESA = "pocketrol.mesa.docs.v1";
export const CLAVE_TRAZOS_PIZARRA = "pocketrol.pizarra.trazos.v1";
export const CLAVE_DOCS_PIZARRA = "pocketrol.pizarra.docs.v1";
export const CLAVE_PIZARRA_CONGELADA = "pocketrol.pizarra.congelada.v1";
const CLAVE_ESCENA_PREVIEW = "pocketrol.preview.escena.v1";
const CLAVE_PROYECCION_PREVIEW = "pocketrol.preview.proyeccion.v1";

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function normalizarPunto(valor: unknown): Punto {
  if (valor && typeof valor === "object") {
    const punto = valor as { x?: unknown; y?: unknown };
    if (typeof punto.x === "number" && typeof punto.y === "number") {
      return {
        x: limitar(punto.x, 0, 100),
        y: limitar(punto.y, 0, 100)
      };
    }
  }
  return { x: 50, y: 50 };
}

function rectAQuad(rect: RectPizarra): QuadMapa {
  const { x, y, w, h } = rect;
  return {
    vertices: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ]
  };
}

/** Acepta el cuadrilátero nuevo y el rectángulo de la primera versión. */
function normalizarMapa(valor: unknown): QuadMapa {
  if (valor && typeof valor === "object") {
    const posible = valor as {
      vertices?: unknown;
      x?: unknown;
      y?: unknown;
      w?: unknown;
      h?: unknown;
    };

    if (Array.isArray(posible.vertices) && posible.vertices.length === 4) {
      const [a, b, c, d] = posible.vertices.map(normalizarPunto);
      return { vertices: [a, b, c, d] };
    }

    if (
      typeof posible.x === "number" &&
      typeof posible.y === "number" &&
      typeof posible.w === "number" &&
      typeof posible.h === "number"
    ) {
      return rectAQuad({
        x: posible.x,
        y: posible.y,
        w: posible.w,
        h: posible.h
      });
    }
  }

  return CALIBRACION_INICIAL.mapa;
}

export function cargarCalibracion(): Calibracion {
  const guardada = leer<Partial<Calibracion> | null>(CLAVE_CALIBRACION, null);

  if (!guardada || typeof guardada !== "object") {
    return CALIBRACION_INICIAL;
  }

  return {
    asientos: { ...CALIBRACION_INICIAL.asientos, ...(guardada.asientos ?? {}) },
    pizarra: { ...CALIBRACION_INICIAL.pizarra, ...(guardada.pizarra ?? {}) },
    mapa: normalizarMapa(guardada.mapa),
    dock: { ...CALIBRACION_INICIAL.dock, ...(guardada.dock ?? {}) }
  };
}

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const bruto = window.localStorage.getItem(clave);
    if (!bruto) return porDefecto;
    return JSON.parse(bruto) as T;
  } catch {
    return porDefecto;
  }
}

function escribir(clave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento disponible: la preview sigue funcionando en memoria.
  }
}

export function guardarCalibracion(calibracion: Calibracion): void {
  escribir(CLAVE_CALIBRACION, calibracion);
}

export function cargarJugadores(): JugadorPreview[] {
  const guardados = leer<JugadorPreview[] | null>(CLAVE_JUGADORES, null);
  return Array.isArray(guardados) && guardados.length > 0
    ? guardados
    : JUGADORES_INICIALES;
}

export function guardarJugadores(jugadores: JugadorPreview[]): void {
  escribir(CLAVE_JUGADORES, jugadores);
}

export function cargarPosits(): PositPreview[] {
  const guardados = leer<PositPreview[] | null>(CLAVE_POSITS, null);
  return Array.isArray(guardados) ? guardados : POSITS_INICIALES;
}

export function guardarPosits(posits: PositPreview[]): void {
  escribir(CLAVE_POSITS, posits);
}

export function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `posit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Elige texto oscuro o claro según la luminosidad del color del posit. */
export function textoLegible(color: string): string {
  const limpio = color.replace("#", "");
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map(caracter => caracter + caracter)
          .join("")
      : limpio;

  const r = parseInt(completo.slice(0, 2), 16) || 0;
  const g = parseInt(completo.slice(2, 4), 16) || 0;
  const b = parseInt(completo.slice(4, 6), 16) || 0;
  const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luz > 0.62 ? "#2a2433" : "#fbf8f2";
}

export function cargarPositsMesa(usuarioId = "preview"): PositPreview[] {
  const guardados = leer<PositPreview[] | null>(
    `${CLAVE_POSITS_MESA}:${usuarioId}`,
    null
  );
  return Array.isArray(guardados) ? guardados : [];
}

export function guardarPositsMesa(
  posits: PositPreview[],
  usuarioId = "preview"
): void {
  escribir(`${CLAVE_POSITS_MESA}:${usuarioId}`, posits);
}

export function cargarDocumentosMesa(usuarioId = "preview"): DocumentoMesa[] {
  const guardados = leer<DocumentoMesa[] | null>(
    `${CLAVE_DOCS_MESA}:${usuarioId}`,
    null
  );
  return Array.isArray(guardados) ? guardados : [];
}

export function guardarDocumentosMesa(
  documentos: DocumentoMesa[],
  usuarioId = "preview"
): void {
  escribir(`${CLAVE_DOCS_MESA}:${usuarioId}`, documentos);
}

export function infoFormatoArchivo(vista: string): {
  codigo: "PDF" | "DOC" | "IMG" | "TXT";
  clase: "pdf" | "doc" | "img" | "txt";
  color: string;
} {
  switch (vista) {
    case "pdf":
      return { codigo: "PDF", clase: "pdf", color: "#d64545" };
    case "docx":
      return { codigo: "DOC", clase: "doc", color: "#2b6cb0" };
    case "imagen":
      return { codigo: "IMG", clase: "img", color: "#2f9e6f" };
    default:
      return { codigo: "TXT", clase: "txt", color: "#64748b" };
  }
}

export function urlImagenEscena(imagen: ImagenEscenaPreview): string {
  return imagen.url ?? `/api/archivos/${encodeURIComponent(imagen.id)}`;
}

function normalizarImagenPreview(valor: unknown): ImagenEscenaPreview | null {
  if (!valor || typeof valor !== "object") return null;
  const obj = valor as { id?: unknown; titulo?: unknown; url?: unknown };
  if (typeof obj.id !== "string" || !obj.id) return null;
  return {
    id: obj.id,
    titulo: typeof obj.titulo === "string" ? obj.titulo : null,
    url: typeof obj.url === "string" ? obj.url : undefined
  };
}

export function cargarEscenaPreview(): ImagenEscenaPreview | null {
  return normalizarImagenPreview(leer<unknown>(CLAVE_ESCENA_PREVIEW, null));
}

export function guardarEscenaPreview(imagen: ImagenEscenaPreview | null): void {
  escribir(CLAVE_ESCENA_PREVIEW, imagen);
}

export function cargarProyeccionPreview(): ImagenEscenaPreview | null {
  return normalizarImagenPreview(leer<unknown>(CLAVE_PROYECCION_PREVIEW, null));
}

export function guardarProyeccionPreview(
  imagen: ImagenEscenaPreview | null
): void {
  escribir(CLAVE_PROYECCION_PREVIEW, imagen);
}

export function cargarTrazosPizarra(): TrazoPizarra[] {
  const guardados = leer<TrazoPizarra[] | null>(CLAVE_TRAZOS_PIZARRA, null);
  return Array.isArray(guardados) ? guardados : [];
}

export function guardarTrazosPizarra(trazos: TrazoPizarra[]): void {
  escribir(CLAVE_TRAZOS_PIZARRA, trazos);
}

export function cargarDocumentosPizarra(): DocumentoMesa[] {
  const guardados = leer<DocumentoMesa[] | null>(CLAVE_DOCS_PIZARRA, null);
  return Array.isArray(guardados) ? guardados : [];
}

export function guardarDocumentosPizarra(docs: DocumentoMesa[]): void {
  escribir(CLAVE_DOCS_PIZARRA, docs);
}

export function cargarPizarraCongelada(): boolean {
  return Boolean(leer<boolean>(CLAVE_PIZARRA_CONGELADA, false));
}

export function guardarPizarraCongelada(congelada: boolean): void {
  escribir(CLAVE_PIZARRA_CONGELADA, congelada);
}

/** Comprueba si el borrador en `punto` toca algún segmento de un trazo. */
export function trazoTocaPunto(
  trazo: TrazoPizarra,
  punto: Punto,
  umbral = 2.6
): boolean {
  const pts = trazo.puntos;
  if (pts.length === 0) return false;
  if (pts.length === 1) {
    return Math.hypot(pts[0].x - punto.x, pts[0].y - punto.y) <= umbral;
  }

  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const t =
      lenSq === 0
        ? 0
        : limitar(((punto.x - a.x) * abx + (punto.y - a.y) * aby) / lenSq, 0, 1);
    const px = a.x + t * abx;
    const py = a.y + t * aby;
    if (Math.hypot(punto.x - px, punto.y - py) <= umbral) {
      return true;
    }
  }
  return false;
}
