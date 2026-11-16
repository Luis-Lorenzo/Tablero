import { ApiError, http } from "./client";
import type {
  ActualizarPlantillaMapaPayload,
  ActualizarTokenMapaPayload,
  CrearTokenMapaPayload,
  DivisaConfig,
  EstadoMapaCompartido,
  EventoTirada,
  GuardarMapaFondoPayload,
  MapaIniciativaEstado,
  MensajeChat,
  MusicaAmbienteMesa,
  PublicMesa,
  PublicTransferencia,
  ResultadoAceptarTransferencia,
  TrazoMapa
} from "./types";

async function putJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : "UNKNOWN_ERROR";
    throw new ApiError(code, response.status);
  }
  return data as T;
}

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

  /** Cambia o limpia el apodo de personaje del jugador dentro de la mesa. */
  cambiarApodo: (id: string, apodo: string) =>
    http.patch<PublicMesa>(`/api/mesas/${id}/apodo`, { apodo }),

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

  /** Difunde un posit, archivo u objeto a todos los demás participantes (solo Máster). */
  compartirATodos: (
    id: string,
    payload:
      | {
          tipo: "posit";
          posit: { texto: string; color: string; giro?: number };
        }
      | {
          tipo: "archivo";
          archivoId: string;
        }
      | {
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
  ) =>
    http.post<{ ok: boolean; destinatarios: number; elemento: unknown }>(
      `/api/mesas/${id}/compartir-todos`,
      payload
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
    http.get<{
      elementos: unknown[];
      divisa?: number;
      divisasSaldos?: Record<string, number>;
      mochila?: unknown[];
    }>(`/api/mesas/${id}/estado`),

  /** Guarda los elementos en mesa y/o mochila del jugador actual. */
  guardarEstado: (id: string, elementos: unknown[], mochila?: unknown[]) =>
    http.patch<void>(`/api/mesas/${id}/estado`, {
      elementos,
      ...(mochila !== undefined ? { mochila } : {})
    }),

  /** Actualiza la divisa del jugador actual y difunde el cambio delta. */
  guardarDivisa: (id: string, divisa: number, delta?: number, divisaId?: string) =>
    http.patch<{
      divisa: number;
      divisaId?: string;
      divisasSaldos?: Record<string, number>;
    }>(`/api/mesas/${id}/divisa`, {
      divisa,
      ...(delta !== undefined ? { delta } : {}),
      ...(divisaId !== undefined ? { divisaId } : {})
    }),

  /** Transfiere monedas de una divisa del jugador actual a otro miembro de la mesa. */
  transferirDivisa: (
    id: string,
    datos: { receptorId: string; divisaId: string; cantidad: number }
  ) =>
    http.post<{
      divisa: number;
      divisaId?: string;
      divisasSaldos?: Record<string, number>;
    }>(`/api/mesas/${id}/divisa/transferir`, datos),

  /** Cambia el nombre de la divisa de la mesa (solo Máster). */
  cambiarDivisaNombre: (id: string, nombre: string) =>
    http.patch<PublicMesa>(`/api/mesas/${id}/divisa-nombre`, { nombre }),

  /** Configura las divisas de la mesa (solo Máster/Admin, máx. 12). */
  guardarDivisasConfig: (id: string, divisas: DivisaConfig[]) =>
    putJson<PublicMesa>(`/api/mesas/${id}/divisas`, { divisas }),

  /** Actualiza el estado de la música ambiente de la mesa (solo Máster/Admin). */
  actualizarMusica: (id: string, musica: MusicaAmbienteMesa) =>
    putJson<{ musica: MusicaAmbienteMesa }>(`/api/mesas/${id}/musica`, musica),

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
      objetos?: Array<Record<string, unknown>>;
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
      objetos?: Array<Record<string, unknown>>;
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
      divisasConfig?: DivisaConfig[];
      jugadores: Array<{
        userId: string;
        nombre: string;
        color: string;
        divisa: number;
        divisasSaldos?: Record<string, number>;
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
    }>(`/api/mesas/${id}/master-resumen`),

  /** Carga el estado compartido del mapa táctico de la mesa. */
  obtenerMapa: (mesaId: string) =>
    http.get<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa`),

  /** Guarda el fondo y/o configuración de rejilla del mapa (solo Máster). */
  guardarMapaFondo: (mesaId: string, datos: GuardarMapaFondoPayload) =>
    putJson<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/fondo`, datos),

  /** Guarda el estado de iniciativa del combate en el mapa (solo Máster). */
  guardarMapaIniciativa: (mesaId: string, iniciativa: MapaIniciativaEstado) =>
    putJson<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/iniciativa`, {
      iniciativa
    }),

  /** Avanza al siguiente turno en la iniciativa del mapa. */
  avanzarTurnoMapa: (mesaId: string) =>
    http.post<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`),

  /** Crea un token en el mapa táctico (y opcionalmente su plantilla). */
  crearTokenMapa: (mesaId: string, datos: CrearTokenMapaPayload) =>
    http.post<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/tokens`, datos),

  /** Actualiza posición, tamaño, escala o nombre de un token del mapa. */
  actualizarTokenMapa: (
    mesaId: string,
    tokenId: string,
    patch: ActualizarTokenMapaPayload
  ) =>
    http.patch<EstadoMapaCompartido>(
      `/api/mesas/${mesaId}/mapa/tokens/${encodeURIComponent(tokenId)}`,
      patch
    ),

  /** Elimina un token del mapa táctico. */
  eliminarTokenMapa: (mesaId: string, tokenId: string) =>
    http.delete<EstadoMapaCompartido>(
      `/api/mesas/${mesaId}/mapa/tokens/${encodeURIComponent(tokenId)}`
    ),

  /** Actualiza la categoría o el nombre de una plantilla de token del mapa. */
  actualizarPlantillaMapa: (
    mesaId: string,
    plantillaId: string,
    patch: ActualizarPlantillaMapaPayload
  ) =>
    http.patch<EstadoMapaCompartido>(
      `/api/mesas/${mesaId}/mapa/plantillas/${encodeURIComponent(plantillaId)}`,
      patch
    ),

  /** Elimina una plantilla de token del mapa táctico. */
  eliminarPlantillaMapa: (mesaId: string, plantillaId: string) =>
    http.delete<EstadoMapaCompartido>(
      `/api/mesas/${mesaId}/mapa/plantillas/${encodeURIComponent(plantillaId)}`
    ),

  /** Añade un trazo de dibujo al mapa táctico. */
  agregarTrazoMapa: (mesaId: string, trazo: Omit<TrazoMapa, "autorId">) =>
    http.post<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/trazos`, trazo),

  /** Elimina (deshace) un trazo de dibujo del mapa táctico. */
  eliminarTrazoMapa: (mesaId: string, trazoId: string) =>
    http.delete<EstadoMapaCompartido>(
      `/api/mesas/${mesaId}/mapa/trazos/${encodeURIComponent(trazoId)}`
    ),

  /** Borra todos los trazos de dibujo del mapa táctico (solo Máster). */
  borrarTrazosMapa: (mesaId: string) =>
    http.delete<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/trazos`),

  /** Congela o descongela el dibujo en el mapa táctico (solo Máster). */
  congelarDibujoMapa: (mesaId: string, congelado: boolean) =>
    putJson<EstadoMapaCompartido>(`/api/mesas/${mesaId}/mapa/congelar`, {
      congelado
    })
};
