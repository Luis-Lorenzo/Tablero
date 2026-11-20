/**
 * Tipos de la previsualización de la sala (datos falsos, sin backend).
 * Todo esto es temporal: sirve para validar el aspecto antes de la fase real.
 */

export interface JugadorPreview {
  id: string;
  /** Identificador real del usuario en el servidor (en modo real). */
  usuarioId?: string;
  /** ID real del usuario en el backend (en modo preview coincide con `id`). */
  userId?: string;
  nombre: string;
  /** Nombre del personaje en esta mesa (editable por cada jugador). */
  apodo?: string;
  retratoArchivoId?: string | null;
  color: string;
  esMaster: boolean;
  /** Asiento habilitado. El trasero derecho empieza desactivado. */
  activo: boolean;
}

export interface Punto {
  /** Posición normalizada dentro de la imagen del fondo (0-100). */
  x: number;
  y: number;
}

export type Asiento = Punto;

export interface RectPizarra {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QuadMapa {
  /**
   * Vértices en orden: arriba-izquierda, arriba-derecha, abajo-derecha y
   * abajo-izquierda. El mapa está dibujado en perspectiva, así que no es un
   * rectángulo: hay que poder mover cada esquina.
   */
  vertices: [Punto, Punto, Punto, Punto];
}

export interface Calibracion {
  asientos: Record<string, Asiento>;
  pizarra: RectPizarra;
  chat: RectPizarra;
  mapa: QuadMapa;
  /** Centro de la bandeja de dados, en % del viewport. */
  dock: Asiento;
}

export interface MensajeSala {
  id: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  destinatarioId: string | null;
  destinatarioNombre: string | null;
  destinatarioIds?: string[];
  destinatarioNombres?: string[];
  createdAt: string;
  /** Mensajes de sistema locales (ej. tiradas públicas en chat). */
  esSistema?: boolean;
  /** Mensajes de cambio económico/divisa (aparecen solo en Todo). */
  esDivisa?: boolean;
}

export type TipoEspecialTirada = "critico" | "pifia" | null;

export interface TiradaAsiento {
  id: string;
  total: number;
  especial?: TipoEspecialTirada;
  caras?: number;
  desglose?: string;
  nombreMacro?: string;
  colorDado?: string;
  colorAristasDado?: string;
}

export interface PositPreview {
  id: string;
  texto: string;
  color: string;
  /** Posición normalizada dentro del lienzo de la pizarra o mesa (0-100). */
  x: number;
  y: number;
  /** Inclinación en grados, para que no parezcan pegados con regla. */
  giro: number;
  /** Dimensiones personalizadas en píxeles (ancho 150..460, alto 110..420). */
  ancho?: number;
  alto?: number;
  /** Si está guardado en el archivador personal del jugador. */
  archivado?: boolean;
  /** Datos del creador para mostrar el aura de jugador o dorada del Máster. */
  autorNombre?: string;
  autorColor?: string;
  esMaster?: boolean;
}

export type FasePreview = "lobby" | "sala" | "pizarra" | "mapa" | "archivador";

export type ElementoMesa =
  | {
      id: string;
      tipo: "posit";
      texto: string;
      color: string;
      giro: number;
      x: number;
      y: number;
      ancho?: number;
      alto?: number;
      archivado?: boolean;
      remitente?: string;
      autorNombre?: string;
      autorColor?: string;
      esMaster?: boolean;
    }
  | {
      id: string;
      tipo: "archivo";
      archivoId: string;
      nombre: string;
      mime: string;
      vista: string;
      tamano: number;
      x: number;
      y: number;
      archivado?: boolean;
      remitente?: string;
      contenidoLocal?: string;
    }
  | {
      id: string;
      tipo: "objeto";
      nombre: string;
      descripcion: string;
      cantidad: number;
      emoji?: string;
      archivoId?: string;
      archivoNombre?: string;
      imagenLocal?: string;
      macro?: MacroTirada;
      x: number;
      y: number;
      archivado?: boolean;
      remitente?: string;
    }
  | {
      id: string;
      tipo: "macro";
      macroId: string;
      nombre: string;
      icono: string;
      color?: string;
      grupos: GrupoDadoMacro[];
      bonificador: number;
      x: number;
      y: number;
      archivado?: boolean;
    };

export const COLORES_DIVISA = [
  { id: "azul-electrico", nombre: "Azul eléctrico", hex: "#2563eb" },
  { id: "magenta", nombre: "Magenta", hex: "#d946ef" },
  { id: "blanco", nombre: "Blanco", hex: "#f8fafc" },
  { id: "verde", nombre: "Verde", hex: "#22c55e" },
  { id: "cobre", nombre: "Cobre", hex: "#b87333" },
  { id: "plata", nombre: "Plata", hex: "#cbd5e1" },
  { id: "negro-carbon", nombre: "Negro carbón", hex: "#27272a" },
  { id: "rojo-rubi", nombre: "Rojo rubí", hex: "#e11d48" },
  { id: "naranja", nombre: "Naranja", hex: "#f97316" }
] as const;

export interface DivisaConfig {
  id: string;
  nombre: string;
  color: string;
}

export interface ObjetoMochila {
  id: string;
  nombre: string;
  descripcion: string;
  cantidad: number;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
  imagenLocal?: string;
  macro?: MacroTirada;
}

export interface DivisaAsientoDelta {
  id: string;
  delta: number;
}

export interface SolicitudTransferencia {
  id: string;
  emisorNombre: string;
  tipo: "posit" | "archivo" | "objeto";
  nombreArchivo?: string;
  mimeArchivo?: string;
  vistaArchivo?: string;
  textoPosit?: string;
  colorPosit?: string;
  giroPosit?: number;
  objeto?: {
    idOrigen?: string;
    nombre: string;
    descripcion: string;
    cantidad: number;
    emoji?: string;
    archivoId?: string;
    archivoNombre?: string;
  };
}

export interface DocumentoMesa {
  id: string;
  nombre: string;
  tipo: string;
  vista: string;
  tamano: number;
  x: number;
  y: number;
  url?: string;
}

export type FormaTrazo = "libre" | "linea" | "flecha";

export interface TrazoPizarra {
  id: string;
  color: string;
  grosor: number;
  /** Puntos normalizados (0-100) dentro del lienzo de la pizarra. */
  puntos: Punto[];
  autorId?: string;
  forma?: FormaTrazo;
}

export type TamanoTextoEscena = "sm" | "md" | "lg";

export interface TextoEscena {
  id: string;
  texto: string;
  x: number;
  y: number;
  color: string;
  tamano: TamanoTextoEscena;
  ancho?: number;
  autorId?: string;
  autorNombre?: string;
}

export interface ImagenEscenaPreview {
  id: string;
  titulo: string | null;
  url?: string;
}

export interface PingVisual {
  id: string;
  x: number;
  y: number;
  color: string;
  vista: "pizarra" | "escena" | "mapa";
  autorNombre?: string;
}

export interface ReglaVisual {
  autorId: string;
  autorNombre?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface GrupoDadoMacro {
  caras: number;
  cantidad: number;
}

export const COLORES_MACRO = [
  { id: "defecto", nombre: "Oscuro", hex: "" },
  { id: "negro-carbon", nombre: "Negro carbón", hex: "#18181b" },
  { id: "acero", nombre: "Gris acero", hex: "#334155" },
  { id: "rojo", nombre: "Rojo oscuro", hex: "#7f1d1d" },
  { id: "carmesi", nombre: "Carmesí", hex: "#b91c1c" },
  { id: "naranja", nombre: "Naranja", hex: "#9a3412" },
  { id: "ambar", nombre: "Ámbar", hex: "#b45309" },
  { id: "dorado", nombre: "Dorado", hex: "#854d0e" },
  { id: "lima", nombre: "Lima oscuro", hex: "#3f6212" },
  { id: "verde", nombre: "Verde bosque", hex: "#14532d" },
  { id: "esmeralda", nombre: "Esmeralda", hex: "#065f46" },
  { id: "turquesa", nombre: "Turquesa", hex: "#115e59" },
  { id: "cyan", nombre: "Cian", hex: "#155e75" },
  { id: "azul", nombre: "Azul marino", hex: "#1e3a8a" },
  { id: "cobalto", nombre: "Azul cobalto", hex: "#1d4ed8" },
  { id: "indigo", nombre: "Índigo", hex: "#3730a3" },
  { id: "morado", nombre: "Morado", hex: "#581c87" },
  { id: "violeta", nombre: "Violeta", hex: "#6d28d9" },
  { id: "magenta", nombre: "Magenta", hex: "#831843" },
  { id: "rosa", nombre: "Rosa oscuro", hex: "#9d174d" }
] as const;

export interface MacroTirada {
  id: string;
  nombre: string;
  icono: string;
  color?: string;
  grupos: GrupoDadoMacro[];
  bonificador: number;
}

export interface MapaRejillaConfig {
  visible: boolean;
  columnas: number;
  filas: number;
  filasAuto: boolean;
  offsetX: number;
  offsetY: number;
  color: string;
  opacidad: number;
  imanActivo: boolean;
}

export interface MapaFondoConfig {
  archivoId?: string;
  url: string;
  titulo?: string;
  anchoNatural?: number;
  altoNatural?: number;
}

export interface TokenMapa {
  id: string;
  nombre: string;
  archivoId?: string;
  imagenUrl: string;
  x: number;
  y: number;
  celdasAncho: number;
  celdasAlto: number;
  escala: number;
  autorId: string;
  autorNombre: string;
  autorColor: string;
  esMonstruo?: boolean;
  enLimbo?: boolean;
}

export interface PlantillaTokenMapa {
  id: string;
  nombre: string;
  archivoId?: string;
  imagenUrl: string;
  celdasAncho: number;
  celdasAlto: number;
  escala: number;
  autorId: string;
  esMonstruo?: boolean;
  categoria?: string;
}

export interface IniciativaEntrada {
  id: string;
  nombre: string;
  valor: number;
  color?: string;
  esMonstruo?: boolean;
  jugadorId?: string;
  tokenId?: string;
}

export interface MapaIniciativaEstado {
  activa: boolean;
  ronda: number;
  turnoIndice: number;
  entradas: IniciativaEntrada[];
  turnoMaxSegundos?: number | null;
  turnoIniciadoEn?: number;
}

export interface AreaMapa {
  id: string;
  tipo: "circulo" | "cono";
  x: number;
  y: number;
  celdas: number;
  angulo: number;
  color: string;
  autorId: string;
  autorNombre: string;
}

export interface EstadoMapaCompartido {
  fondo: MapaFondoConfig | null;
  rejilla: MapaRejillaConfig;
  tokens: TokenMapa[];
  plantillas: PlantillaTokenMapa[];
  iniciativa?: MapaIniciativaEstado;
  trazos?: TrazoPizarra[];
  areas?: AreaMapa[];
  dibujoCongelado?: boolean;
  servidorAhora?: number;
}
