import type { User } from "../repositories/user.repository.js";

export interface PublicUser {
  id: string;
  email: string;
  role: string;
  provider: string;
  emailConfirmed: boolean;
  active: boolean;
  createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    provider: user.provider,
    emailConfirmed: user.emailConfirmed,
    active: !user.deleted && user.emailConfirmed,
    createdAt: user.createdAt.toISOString()
  };
}
