import { http } from "./client";
import type { ActiveStatus, PublicUser } from "./types";

export const usersApi = {
  list: () => http.get<PublicUser[]>("/api/users"),

  isActive: (id: string) => http.get<ActiveStatus>(`/api/users/${id}/active`),

  remove: (id: string) => http.delete<void>(`/api/users/${id}`),

  /** Cambia el nombre visible. `null` lo borra y vuelve a usarse el correo. */
  setNickname: (nickname: string | null) =>
    http.patch<PublicUser>("/api/users/me/nickname", { nickname })
};
