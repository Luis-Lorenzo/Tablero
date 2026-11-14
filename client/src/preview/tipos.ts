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
}

export type TipoEspecialTirada = "critico" | "pifia" | null;

export interface TiradaAsiento {
  id: string;
  total: number;
  especial?: TipoEspecialTirada;
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
      remitente?: string;
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
      remitente?: string;
      contenidoLocal?: string;
    };

export interface SolicitudTransferencia {
  id: string;
  emisorNombre: string;
  tipo: "posit" | "archivo";
  nombreArchivo?: string;
  mimeArchivo?: string;
  vistaArchivo?: string;
  textoPosit?: string;
  colorPosit?: string;
  giroPosit?: number;
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
}

export interface ImagenEscenaPreview {
  id: string;
  titulo: string | null;
  url?: string;
}
