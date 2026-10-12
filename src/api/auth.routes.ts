import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import { toPublicUser } from "./serializers.js";

export function createAuthRouter(
  context: AppContext,
  requireAuth: RequestHandler
): Router {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      const user = await context.authService.register(
        String(email ?? ""),
        String(password ?? "")
      );
      res.status(201).json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      const user = await context.authService.login(
        String(email ?? ""),
        String(password ?? "")
      );

      req.session.userId = user.id;
      req.session.save(error => {
        if (error) {
          next(error);
          return;
        }
        res.json(toPublicUser(user));
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", (req, res, next) => {
    req.session.destroy(error => {
      if (error) {
        next(error);
        return;
      }
      res.clearCookie("connect.sid");
      res.status(204).end();
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json(toPublicUser(req.currentUser!));
  });

  return router;
}
