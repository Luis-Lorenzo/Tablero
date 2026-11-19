import { AppError, errors } from "../lib/errors.js";
import type { MesasNotifier } from "../realtime/mesas-notifier.js";
import {
  clampNumero,
  sanitizarAreaMapa,
  sanitizarFondo,
  sanitizarIniciativa,
  sanitizarMapaEstado,
  sanitizarRejilla,
  sanitizarTrazo,
  type AreaMapa,
  type EstadoMapaCompartido,
  type IniciativaEntrada,
  type MapaEstadoRepository,
  type MapaFondoConfig,
  type MapaIniciativaEstado,
  type MapaRejillaConfig,
  type PlantillaTokenMapa,
  type TokenMapa,
  type TrazoMapa
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
  enLimbo?: unknown;
}

export interface ActualizarPlantillaMapaInput {
  categoria?: unknown;
  nombre?: unknown;
}

export interface AvanzarTurnoOpciones {
  porTiempo?: boolean;
  rondaEsperada?: number;
  turnoIndiceEsperado?: number;
  entradaIdEsperada?: string;
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
    const estado = await this.mapaEstado.getEstado(mesaId);
    return this.conMarcaServidor(estado);
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
    const prevIni = actual.iniciativa;
    const prevEntradaId = prevIni?.entradas[prevIni.turnoIndice]?.id;
    const nextEntradaId = limpia.entradas[limpia.turnoIndice]?.id;
    const mismoTurno = Boolean(
      prevIni &&
        prevIni.activa &&
        limpia.activa &&
        limpia.entradas.length > 0 &&
        prevIni.ronda === limpia.ronda &&
        prevIni.turnoIndice === limpia.turnoIndice &&
        prevEntradaId === nextEntradaId &&
        (prevIni.turnoMaxSegundos ?? null) === (limpia.turnoMaxSegundos ?? null) &&
        typeof prevIni.turnoIniciadoEn === "number"
    );

    const iniciativaConTiempo: MapaIniciativaEstado =
      limpia.activa && limpia.entradas.length > 0
        ? {
            ...limpia,
            turnoIniciadoEn: mismoTurno ? prevIni!.turnoIniciadoEn : Date.now()
          }
        : {
            activa: limpia.activa,
            ronda: limpia.ronda,
            turnoIndice: limpia.turnoIndice,
            entradas: limpia.entradas,
            ...(limpia.turnoMaxSegundos !== undefined
              ? { turnoMaxSegundos: limpia.turnoMaxSegundos }
              : {})
          };

    const siguiente: EstadoMapaCompartido = sanitizarMapaEstado({
      ...actual,
      iniciativa: iniciativaConTiempo
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return this.conMarcaServidor(siguiente);
  }

  async avanzarTurnoIniciativa(
    actor: User,
    mesaId: string,
    opciones?: AvanzarTurnoOpciones
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);
    const iniciativa = actual.iniciativa;

    if (!iniciativa?.activa || iniciativa.entradas.length === 0) {
      return this.conMarcaServidor(actual);
    }

    const entradaActual = iniciativa.entradas[iniciativa.turnoIndice];
    const tokenTurno = entradaActual?.tokenId
      ? actual.tokens.find(t => t.id === entradaActual.tokenId)
      : undefined;

    if (opciones?.porTiempo) {
      if (
        (typeof opciones.rondaEsperada === "number" &&
          opciones.rondaEsperada !== iniciativa.ronda) ||
        (typeof opciones.turnoIndiceEsperado === "number" &&
          opciones.turnoIndiceEsperado !== iniciativa.turnoIndice) ||
        (typeof opciones.entradaIdEsperada === "string" &&
          opciones.entradaIdEsperada !== entradaActual?.id)
      ) {
        return this.conMarcaServidor(actual);
      }

      const maxSeg = iniciativa.turnoMaxSegundos;
      if (typeof maxSeg !== "number" || maxSeg <= 0) {
        return this.conMarcaServidor(actual);
      }
      if (this.esTurnoDelMaster(mesa, entradaActual, actual.tokens)) {
        return this.conMarcaServidor(actual);
      }
      if (
        typeof iniciativa.turnoIniciadoEn !== "number" ||
        Date.now() - iniciativa.turnoIniciadoEn < maxSeg * 1000 - 400
      ) {
        return this.conMarcaServidor(actual);
      }
    } else {
      const esDuenoDelTurno =
        entradaActual?.jugadorId === actor.id ||
        Boolean(tokenTurno && !tokenTurno.esMonstruo && tokenTurno.autorId === actor.id);
      if (!this.esMaster(actor, mesa) && !esDuenoDelTurno) {
        throw errors.forbidden();
      }
    }

    const haySiguiente = iniciativa.turnoIndice + 1 < iniciativa.entradas.length;
    const siguiente: EstadoMapaCompartido = sanitizarMapaEstado({
      ...actual,
      iniciativa: {
        ...iniciativa,
        turnoIndice: haySiguiente ? iniciativa.turnoIndice + 1 : 0,
        ronda: haySiguiente ? iniciativa.ronda : iniciativa.ronda + 1,
        turnoIniciadoEn: Date.now()
      }
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return this.conMarcaServidor(siguiente);
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

    if (typeof patch.enLimbo === "boolean") {
      if (patch.enLimbo) {
        actualizado.enLimbo = true;
      } else {
        delete actualizado.enLimbo;
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
      const prevEntradaId = iniciativa.entradas[iniciativa.turnoIndice]?.id;
      const nuevasEntradas = iniciativa.entradas.filter(e => e.tokenId !== tokenId);
      if (nuevasEntradas.length !== iniciativa.entradas.length) {
        const nuevoIndice = Math.min(
          iniciativa.turnoIndice,
          Math.max(0, nuevasEntradas.length - 1)
        );
        const nuevaEntradaId = nuevasEntradas[nuevoIndice]?.id;
        iniciativa = {
          ...iniciativa,
          entradas: nuevasEntradas,
          turnoIndice: nuevoIndice,
          ...(nuevasEntradas.length === 0 || !iniciativa.activa
            ? { turnoIniciadoEn: undefined }
            : prevEntradaId !== nuevaEntradaId
              ? { turnoIniciadoEn: Date.now() }
              : {})
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

  async agregarTrazo(
    actor: User,
    mesaId: string,
    trazoRaw: unknown
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);

    if (actual.dibujoCongelado && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    if (!trazoRaw || typeof trazoRaw !== "object" || Array.isArray(trazoRaw)) {
      throw errors.invalidRequest();
    }

    const bruto = trazoRaw as Record<string, unknown>;
    const id =
      typeof bruto.id === "string" && bruto.id.trim()
        ? bruto.id.trim()
        : crypto.randomUUID();

    const trazo: TrazoMapa | null = sanitizarTrazo({
      ...bruto,
      id,
      autorId: actor.id
    });
    if (!trazo) {
      throw errors.invalidRequest();
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      trazos: [...(actual.trazos ?? []), trazo]
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async eliminarTrazo(
    actor: User,
    mesaId: string,
    trazoId: string
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);

    const trazosActuales = actual.trazos ?? [];
    const trazo = trazosActuales.find(t => t.id === trazoId);
    if (!trazo) {
      throw new AppError("TRAZO_NOT_FOUND", 404);
    }

    const esMaster = this.esMaster(actor, mesa);
    if (!esMaster && (trazo.autorId !== actor.id || actual.dibujoCongelado)) {
      throw errors.forbidden();
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      trazos: trazosActuales.filter(t => t.id !== trazoId)
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async eliminarTrazos(
    actor: User,
    mesaId: string,
    idsRaw: unknown
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    if (!Array.isArray(idsRaw)) {
      throw errors.invalidRequest();
    }

    const idsLimpias = Array.from(
      new Set(
        idsRaw
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map(id => id.trim())
      )
    ).slice(0, 500);

    const actual = await this.mapaEstado.getEstado(mesaId);
    if (idsLimpias.length === 0) {
      return this.conMarcaServidor(actual);
    }

    const esMaster = this.esMaster(actor, mesa);
    if (actual.dibujoCongelado && !esMaster) {
      throw errors.forbidden();
    }

    const idsSet = new Set(idsLimpias);
    const trazosActuales = actual.trazos ?? [];
    const aBorrar = trazosActuales.filter(t => idsSet.has(t.id));
    if (!esMaster && aBorrar.some(t => t.autorId !== actor.id)) {
      throw errors.forbidden();
    }
    if (aBorrar.length === 0) {
      return this.conMarcaServidor(actual);
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      trazos: trazosActuales.filter(t => !idsSet.has(t.id))
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return this.conMarcaServidor(siguiente);
  }

  async borrarTodosTrazos(
    actor: User,
    mesaId: string
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesa(mesaId);
    if (!this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const actual = await this.mapaEstado.getEstado(mesaId);
    const siguiente = sanitizarMapaEstado({
      ...actual,
      trazos: []
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async cambiarDibujoCongelado(
    actor: User,
    mesaId: string,
    congelado: boolean
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesa(mesaId);
    if (!this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const actual = await this.mapaEstado.getEstado(mesaId);
    const siguiente = sanitizarMapaEstado({
      ...actual,
      dibujoCongelado: Boolean(congelado)
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async crearArea(
    actor: User,
    mesaId: string,
    raw: unknown
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);
    if (actual.dibujoCongelado && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const obj = (raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : {}) as Record<string, unknown>;
    const area = sanitizarAreaMapa({
      ...obj,
      id:
        typeof obj.id === "string" && obj.id.trim()
          ? obj.id.trim()
          : crypto.randomUUID(),
      autorId: actor.id,
      autorNombre: nombreDeUsuario(actor)
    });
    if (!area) {
      throw errors.invalidRequest();
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      areas: [...(actual.areas ?? []), area]
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async actualizarArea(
    actor: User,
    mesaId: string,
    areaId: string,
    raw: unknown
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);
    if (actual.dibujoCongelado && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const areasActuales = actual.areas ?? [];
    const indice = areasActuales.findIndex(a => a.id === areaId);
    if (indice === -1) {
      throw new AppError("AREA_NOT_FOUND", 404);
    }

    const previa = areasActuales[indice];
    const esMaster = this.esMaster(actor, mesa);
    if (!esMaster && previa.autorId !== actor.id) {
      throw errors.forbidden();
    }

    const patch = (raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : {}) as Record<string, unknown>;
    const actualizada = sanitizarAreaMapa({
      ...previa,
      ...(patch.x !== undefined ? { x: patch.x } : {}),
      ...(patch.y !== undefined ? { y: patch.y } : {}),
      ...(patch.celdas !== undefined ? { celdas: patch.celdas } : {}),
      ...(patch.angulo !== undefined ? { angulo: patch.angulo } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      id: previa.id,
      tipo: previa.tipo,
      autorId: previa.autorId,
      autorNombre: previa.autorNombre
    });
    if (!actualizada) {
      throw errors.invalidRequest();
    }

    const nuevas = [...areasActuales];
    nuevas[indice] = actualizada;
    const siguiente = sanitizarMapaEstado({
      ...actual,
      areas: nuevas
    });

    await this.mapaEstado.saveEstado(mesaId, siguiente);
    this.difundir(mesa, siguiente);
    return siguiente;
  }

  async eliminarArea(
    actor: User,
    mesaId: string,
    areaId: string
  ): Promise<EstadoMapaCompartido> {
    const mesa = await this.obtenerMesaParticipante(actor, mesaId);
    const actual = await this.mapaEstado.getEstado(mesaId);
    if (actual.dibujoCongelado && !this.esMaster(actor, mesa)) {
      throw errors.forbidden();
    }

    const areasActuales = actual.areas ?? [];
    const area = areasActuales.find(a => a.id === areaId);
    if (!area) {
      throw new AppError("AREA_NOT_FOUND", 404);
    }

    const esMaster = this.esMaster(actor, mesa);
    if (!esMaster && area.autorId !== actor.id) {
      throw errors.forbidden();
    }

    const siguiente = sanitizarMapaEstado({
      ...actual,
      areas: areasActuales.filter(a => a.id !== areaId)
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
    const adminLibre = actor.role === "ADMIN" && !mesa.players.includes(actor.id);
    if (mesa.hostId !== actor.id && !mesa.players.includes(actor.id) && !adminLibre) {
      throw errors.forbidden();
    }
    return mesa;
  }

  private esMaster(actor: User, mesa: Mesa): boolean {
    const adminLibre = actor.role === "ADMIN" && !mesa.players.includes(actor.id);
    return mesa.hostId === actor.id || adminLibre;
  }

  private esTurnoDelMaster(
    mesa: Mesa,
    entrada: IniciativaEntrada | undefined,
    tokens: TokenMapa[]
  ): boolean {
    if (!entrada || entrada.esMonstruo) return true;
    if (entrada.jugadorId) return entrada.jugadorId === mesa.hostId;
    if (entrada.tokenId) {
      const token = tokens.find(t => t.id === entrada.tokenId);
      return !token || Boolean(token.esMonstruo) || token.autorId === mesa.hostId;
    }
    return true;
  }

  private conMarcaServidor(estado: EstadoMapaCompartido): EstadoMapaCompartido {
    return { ...estado, servidorAhora: Date.now() };
  }

  private difundir(mesa: Mesa, mapa: EstadoMapaCompartido): void {
    const miembros = [mesa.hostId, ...mesa.players];
    this.notifier.mapaActualizado(miembros, mesa.id, this.conMarcaServidor(mapa));
  }
}
