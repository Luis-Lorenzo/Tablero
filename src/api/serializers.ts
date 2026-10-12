import type { User } from "../repositories/user.repository.js";

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    active: !user.deleted,
    createdAt: user.createdAt.toISOString()
  };
}
