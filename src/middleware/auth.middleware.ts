import type { RequestHandler } from "express";
import { errors } from "../lib/errors.js";
import type { UserRepository } from "../repositories/user.repository.js";

export function createRequireAuth(users: UserRepository): RequestHandler {
  return async (req, _res, next) => {
    try {
      const userId = req.session.userId;

      if (!userId) {
        throw errors.unauthenticated();
      }

      const user = await users.findById(userId);

      if (!user || user.deleted || user.status !== "ACTIVE") {
        req.session.destroy(() => undefined);
        throw errors.unauthenticated();
      }

      req.currentUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.currentUser?.role !== "ADMIN") {
    next(errors.forbidden());
    return;
  }
  next();
};
