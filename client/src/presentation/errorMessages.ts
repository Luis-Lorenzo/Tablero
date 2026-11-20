const MESSAGES: Record<string, string> = {
  INVALID_EMAIL: "El correo no tiene un formato válido.",
  WEAK_PASSWORD: "La contraseña debe tener al menos 8 caracteres.",
  EMAIL_EXISTS: "Ya existe una cuenta con ese correo.",
  INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
  ACCOUNT_PENDING:
    "Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada o solicita un nuevo enlace.",
  ACCOUNT_REJECTED: "Tu cuenta ha sido rechazada.",
  ACCOUNT_LOCKED:
    "La cuenta está bloqueada temporalmente por demasiados intentos fallidos. Inténtalo más tarde.",
  INVALID_VERIFICATION_TOKEN:
    "El enlace de verificación no es válido o ya fue utilizado.",
  EXPIRED_VERIFICATION_TOKEN:
    "El enlace de verificación ha caducado. Solicita un nuevo correo de verificación.",
  EMAIL_ALREADY_VERIFIED:
    "Tu correo electrónico ya estaba verificado. Puedes iniciar sesión.",
  VERIFICATION_RATE_LIMITED:
    "Acabamos de enviarte un correo. Espera un minuto antes de solicitar otro.",
  EMAIL_DELIVERY_FAILED:
    "No se pudo enviar el correo de verificación en este momento. Inténtalo de nuevo más tarde.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  USER_NOT_FOUND: "El usuario indicado no existe.",
  MESA_NOT_FOUND: "Esa mesa ya no existe. Puede que la haya cerrado su anfitrión.",
  MESA_FULL: "La mesa está llena. No caben más jugadores.",
  MESA_FORBIDDEN: "No puedes hacer eso en esta mesa.",
  MESA_BANNED: "Te han expulsado de esta mesa y no puedes volver a entrar.",
  MESA_PASSWORD_REQUIRED: "Esta mesa requiere contraseña para unirte.",
  MESA_PASSWORD_INVALID: "Contraseña incorrecta. Inténtalo de nuevo.",
  INVALID_NICKNAME:
    "El nombre no es válido: de 3 a 20 caracteres, empieza por letra, termina en letra o número y solo admite letras, números y guion bajo.",
  NICKNAME_TAKEN: "Ese nombre ya está en uso. Prueba con otro.",
  UNAUTHENTICATED: "Tu sesión ha expirado. Vuelve a iniciar sesión.",
  ARCHIVO_NOT_FOUND: "Ese archivo ya no existe.",
  ARCHIVO_TIPO_INVALIDO:
    "Tipo de archivo no permitido. Solo se aceptan PDF, imágenes, .docx y texto plano.",
  ARCHIVO_DEMASIADO_GRANDE: "El archivo es demasiado grande (máximo 15 MB).",
  ARCHIVO_VACIO: "El archivo está vacío.",
  TRANSFERENCIA_NOT_FOUND: "Esa solicitud ya no está pendiente.",
  NETWORK_ERROR: "No se pudo conectar con el servidor.",
  INTERNAL_ERROR: "Ha ocurrido un error en el servidor."
};

export function describeError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    return MESSAGES[code] ?? "Ha ocurrido un error inesperado.";
  }
  return "Ha ocurrido un error inesperado.";
}
