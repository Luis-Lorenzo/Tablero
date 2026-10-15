import { errors } from "./errors.js";

/**
 * Reglas del nombre visible (nickname):
 * - Entre 3 y 20 caracteres.
 * - Empieza por letra (a-z, A-Z).
 * - Termina por letra o número.
 * - El resto son letras, números o guion bajo.
 * No se permiten espacios, acentos, ñ, emojis ni símbolos como @, #, / o &.
 */
const NICKNAME_RE = /^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$/;
const NICKNAME_MIN = 3;
const NICKNAME_MAX = 20;

/** Mantiene solo lo que el usuario escribió (sin recortar) para poder validar. */
export function normalizarNickname(raw: string): string {
  return raw.trim();
}

/** `null` (o vacío) significa "sin nombre visible". Devuelve el porqué o null. */
export function validarNickname(nickname: string | null): string | null {
  if (nickname === null) return null;

  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return "El nombre debe tener entre 3 y 20 caracteres.";
  }

  if (!NICKNAME_RE.test(nickname)) {
    return "Solo letras, números y guion bajo; debe empezar por letra y terminar por letra o número.";
  }

  return null;
}

/** Valida el nickname y lanza `INVALID_NICKNAME` si no cumple las reglas. */
export function exigirNicknameValido(nickname: string | null): void {
  const problema = validarNickname(nickname);
  if (problema) throw errors.invalidNickname();
}
