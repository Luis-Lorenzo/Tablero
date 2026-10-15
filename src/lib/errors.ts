export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const errors = {
  invalidEmail: () => new AppError("INVALID_EMAIL", 400),
  weakPassword: () => new AppError("WEAK_PASSWORD", 400),
  emailExists: () => new AppError("EMAIL_EXISTS", 409),
  invalidRequest: () => new AppError("INVALID_REQUEST", 400),
  invalidDate: () => new AppError("INVALID_DATE", 400),
  invalidCredentials: () => new AppError("INVALID_CREDENTIALS", 401),
  accountPending: () => new AppError("ACCOUNT_PENDING", 403),
  accountRejected: () => new AppError("ACCOUNT_REJECTED", 403),
  accountLocked: () => new AppError("ACCOUNT_LOCKED", 403),
  unauthenticated: () => new AppError("UNAUTHENTICATED", 401),
  forbidden: () => new AppError("FORBIDDEN", 403),
  userNotFound: () => new AppError("USER_NOT_FOUND", 404),
  invalidNickname: () => new AppError("INVALID_NICKNAME", 400),
  nicknameTaken: () => new AppError("NICKNAME_TAKEN", 409),
  mesaNotFound: () => new AppError("MESA_NOT_FOUND", 404),
  mesaFull: () => new AppError("MESA_FULL", 409),
  mesaForbidden: () => new AppError("MESA_FORBIDDEN", 403),
  mesaBanned: () => new AppError("MESA_BANNED", 403),
  internal: () => new AppError("INTERNAL_ERROR", 500)
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
