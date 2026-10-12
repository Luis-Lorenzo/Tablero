import type { User } from "../repositories/user.repository.js";

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

export {};
