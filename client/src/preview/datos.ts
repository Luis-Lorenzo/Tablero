import type { Calibracion, JugadorPreview, PositPreview } from "./tipos";

/** Fondo de la sala. Vive en `client/public/medios/tablero/fondos/`. */
export const FONDO_SALA = "/medios/tablero/fondos/sala-extendida.jpg";

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
 * Estos valores salen del calibrado sobre `sala-extendida.jpg`.
 */
export const CALIBRACION_INICIAL: Calibracion = {
  asientos: {
    master: { x: 50.0, y: 52.8 },
    p1: { x: 61.7, y: 56.2 },
    p2: { x: 34.1, y: 60.4 },
    p3: { x: 38.0, y: 56.2 },
    p4: { x: 70.6, y: 66.2 },
    p5: { x: 65.5, y: 60.4 },
    p6: { x: 29.0, y: 66.2 }
  },
  pizarra: { x: 38.8, y: 34.4, w: 22.5, h: 15.0 },
  mapa: {
    vertices: [
      { x: 43.3, y: 55.4 },
      { x: 56.8, y: 55.4 },
      { x: 61.0, y: 63.3 },
      { x: 39.1, y: 63.3 }
    ]
  },
  dock: { x: 50.0, y: 80.5 },
  chat: { x: 1.5, y: 11, w: 22, h: 42 }
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
