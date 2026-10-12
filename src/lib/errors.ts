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
  invalidCredentials: () => new AppError("INVALID_CREDENTIALS", 401),
  emailNotConfirmed: () => new AppError("EMAIL_NOT_CONFIRMED", 403),
  unauthenticated: () => new AppError("UNAUTHENTICATED", 401),
  forbidden: () => new AppError("FORBIDDEN", 403),
  userNotFound: () => new AppError("USER_NOT_FOUND", 404),
  invalidToken: () => new AppError("INVALID_TOKEN", 400),
  oauthFailed: () => new AppError("OAUTH_FAILED", 401),
  internal: () => new AppError("INTERNAL_ERROR", 500)
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
