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

  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      await context.mesaService.cerrar(req.currentUser!, String(req.params.id));
      context.mesasNotifier.notificarCambio();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/chat", requireAuth, async (req, res, next) => {
    try {
      const mensajes = await context.chatService.listar(
        req.currentUser!,
        String(req.params.id)
      );
      res.json(mensajes);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/chat", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const body = (req.body ?? {}) as { texto?: unknown; destinatarioId?: unknown };
      const { mensaje, destinatarios } = await context.chatService.enviar(
        req.currentUser!,
        mesaId,
        body.texto,
        body.destinatarioId
      );
      context.mesasNotifier.enviarAUsuarios(destinatarios, {
        type: "chat:message",
        mesaId,
        message: mensaje
      });
      res.status(201).json(mensaje);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/tiradas", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const body = (req.body ?? {}) as {
        total?: number;
        formula?: string;
        dados?: number[];
        bonificador?: number;
        secreta?: boolean;
      };
      const resultado = await context.chatService.registrarTirada(
        req.currentUser!,
        mesaId,
        {
          total: body.total as number,
          formula: body.formula as string,
          dados: body.dados as number[],
          bonificador: body.bonificador as number,
          secreta: Boolean(body.secreta)
        }
      );

      if (!resultado) {
        res.status(204).end();
        return;
      }

      context.mesasNotifier.enviarAUsuarios(resultado.destinatarios, {
        type: "dice:roll",
        mesaId,
        roll: resultado.tirada
      });
      res.status(201).json(resultado.tirada);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
