/**
 * Tipos de la previsualización de la sala (datos falsos, sin backend).
 * Todo esto es temporal: sirve para validar el aspecto antes de la fase real.
 */

export interface JugadorPreview {
  id: string;
  nombre: string;
  color: string;
  esMaster: boolean;
  /** Asiento habilitado. El trasero derecho empieza desactivado. */
  activo: boolean;
}

export interface Asiento {
  /** Posición normalizada dentro de la imagen del fondo (0-100). */
  x: number;
  y: number;
}

export interface RectPizarra {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Calibracion {
  asientos: Record<string, Asiento>;
  pizarra: RectPizarra;
  /** Mapa de papel sobre la mesa. Aún no tiene contenido (fase 1). */
  mapa: RectPizarra;
  /** Centro de la bandeja de dados, en % del viewport. */
  dock: Asiento;
}

export interface PositPreview {
  id: string;
  texto: string;
  color: string;
  /** Posición normalizada dentro del lienzo de la pizarra (0-100). */
  x: number;
  y: number;
  /** Inclinación en grados, para que no parezcan pegados con regla. */
  giro: number;
}

export type FasePreview = "lobby" | "sala" | "pizarra" | "mapa";
