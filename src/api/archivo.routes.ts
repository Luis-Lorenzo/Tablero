import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import express, { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import { toPublicArchivo } from "./serializers.js";
import { errors } from "../lib/errors.js";

/**
 * Archivos personales del usuario. El cuerpo de la subida es el propio archivo
 * en binario (`Content-Type` = tipo del archivo), con su nombre en `?nombre=`.
 */
export function createArchivoRouter(
  context: AppContext,
  requireAuth: RequestHandler
): Router {
  const router = Router();

  const binario = express.raw({
    type: () => true,
    limit: context.config.archivos.maxBytes + 1024
  });

  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const archivos = await context.archivoService.listar(req.currentUser!);
      res.json(archivos.map(toPublicArchivo));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireAuth, binario, async (req, res, next) => {
    try {
      const nombre = String(req.query.nombre ?? "archivo");
      const tipo = String(req.headers["content-type"] ?? "");
      const datos = req.body;

      if (!Buffer.isBuffer(datos)) {
        throw errors.invalidRequest();
      }

      const archivo = await context.archivoService.subir(req.currentUser!, {
        nombre,
        tipo,
        datos: new Uint8Array(datos)
      });

      res.status(201).json(toPublicArchivo(archivo));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", requireAuth, async (req, res, next) => {
    try {
      const resultado = await context.archivoService.obtenerStream(
        req.currentUser!,
        String(req.params.id)
      );
      const { archivo } = resultado;

      const ascii = archivo.nombre.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
      const disposicion = req.query.descarga ? "attachment" : "inline";

      res.setHeader("Content-Type", archivo.tipo);
      res.setHeader(
        "Content-Length",
        String("datos" in resultado ? resultado.datos.length : archivo.tamano)
      );
      res.setHeader(
        "Content-Disposition",
        `${disposicion}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=300");

      if ("stream" in resultado) {
        const nodeStream = Readable.fromWeb(resultado.stream as never);
        await pipeline(nodeStream, res);
        return;
      }

      res.end(Buffer.from(resultado.datos));
    } catch (error) {
      if (!res.headersSent) {
        next(error);
      }
    }
  });

  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      await context.archivoService.borrar(req.currentUser!, String(req.params.id));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
