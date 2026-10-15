import { isActiveUser, type User } from "../repositories/user.repository.js";

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  createdAt: string;
  lockedUntil: string | null;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    active: isActiveUser(user),
    createdAt: user.createdAt.toISOString(),
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null
  };
}
