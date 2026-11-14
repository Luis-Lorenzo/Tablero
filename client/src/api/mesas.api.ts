import { http } from "./client";
import type {
  PublicMesa,
  PublicTransferencia,
  ResultadoAceptarTransferencia
} from "./types";

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

  cerrar: (id: string) => http.delete<void>(`/api/mesas/${id}`),

  /** El máster empieza la partida (va a la sala). */
  iniciar: (id: string) => http.post<PublicMesa>(`/api/mesas/${id}/iniciar`),

  /** Vuelve la partida a la sala de espera. */
  terminar: (id: string) => http.post<PublicMesa>(`/api/mesas/${id}/terminar`),

  /** Cambia el color del jugador dentro de la mesa. */
  ponerColor: (id: string, color: string | null) =>
    http.post<PublicMesa>(`/api/mesas/${id}/color`, { color }),

  pendientesCompartir: (id: string) =>
    http.get<PublicTransferencia[]>(`/api/mesas/${id}/compartir/pendientes`),

  compartir: (
    id: string,
    payload:
      | {
          receptorId: string;
          tipo: "posit";
          posit: { texto: string; color: string; giro?: number };
        }
      | {
          receptorId: string;
          tipo: "archivo";
          archivoId: string;
        }
  ) => http.post<PublicTransferencia>(`/api/mesas/${id}/compartir`, payload),

  aceptarCompartir: (id: string, transferenciaId: string) =>
    http.post<ResultadoAceptarTransferencia>(
      `/api/mesas/${id}/compartir/${encodeURIComponent(transferenciaId)}/aceptar`
    ),

  rechazarCompartir: (id: string, transferenciaId: string) =>
    http.post<void>(
      `/api/mesas/${id}/compartir/${encodeURIComponent(transferenciaId)}/rechazar`
    )
};
