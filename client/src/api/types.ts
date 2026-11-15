export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  blocked: boolean;
  createdAt: string;
  lockedUntil: string | null;
  nickname: string | null;
}

export interface ActiveStatus {
  id: string;
  active: boolean;
}

export interface MesaJugador {
  id: string;
  name: string;
  color?: string | null;
}

export interface ImagenMaster {
  id: string;
  titulo: string | null;
  url?: string;
}

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: MesaJugador[];
  expulsados?: string[];
  pendingHostId: string | null;
  /** Si el máster ya ha empezado la partida. */
  estado: "ESPERA" | "EN_CURSO";
  colores?: Record<string, string>;
  imagenEscena?: ImagenMaster | null;
  imagenProyectada?: ImagenMaster | null;
  createdAt: string;
}

/** Archivo personal subido por el usuario (metadatos; los bytes los sirve la API). */
export interface PublicArchivo {
  id: string;
  nombre: string;
  tipo: string;
  /** El navegador puede mostrarlo dentro de la página (PDF, imagen o .docx). */
  vista: string;
  tamano: number;
  createdAt: string;
}

export interface PositTransferido {
  texto: string;
  color: string;
  giro: number;
}

export interface ArchivoTransferidoMeta {
  id: string;
  nombre: string;
  tipo: string;
  vista: string;
  tamano: number;
}

export type PublicTransferencia =
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "posit";
      posit: PositTransferido;
      createdAt: string;
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "archivo";
      archivo: ArchivoTransferidoMeta;
      createdAt: string;
    };

export type ResultadoAceptarTransferencia =
  | {
      tipo: "posit";
      posit: PositTransferido;
    }
  | {
      tipo: "archivo";
      archivo: PublicArchivo;
    };

export interface MensajeChat {
  id: string;
  mesaId: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  destinatarioId: string | null;
  destinatarioNombre: string | null;
  createdAt: string;
}

export interface EventoTirada {
  id: string;
  mesaId: string;
  jugadorId: string;
  jugadorNombre: string;
  total: number;
  formula: string;
  dados: number[];
  bonificador: number;
  caras?: number;
  especial?: "critico" | "pifia" | null;
  createdAt: string;
}
