import type { Archivo } from "../repositories/archivo.repository.js";
import {
  resolverDivisasConfig,
  type DivisaConfig,
  type MusicaAmbienteMesa,
  type PistaMusicaMesa
} from "../repositories/mesa.repository.js";
import {
  isActiveUser,
  isUserLocked,
  type User
} from "../repositories/user.repository.js";
import type { MesaVista } from "../services/mesa.service.js";
import type {
  ArchivoTransferidoMeta,
  ObjetoTransferido,
  PositTransferido,
  Transferencia
} from "../services/transferencia.service.js";
import { vistaDe } from "../lib/archivos.js";

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
  color?: string | null;
  retratoArchivoId?: string | null;
}

export interface PublicImagenMesa {
  id: string;
  titulo: string | null;
}

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: PublicMesaJugador[];
  /** Usuarios vetados: el cliente los usa para no ofrecer la entrada. */
  expulsados: string[];
  pendingHostId: string | null;
  /** Si el máster ya ha empezado la partida. */
  estado: MesaVista["estado"];
  colores: Record<string, string>;
  playerApodos?: Record<string, string>;
  retratosPorJugador?: Record<string, string | null>;
  imagenEscena: PublicImagenMesa | null;
  imagenProyectada: PublicImagenMesa | null;
  divisaNombre?: string;
  divisasConfig?: DivisaConfig[];
  musicaAmbiente?: MusicaAmbienteMesa | null;
  tieneContrasena: boolean;
  contrasena?: string | null;
  createdAt: string;
}

export type { MusicaAmbienteMesa, PistaMusicaMesa };

export function toPublicMesa(mesa: MesaVista, actor?: User): PublicMesa {
  const esAdminLibre = Boolean(
    actor && actor.role === "ADMIN" && !mesa.players.some(jugador => jugador.id === actor.id)
  );
  const puedeVerContrasena = Boolean(actor && (mesa.hostId === actor.id || esAdminLibre));
  return {
    id: mesa.id,
    hostId: mesa.hostId,
    hostName: mesa.hostName,
    players: mesa.players.map(jugador => ({
      id: jugador.id,
      name: jugador.name,
      color: jugador.color ?? null,
      retratoArchivoId: jugador.retratoArchivoId ?? null
    })),
    expulsados: mesa.expulsados ?? [],
    pendingHostId: mesa.pendingHostId,
    estado: mesa.estado,
    colores: mesa.colores ?? {},
    playerApodos: mesa.playerApodos ?? {},
    retratosPorJugador: mesa.retratosPorJugador ?? {},
    imagenEscena: mesa.imagenEscena ?? null,
    imagenProyectada: mesa.imagenProyectada ?? null,
    divisaNombre: mesa.divisaNombre ?? "Divisa",
    divisasConfig: resolverDivisasConfig(mesa),
    musicaAmbiente: mesa.musicaAmbiente ?? null,
    tieneContrasena: Boolean(mesa.contrasena),
    ...(puedeVerContrasena ? { contrasena: mesa.contrasena ?? null } : {}),
    createdAt: mesa.createdAt.toISOString()
  };
}

export interface PublicArchivo {
  id: string;
  nombre: string;
  tipo: string;
  /** Cómo mostrarlo dentro de la página (pdf, imagen, docx, texto o ninguna). */
  vista: string;
  tamano: number;
  createdAt: string;
  updatedAt: string;
}

export function toPublicArchivo(archivo: Archivo): PublicArchivo {
  return {
    id: archivo.id,
    nombre: archivo.nombre,
    tipo: archivo.tipo,
    vista: vistaDe(archivo.tipo),
    tamano: archivo.tamano,
    createdAt: archivo.createdAt.toISOString(),
    updatedAt: (archivo.updatedAt ?? archivo.createdAt).toISOString()
  };
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
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "objeto";
      objeto: ObjetoTransferido;
      createdAt: string;
    };

export function toPublicTransferencia(
  transferencia: Transferencia
): PublicTransferencia {
  const base = {
    id: transferencia.id,
    mesaId: transferencia.mesaId,
    emisorId: transferencia.emisorId,
    emisorNombre: transferencia.emisorNombre,
    receptorId: transferencia.receptorId,
    createdAt: transferencia.createdAt.toISOString()
  };

  if (transferencia.tipo === "posit") {
    return { ...base, tipo: "posit", posit: transferencia.posit };
  }

  if (transferencia.tipo === "objeto") {
    return { ...base, tipo: "objeto", objeto: transferencia.objeto };
  }

  return { ...base, tipo: "archivo", archivo: transferencia.archivo };
}
