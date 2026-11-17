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
      const mesaId =
        typeof req.query.mesaId === "string" && req.query.mesaId.trim()
          ? req.query.mesaId.trim()
          : undefined;
      const archivos = await context.archivoService.listar(req.currentUser!, mesaId);
      res.json(archivos.map(toPublicArchivo));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireAuth, binario, async (req, res, next) => {
    try {
      const nombre = String(req.query.nombre ?? "archivo");
      const mesaId =
        typeof req.query.mesaId === "string" && req.query.mesaId.trim()
          ? req.query.mesaId.trim()
          : undefined;
      const tipo = String(req.headers["content-type"] ?? "");
      const datos = req.body;

      if (!Buffer.isBuffer(datos)) {
        throw errors.invalidRequest();
      }

      const archivo = await context.archivoService.subir(req.currentUser!, {
        nombre,
        tipo,
        datos: new Uint8Array(datos),
        ...(mesaId ? { mesaId } : {})
      });

      res.status(201).json(toPublicArchivo(archivo));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", requireAuth, async (req, res, next) => {
    try {
      const range =
        typeof req.headers.range === "string" ? req.headers.range : undefined;
      const resultado = await context.archivoService.obtenerStream(
        req.currentUser!,
        String(req.params.id),
        range
      );
      const { archivo } = resultado;

      const etag = `"${archivo.id}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("Accept-Ranges", "bytes");

      const ifNoneMatch = req.headers["if-none-match"];
      // Los navegadores piden rangos para reproducir y buscar dentro del audio.
      // Responder 304 a una petición con `Range` rompe la reproducción en
      // algunos navegadores, así que solo revalidamos cuando no hay rango.
      if (
        !range &&
        typeof ifNoneMatch === "string" &&
        (ifNoneMatch === etag || ifNoneMatch.includes(archivo.id))
      ) {
        if ("stream" in resultado) {
          void resultado.stream.cancel().catch(() => {});
        }
        res.status(304).end();
        return;
      }

      const ascii = archivo.nombre.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
      const disposicion = req.query.descarga ? "attachment" : "inline";

      res.setHeader("Content-Type", archivo.tipo);
      res.setHeader(
        "Content-Disposition",
        `${disposicion}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`
      );
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (
        "stream" in resultado &&
        resultado.status === 206 &&
        resultado.contentRange
      ) {
        res.status(206);
        res.setHeader("Content-Range", resultado.contentRange);
        res.setHeader(
          "Content-Length",
          String(resultado.contentLength ?? archivo.tamano)
        );
      } else {
        res.setHeader(
          "Content-Length",
          String(
            "datos" in resultado
              ? resultado.datos.length
              : (resultado.contentLength ?? archivo.tamano)
          )
        );
      }

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
