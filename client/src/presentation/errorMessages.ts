const MESSAGES: Record<string, string> = {
  INVALID_EMAIL: "El correo no tiene un formato válido.",
  WEAK_PASSWORD: "La contraseña debe tener al menos 8 caracteres.",
  EMAIL_EXISTS: "Ya existe una cuenta con ese correo.",
  INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
  ACCOUNT_PENDING: "Tu cuenta está pendiente de aprobación por un administrador.",
  ACCOUNT_REJECTED: "Tu cuenta ha sido rechazada.",
  ACCOUNT_LOCKED:
    "La cuenta está bloqueada temporalmente por demasiados intentos fallidos. Inténtalo más tarde.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  USER_NOT_FOUND: "El usuario indicado no existe.",
  MESA_NOT_FOUND: "Esa mesa ya no existe. Puede que la haya cerrado su anfitrión.",
  MESA_FULL: "La mesa está llena. No caben más jugadores.",
  UNAUTHENTICATED: "Tu sesión ha expirado. Vuelve a iniciar sesión.",
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
