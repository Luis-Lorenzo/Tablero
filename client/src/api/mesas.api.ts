import { http } from "./client";
import type {
  EventoTirada,
  MensajeChat,
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
      | {
          receptorId: string;
          tipo: "objeto";
          objeto: {
            idOrigen?: string;
            nombre: string;
            descripcion: string;
            cantidad: number;
            emoji?: string;
            archivoId?: string;
            archivoNombre?: string;
          };
        }
  ) => http.post<PublicTransferencia>(`/api/mesas/${id}/compartir`, payload),

  aceptarCompartir: (id: string, transferenciaId: string) =>
    http.post<ResultadoAceptarTransferencia>(
      `/api/mesas/${id}/compartir/${encodeURIComponent(transferenciaId)}/aceptar`
    ),

  rechazarCompartir: (id: string, transferenciaId: string) =>
    http.post<void>(
      `/api/mesas/${id}/compartir/${encodeURIComponent(transferenciaId)}/rechazar`
    ),

  /** Historial reciente del chat de la mesa. */
  listarChat: (id: string) => http.get<MensajeChat[]>(`/api/mesas/${id}/chat`),

  /** Envía un mensaje público o privado (@mención) al chat de la mesa. */
  enviarChat: (id: string, texto: string, destinatarioId?: string | null) =>
    http.post<MensajeChat>(`/api/mesas/${id}/chat`, {
      texto,
      destinatarioId: destinatarioId ?? null
    }),

  /** Difunde una tirada de dados pública (o valida una secreta del Máster). */
  enviarTirada: (
    id: string,
    datos: {
      total: number;
      formula: string;
      dados: number[];
      bonificador: number;
      caras?: number;
      especial?: "critico" | "pifia" | null;
      secreta?: boolean;
      soloMaster?: boolean;
    }
  ) => http.post<EventoTirada | void>(`/api/mesas/${id}/tiradas`, datos),

  /** Fija o retira la imagen de escena del máster en la pizarra de la sala. */
  ponerEscena: (
    id: string,
    archivoId: string | null,
    titulo?: string | null
  ) =>
    http.post<PublicMesa>(`/api/mesas/${id}/escena`, {
      archivoId,
      titulo: titulo ?? null
    }),

  /** Proyecta o retira una imagen dramática a pantalla completa para todos. */
  proyectar: (id: string, archivoId: string | null, titulo?: string | null) =>
    http.post<PublicMesa>(`/api/mesas/${id}/proyeccion`, {
      archivoId,
      titulo: titulo ?? null
    }),

  /** Carga los elementos en mesa, divisa y mochila del jugador actual. */
  obtenerEstado: (id: string) =>
    http.get<{ elementos: unknown[]; divisa?: number; mochila?: unknown[] }>(
      `/api/mesas/${id}/estado`
    ),

  /** Guarda los elementos en mesa y/o mochila del jugador actual. */
  guardarEstado: (id: string, elementos: unknown[], mochila?: unknown[]) =>
    http.patch<void>(`/api/mesas/${id}/estado`, {
      elementos,
      ...(mochila !== undefined ? { mochila } : {})
    }),

  /** Actualiza la divisa del jugador actual y difunde el cambio delta. */
  guardarDivisa: (id: string, divisa: number, delta?: number) =>
    http.patch<{ divisa: number }>(`/api/mesas/${id}/divisa`, {
      divisa,
      ...(delta !== undefined ? { delta } : {})
    }),

  /** Cambia el nombre de la divisa de la mesa (solo Máster). */
  cambiarDivisaNombre: (id: string, nombre: string) =>
    http.patch<PublicMesa>(`/api/mesas/${id}/divisa-nombre`, { nombre }),

  /** Carga el estado compartido de la pizarra y vista escena de la mesa. */
  obtenerPizarra: (id: string) =>
    http.get<{
      posits: unknown[];
      trazos: unknown[];
      documentos: unknown[];
      trazosEscena: unknown[];
      positsEscena: unknown[];
      docsEscena: unknown[];
      tamanoImagenesEscena: Record<string, { w: number; h: number }>;
      congelada: boolean;
    }>(`/api/mesas/${id}/pizarra`),

  /** Guarda y difunde el estado compartido de la pizarra y vista escena. */
  guardarPizarra: (
    id: string,
    datos: {
      posits: unknown[];
      trazos: unknown[];
      documentos: unknown[];
      trazosEscena: unknown[];
      positsEscena: unknown[];
      docsEscena: unknown[];
      tamanoImagenesEscena: Record<string, { w: number; h: number }>;
      congelada: boolean;
    }
  ) => http.patch<void>(`/api/mesas/${id}/pizarra`, datos),

  /** Envía un ping visual temporal en pizarra, escena o mapa. */
  enviarPing: (
    id: string,
    datos: {
      x: number;
      y: number;
      vista: "pizarra" | "escena" | "mapa";
      color: string;
    }
  ) => http.post<void>(`/api/mesas/${id}/ping`, datos),

  /** Resumen de divisa, mochila y objetos en mesa de jugadores conectados (solo Máster). */
  resumenInventarioMaster: (id: string) =>
    http.get<{
      jugadores: Array<{
        userId: string;
        nombre: string;
        color: string;
        divisa: number;
        mochila: Array<{
          id: string;
          nombre: string;
          descripcion: string;
          cantidad: number;
          emoji?: string;
          archivoId?: string;
          archivoNombre?: string;
        }>;
        objetosMesa: Array<{
          id: string;
          nombre: string;
          descripcion: string;
          cantidad: number;
          emoji?: string;
          archivoId?: string;
          archivoNombre?: string;
        }>;
      }>;
    }>(`/api/mesas/${id}/master-resumen`)
};
