import {
  CALIBRACION_INICIAL,
  JUGADORES_INICIALES,
  POSITS_INICIALES
} from "./datos";
import type { Calibracion, JugadorPreview, PositPreview } from "./tipos";

/**
 * Persistencia de la preview en `localStorage`. En la versión real esto vivirá
 * en PostgreSQL (estado de la partida) y en R2 (archivos); aquí basta para no
 * perder el trabajo de calibración entre recargas.
 */

const CLAVE_CALIBRACION = "pocketrol.preview.calibracion.v1";
const CLAVE_JUGADORES = "pocketrol.preview.jugadores.v1";
const CLAVE_POSITS = "pocketrol.preview.posits.v1";

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

export function cargarCalibracion(): Calibracion {
  const guardada = leer<Partial<Calibracion> | null>(CLAVE_CALIBRACION, null);

  if (!guardada || typeof guardada !== "object") {
    return CALIBRACION_INICIAL;
  }

  return {
    asientos: { ...CALIBRACION_INICIAL.asientos, ...(guardada.asientos ?? {}) },
    pizarra: { ...CALIBRACION_INICIAL.pizarra, ...(guardada.pizarra ?? {}) },
    mapa: { ...CALIBRACION_INICIAL.mapa, ...(guardada.mapa ?? {}) },
    dock: { ...CALIBRACION_INICIAL.dock, ...(guardada.dock ?? {}) }
  };
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
