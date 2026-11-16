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
  categoria?: unknown;
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

export interface ActualizarPlantillaMapaInput {
  categoria?: unknown;
  nombre?: unknown;
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

  async avanzarTurnoIniciativa(
    actor: User,
    mesaId: string
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);
    const iniciativa = actual.iniciativa;

    if (!iniciativa?.activa || iniciativa.entradas.length === 0) {
      return actual;
    }

    const entradaActual = iniciativa.entradas[iniciativa.turnoIndice];
    if (!this.esMaster(actor, mesa) && entradaActual?.jugadorId !== actor.id) {
      throw errors.forbidden();
    }

    const haySiguiente = iniciativa.turnoIndice + 1 < iniciativa.entradas.length;
    const siguiente: EstadoMapaCompartido = sanitizarMapaEstado({
      ...actual,
      iniciativa: {
        ...iniciativa,
        turnoIndice: haySiguiente ? iniciativa.turnoIndice + 1 : 0,
        ronda: haySiguiente ? iniciativa.ronda : iniciativa.ronda + 1
      }
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async crearToken(
    actor: User,
    mesaId: string,
    datos: CrearTokenMapaInput,
    guardarPlantilla = false,
    categoria?: string
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
    const debeGuardarPlantilla =
      typeof datos.guardarPlantilla === "boolean"
        ? datos.guardarPlantilla
        : guardarPlantilla;
    const categoriaRaw = categoria !== undefined ? categoria : datos.categoria;
    const categoriaLimpia =
      typeof categoriaRaw === "string" && categoriaRaw.trim()
        ? categoriaRaw.trim().slice(0, 40)
        : undefined;

    if (debeGuardarPlantilla) {
      const plantilla: PlantillaTokenMapa = {
        id: crypto.randomUUID(),
        nombre,
        ...(archivoId ? { archivoId } : {}),
        imagenUrl,
        celdasAncho,
        celdasAlto,
        escala,
        autorId: actor.id,
        ...(esMonstruo ? { esMonstruo: true } : {}),
        ...(categoriaLimpia ? { categoria: categoriaLimpia } : {})
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

    const plantillas = [...actual.plantillas];
    const yaTienePlantilla = plantillas.some(
      p =>
        p.autorId === token.autorId &&
        p.nombre === token.nombre &&
        p.imagenUrl === token.imagenUrl
    );
    if (!yaTienePlantilla) {
      plantillas.push({
        id: crypto.randomUUID(),
        nombre: token.nombre,
        ...(token.archivoId ? { archivoId: token.archivoId } : {}),
        imagenUrl: token.imagenUrl,
        celdasAncho: token.celdasAncho,
        celdasAlto: token.celdasAlto,
        escala: token.escala,
        autorId: token.autorId,
        ...(token.esMonstruo ? { esMonstruo: true } : {})
      });
    }

    let iniciativa = actual.iniciativa;
    if (iniciativa) {
      const nuevasEntradas = iniciativa.entradas.filter(e => e.tokenId !== tokenId);
      if (nuevasEntradas.length !== iniciativa.entradas.length) {
        iniciativa = {
          ...iniciativa,
          entradas: nuevasEntradas,
          turnoIndice: Math.min(
            iniciativa.turnoIndice,
            Math.max(0, nuevasEntradas.length - 1)
          )
        };
      }
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      tokens: actual.tokens.filter(t => t.id !== tokenId),
      plantillas,
      ...(iniciativa !== undefined ? { iniciativa } : {})
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async actualizarPlantilla(
    actor: User,
    mesaId: string,
    plantillaId: string,
    patch: ActualizarPlantillaMapaInput
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);

    const idx = actual.plantillas.findIndex(p => p.id === plantillaId);
    if (idx === -1) {
      throw new AppError("PLANTILLA_NOT_FOUND", 404);
    }

    const plantillaActual = actual.plantillas[idx]!;
    if (plantillaActual.autorId !== actor.id && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const actualizada: PlantillaTokenMapa = { ...plantillaActual };
    if (typeof patch.nombre === "string" && patch.nombre.trim()) {
      actualizada.nombre = patch.nombre.trim().slice(0, 120);
    }
    if (patch.categoria !== undefined && typeof patch.categoria === "string") {
      const categoriaLimpia = patch.categoria.trim().slice(0, 40);
      if (categoriaLimpia) {
        actualizada.categoria = categoriaLimpia;
      } else {
        delete actualizada.categoria;
      }
    }

    const plantillas = [...actual.plantillas];
    plantillas[idx] = actualizada;

    const siguiente = sanitizarMapaEstado({ ...actual, plantillas });
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
