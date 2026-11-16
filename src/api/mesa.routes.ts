import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import {
  toPublicArchivo,
  toPublicMesa,
  toPublicTransferencia
} from "./serializers.js";
import { errors } from "../lib/errors.js";
import { nombreDeUsuario } from "../repositories/user.repository.js";
import {
  MemoryMesaEstadoRepository,
  sanitizarDivisa,
  sanitizarElementosMesa,
  sanitizarMochila
} from "../repositories/mesa-estado.repository.js";
import {
  MemoryPizarraEstadoRepository,
  sanitizarPizarraEstado
} from "../repositories/pizarra-estado.repository.js";
import { MemoryMapaEstadoRepository } from "../repositories/mapa-estado.repository.js";
import { MapaEstadoService } from "../services/mapa-estado.service.js";
import { TransferenciaService } from "../services/transferencia.service.js";

function leerImagenBody(body: unknown): { id: string; titulo: string | null } | null {
  const { archivoId, titulo } = (body ?? {}) as {
    archivoId?: unknown;
    titulo?: unknown;
  };
  if (typeof archivoId !== "string" || !archivoId.trim()) {
    return null;
  }
  const tituloLimpio =
    typeof titulo === "string" && titulo.trim() ? titulo.trim() : null;
  return { id: archivoId.trim(), titulo: tituloLimpio };
}

export function createMesaRouter(context: AppContext, requireAuth: RequestHandler): Router {
  const router = Router();
  const mesaEstado =
    context.mesaEstadoRepository ?? new MemoryMesaEstadoRepository();
  const pizarraEstado =
    context.pizarraEstadoRepository ?? new MemoryPizarraEstadoRepository();
  const mapaEstadoService =
    context.mapaEstadoService ??
    new MapaEstadoService(
      context.mesaRepository,
      context.mapaEstadoRepository ?? new MemoryMapaEstadoRepository(),
      context.mesasNotifier
    );
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

  router.patch("/:id/apodo", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { apodo?: unknown };
      const apodo =
        body.apodo === null || body.apodo === undefined
          ? ""
          : typeof body.apodo === "string"
            ? body.apodo
            : null;
      if (apodo === null) {
        throw errors.invalidRequest();
      }
      const vista = await context.mesaService.cambiarApodo(
        req.currentUser!,
        String(req.params.id),
        apodo
      );
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(vista));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/escena", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.ponerImagenEscena(
        req.currentUser!,
        String(req.params.id),
        leerImagenBody(req.body)
      );
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(mesa));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/proyeccion", requireAuth, async (req, res, next) => {
    try {
      const mesa = await context.mesaService.proyectarImagen(
        req.currentUser!,
        String(req.params.id),
        leerImagenBody(req.body)
      );
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

      if (!receptorId || (tipo !== "posit" && tipo !== "archivo" && tipo !== "objeto")) {
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
          : tipo === "objeto"
            ? await transferencias.crear(req.currentUser!, String(req.params.id), {
                receptorId,
                tipo: "objeto",
                objeto: (body.objeto ?? {}) as {
                  idOrigen?: string;
                  nombre: string;
                  descripcion: string;
                  cantidad: number;
                  emoji?: string;
                  archivoId?: string;
                  archivoNombre?: string;
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
          tipo: resultado.tipo,
          ...(resultado.tipo === "objeto" ? { objeto: resultado.objeto } : {}),
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

        if (resultado.tipo === "objeto") {
          res.json({
            tipo: "objeto",
            objeto: resultado.objeto
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
        caras?: number;
        especial?: "critico" | "pifia" | null;
        secreta?: boolean;
        soloMaster?: boolean;
      };
      const resultado = await context.chatService.registrarTirada(
        req.currentUser!,
        mesaId,
        {
          total: body.total as number,
          formula: body.formula as string,
          dados: body.dados as number[],
          bonificador: body.bonificador as number,
          caras: body.caras,
          especial: body.especial,
          secreta: Boolean(body.secreta),
          soloMaster: Boolean(body.soloMaster)
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

  router.get("/:id/master-resumen", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actorId = req.currentUser!.id;
      if (mesa.hostId !== actorId) {
        throw errors.forbidden();
      }

      const conectados = mesa.players.filter(playerId =>
        context.mesasNotifier.estaConectado
          ? context.mesasNotifier.estaConectado(playerId)
          : true
      );

      const jugadores = await Promise.all(
        conectados.map(async playerId => {
          const usuario = await context.userRepository.findById(playerId);
          const nombre = usuario ? nombreDeUsuario(usuario) : "Jugador";
          const color = mesa.colores?.[playerId] ?? "#96fbc7";

          const estado = mesaEstado.getEstadoCompleto
            ? await mesaEstado.getEstadoCompleto(mesaId, playerId)
            : {
                elementos: await mesaEstado.getElementos(mesaId, playerId),
                divisa: 0,
                mochila: []
              };

          const objetosMesa = estado.elementos
            .filter(el => el.tipo === "objeto" && typeof el.nombre === "string")
            .map(el => ({
              id: typeof el.id === "string" ? el.id : "",
              nombre: String(el.nombre ?? ""),
              descripcion: typeof el.descripcion === "string" ? el.descripcion : "",
              cantidad:
                typeof el.cantidad === "number" && Number.isFinite(el.cantidad)
                  ? Math.max(1, Math.trunc(el.cantidad))
                  : 1,
              ...(typeof el.emoji === "string" && el.emoji ? { emoji: el.emoji } : {}),
              ...(typeof el.archivoId === "string" && el.archivoId
                ? { archivoId: el.archivoId }
                : {}),
              ...(typeof el.archivoNombre === "string" && el.archivoNombre
                ? { archivoNombre: el.archivoNombre }
                : {})
            }));

          return {
            userId: playerId,
            nombre,
            color,
            divisa: estado.divisa,
            mochila: estado.mochila,
            objetosMesa
          };
        })
      );

      res.json({ jugadores });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/estado", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actorId = req.currentUser!.id;
      if (mesa.hostId !== actorId && !mesa.players.includes(actorId)) {
        throw errors.forbidden();
      }

      if (mesaEstado.getEstadoCompleto) {
        const estado = await mesaEstado.getEstadoCompleto(mesaId, actorId);
        res.json(estado);
        return;
      }

      const elementos = await mesaEstado.getElementos(mesaId, actorId);
      res.json({ elementos, divisa: 0, mochila: [] });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/estado", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actorId = req.currentUser!.id;
      if (mesa.hostId !== actorId && !mesa.players.includes(actorId)) {
        throw errors.forbidden();
      }

      const body = (req.body ?? {}) as { elementos?: unknown; mochila?: unknown };
      if (!Array.isArray(body.elementos) && !Array.isArray(body.mochila)) {
        throw errors.invalidRequest();
      }

      if (Array.isArray(body.elementos)) {
        await mesaEstado.saveElementos(
          mesaId,
          actorId,
          sanitizarElementosMesa(body.elementos)
        );
      }
      if (Array.isArray(body.mochila) && mesaEstado.saveMochila) {
        await mesaEstado.saveMochila(mesaId, actorId, sanitizarMochila(body.mochila));
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/divisa", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actor = req.currentUser!;
      if (mesa.hostId !== actor.id && !mesa.players.includes(actor.id)) {
        throw errors.forbidden();
      }

      const body = (req.body ?? {}) as { divisa?: unknown; delta?: unknown };
      const limpia = sanitizarDivisa(body.divisa);
      const guardada = mesaEstado.saveDivisa
        ? await mesaEstado.saveDivisa(mesaId, actor.id, limpia)
        : limpia;

      const delta =
        typeof body.delta === "number" && Number.isFinite(body.delta)
          ? Math.trunc(body.delta)
          : 0;
      if (delta !== 0) {
        const miembros = [mesa.hostId, ...mesa.players];
        context.mesasNotifier.enviarAUsuarios(miembros, {
          type: "mesa:divisa",
          mesaId,
          jugadorId: actor.id,
          jugadorNombre: nombreDeUsuario(actor),
          delta,
          divisa: guardada,
          divisaNombre: mesa.divisaNombre ?? "Divisa",
          createdAt: new Date().toISOString()
        });
      }

      res.json({ divisa: guardada });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/divisa-nombre", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const body = (req.body ?? {}) as { nombre?: unknown };
      if (typeof body.nombre !== "string") {
        throw errors.invalidRequest();
      }
      const vista = await context.mesaService.cambiarDivisaNombre(
        req.currentUser!,
        mesaId,
        body.nombre
      );
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(vista));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/pizarra", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actorId = req.currentUser!.id;
      if (mesa.hostId !== actorId && !mesa.players.includes(actorId)) {
        throw errors.forbidden();
      }

      const estado = await pizarraEstado.getEstado(mesaId);
      res.json(estado);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/pizarra", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actorId = req.currentUser!.id;
      if (mesa.hostId !== actorId && !mesa.players.includes(actorId)) {
        throw errors.forbidden();
      }

      const actual = await pizarraEstado.getEstado(mesaId);
      const esMaster = mesa.hostId === actorId;
      const limpio = sanitizarPizarraEstado(req.body);

      if (!esMaster && (actual.congelada || limpio.congelada !== actual.congelada)) {
        throw errors.forbidden();
      }

      await pizarraEstado.saveEstado(mesaId, limpio);
      const miembros = [mesa.hostId, ...mesa.players];
      context.mesasNotifier.enviarAUsuarios(miembros, {
        type: "pizarra:actualizada",
        mesaId,
        estado: limpio,
        autorId: actorId
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/ping", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actor = req.currentUser!;
      if (mesa.hostId !== actor.id && !mesa.players.includes(actor.id)) {
        throw errors.forbidden();
      }

      const body = (req.body ?? {}) as {
        x?: unknown;
        y?: unknown;
        vista?: unknown;
        color?: unknown;
      };
      if (
        typeof body.x !== "number" ||
        !Number.isFinite(body.x) ||
        typeof body.y !== "number" ||
        !Number.isFinite(body.y) ||
        (body.vista !== "pizarra" && body.vista !== "escena" && body.vista !== "mapa")
      ) {
        throw errors.invalidRequest();
      }

      const x = Math.max(0, Math.min(100, body.x));
      const y = Math.max(0, Math.min(100, body.y));
      const color =
        typeof body.color === "string" && body.color.trim()
          ? body.color.trim().slice(0, 32)
          : "#e8c56a";

      const miembros = [mesa.hostId, ...mesa.players];
      context.mesasNotifier.enviarAUsuarios(miembros, {
        type: "mesa:ping",
        mesaId,
        ping: {
          id: crypto.randomUUID(),
          autorId: actor.id,
          autorNombre: nombreDeUsuario(actor),
          color,
          x,
          y,
          vista: body.vista
        }
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/mapa", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.obtenerMapa(
        req.currentUser!,
        String(req.params.id)
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/mapa/fondo", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as {
        fondo?: unknown;
        rejilla?: unknown;
      };
      const mapa = await mapaEstadoService.guardarFondoYRejilla(
        req.currentUser!,
        String(req.params.id),
        body.fondo as Parameters<typeof mapaEstadoService.guardarFondoYRejilla>[2],
        body.rejilla as Parameters<typeof mapaEstadoService.guardarFondoYRejilla>[3]
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/mapa/iniciativa", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const payload = "iniciativa" in body ? body.iniciativa : body;
      const mapa = await mapaEstadoService.guardarIniciativa(
        req.currentUser!,
        String(req.params.id),
        payload
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/mapa/iniciativa/siguiente", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.avanzarTurnoIniciativa(
        req.currentUser!,
        String(req.params.id)
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/mapa/tokens", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const guardarPlantilla = body.guardarPlantilla === true;
      const categoria = typeof body.categoria === "string" ? body.categoria : undefined;
      const mapa = await mapaEstadoService.crearToken(
        req.currentUser!,
        String(req.params.id),
        body,
        guardarPlantilla,
        categoria
      );
      res.status(201).json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/mapa/tokens/:tokenId", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const mapa = await mapaEstadoService.actualizarToken(
        req.currentUser!,
        String(req.params.id),
        String(req.params.tokenId),
        body
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/mapa/tokens/:tokenId", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.eliminarToken(
        req.currentUser!,
        String(req.params.id),
        String(req.params.tokenId)
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/:id/mapa/plantillas/:plantillaId",
    requireAuth,
    async (req, res, next) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const mapa = await mapaEstadoService.actualizarPlantilla(
          req.currentUser!,
          String(req.params.id),
          String(req.params.plantillaId),
          body
        );
        res.json(mapa);
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:id/mapa/plantillas/:plantillaId",
    requireAuth,
    async (req, res, next) => {
      try {
        const mapa = await mapaEstadoService.eliminarPlantilla(
          req.currentUser!,
          String(req.params.id),
          String(req.params.plantillaId)
        );
        res.json(mapa);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
