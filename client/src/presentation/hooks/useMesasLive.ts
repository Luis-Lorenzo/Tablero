import { useEffect, useRef } from "react";
import { ApiError } from "../../api/client";
import { authApi } from "../../api/auth.api";

/** Ventana para agrupar ráfagas de avisos sin perder el último estado. */
const VENTANA_MS = 200;
const ESPERA_MIN_MS = 1000;
const ESPERA_MAX_MS = 15000;

interface MensajeMesas {
  type?: unknown;
}

/**
 * Mantiene un canal WebSocket con la recepción y llama a `onChange` cuando el
 * servidor avisa de que las mesas cambiaron.
 *
 * - Los avisos se agrupan con un "throttle" con salida inmediata *y* final: el
 *   primer aviso refresca al momento y, si llegan más dentro de la ventana, se
 *   hace una última llamada al terminar. Así no se pierde ningún cambio.
 * - Si el canal se cae, se reconecta con espera creciente. Antes de reintentar
 *   comprueba la sesión: si está caducada (401) no insiste y avisa por
 *   `onSessionExpired`; si el fallo es de red, sigue reintentando.
 */
export function useMesasLive(
  onChange: () => void,
  onSessionExpired?: () => void
): void {
  const onChangeRef = useRef(onChange);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reintento = 0;
    let cerrado = false;
    let temporizadorReconexion: number | undefined;

    // "Throttle" con salida inmediata y final.
    let enVentana = false;
    let pendiente = false;
    let temporizadorVentana: number | undefined;

    function avisarCambio() {
      if (!enVentana) {
        enVentana = true;
        onChangeRef.current();
        temporizadorVentana = window.setTimeout(() => {
          enVentana = false;
          if (pendiente) {
            pendiente = false;
            avisarCambio();
          }
        }, VENTANA_MS);
        return;
      }

      pendiente = true;
    }

    function programarReconexion() {
      const espera = Math.min(ESPERA_MIN_MS * 2 ** reintento, ESPERA_MAX_MS);
      reintento += 1;
      temporizadorReconexion = window.setTimeout(conectar, espera);
    }

    /** Distingue "la red falló" de "la sesión ya no vale". */
    async function sesionSigueViva(): Promise<boolean> {
      try {
        await authApi.me();
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return false;
        }
        // Error de red: la sesión no es el problema.
        return true;
      }
    }

    async function alCerrar() {
      if (cerrado) return;

      const viva = await sesionSigueViva();
      if (cerrado) return;

      if (!viva) {
        onSessionExpiredRef.current?.();
        return;
      }

      programarReconexion();
    }

    function conectar() {
      const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocolo}//${window.location.host}/ws`);

      socket.onopen = () => {
        reintento = 0;
      };

      socket.onmessage = evento => {
        let dato: MensajeMesas;
        try {
          dato = JSON.parse(String(evento.data)) as MensajeMesas;
        } catch {
          return;
        }

        if (dato !== null && typeof dato === "object" && dato.type === "mesas:changed") {
          avisarCambio();
        }
      };

      socket.onclose = () => {
        void alCerrar();
      };
    }

    conectar();

    return () => {
      cerrado = true;
      window.clearTimeout(temporizadorReconexion);
      window.clearTimeout(temporizadorVentana);
      socket?.close();
    };
  }, []);
}
