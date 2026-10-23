import {
  CALIBRACION_INICIAL,
  JUGADORES_INICIALES,
  POSITS_INICIALES
} from "./datos";
import type {
  Calibracion,
  JugadorPreview,
  PositPreview,
  Punto,
  QuadMapa,
  RectPizarra
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
const CLAVE_POSITS = "pocketrol.preview.posits.v1";

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
