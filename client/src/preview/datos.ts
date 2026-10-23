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
 * `p6` es el trasero derecho y arranca desactivado (una línea para activarlo).
 */
export const JUGADORES_INICIALES: JugadorPreview[] = [
  { id: "master", nombre: "Máster", color: "#e8c56a", esMaster: true, activo: true },
  { id: "p1", nombre: "Aria", color: "#74569b", esMaster: false, activo: true },
  { id: "p2", nombre: "Borin", color: "#96fbc7", esMaster: false, activo: true },
  { id: "p3", nombre: "Celeste", color: "#f7ffae", esMaster: false, activo: true },
  { id: "p4", nombre: "Dorian", color: "#ffb3cb", esMaster: false, activo: true },
  { id: "p5", nombre: "Elena", color: "#d8bfd8", esMaster: false, activo: true },
  { id: "p6", nombre: "Fenrir", color: "#8fb8ff", esMaster: false, activo: false }
];

/**
 * Colocación de partida (se ajusta a mano con el calibrador). Las posiciones
 * son porcentajes de la imagen del fondo, no píxeles.
 */
export const CALIBRACION_INICIAL: Calibracion = {
  asientos: {
    master: { x: 50, y: 90 },
    p1: { x: 26, y: 72 },
    p2: { x: 13, y: 52 },
    p3: { x: 25, y: 33 },
    p4: { x: 74, y: 72 },
    p5: { x: 87, y: 52 },
    p6: { x: 75, y: 33 }
  },
  pizarra: { x: 37, y: 9, w: 26, h: 20 }
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
