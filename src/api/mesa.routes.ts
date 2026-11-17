import { Router, type RequestHandler } from "express";
import type { AppContext } from "./context.js";
import {
  toPublicArchivo,
  toPublicMesa,
  toPublicTransferencia
} from "./serializers.js";
import { errors } from "../lib/errors.js";
import { vistaDe } from "../lib/archivos.js";
import {
  resolverDivisasConfig,
  sanitizarMusicaAmbiente
} from "../repositories/mesa.repository.js";
import { nombreDeUsuario } from "../repositories/user.repository.js";
import {
  MemoryMesaEstadoRepository,
  sanitizarDivisa,
  sanitizarDivisaId,
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

  router.post("/:id/compartir-todos", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actor = req.currentUser!;
      const esAdminLibre = actor.role === "ADMIN" && !mesa.players.includes(actor.id);
      if (mesa.hostId !== actor.id && !esAdminLibre) {
        throw errors.mesaForbidden();
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const tipo = body.tipo;
      if (tipo !== "posit" && tipo !== "archivo" && tipo !== "objeto") {
        throw errors.invalidRequest();
      }

      let elemento: Record<string, unknown>;

      if (tipo === "posit") {
        const rawPosit = (body.posit ?? {}) as {
          texto?: unknown;
          color?: unknown;
          giro?: unknown;
        };
        const texto = typeof rawPosit.texto === "string" ? rawPosit.texto.slice(0, 2000) : "";
        const color =
          typeof rawPosit.color === "string" && rawPosit.color.trim()
            ? rawPosit.color.trim()
            : "#f7ffae";
        const giro =
          typeof rawPosit.giro === "number" && Number.isFinite(rawPosit.giro)
            ? Math.max(-15, Math.min(15, rawPosit.giro))
            : 0;
        elemento = {
          tipo: "posit",
          posit: { texto, color, giro }
        };
      } else if (tipo === "archivo") {
        const archivoId = typeof body.archivoId === "string" ? body.archivoId.trim() : "";
        if (!archivoId) throw errors.invalidRequest();
        const archivo = await context.archivoService.obtenerMetadatos(actor, archivoId);
        elemento = {
          tipo: "archivo",
          archivo: {
            id: archivo.id,
            nombre: archivo.nombre,
            tipo: archivo.tipo,
            vista: vistaDe(archivo.tipo),
            tamano: archivo.tamano
          }
        };
      } else {
        const rawObj = (body.objeto ?? {}) as Record<string, unknown>;
        const nombre = typeof rawObj.nombre === "string" ? rawObj.nombre.trim().slice(0, 60) : "";
        if (!nombre) throw errors.invalidRequest();
        const descripcion =
          typeof rawObj.descripcion === "string" ? rawObj.descripcion.slice(0, 1000) : "";
        const cantidadBruta =
          typeof rawObj.cantidad === "number" && Number.isFinite(rawObj.cantidad)
            ? Math.trunc(rawObj.cantidad)
            : 1;
        const cantidad = Math.max(1, Math.min(9999, cantidadBruta));
        const emoji =
          typeof rawObj.emoji === "string" && rawObj.emoji.trim()
            ? rawObj.emoji.trim().slice(0, 16)
            : undefined;
        const idOrigen =
          typeof rawObj.idOrigen === "string" && rawObj.idOrigen.trim()
            ? rawObj.idOrigen.trim().slice(0, 80)
            : undefined;
        let archivoId: string | undefined;
        let archivoNombre: string | undefined;
        if (typeof rawObj.archivoId === "string" && rawObj.archivoId.trim()) {
          const archivo = await context.archivoService.obtenerMetadatos(
            actor,
            rawObj.archivoId.trim()
          );
          archivoId = archivo.id;
          archivoNombre = archivo.nombre;
        }
        elemento = {
          tipo: "objeto",
          objeto: {
            ...(idOrigen ? { idOrigen } : {}),
            nombre,
            descripcion,
            cantidad,
            ...(emoji ? { emoji } : {}),
            ...(archivoId ? { archivoId } : {}),
            ...(archivoNombre ? { archivoNombre } : {})
          }
        };
      }

      const destinatarios = [mesa.hostId, ...mesa.players].filter(id => id !== actor.id);
      if (destinatarios.length > 0) {
        context.mesasNotifier.enviarAUsuarios(destinatarios, {
          type: "mesa:compartir-todos",
          mesaId,
          emisorId: actor.id,
          emisorNombre: nombreDeUsuario(actor),
          elemento
        });
      }

      res.json({ ok: true, destinatarios: destinatarios.length, elemento });
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
        caras?: number;
        especial?: "critico" | "pifia" | null;
        secreta?: boolean;
        soloMaster?: boolean;
        colorDado?: string;
        colorAristasDado?: string;
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
          soloMaster: Boolean(body.soloMaster),
          colorDado: body.colorDado,
          colorAristasDado: body.colorAristasDado
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

      const estadosPorUsuario = mesaEstado.getEstadosPorMesa
        ? await mesaEstado.getEstadosPorMesa(mesaId, conectados)
        : null;

      const jugadores = await Promise.all(
        conectados.map(async playerId => {
          const usuario = await context.userRepository.findById(playerId);
          const nombre = usuario ? nombreDeUsuario(usuario) : "Jugador";
          const color = mesa.colores?.[playerId] ?? "#96fbc7";

          const estado = estadosPorUsuario
            ? (estadosPorUsuario.get(playerId) ?? {
                elementos: [],
                divisa: 0,
                divisasSaldos: {},
                mochila: []
              })
            : mesaEstado.getEstadoCompleto
              ? await mesaEstado.getEstadoCompleto(mesaId, playerId)
              : {
                  elementos: await mesaEstado.getElementos(mesaId, playerId),
                  divisa: 0,
                  divisasSaldos: {},
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
            divisasSaldos: estado.divisasSaldos ?? {},
            mochila: estado.mochila,
            objetosMesa
          };
        })
      );

      res.json({
        divisasConfig: resolverDivisasConfig(mesa),
        jugadores
      });
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
        res.json({
          elementos: estado.elementos,
          divisa: estado.divisa,
          divisasSaldos: estado.divisasSaldos ?? {},
          mochila: estado.mochila
        });
        return;
      }

      const elementos = await mesaEstado.getElementos(mesaId, actorId);
      res.json({ elementos, divisa: 0, divisasSaldos: {}, mochila: [] });
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

      const body = (req.body ?? {}) as {
        divisaId?: unknown;
        divisa?: unknown;
        delta?: unknown;
      };
      const divisaId = sanitizarDivisaId(body.divisaId);
      const limpia = sanitizarDivisa(body.divisa);

      let guardada = limpia;
      let divisasSaldos: Record<string, number> = { [divisaId]: limpia };

      if (mesaEstado.saveDivisaSaldo) {
        const resSaldo = await mesaEstado.saveDivisaSaldo(
          mesaId,
          actor.id,
          divisaId,
          limpia
        );
        divisasSaldos = resSaldo.divisasSaldos;
        guardada = divisasSaldos[divisaId] ?? limpia;
      } else if (mesaEstado.saveDivisa && divisaId === "principal") {
        guardada = await mesaEstado.saveDivisa(mesaId, actor.id, limpia);
        divisasSaldos = { principal: guardada };
      }

      const delta =
        typeof body.delta === "number" && Number.isFinite(body.delta)
          ? Math.trunc(body.delta)
          : 0;
      if (delta !== 0) {
        const divisasConfig = resolverDivisasConfig(mesa);
        const divisaMeta = divisasConfig.find(d => d.id === divisaId);
        const divisaNombre = divisaMeta?.nombre ?? (mesa.divisaNombre ?? "Divisa");
        const color = divisaMeta?.color ?? mesa.colores?.[actor.id] ?? "#e8c56a";
        const actorNombre = nombreDeUsuario(actor);
        const miembros = [mesa.hostId, ...mesa.players];
        context.mesasNotifier.enviarAUsuarios(miembros, {
          type: "mesa:divisa",
          mesaId,
          userId: actor.id,
          nombre: actorNombre,
          color,
          divisaId,
          divisa: guardada,
          divisaNombre,
          delta,
          jugadorId: actor.id,
          jugadorNombre: actorNombre,
          createdAt: new Date().toISOString()
        });
      }

      res.json({ divisa: guardada, divisaId, divisasSaldos });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/divisa/transferir", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actor = req.currentUser!;
      const miembros = [mesa.hostId, ...mesa.players];
      if (!miembros.includes(actor.id)) {
        throw errors.forbidden();
      }

      const body = (req.body ?? {}) as {
        receptorId?: unknown;
        divisaId?: unknown;
        cantidad?: unknown;
      };
      const receptorId = typeof body.receptorId === "string" ? body.receptorId.trim() : "";
      if (!receptorId || receptorId === actor.id || !miembros.includes(receptorId)) {
        throw errors.invalidRequest();
      }

      const cantidad =
        typeof body.cantidad === "number" && Number.isFinite(body.cantidad)
          ? Math.trunc(body.cantidad)
          : 0;
      if (cantidad <= 0) {
        throw errors.invalidRequest();
      }

      const divisasConfig = resolverDivisasConfig(mesa);
      const divisaId = sanitizarDivisaId(body.divisaId);
      const esPrincipal = divisaId === (divisasConfig[0]?.id ?? "principal") || divisaId === "principal";

      const leerSaldo = async (usuarioId: string): Promise<number> => {
        if (!mesaEstado.getEstadoCompleto) return 0;
        const est = await mesaEstado.getEstadoCompleto(mesaId, usuarioId);
        if (est.divisasSaldos && typeof est.divisasSaldos[divisaId] === "number") {
          return Math.max(0, Math.trunc(est.divisasSaldos[divisaId]));
        }
        return esPrincipal ? Math.max(0, Math.trunc(est.divisa ?? 0)) : 0;
      };

      const saldoEmisorActual = await leerSaldo(actor.id);
      if (saldoEmisorActual < cantidad) {
        res.status(400).json({
          error: {
            code: "SALDO_INSUFICIENTE",
            message: "No tienes suficientes monedas para enviar esa cantidad."
          }
        });
        return;
      }

      const saldoReceptorActual = await leerSaldo(receptorId);
      const nuevoSaldoEmisor = sanitizarDivisa(saldoEmisorActual - cantidad);
      const nuevoSaldoReceptor = sanitizarDivisa(saldoReceptorActual + cantidad);

      const guardarSaldoUsuario = async (
        usuarioId: string,
        nuevoValor: number
      ): Promise<Record<string, number>> => {
        if (mesaEstado.saveDivisaSaldo) {
          const resSaldo = await mesaEstado.saveDivisaSaldo(
            mesaId,
            usuarioId,
            divisaId,
            nuevoValor
          );
          return resSaldo.divisasSaldos;
        }
        if (mesaEstado.saveDivisa && divisaId === "principal") {
          const v = await mesaEstado.saveDivisa(mesaId, usuarioId, nuevoValor);
          return { principal: v };
        }
        return { [divisaId]: nuevoValor };
      };

      const saldosEmisor = await guardarSaldoUsuario(actor.id, nuevoSaldoEmisor);
      await guardarSaldoUsuario(receptorId, nuevoSaldoReceptor);

      const receptorUsuario = await context.userRepository.findById(receptorId);
      const divisaMeta = divisasConfig.find(d => d.id === divisaId);
      const divisaNombre = divisaMeta?.nombre ?? (mesa.divisaNombre ?? "Divisa");
      const actorNombre = nombreDeUsuario(actor);
      const receptorNombre = receptorUsuario ? nombreDeUsuario(receptorUsuario) : "Jugador";
      const ahora = new Date().toISOString();

      context.mesasNotifier.enviarAUsuarios(miembros, {
        type: "mesa:divisa",
        mesaId,
        userId: actor.id,
        nombre: actorNombre,
        color: divisaMeta?.color ?? mesa.colores?.[actor.id] ?? "#e8c56a",
        divisaId,
        divisa: saldosEmisor[divisaId] ?? nuevoSaldoEmisor,
        divisaNombre,
        delta: -cantidad,
        jugadorId: actor.id,
        jugadorNombre: actorNombre,
        createdAt: ahora
      });

      context.mesasNotifier.enviarAUsuarios(miembros, {
        type: "mesa:divisa",
        mesaId,
        userId: receptorId,
        nombre: receptorNombre,
        color: divisaMeta?.color ?? mesa.colores?.[receptorId] ?? "#e8c56a",
        divisaId,
        divisa: nuevoSaldoReceptor,
        divisaNombre,
        delta: cantidad,
        jugadorId: receptorId,
        jugadorNombre: receptorNombre,
        createdAt: ahora
      });

      res.json({
        divisa: saldosEmisor[divisaId] ?? nuevoSaldoEmisor,
        divisaId,
        divisasSaldos: saldosEmisor
      });
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

  router.put("/:id/divisas", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const divisas = Array.isArray(req.body)
        ? req.body
        : (req.body as { divisas?: unknown } | undefined)?.divisas;
      const vista = await context.mesaService.guardarDivisasConfig(
        req.currentUser!,
        mesaId,
        divisas
      );
      context.mesasNotifier.notificarCambio();
      res.json(toPublicMesa(vista));
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/musica", requireAuth, async (req, res, next) => {
    try {
      const mesaId = String(req.params.id);
      const mesa = await context.mesaRepository.findById(mesaId);
      if (!mesa) throw errors.mesaNotFound();

      const actor = req.currentUser!;
      const esAdminLibre = actor.role === "ADMIN" && !mesa.players.includes(actor.id);
      if (mesa.hostId !== actor.id && !esAdminLibre) {
        throw errors.mesaForbidden();
      }

      const rawBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body) && "musica" in req.body
          ? (req.body as { musica: unknown }).musica
          : req.body;

      const musica = sanitizarMusicaAmbiente(rawBody);
      if (!musica) {
        throw errors.invalidRequest();
      }

      const pistasExistentes = new Set(
        (mesa.musicaAmbiente?.pistas ?? []).map(p => p.archivoId)
      );
      for (const pista of musica.pistas) {
        if (pistasExistentes.has(pista.archivoId)) continue;
        const archivo = await context.archivoService.obtenerMetadatos(
          actor,
          pista.archivoId
        );
        if (vistaDe(archivo.tipo) !== "audio") {
          throw errors.archivoTipoInvalido();
        }
        if (pista.nombre === "Pista" && archivo.nombre) {
          pista.nombre = archivo.nombre.slice(0, 180);
        }
      }

      mesa.musicaAmbiente = musica;
      await context.mesaRepository.save(mesa);

      const miembros = [mesa.hostId, ...mesa.players];
      context.mesasNotifier.enviarAUsuarios(miembros, {
        type: "mesa:musica-actualizada",
        mesaId,
        musica
      });

      res.json({ musica });
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

  router.post("/:id/mapa/trazos", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.agregarTrazo(
        req.currentUser!,
        String(req.params.id),
        req.body
      );
      res.status(201).json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/mapa/trazos/:trazoId", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.eliminarTrazo(
        req.currentUser!,
        String(req.params.id),
        String(req.params.trazoId)
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/mapa/trazos", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.borrarTodosTrazos(
        req.currentUser!,
        String(req.params.id)
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/mapa/congelar", requireAuth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as {
        congelado?: unknown;
        dibujoCongelado?: unknown;
      };
      const congelado =
        typeof body.congelado === "boolean"
          ? body.congelado
          : typeof body.dibujoCongelado === "boolean"
            ? body.dibujoCongelado
            : null;
      if (congelado === null) {
        throw errors.invalidRequest();
      }
      const mapa = await mapaEstadoService.cambiarDibujoCongelado(
        req.currentUser!,
        String(req.params.id),
        congelado
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/mapa/areas", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.crearArea(
        req.currentUser!,
        String(req.params.id),
        req.body
      );
      res.status(201).json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/mapa/areas/:areaId", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.actualizarArea(
        req.currentUser!,
        String(req.params.id),
        String(req.params.areaId),
        req.body
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/mapa/areas/:areaId", requireAuth, async (req, res, next) => {
    try {
      const mapa = await mapaEstadoService.eliminarArea(
        req.currentUser!,
        String(req.params.id),
        String(req.params.areaId)
      );
      res.json(mapa);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
