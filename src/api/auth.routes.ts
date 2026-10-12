import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import { toPublicUser } from "./serializers.js";
import { errors } from "../lib/errors.js";
import { buildGoogleAuthUrl, exchangeCodeForProfile } from "../lib/oauth.js";

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

  router.get("/confirm", async (req, res) => {
    const token = String(req.query.token ?? "");

    try {
      const user = await context.authService.confirmEmail(token);
      res.redirect(`${context.config.appBaseUrl}/?confirmado=${encodeURIComponent(user.email)}`);
    } catch {
      res.redirect(`${context.config.appBaseUrl}/?error=INVALID_TOKEN`);
    }
  });

  router.get("/google", (req, res, next) => {
    if (!context.config.google.clientId || !context.config.google.clientSecret) {
      next(errors.internal());
      return;
    }

    const state = crypto.randomUUID();
    req.session.oauthState = state;
    req.session.save(error => {
      if (error) {
        next(error);
        return;
      }
      res.redirect(buildGoogleAuthUrl(context.config, state));
    });
  });

  router.get("/google/callback", async (req, res, next) => {
    try {
      const state = String(req.query.state ?? "");
      const code = String(req.query.code ?? "");

      if (!state || state !== req.session.oauthState) {
        throw errors.oauthFailed();
      }

      delete req.session.oauthState;

      const profile = await exchangeCodeForProfile(context.config, code);
      const user = await context.authService.loginWithOAuth(profile);

      req.session.userId = user.id;
      req.session.save(error => {
        if (error) {
          next(error);
          return;
        }
        res.redirect(`${context.config.appBaseUrl}/`);
      });
    } catch {
      res.redirect(`${context.config.appBaseUrl}/?error=OAUTH_FAILED`);
    }
  });

  return router;
}
