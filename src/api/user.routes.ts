import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import { toPublicUser } from "./serializers.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

export function createUserRouter(
  context: AppContext,
  requireAuth: RequestHandler
): Router {
  const router = Router();

  router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const users = await context.userService.listUsers(req.currentUser!);
      res.json(users.map(toPublicUser));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/me/nickname", requireAuth, async (req, res, next) => {
    try {
      const raw = (req.body ?? {}) as { nickname?: unknown };
      const nickname =
        raw.nickname === null || raw.nickname === undefined
          ? null
          : String(raw.nickname);

      const user = await context.userService.setNickname(
        req.currentUser!,
        nickname
      );
      res.json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/active", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const active = await context.userService.isActive(req.currentUser!, id);
      res.json({ id, active });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      await context.userService.deleteUser(req.currentUser!, id);

      if (id === req.currentUser!.id) {
        req.session.destroy(() => undefined);
      }

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
