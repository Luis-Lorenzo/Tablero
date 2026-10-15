import {
  isActiveUser,
  isUserLocked,
  type User
} from "../repositories/user.repository.js";

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

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    active: isActiveUser(user),
    blocked: isUserLocked(user, new Date()),
    createdAt: user.createdAt.toISOString(),
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
    nickname: user.nickname
  };
}

import type { MesaVista } from "../services/mesa.service.js";

export interface PublicMesaJugador {
  id: string;
  name: string;
}

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: PublicMesaJugador[];
  createdAt: string;
}

export function toPublicMesa(mesa: MesaVista): PublicMesa {
  return {
    id: mesa.id,
    hostId: mesa.hostId,
    hostName: mesa.hostName,
    players: mesa.players.map(player => ({ id: player.id, name: player.name })),
    createdAt: mesa.createdAt.toISOString()
  };
}
