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
  createdAt: string;
  /** Mensajes de sistema locales (ej. tiradas públicas en chat). */
  esSistema?: boolean;
  /** Mensajes de cambio económico/divisa (aparecen en Todo y Chat, no en Dados). */
  esDivisa?: boolean;
}

export type TipoEspecialTirada = "critico" | "pifia" | null;

export interface TiradaAsiento {
  id: string;
  total: number;
  especial?: TipoEspecialTirada;
  caras?: number;
  desglose?: string;
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
      x: number;
      y: number;
      archivado?: boolean;
      remitente?: string;
    };

export interface ObjetoMochila {
  id: string;
  nombre: string;
  descripcion: string;
  cantidad: number;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
  imagenLocal?: string;
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

export interface TrazoPizarra {
  id: string;
  color: string;
  grosor: number;
  /** Puntos normalizados (0-100) dentro del lienzo de la pizarra. */
  puntos: Punto[];
  autorId?: string;
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

export interface GrupoDadoMacro {
  caras: number;
  cantidad: number;
}

export interface MacroTirada {
  id: string;
  nombre: string;
  icono: string;
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
}

export interface EstadoMapaCompartido {
  fondo: MapaFondoConfig | null;
  rejilla: MapaRejillaConfig;
  tokens: TokenMapa[];
  plantillas: PlantillaTokenMapa[];
  iniciativa?: MapaIniciativaEstado;
  trazos?: TrazoPizarra[];
  dibujoCongelado?: boolean;
}
