export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  blocked: boolean;
  createdAt: string;
  lockedUntil: string | null;
}

export interface ActiveStatus {
  id: string;
  active: boolean;
}

export interface MesaJugador {
  id: string;
  name: string;
}

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: MesaJugador[];
  createdAt: string;
}
