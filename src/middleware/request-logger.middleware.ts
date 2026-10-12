import type { RequestHandler } from "express";
import type { Logger } from "../lib/logger.js";

export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
      logger.info("Peticion HTTP", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start
      });
    });

    next();
  };
}
