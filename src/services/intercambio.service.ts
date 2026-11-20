import { randomUUID } from "node:crypto";
import { AppError, errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import {
  resolverDivisasConfig,
  type Mesa,
  type MesaRepository
} from "../repositories/mesa.repository.js";
import {
  sanitizarDivisa,
  sanitizarDivisaId,
  sanitizarMochila,
  type ElementoMesaPersistido,
  type EstadoJugadorMesa,
  type MesaEstadoRepository,
  type ObjetoMochilaPersistido
} from "../repositories/mesa-estado.repository.js";
import type { MacroTiradaPersistida } from "../repositories/user-macros.repository.js";
import {
  nombreDeUsuario,
  type User,
  type UserRepository
} from "../repositories/user.repository.js";
import type { ArchivoService } from "./archivo.service.js";

export type EstadoIntercambio = "abierto" | "completado" | "cancelado";

export interface OfertaObjetoIntercambio {
  objetoId: string;
  cantidad: number;
  nombre?: string;
  descripcion?: string;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
  macro?: MacroTiradaPersistida;
}

export interface OfertaArchivoIntercambio {
  archivoId: string;
  nombre: string;
  tipoMime?: string;
}

export interface OfertaPositIntercambio {
  positId: string;
  titulo?: string;
  contenido?: string;
  color?: string;
}

export interface OfertaIntercambio {
  monedas: Record<string, number>;
  objetos: OfertaObjetoIntercambio[];
  archivos: OfertaArchivoIntercambio[];
  posits: OfertaPositIntercambio[];
}

export interface SesionIntercambio {
  id: string;
  mesaId: string;
  participantes: [string, string];
  nombres: Record<string, string>;
  ofertas: Record<string, OfertaIntercambio>;
  listos: Record<string, boolean>;
  estado: EstadoIntercambio;
  createdAt: string;
  updatedAt: string;
}

export interface EntradaOfertaIntercambio {
  monedas?: Record<string, number>;
  objetos?: Array<{ objetoId: string; cantidad: number }>;
  archivos?: Array<{ archivoId: string; nombre: string; tipoMime?: string }>;
  posits?: Array<{
    positId: string;
    titulo?: string;
    contenido?: string;
    color?: string;
  }>;
}

export interface DivisaCambioEvento {
  userId: string;
  nombre: string;
  color: string;
  divisaId: string;
  divisa: number;
  divisaNombre: string;
  delta: number;
}

export interface ResultadoListoIntercambio {
  sesion: SesionIntercambio;
  completado: boolean;
  divisaEventos: DivisaCambioEvento[];
  estadosActualizados?: Record<string, EstadoJugadorMesa>;
}

function ofertaVacia(): OfertaIntercambio {
  return {
    monedas: {},
    objetos: [],
    archivos: [],
    posits: []
  };
}

function clonarOferta(oferta: OfertaIntercambio): OfertaIntercambio {
  return {
    monedas: { ...oferta.monedas },
    objetos: oferta.objetos.map(o => ({
      ...o,
      ...(o.macro
        ? {
            macro: {
              ...o.macro,
              grupos: o.macro.grupos.map(g => ({ ...g }))
            }
          }
        : {})
    })),
    archivos: oferta.archivos.map(a => ({ ...a })),
    posits: oferta.posits.map(p => ({ ...p }))
  };
}

function clonarSesion(sesion: SesionIntercambio): SesionIntercambio {
  return {
    ...sesion,
    participantes: [sesion.participantes[0], sesion.participantes[1]],
    nombres: { ...sesion.nombres },
    ofertas: {
      [sesion.participantes[0]]: clonarOferta(
        sesion.ofertas[sesion.participantes[0]] ?? ofertaVacia()
      ),
      [sesion.participantes[1]]: clonarOferta(
        sesion.ofertas[sesion.participantes[1]] ?? ofertaVacia()
      )
    },
    listos: { ...sesion.listos }
  };
}

function esMiembroDeMesa(mesa: Mesa, userId: string): boolean {
  return mesa.hostId === userId || mesa.players.includes(userId);
}

function saldoDeDivisa(estado: EstadoJugadorMesa, divisaId: string): number {
  if (estado.divisasSaldos && typeof estado.divisasSaldos[divisaId] === "number") {
    return Math.max(0, Math.trunc(estado.divisasSaldos[divisaId]));
  }
  return divisaId === "principal" ? Math.max(0, Math.trunc(estado.divisa ?? 0)) : 0;
}

function macrosIguales(
  a?: MacroTiradaPersistida,
  b?: MacroTiradaPersistida
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Gestiona sesiones de intercambio bilateral en tiempo real dentro de una mesa.
 */
export class IntercambioService {
  private readonly sesiones = new Map<string, SesionIntercambio>();

  constructor(
    private readonly mesas: MesaRepository,
    private readonly users: UserRepository,
    private readonly mesaEstado: MesaEstadoRepository,
    private readonly archivos: ArchivoService,
    private readonly logger: Logger
  ) {}

  async iniciar(
    actor: User,
    mesaId: string,
    conUsuarioIdRaw: unknown
  ): Promise<{ sesion: SesionIntercambio; creada: boolean }> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (!esMiembroDeMesa(mesa, actor.id)) {
      throw errors.mesaForbidden();
    }

    const conUsuarioId =
      typeof conUsuarioIdRaw === "string" ? conUsuarioIdRaw.trim() : "";
    if (!conUsuarioId || conUsuarioId === actor.id) {
      throw errors.invalidRequest();
    }
    if (!esMiembroDeMesa(mesa, conUsuarioId)) {
      throw errors.mesaForbidden();
    }

    for (const sesion of this.sesiones.values()) {
      if (
        sesion.mesaId === mesaId &&
        sesion.estado === "abierto" &&
        sesion.participantes.includes(actor.id) &&
        sesion.participantes.includes(conUsuarioId)
      ) {
        return { sesion: clonarSesion(sesion), creada: false };
      }
    }

    const otroUsuario = await this.users.findById(conUsuarioId);
    if (!otroUsuario) throw errors.userNotFound();

    const ahora = new Date().toISOString();
    const sesion: SesionIntercambio = {
      id: randomUUID(),
      mesaId,
      participantes: [actor.id, conUsuarioId],
      nombres: {
        [actor.id]: nombreDeUsuario(actor),
        [conUsuarioId]: nombreDeUsuario(otroUsuario)
      },
      ofertas: {
        [actor.id]: ofertaVacia(),
        [conUsuarioId]: ofertaVacia()
      },
      listos: {
        [actor.id]: false,
        [conUsuarioId]: false
      },
      estado: "abierto",
      createdAt: ahora,
      updatedAt: ahora
    };

    this.sesiones.set(sesion.id, sesion);
    this.logger.info("Intercambio iniciado", {
      intercambioId: sesion.id,
      mesaId,
      participantes: sesion.participantes
    });

    return { sesion: clonarSesion(sesion), creada: true };
  }

  async actualizarOferta(
    actor: User,
    mesaId: string,
    intercambioId: string,
    entrada: EntradaOfertaIntercambio
  ): Promise<SesionIntercambio> {
    const sesion = this.obtenerSesionAbierta(actor, mesaId, intercambioId);
    const estadoJugador = await this.leerEstado(mesaId, actor.id);
    const ofertaActual = clonarOferta(sesion.ofertas[actor.id] ?? ofertaVacia());

    if (entrada.monedas !== undefined) {
      if (
        !entrada.monedas ||
        typeof entrada.monedas !== "object" ||
        Array.isArray(entrada.monedas)
      ) {
        throw errors.invalidRequest();
      }
      const monedasLimpias: Record<string, number> = {};
      for (const [rawId, rawCantidad] of Object.entries(entrada.monedas)) {
        const divisaId = sanitizarDivisaId(rawId);
        const numero = Number(rawCantidad);
        if (!Number.isFinite(numero) || numero < 0) {
          throw errors.invalidRequest();
        }
        const cantidad = Math.trunc(numero);
        if (cantidad === 0) continue;
        const disponible = saldoDeDivisa(estadoJugador, divisaId);
        if (cantidad > disponible) {
          throw new AppError(
            "SALDO_INSUFICIENTE",
            400,
            "No tienes suficientes monedas para ofrecer esa cantidad."
          );
        }
        monedasLimpias[divisaId] = cantidad;
      }
      ofertaActual.monedas = monedasLimpias;
    }

    if (entrada.objetos !== undefined) {
      if (!Array.isArray(entrada.objetos)) {
        throw errors.invalidRequest();
      }
      const acumulados = new Map<string, number>();
      for (const item of entrada.objetos) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw errors.invalidRequest();
        }
        const objetoId =
          typeof item.objetoId === "string" ? item.objetoId.trim() : "";
        const num = Number(item.cantidad);
        if (!objetoId || !Number.isFinite(num) || num < 1) {
          throw errors.invalidRequest();
        }
        const cantidad = Math.trunc(num);
        acumulados.set(objetoId, (acumulados.get(objetoId) ?? 0) + cantidad);
      }

      const objetosLimpios: OfertaObjetoIntercambio[] = [];
      for (const [objetoId, cantidad] of acumulados.entries()) {
        const enMochila = estadoJugador.mochila.find(m => m.id === objetoId);
        if (!enMochila || enMochila.cantidad < cantidad) {
          throw errors.invalidRequest();
        }
        objetosLimpios.push({
          objetoId,
          cantidad,
          nombre: enMochila.nombre,
          descripcion: enMochila.descripcion,
          ...(enMochila.emoji ? { emoji: enMochila.emoji } : {}),
          ...(enMochila.archivoId ? { archivoId: enMochila.archivoId } : {}),
          ...(enMochila.archivoNombre
            ? { archivoNombre: enMochila.archivoNombre }
            : {}),
          ...(enMochila.macro ? { macro: enMochila.macro } : {})
        });
      }
      ofertaActual.objetos = objetosLimpios;
    }

    if (entrada.archivos !== undefined) {
      if (!Array.isArray(entrada.archivos)) {
        throw errors.invalidRequest();
      }
      const archivosLimpios: OfertaArchivoIntercambio[] = [];
      const vistos = new Set<string>();
      for (const item of entrada.archivos) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw errors.invalidRequest();
        }
        const archivoId =
          typeof item.archivoId === "string" ? item.archivoId.trim() : "";
        if (!archivoId || vistos.has(archivoId)) {
          throw errors.invalidRequest();
        }
        const meta = await this.archivos.obtenerMetadatos(actor, archivoId);
        vistos.add(meta.id);
        const nombre =
          typeof item.nombre === "string" && item.nombre.trim()
            ? item.nombre.trim().slice(0, 180)
            : meta.nombre;
        const tipoMime =
          typeof item.tipoMime === "string" && item.tipoMime.trim()
            ? item.tipoMime.trim().slice(0, 120)
            : meta.tipo;
        archivosLimpios.push({ archivoId: meta.id, nombre, tipoMime });
      }
      ofertaActual.archivos = archivosLimpios;
    }

    if (entrada.posits !== undefined) {
      if (!Array.isArray(entrada.posits)) {
        throw errors.invalidRequest();
      }
      const positsLimpios: OfertaPositIntercambio[] = [];
      const vistos = new Set<string>();
      for (const item of entrada.posits) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw errors.invalidRequest();
        }
        const positId =
          typeof item.positId === "string" ? item.positId.trim().slice(0, 80) : "";
        if (!positId || vistos.has(positId)) {
          throw errors.invalidRequest();
        }
        vistos.add(positId);
        const titulo =
          typeof item.titulo === "string" ? item.titulo.slice(0, 120) : undefined;
        const contenido =
          typeof item.contenido === "string"
            ? item.contenido.slice(0, 2000)
            : undefined;
        const color =
          typeof item.color === "string" && item.color.trim()
            ? item.color.trim().slice(0, 32)
            : undefined;
        positsLimpios.push({
          positId,
          ...(titulo !== undefined ? { titulo } : {}),
          ...(contenido !== undefined ? { contenido } : {}),
          ...(color !== undefined ? { color } : {})
        });
      }
      ofertaActual.posits = positsLimpios;
    }

    sesion.ofertas[actor.id] = ofertaActual;
    // Al cambiar cualquier oferta, ambos participantes deben volver a confirmar.
    for (const p of sesion.participantes) {
      sesion.listos[p] = false;
    }
    sesion.updatedAt = new Date().toISOString();

    return clonarSesion(sesion);
  }

  async marcarListo(
    actor: User,
    mesaId: string,
    intercambioId: string,
    listo: boolean
  ): Promise<ResultadoListoIntercambio> {
    const sesion = this.obtenerSesionAbierta(actor, mesaId, intercambioId);
    sesion.listos[actor.id] = Boolean(listo);
    sesion.updatedAt = new Date().toISOString();

    const [p0, p1] = sesion.participantes;
    if (!sesion.listos[p0] || !sesion.listos[p1]) {
      return { sesion: clonarSesion(sesion), completado: false, divisaEventos: [] };
    }

    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    const [user0, user1] = await Promise.all([
      this.users.findById(p0),
      this.users.findById(p1)
    ]);
    if (!user0 || !user1) throw errors.userNotFound();

    const [estado0, estado1] = await Promise.all([
      this.leerEstado(mesaId, p0),
      this.leerEstado(mesaId, p1)
    ]);

    const oferta0 = sesion.ofertas[p0] ?? ofertaVacia();
    const oferta1 = sesion.ofertas[p1] ?? ofertaVacia();

    // Re-validar saldos y objetos antes de ejecutar el intercambio atómico.
    this.validarRecursosParaIntercambio(estado0, oferta0);
    this.validarRecursosParaIntercambio(estado1, oferta1);

    const divisaEventos = await this.aplicarMonedas(
      mesa,
      [
        { emisor: user0, receptor: user1, estadoEmisor: estado0, estadoReceptor: estado1, oferta: oferta0 },
        { emisor: user1, receptor: user0, estadoEmisor: estado1, estadoReceptor: estado0, oferta: oferta1 }
      ]
    );

    await this.aplicarObjetos(
      mesaId,
      [
        { emisorId: p0, receptor: user1, estadoEmisor: estado0, estadoReceptor: estado1, oferta: oferta0 },
        { emisorId: p1, receptor: user0, estadoEmisor: estado1, estadoReceptor: estado0, oferta: oferta1 }
      ]
    );

    await this.aplicarArchivos(mesaId, p0, user1, oferta0.archivos);
    await this.aplicarArchivos(mesaId, p1, user0, oferta1.archivos);

    await this.aplicarPosits(
      mesaId,
      [
        { emisorId: p0, receptorId: p1, estadoEmisor: estado0, estadoReceptor: estado1, oferta: oferta0 },
        { emisorId: p1, receptorId: p0, estadoEmisor: estado1, estadoReceptor: estado0, oferta: oferta1 }
      ]
    );

    sesion.estado = "completado";
    sesion.updatedAt = new Date().toISOString();

    const [final0, final1] = await Promise.all([
      this.leerEstado(mesaId, p0),
      this.leerEstado(mesaId, p1)
    ]);

    this.logger.info("Intercambio completado", {
      intercambioId: sesion.id,
      mesaId,
      participantes: sesion.participantes
    });

    return {
      sesion: clonarSesion(sesion),
      completado: true,
      divisaEventos,
      estadosActualizados: {
        [p0]: final0,
        [p1]: final1
      }
    };
  }

  async cancelar(
    actor: User,
    mesaId: string,
    intercambioId: string
  ): Promise<SesionIntercambio> {
    const sesion = this.obtenerSesionAbierta(actor, mesaId, intercambioId);
    sesion.estado = "cancelado";
    sesion.updatedAt = new Date().toISOString();

    this.logger.info("Intercambio cancelado", {
      intercambioId: sesion.id,
      mesaId,
      actorId: actor.id
    });

    return clonarSesion(sesion);
  }

  private obtenerSesionAbierta(
    actor: User,
    mesaId: string,
    intercambioId: string
  ): SesionIntercambio {
    const sesion = this.sesiones.get(intercambioId);
    if (!sesion || sesion.mesaId !== mesaId) {
      throw errors.transferenciaNotFound();
    }
    if (!sesion.participantes.includes(actor.id)) {
      throw errors.mesaForbidden();
    }
    if (sesion.estado !== "abierto") {
      throw errors.invalidRequest();
    }
    return sesion;
  }

  private async leerEstado(mesaId: string, userId: string): Promise<EstadoJugadorMesa> {
    if (this.mesaEstado.getEstadoCompleto) {
      return this.mesaEstado.getEstadoCompleto(mesaId, userId);
    }
    const elementos = await this.mesaEstado.getElementos(mesaId, userId);
    return { elementos, divisa: 0, divisasSaldos: {}, mochila: [] };
  }

  private validarRecursosParaIntercambio(
    estado: EstadoJugadorMesa,
    oferta: OfertaIntercambio
  ): void {
    for (const [divisaId, cantidad] of Object.entries(oferta.monedas)) {
      if (cantidad > saldoDeDivisa(estado, divisaId)) {
        throw new AppError(
          "SALDO_INSUFICIENTE",
          400,
          "Uno de los participantes ya no tiene suficientes monedas."
        );
      }
    }
    for (const item of oferta.objetos) {
      const enMochila = estado.mochila.find(m => m.id === item.objetoId);
      if (!enMochila || enMochila.cantidad < item.cantidad) {
        throw errors.invalidRequest();
      }
    }
  }

  private async aplicarMonedas(
    mesa: Mesa,
    direcciones: Array<{
      emisor: User;
      receptor: User;
      estadoEmisor: EstadoJugadorMesa;
      estadoReceptor: EstadoJugadorMesa;
      oferta: OfertaIntercambio;
    }>
  ): Promise<DivisaCambioEvento[]> {
    const divisasIds = new Set<string>();
    for (const d of direcciones) {
      for (const id of Object.keys(d.oferta.monedas)) {
        divisasIds.add(id);
      }
    }
    if (divisasIds.size === 0) return [];

    const divisasConfig = resolverDivisasConfig(mesa);
    const eventos: DivisaCambioEvento[] = [];
    const d0 = direcciones[0];
    const user0 = d0.emisor;
    const user1 = d0.receptor;
    const est0 = d0.estadoEmisor;
    const est1 = d0.estadoReceptor;
    const of0 = d0.oferta;
    const of1 = direcciones[1].oferta;

    for (const divisaId of divisasIds) {
      const sale0 = of0.monedas[divisaId] ?? 0;
      const sale1 = of1.monedas[divisaId] ?? 0;
      const delta0 = sale1 - sale0;
      const delta1 = sale0 - sale1;
      if (delta0 === 0 && delta1 === 0) continue;

      const nuevo0 = sanitizarDivisa(saldoDeDivisa(est0, divisaId) + delta0);
      const nuevo1 = sanitizarDivisa(saldoDeDivisa(est1, divisaId) + delta1);

      await this.guardarSaldo(mesa.id, user0.id, divisaId, nuevo0);
      await this.guardarSaldo(mesa.id, user1.id, divisaId, nuevo1);

      const meta = divisasConfig.find(c => c.id === divisaId);
      const divisaNombre = meta?.nombre ?? (mesa.divisaNombre ?? "Divisa");

      if (delta0 !== 0) {
        eventos.push({
          userId: user0.id,
          nombre: nombreDeUsuario(user0),
          color: meta?.color ?? mesa.colores?.[user0.id] ?? "#e8c56a",
          divisaId,
          divisa: nuevo0,
          divisaNombre,
          delta: delta0
        });
      }
      if (delta1 !== 0) {
        eventos.push({
          userId: user1.id,
          nombre: nombreDeUsuario(user1),
          color: meta?.color ?? mesa.colores?.[user1.id] ?? "#e8c56a",
          divisaId,
          divisa: nuevo1,
          divisaNombre,
          delta: delta1
        });
      }
    }

    return eventos;
  }

  private async guardarSaldo(
    mesaId: string,
    userId: string,
    divisaId: string,
    valor: number
  ): Promise<void> {
    if (this.mesaEstado.saveDivisaSaldo) {
      await this.mesaEstado.saveDivisaSaldo(mesaId, userId, divisaId, valor);
      return;
    }
    if (this.mesaEstado.saveDivisa && divisaId === "principal") {
      await this.mesaEstado.saveDivisa(mesaId, userId, valor);
    }
  }

  private async aplicarObjetos(
    mesaId: string,
    direcciones: Array<{
      emisorId: string;
      receptor: User;
      estadoEmisor: EstadoJugadorMesa;
      estadoReceptor: EstadoJugadorMesa;
      oferta: OfertaIntercambio;
    }>
  ): Promise<void> {
    if (!this.mesaEstado.saveMochila) return;
    const hayObjetos = direcciones.some(d => d.oferta.objetos.length > 0);
    if (!hayObjetos) return;

    const mochilas = new Map<string, ObjetoMochilaPersistido[]>();
    for (const d of direcciones) {
      mochilas.set(
        d.emisorId,
        d.estadoEmisor.mochila.map(m => ({ ...m }))
      );
    }

    for (const d of direcciones) {
      if (d.oferta.objetos.length === 0) continue;
      const mochilaEmisor = mochilas.get(d.emisorId)!;
      const mochilaReceptor = mochilas.get(d.receptor.id)!;

      for (const ofrecido of d.oferta.objetos) {
        const idx = mochilaEmisor.findIndex(m => m.id === ofrecido.objetoId);
        if (idx === -1) continue;
        const original = mochilaEmisor[idx];
        const restante = original.cantidad - ofrecido.cantidad;
        if (restante <= 0) {
          mochilaEmisor.splice(idx, 1);
        } else {
          mochilaEmisor[idx] = { ...original, cantidad: restante };
        }

        let archivoId = original.archivoId;
        let archivoNombre = original.archivoNombre;
        if (archivoId) {
          try {
            const clon = await this.archivos.clonarPara(
              d.emisorId,
              archivoId,
              d.receptor,
              mesaId
            );
            archivoId = clon.id;
            archivoNombre = clon.nombre;
          } catch {
            // Si el archivo ya no existe, conservar metadatos básicos.
          }
        }

        const existente = mochilaReceptor.find(
          m =>
            m.nombre === original.nombre &&
            m.descripcion === original.descripcion &&
            (m.emoji ?? "") === (original.emoji ?? "") &&
            (m.archivoId ?? "") === (archivoId ?? "") &&
            macrosIguales(m.macro, original.macro)
        );
        if (existente) {
          existente.cantidad = Math.min(9999, existente.cantidad + ofrecido.cantidad);
        } else {
          mochilaReceptor.push({
            id: randomUUID(),
            nombre: original.nombre,
            descripcion: original.descripcion,
            cantidad: ofrecido.cantidad,
            ...(original.emoji ? { emoji: original.emoji } : {}),
            ...(archivoId ? { archivoId } : {}),
            ...(archivoNombre ? { archivoNombre } : {}),
            ...(original.macro ? { macro: original.macro } : {})
          });
        }
      }
    }

    for (const [userId, mochila] of mochilas.entries()) {
      await this.mesaEstado.saveMochila(mesaId, userId, sanitizarMochila(mochila));
    }
  }

  private async aplicarArchivos(
    mesaId: string,
    emisorId: string,
    receptor: User,
    archivos: OfertaArchivoIntercambio[]
  ): Promise<void> {
    for (const archivo of archivos) {
      await this.archivos.clonarPara(emisorId, archivo.archivoId, receptor, mesaId);
    }
  }

  private async aplicarPosits(
    mesaId: string,
    direcciones: Array<{
      emisorId: string;
      receptorId: string;
      estadoEmisor: EstadoJugadorMesa;
      estadoReceptor: EstadoJugadorMesa;
      oferta: OfertaIntercambio;
    }>
  ): Promise<void> {
    const hayPosits = direcciones.some(d => d.oferta.posits.length > 0);
    if (!hayPosits) return;

    const elementosPorUsuario = new Map<string, ElementoMesaPersistido[]>();
    for (const d of direcciones) {
      elementosPorUsuario.set(
        d.emisorId,
        d.estadoEmisor.elementos.map(el => ({ ...el }))
      );
    }

    for (const d of direcciones) {
      if (d.oferta.posits.length === 0) continue;
      const elemEmisor = elementosPorUsuario.get(d.emisorId)!;
      const elemReceptor = elementosPorUsuario.get(d.receptorId)!;

      for (const posit of d.oferta.posits) {
        const idx = elemEmisor.findIndex(el => el.id === posit.positId);
        const origen = idx !== -1 ? elemEmisor[idx] : undefined;
        if (idx !== -1) {
          elemEmisor.splice(idx, 1);
        }

        const texto =
          (typeof posit.contenido === "string" && posit.contenido) ||
          (typeof origen?.texto === "string" && origen.texto) ||
          posit.titulo ||
          "";
        const color =
          posit.color ||
          (typeof origen?.color === "string" ? origen.color : "#f7ffae");

        elemReceptor.push({
          id: randomUUID(),
          tipo: "posit",
          texto,
          color,
          giro: typeof origen?.giro === "number" ? origen.giro : 0,
          x: 50,
          y: 50,
          archivado: true
        });
      }
    }

    for (const [userId, elementos] of elementosPorUsuario.entries()) {
      await this.mesaEstado.saveElementos(mesaId, userId, elementos);
    }
  }
}
