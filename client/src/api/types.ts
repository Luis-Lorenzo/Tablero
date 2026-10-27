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

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: MesaJugador[];
  pendingHostId: string | null;
  /** Si el máster ya ha empezado la partida. */
  estado: "ESPERA" | "EN_CURSO";
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
