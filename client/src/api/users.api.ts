import { http } from "./client";
import type { ActiveStatus, PublicUser } from "./types";

export interface GrupoDadoMacroDto {
  caras: number;
  cantidad: number;
}

export interface MacroTiradaDto {
  id: string;
  nombre: string;
  icono: string;
  grupos: GrupoDadoMacroDto[];
  bonificador: number;
}

export const usersApi = {
  list: () => http.get<PublicUser[]>("/api/users"),

  isActive: (id: string) => http.get<ActiveStatus>(`/api/users/${id}/active`),

  remove: (id: string) => http.delete<void>(`/api/users/${id}`),

  /** Cambia el nombre visible. `null` lo borra y vuelve a usarse el correo. */
  setNickname: (nickname: string | null) =>
    http.patch<PublicUser>("/api/users/me/nickname", { nickname }),

  /** Obtiene las macros de tirada guardadas por el usuario autenticado. */
  obtenerMacros: () => http.get<{ macros: MacroTiradaDto[] }>("/api/users/me/macros"),

  /** Guarda la lista completa de macros de tirada del usuario autenticado. */
  guardarMacros: (macros: MacroTiradaDto[]) =>
    http.patch<{ macros: MacroTiradaDto[] }>("/api/users/me/macros", { macros })
};
