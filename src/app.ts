import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Store } from "express-session";
import type { AppContext } from "./api/context.js";
import { createAuthRouter } from "./api/auth.routes.js";
import { createUserRouter } from "./api/user.routes.js";
import { createHealthRouter } from "./api/health.routes.js";
import { createPruebaRouter } from "./api/prueba.routes.js";
import { createMesaRouter } from "./api/mesa.routes.js";
import { createArchivoRouter } from "./api/archivo.routes.js";
import { createRequireAuth } from "./middleware/auth.middleware.js";
import { createRequestLogger } from "./middleware/request-logger.middleware.js";
import { apiNotFound, createErrorHandler } from "./middleware/error.middleware.js";
import { createSessionMiddleware, createSessionStore } from "./lib/session.js";

export function createApp(context: AppContext, store?: Store): express.Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(createRequestLogger(context.logger));
  app.use(
    createSessionMiddleware(
      context.config.sessionSecret,
      context.config.isProduction,
      // El contenedor comparte el mismo almacén con el canal en vivo.
      store ?? createSessionStore()
    )
  );

  const requireAuth = createRequireAuth(context.userRepository);

  app.use("/api/health", createHealthRouter());
  app.use("/api/auth", createAuthRouter(context, requireAuth));
  app.use("/api/users", createUserRouter(context, requireAuth));
  app.use("/api/prueba", createPruebaRouter(context));
  app.use("/api/mesas", createMesaRouter(context, requireAuth));
  app.use("/api/archivos", createArchivoRouter(context, requireAuth));

  app.use("/api", apiNotFound);

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(currentDir, "../client/dist");

  app.use(express.static(clientDist));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  app.use(createErrorHandler(context.logger));

  return app;
}
