import { http } from "./client";
import type { PublicMesa } from "./types";

/**
 * Máximo de jugadores por mesa (el anfitrión no ocupa plaza). Debe coincidir
 * con `MESA_MAX_JUGADORES` del servidor: la API rechaza con `MESA_FULL`.
 */
export const MESA_MAX_JUGADORES = 6;

export const mesasApi = {
  /** Cuadrícula de la recepción: siempre 4 huecos (los vacíos, null). */
  inicio: () => http.get<Array<PublicMesa | null>>("/api/mesas/inicio"),

  /** La mesa que aloja el usuario actual, o null. */
  mia: () => http.get<PublicMesa | null>("/api/mesas/mia"),

  /** La mesa en la que al usuario actual le han ofrecido el mando, o null. */
  pendiente: () => http.get<PublicMesa | null>("/api/mesas/pendiente"),

  /** Mesa concreta por id. */
  obtener: (id: string) => http.get<PublicMesa>(`/api/mesas/${id}`),

  /** Todas las mesas; con `q` filtra por el nombre del anfitrión. */
  list: (q?: string) =>
    http.get<PublicMesa[]>(q ? `/api/mesas?q=${encodeURIComponent(q)}` : "/api/mesas"),

  crear: () => http.post<PublicMesa>("/api/mesas"),

  unirse: (id: string) => http.post<PublicMesa>(`/api/mesas/${id}/unirse`),

  abandonar: (id: string) => http.post<void>(`/api/mesas/${id}/abandonar`),

  expulsar: (id: string, playerId: string) =>
    http.post<void>(`/api/mesas/${id}/expulsar`, { playerId }),

  ceder: (id: string, playerId: string) =>
    http.post<void>(`/api/mesas/${id}/ceder`, { playerId }),

  aceptarCesion: (id: string) => http.post<void>(`/api/mesas/${id}/ceder/aceptar`),

  rechazarCesion: (id: string) => http.post<void>(`/api/mesas/${id}/ceder/rechazar`),

  cerrar: (id: string) => http.delete<void>(`/api/mesas/${id}`)
};
