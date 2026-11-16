import { AppError, errors } from "../lib/errors.js";
import type { MesasNotifier } from "../realtime/mesas-notifier.js";
import {
  clampNumero,
  sanitizarFondo,
  sanitizarIniciativa,
  sanitizarMapaEstado,
  sanitizarRejilla,
  type EstadoMapaCompartido,
  type MapaEstadoRepository,
  type MapaFondoConfig,
  type MapaRejillaConfig,
  type PlantillaTokenMapa,
  type TokenMapa
} from "../repositories/mapa-estado.repository.js";
import type { Mesa, MesaRepository } from "../repositories/mesa.repository.js";
import { nombreDeUsuario, type User } from "../repositories/user.repository.js";

export interface CrearTokenMapaInput {
  nombre?: unknown;
  archivoId?: unknown;
  imagenUrl?: unknown;
  x?: unknown;
  y?: unknown;
  celdasAncho?: unknown;
  celdasAlto?: unknown;
  escala?: unknown;
  esMonstruo?: unknown;
  guardarPlantilla?: unknown;
}

export interface ActualizarTokenMapaInput {
  nombre?: unknown;
  x?: unknown;
  y?: unknown;
  celdasAncho?: unknown;
  celdasAlto?: unknown;
  escala?: unknown;
  esMonstruo?: unknown;
}

export class MapaEstadoService {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly mapaEstado: MapaEstadoRepository,
    private readonly notifier: MesasNotifier
  ) {}

  async obtenerMapa(actor: User, mesaId: string): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    void mesa;
    return this.mapaEstado.getEstado(mesaId);
  }

  async guardarFondoYRejilla(
    actor: User,
    mesaId: string,
    fondo?: MapaFondoConfig | null,
    rejilla?: MapaRejillaConfig
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesa(mesaId);
    if (!this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const actual = await this.mapaEstado.getEstado(mesaId);
    const siguiente: EstadoMapaCompartido = sanitizarMapaEstado({
      ...actual,
      fondo: fondo === undefined ? actual.fondo : sanitizarFondo(fondo),
      rejilla: rejilla === undefined ? actual.rejilla : sanitizarRejilla(rejilla)
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async guardarIniciativa(
    actor: User,
    mesaId: string,
    iniciativa: unknown
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesa(mesaId);
    if (!this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const limpia = sanitizarIniciativa(iniciativa);
    if (!limpia) {
      throw errors.invalidRequest();
    }

    const actual = await this.mapaEstado.getEstado(mesaId);
    const siguiente: EstadoMapaCompartido = sanitizarMapaEstado({
      ...actual,
      iniciativa: limpia
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async crearToken(
    actor: User,
    mesaId: string,
    datos: CrearTokenMapaInput,
    guardarPlantilla = false
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const esMaster = this.esMaster(actor, mesa);

    if (datos.esMonstruo === true && !esMaster) {
      throw errors.forbidden();
    }

    const archivoId =
      typeof datos.archivoId === "string" && datos.archivoId.trim()
        ? datos.archivoId.trim()
        : undefined;
    const urlCruda =
      typeof datos.imagenUrl === "string" && datos.imagenUrl.trim()
        ? datos.imagenUrl.trim()
        : "";
    const imagenUrl =
      urlCruda || (archivoId ? `/api/archivos/${archivoId}` : "");
    if (!imagenUrl) {
      throw errors.invalidRequest();
    }

    const nombre =
      typeof datos.nombre === "string" && datos.nombre.trim()
        ? datos.nombre.trim().slice(0, 120)
        : "Token";
    const celdasAncho = clampNumero(datos.celdasAncho, 0.25, 20, 1);
    const celdasAlto = clampNumero(datos.celdasAlto, 0.25, 20, 1);
    const escala = clampNumero(datos.escala, 0.1, 5, 1);
    const esMonstruo = esMaster && datos.esMonstruo === true;

    const token: TokenMapa = {
      id: crypto.randomUUID(),
      nombre,
      ...(archivoId ? { archivoId } : {}),
      imagenUrl,
      x: clampNumero(datos.x, -10000, 10000, 50),
      y: clampNumero(datos.y, -10000, 10000, 50),
      celdasAncho,
      celdasAlto,
      escala,
      autorId: actor.id,
      autorNombre: nombreDeUsuario(actor),
      autorColor: mesa.colores?.[actor.id] ?? "#96fbc7",
      ...(esMonstruo ? { esMonstruo: true } : {})
    };

    const actual = await this.mapaEstado.getEstado(mesaId);
    const plantillas = [...actual.plantillas];

    if (guardarPlantilla) {
      const plantilla: PlantillaTokenMapa = {
        id: crypto.randomUUID(),
        nombre,
        ...(archivoId ? { archivoId } : {}),
        imagenUrl,
        celdasAncho,
        celdasAlto,
        escala,
        autorId: actor.id,
        ...(esMonstruo ? { esMonstruo: true } : {})
      };
      plantillas.push(plantilla);
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      tokens: [...actual.tokens, token],
      plantillas
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async actualizarToken(
    actor: User,
    mesaId: string,
    tokenId: string,
    patch: ActualizarTokenMapaInput
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);

    const idx = actual.tokens.findIndex(t => t.id === tokenId);
    if (idx === -1) {
      throw new AppError("TOKEN_NOT_FOUND", 404);
    }

    const tokenActual = actual.tokens[idx]!;
    const esMaster = this.esMaster(actor, mesa);
    if (tokenActual.autorId !== actor.id && !esMaster) {
      throw errors.forbidden();
    }

    if (patch.esMonstruo === true && !esMaster) {
      throw errors.forbidden();
    }

    const actualizado: TokenMapa = {
      ...tokenActual,
      nombre:
        typeof patch.nombre === "string" && patch.nombre.trim()
          ? patch.nombre.trim().slice(0, 120)
          : tokenActual.nombre,
      x:
        patch.x !== undefined
          ? clampNumero(patch.x, -10000, 10000, tokenActual.x)
          : tokenActual.x,
      y:
        patch.y !== undefined
          ? clampNumero(patch.y, -10000, 10000, tokenActual.y)
          : tokenActual.y,
      celdasAncho:
        patch.celdasAncho !== undefined
          ? clampNumero(patch.celdasAncho, 0.25, 20, tokenActual.celdasAncho)
          : tokenActual.celdasAncho,
      celdasAlto:
        patch.celdasAlto !== undefined
          ? clampNumero(patch.celdasAlto, 0.25, 20, tokenActual.celdasAlto)
          : tokenActual.celdasAlto,
      escala:
        patch.escala !== undefined
          ? clampNumero(patch.escala, 0.1, 5, tokenActual.escala)
          : tokenActual.escala
    };

    if (patch.esMonstruo !== undefined && esMaster) {
      if (patch.esMonstruo === true) {
        actualizado.esMonstruo = true;
      } else {
        delete actualizado.esMonstruo;
      }
    }

    const tokens = [...actual.tokens];
    tokens[idx] = actualizado;

    const siguiente = sanitizarMapaEstado({ ...actual, tokens });
    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async eliminarToken(
    actor: User,
    mesaId: string,
    tokenId: string
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);

    const token = actual.tokens.find(t => t.id === tokenId);
    if (!token) {
      throw new AppError("TOKEN_NOT_FOUND", 404);
    }

    if (token.autorId !== actor.id && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      tokens: actual.tokens.filter(t => t.id !== tokenId)
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async eliminarPlantilla(
    actor: User,
    mesaId: string,
    plantillaId: string
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);

    const plantilla = actual.plantillas.find(p => p.id === plantillaId);
    if (!plantilla) {
      throw new AppError("PLANTILLA_NOT_FOUND", 404);
    }

    if (plantilla.autorId !== actor.id && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      plantillas: actual.plantillas.filter(p => p.id !== plantillaId)
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  private async obtenerMesa(mesaId: string): Promise<Mesa> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();
    return mesa;
  }

  private async obtenerMesaParticipante(actor: User, mesaId: string): Promise<Mesa> {
    const mesa = await this.obtenerMesa(mesaId);
    if (mesa.hostId !== actor.id && !mesa.players.includes(actor.id)) {
      throw errors.forbidden();
    }
    return mesa;
  }

  private esMaster(actor: User, mesa: Mesa): boolean {
    return mesa.hostId === actor.id || actor.role === "ADMIN";
  }

  private difundir(mesa: Mesa, mapa: EstadoMapaCompartido): void {
    const miembros = [mesa.hostId, ...mesa.players];
    this.notifier.mapaActualizado(miembros, mesa.id, mapa);
  }
}
