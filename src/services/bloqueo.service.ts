import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

/** Número de fallos recientes que se tienen en cuenta para bloquear. */
export const FAILED_ATTEMPTS_THRESHOLD = 5;

/** Ventana máxima (15 minutos) que pueden abarcar esos fallos. */
export const ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

/** Duración del bloqueo (15 minutos) contada desde el último fallo. */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface BloqueoResultado {
  bloqueado: boolean;
  hasta: string | null;
}

/**
 * Decide si una cuenta queda bloqueada a partir de sus inicios de sesión
 * fallidos. Es una función pura: recibe el instante actual (`ahora`) en lugar
 * de consultar el reloj del sistema, de modo que se puede probar de forma
 * determinista.
 *
 * Reglas:
 * - Se toman los 5 fallos más recientes (la lista puede venir desordenada).
 * - Con menos de 5 fallos no hay bloqueo.
 * - Si entre el primero y el último de esos 5 hay como mucho 15 minutos, la
 *   cuenta queda bloqueada hasta 15 minutos después del último fallo.
 * - Si el bloqueo ya ha expirado, el resultado es el de no bloqueado.
 */
export function calcularBloqueo(
  fallos: readonly Date[],
  ahora: Date
): BloqueoResultado {
  if (fallos.length < FAILED_ATTEMPTS_THRESHOLD) {
    return { bloqueado: false, hasta: null };
  }

  const ordenados = [...fallos].sort((a, b) => a.getTime() - b.getTime());
  const recientes = ordenados.slice(-FAILED_ATTEMPTS_THRESHOLD);
  const primero = recientes[0];
  const ultimo = recientes[recientes.length - 1];

  if (ultimo.getTime() - primero.getTime() > ATTEMPTS_WINDOW_MS) {
    return { bloqueado: false, hasta: null };
  }

  const hasta = new Date(ultimo.getTime() + LOCK_DURATION_MS);

  if (hasta.getTime() <= ahora.getTime()) {
    return { bloqueado: false, hasta: null };
  }

  return { bloqueado: true, hasta: formatearInstante(hasta) };
}

/**
 * Formatea un instante en ISO 8601. Omite los milisegundos cuando son cero para
 * mantener la forma compacta del contrato (`...T10:19:00Z`).
 */
function formatearInstante(instante: Date): string {
  return instante.toISOString().replace(/\.000Z$/, "Z");
}

function parsearInstante(valor: unknown): Date {
  if (typeof valor !== "string" || valor.trim().length === 0) {
    throw errors.invalidDate();
  }

  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) {
    throw errors.invalidDate();
  }

  return instante;
}

/**
 * Capa de lógica del cálculo de bloqueo: valida la entrada (cuerpo de la
 * petición) y delega en `calcularBloqueo`. Una fecha no válida lanza
 * `INVALID_DATE` (400); una lista de fallos mal formada lanza
 * `INVALID_REQUEST` (400).
 */
export class BloqueoService {
  constructor(private readonly logger: Logger) {}

  evaluar(fallos: unknown, ahora: unknown): BloqueoResultado {
    if (!Array.isArray(fallos)) {
      throw errors.invalidRequest();
    }

    const instantes = fallos.map(fallo => parsearInstante(fallo));
    const momento = parsearInstante(ahora);

    const resultado = calcularBloqueo(instantes, momento);

    this.logger.info("Comprobacion de bloqueo", {
      fallos: instantes.length,
      bloqueado: resultado.bloqueado,
      hasta: resultado.hasta
    });

    return resultado;
  }
}
