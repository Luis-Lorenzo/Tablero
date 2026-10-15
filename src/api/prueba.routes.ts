import { Router } from "express";
import type { AppContext } from "./context.js";

export function createPruebaRouter(context: AppContext): Router {
  const router = Router();

  router.post("/bloqueo", (req, res, next) => {
    try {
      const { fallos, ahora } = req.body ?? {};
      const resultado = context.bloqueoService.evaluar(fallos, ahora);
      res.json(resultado);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
