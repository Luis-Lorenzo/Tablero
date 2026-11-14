import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import {
  toPublicArchivo,
  toPublicMesa,
  toPublicTransferencia
} from "./serializers.js";
import { errors } from "../lib/errors.js";
import { nombreDeUsuario } from "../repositories/user.repository.js";
import { TransferenciaService } from "../services/transferencia.service.js";

export function createMesaRouter(context: AppContext, requireAuth: RequestHandler): Router {
  const router = Router();
  const transferencias =
    context.transferenciaService ??
    new TransferenciaService(
      context.mesaRepository,
      context.archivoService,
      context.logger
    );

  router.get("/inicio", requireAuth, async (req, res, next) => {
    try {
      const huecos = await context.mesaService.inicio();
      res.json(huecos.map(mesa => (mesa ? toPublicMesa(mesa) : null)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const busqueda = typeof req.query.q === "string" ? req.query.q : undefined;
      const mesas = await context.mesaService.listar(busqueda);
      res.json(mesas.map(toPublicMesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const { mesa, creada } = await context.mesaService.crear(req.currentUser!);
      if (creada) {
        context.mesasNotifier.notificarCambio();
      }
      res.status(creada ? 201 : 200).json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.get("/mia", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.mia(req.currentUser!);
      res.json(mesa ? toPublicMesa(mesa) : null);
    } catch (error) {
      next(error);
    }
  });

  router.get("/pendiente", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.pendienteDe(req.currentUser!);
      res.json(mesa ? toPublicMesa(mesa) : null);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.obtener(String(req.params.id));
      res.json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/unirse", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.unirse(req.currentUser!, String(req.params.id));
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/abandonar", requireAuth, async (req, res, next) => {
    try {
      await context.mesaService.abandonar(req.currentUser!, String(req.params.id));
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/iniciar", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.iniciar(
        req.currentUser!,
        String(req.params.id)
      );
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/terminar", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.terminar(
        req.currentUser!,
        String(req.params.id)
      );
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/color", requireAuth, async (req, res, next) => {
    try {
      const color = typeof (req.body ?? {}).color === "string" ? (req.body ?? {}).color : null;
      const mesa = await context.mesaService.ponerColor(req.currentUser!, String(req.params.id), color);
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/expulsar", requireAuth, async (req, res, next) => {
    try {
      const playerId = String((req.body ?? {}).playerId ?? "");
      if (!playerId) throw errors.invalidRequest();

      await context.mesaService.expulsar(
        req.currentUser!,
        String(req.params.id),
        playerId
      );
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/ceder", requireAuth, async (req, res, next) => {
    try {
      const playerId = String((req.body ?? {}).playerId ?? "");
      if (!playerId) throw errors.invalidRequest();

      await context.mesaService.solicitarCesion(
        req.currentUser!,
        String(req.params.id),
        playerId
      );
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/ceder/aceptar", requireAuth, async (req, res, next) => {
    try {
      await context.mesaService.aceptarCesion(
        req.currentUser!,
        String(req.params.id)
      );
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/ceder/rechazar", requireAuth, async (req, res, next) => {
    try {
      await context.mesaService.rechazarCesion(
        req.currentUser!,
        String(req.params.id)
      );
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/compartir/pendientes", requireAuth, async (req, res, next) => {
    try {
      const lista = await transferencias.listarPendientes(
        req.currentUser!,
        String(req.params.id)
      );
      res.json(lista.map(toPublicTransferencia));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/compartir", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const receptorId = typeof body.receptorId === "string" ? body.receptorId : "";
      const tipo = body.tipo;

      if (!receptorId || (tipo !== "posit" && tipo !== "archivo")) {
        throw errors.invalidRequest();
      }

      const transferencia =
        tipo === "posit"
          ? await transferencias.crear(req.currentUser!, String(req.params.id), {
              receptorId,
              tipo: "posit",
              posit: {
                texto:
                  typeof (body.posit as { texto?: unknown } | undefined)?.texto === "string"
                    ? (body.posit as { texto: string }).texto
                    : "",
                color:
                  typeof (body.posit as { color?: unknown } | undefined)?.color === "string"
                    ? (body.posit as { color: string }).color
                    : "#f7ffae",
                giro:
                  typeof (body.posit as { giro?: unknown } | undefined)?.giro === "number"
                    ? (body.posit as { giro: number }).giro
                    : 0
              }
            })
          : await transferencias.crear(req.currentUser!, String(req.params.id), {
              receptorId,
              tipo: "archivo",
              archivoId: typeof body.archivoId === "string" ? body.archivoId : ""
            });

      const publica = toPublicTransferencia(transferencia);
      context.mesasNotifier.notificarUsuario(receptorId, {
        type: "transferencia:recibida",
        transferencia: publica
      });

      res.status(201).json(publica);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/compartir/:transferenciaId/aceptar",
    requireAuth,
    async (req, res, next) => {
      try {
        const resultado = await transferencias.aceptar(
          req.currentUser!,
          String(req.params.id),
          String(req.params.transferenciaId)
        );

        context.mesasNotifier.notificarUsuario(resultado.transferencia.emisorId, {
          type: "transferencia:resuelta",
          id: resultado.transferencia.id,
          estado: "ACEPTADA",
          receptorId: req.currentUser!.id,
          receptorNombre: nombreDeUsuario(req.currentUser!)
        });

        if (resultado.tipo === "archivo") {
          res.json({
            tipo: "archivo",
            archivo: toPublicArchivo(resultado.archivo)
          });
          return;
        }

        res.json({
          tipo: "posit",
          posit: resultado.posit
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:id/compartir/:transferenciaId/rechazar",
    requireAuth,
    async (req, res, next) => {
      try {
        const transferencia = await transferencias.rechazar(
          req.currentUser!,
          String(req.params.id),
          String(req.params.transferenciaId)
        );

        context.mesasNotifier.notificarUsuario(transferencia.emisorId, {
          type: "transferencia:resuelta",
          id: transferencia.id,
          estado: "RECHAZADA",
          receptorId: req.currentUser!.id,
          receptorNombre: nombreDeUsuario(req.currentUser!)
        });

        res.status(204).end();
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      await context.mesaService.cerrar(req.currentUser!, String(req.params.id));
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
