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
    master: { x: 50.04076963801972, y: 42.934901250994145 },
    p1: { x: 69.2578265057803, y: 50.31669512213982 },
    p2: { x: 24.49736947128753, y: 58.01911367332742 },
    p3: { x: 30.544822273537044, y: 50.622217546036865 },
    p4: { x: 85.619671798266, y: 68.37402442562203 },
    p5: { x: 76.03265997559794, y: 57.94658853791983 },
    p6: { x: 14.98536921553315, y: 68.75206807942662 }
  },
  pizarra: { x: 32.025959245819664, y: 12.843529500350636, w: 36.19270372786609, h: 24.641241549083777 },
  mapa: {
    vertices: [
      { x: 39.31904035306125, y: 48.6144481005132 },
      { x: 60.96928268880985, y: 48.89707977419673 },
      { x: 68.8940981175785, y: 62.26763032536409 },
      { x: 31.050664774081742, y: 62.42985583019637 }
    ]
  },
  dock: { x: 50.17360986447802, y: 80.47148201057503 }
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
