import type { ErrorRequestHandler, RequestHandler } from "express";
import { isAppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: "API_ROUTE_NOT_FOUND", path: req.originalUrl });
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.code });
      return;
    }

    // Cuerpo de la petición por encima del límite permitido (express.raw).
    if (esCuerpoDemasiadoGrande(error)) {
      res.status(413).json({ error: "ARCHIVO_DEMASIADO_GRANDE" });
      return;
    }

    logger.error("Error no controlado", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(500).json({ error: "INTERNAL_ERROR" });
  };
}

function esCuerpoDemasiadoGrande(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { type?: unknown }).type === "entity.too.large"
  );
}
