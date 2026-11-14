/**
 * Tipos de la previsualización de la sala (datos falsos, sin backend).
 * Todo esto es temporal: sirve para validar el aspecto antes de la fase real.
 */

export interface JugadorPreview {
  id: string;
  /** Identificador real del usuario en el servidor (en modo real). */
  usuarioId?: string;
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
  mapa: QuadMapa;
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
