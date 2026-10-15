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

  /** Todas las mesas; con `q` filtra por el nombre del anfitrión. */
  list: (q?: string) =>
    http.get<PublicMesa[]>(q ? `/api/mesas?q=${encodeURIComponent(q)}` : "/api/mesas"),

  crear: () => http.post<PublicMesa>("/api/mesas"),

  unirse: (id: string) => http.post<PublicMesa>(`/api/mesas/${id}/unirse`),

  cerrar: (id: string) => http.delete<void>(`/api/mesas/${id}`)
};
