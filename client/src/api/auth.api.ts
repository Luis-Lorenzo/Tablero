import { http } from "./client";
import type { PublicUser } from "./types";

export const authApi = {
  register: (email: string, password: string) =>
    http.post<PublicUser>("/api/auth/register", { email, password }),

  login: (email: string, password: string) =>
    http.post<PublicUser>("/api/auth/login", { email, password }),

  logout: () => http.post<void>("/api/auth/logout"),

  me: () => http.get<PublicUser>("/api/auth/me"),

  verifyEmail: (token: string) =>
    http.post<PublicUser>("/api/auth/verify-email", { token }),

  resendVerification: (email: string) =>
    http.post<{ ok: boolean }>("/api/auth/resend-verification", { email })
};
