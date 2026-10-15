import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import { toPublicMesa } from "./serializers.js";
import { errors } from "../lib/errors.js";

export function createMesaRouter(context: AppContext, requireAuth: RequestHandler): Router {
  const router = Router();

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
