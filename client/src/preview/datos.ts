import type { Calibracion, JugadorPreview, PositPreview } from "./tipos";

/** Fondo de la sala. Vive en `client/public/medios/tablero/fondos/`. */
export const FONDO_SALA = "/medios/tablero/fondos/sala-default.png";

/**
 * Paleta de posits acordada con el autor: blanco + cinco tonos.
 * Al cambiar de color se mantiene el texto legible.
 */
export const COLORES_POSIT = [
  { nombre: "Blanco", valor: "#ffffff" },
  { nombre: "Morado", valor: "#74569b" },
  { nombre: "Menta", valor: "#96fbc7" },
  { nombre: "Limón", valor: "#f7ffae" },
  { nombre: "Rosa", valor: "#ffb3cb" },
  { nombre: "Lila", valor: "#d8bfd8" }
] as const;

/**
 * Jugadores de mentira para la preview: el máster y seis asientos laterales.
 *
 * Van en orden de llegada: Aria, Celeste, Elena, Borin, Dorian y Fenrir. Si
 * llegan menos de seis, las sillas se llenan en ese mismo orden (p1 → p6) y
 * las últimas quedan libres. `p6` arranca desactivado (una línea para activarlo).
 */
export const JUGADORES_INICIALES: JugadorPreview[] = [
  { id: "master", nombre: "Máster", color: "#e8c56a", esMaster: true, activo: true },
  { id: "p1", nombre: "Aria", color: "#74569b", esMaster: false, activo: true },
  { id: "p2", nombre: "Celeste", color: "#f7ffae", esMaster: false, activo: true },
  { id: "p3", nombre: "Elena", color: "#d8bfd8", esMaster: false, activo: true },
  { id: "p4", nombre: "Borin", color: "#96fbc7", esMaster: false, activo: true },
  { id: "p5", nombre: "Dorian", color: "#ffb3cb", esMaster: false, activo: true },
  { id: "p6", nombre: "Fenrir", color: "#8fb8ff", esMaster: false, activo: false }
];

/**
 * Colocación de partida (se ajusta a mano con el calibrador). Las posiciones
 * son porcentajes de la imagen del fondo, no píxeles.
 *
 * Estos valores salen del calibrado real sobre `sala-default.png`.
 */
export const CALIBRACION_INICIAL: Calibracion = {
  asientos: {
    master: { x: 50.04, y: 42.93 },
    p1: { x: 68.93, y: 50.1 },
    p2: { x: 24.5, y: 58.02 },
    p3: { x: 30.91, y: 51.06 },
    p4: { x: 85.62, y: 68.37 },
    p5: { x: 76.03, y: 57.95 },
    p6: { x: 14.99, y: 68.75 }
  },
  pizarra: { x: 32.03, y: 12.84, w: 36.19, h: 24.64 },
  mapa: {
    vertices: [
      { x: 35.47, y: 48.61 },
      { x: 64.65, y: 48.61 },
      { x: 64.65, y: 62.68 },
      { x: 35.47, y: 62.68 }
    ]
  },
  dock: { x: 50.17, y: 80.47 }
};

export const POSITS_INICIALES: PositPreview[] = [
  {
    id: "posit-inicial-1",
    texto: "La puerta del fondo está cerrada con runas.",
    color: "#f7ffae",
    x: 24,
    y: 32,
    giro: -2.5
  },
  {
    id: "posit-inicial-2",
    texto: "Pista: el mercader miente.",
    color: "#ffb3cb",
    x: 50,
    y: 22,
    giro: 1.8
  },
  {
    id: "posit-inicial-3",
    texto: "Recordar: 3 antorchas, 1 llave.",
    color: "#96fbc7",
    x: 74,
    y: 36,
    giro: -1.2
  }
];
