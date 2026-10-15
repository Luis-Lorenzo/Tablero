import type { Archivo } from "../repositories/archivo.repository.js";
import {
  isActiveUser,
  isUserLocked,
  type User
} from "../repositories/user.repository.js";
import type { MesaVista } from "../services/mesa.service.js";
import { tipoVisible } from "../lib/archivos.js";

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

export interface PublicMesaJugador {
  id: string;
  name: string;
}

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: PublicMesaJugador[];
  pendingHostId: string | null;
  createdAt: string;
}

export function toPublicMesa(mesa: MesaVista): PublicMesa {
  return {
    id: mesa.id,
    hostId: mesa.hostId,
    hostName: mesa.hostName,
    players: mesa.players.map(jugador => ({
      id: jugador.id,
      name: jugador.name
    })),
    pendingHostId: mesa.pendingHostId,
    createdAt: mesa.createdAt.toISOString()
  };
}

export interface PublicArchivo {
  id: string;
  nombre: string;
  tipo: string;
  /** Tipo que el navegador puede mostrar dentro de la página. */
  visible: boolean;
  tamano: number;
  createdAt: string;
}

export function toPublicArchivo(archivo: Archivo): PublicArchivo {
  return {
    id: archivo.id,
    nombre: archivo.nombre,
    tipo: archivo.tipo,
    visible: tipoVisible(archivo.tipo),
    tamano: archivo.tamano,
    createdAt: archivo.createdAt.toISOString()
  };
}
