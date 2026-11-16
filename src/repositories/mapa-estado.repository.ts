export interface MapaRejillaConfig {
  visible: boolean;
  columnas: number;
  filas: number;
  filasAuto: boolean;
  offsetX: number;
  offsetY: number;
  color: string;
  opacidad: number;
  imanActivo: boolean;
}

export interface MapaFondoConfig {
  archivoId?: string;
  url: string;
  titulo?: string;
  anchoNatural?: number;
  altoNatural?: number;
}

export interface TokenMapa {
  id: string;
  nombre: string;
  archivoId?: string;
  imagenUrl: string;
  x: number;
  y: number;
  celdasAncho: number;
  celdasAlto: number;
  escala: number;
  autorId: string;
  autorNombre: string;
  autorColor: string;
  esMonstruo?: boolean;
}

export interface PlantillaTokenMapa {
  id: string;
  nombre: string;
  archivoId?: string;
  imagenUrl: string;
  celdasAncho: number;
  celdasAlto: number;
  escala: number;
  autorId: string;
  esMonstruo?: boolean;
  categoria?: string;
}

export interface IniciativaEntrada {
  id: string;
  nombre: string;
  valor: number;
  color?: string;
  esMonstruo?: boolean;
  jugadorId?: string;
  tokenId?: string;
}

export interface MapaIniciativaEstado {
  activa: boolean;
  ronda: number;
  turnoIndice: number;
  entradas: IniciativaEntrada[];
}

export interface TrazoMapa {
  id: string;
  color: string;
  grosor: number;
  puntos: Array<{ x: number; y: number }>;
  autorId?: string;
}

export interface EstadoMapaCompartido {
  fondo: MapaFondoConfig | null;
  rejilla: MapaRejillaConfig;
  tokens: TokenMapa[];
  plantillas: PlantillaTokenMapa[];
  iniciativa?: MapaIniciativaEstado;
  trazos?: TrazoMapa[];
  dibujoCongelado?: boolean;
}

export const REJILLA_MAPA_DEFECTO: MapaRejillaConfig = {
  visible: true,
  columnas: 24,
  filas: 16,
  filasAuto: true,
  offsetX: 0,
  offsetY: 0,
  color: "#e8c56a",
  opacidad: 0.35,
  imanActivo: true
};

export function crearMapaEstadoVacio(): EstadoMapaCompartido {
  return {
    fondo: null,
    rejilla: { ...REJILLA_MAPA_DEFECTO },
    tokens: [],
    plantillas: [],
    trazos: [],
    dibujoCongelado: false
  };
}

export function clampNumero(
  valor: unknown,
  min: number,
  max: number,
  defecto: number
): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return defecto;
  return Math.max(min, Math.min(max, valor));
}

export function sanitizarRejilla(raw: unknown): MapaRejillaConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...REJILLA_MAPA_DEFECTO };
  }
  const obj = raw as Record<string, unknown>;
  const color =
    typeof obj.color === "string" && obj.color.trim()
      ? obj.color.trim().slice(0, 32)
      : REJILLA_MAPA_DEFECTO.color;

  return {
    visible:
      typeof obj.visible === "boolean"
        ? obj.visible
        : REJILLA_MAPA_DEFECTO.visible,
    columnas: Math.round(
      clampNumero(obj.columnas, 2, 200, REJILLA_MAPA_DEFECTO.columnas)
    ),
    filas: Math.round(
      clampNumero(obj.filas, 2, 200, REJILLA_MAPA_DEFECTO.filas)
    ),
    filasAuto:
      typeof obj.filasAuto === "boolean"
        ? obj.filasAuto
        : REJILLA_MAPA_DEFECTO.filasAuto,
    offsetX: clampNumero(obj.offsetX, -500, 500, REJILLA_MAPA_DEFECTO.offsetX),
    offsetY: clampNumero(obj.offsetY, -500, 500, REJILLA_MAPA_DEFECTO.offsetY),
    color,
    opacidad: clampNumero(obj.opacidad, 0, 1, REJILLA_MAPA_DEFECTO.opacidad),
    imanActivo:
      typeof obj.imanActivo === "boolean"
        ? obj.imanActivo
        : REJILLA_MAPA_DEFECTO.imanActivo
  };
}

export function sanitizarFondo(raw: unknown): MapaFondoConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const archivoId =
    typeof obj.archivoId === "string" && obj.archivoId.trim()
      ? obj.archivoId.trim()
      : undefined;
  const urlCruda =
    typeof obj.url === "string" && obj.url.trim() ? obj.url.trim() : "";
  const url =
    urlCruda || (archivoId ? `/api/archivos/${archivoId}` : "");
  if (!url) return null;

  const resultado: MapaFondoConfig = { url };
  if (archivoId) resultado.archivoId = archivoId;
  if (typeof obj.titulo === "string" && obj.titulo.trim()) {
    resultado.titulo = obj.titulo.trim().slice(0, 160);
  }
  if (
    typeof obj.anchoNatural === "number" &&
    Number.isFinite(obj.anchoNatural) &&
    obj.anchoNatural > 0
  ) {
    resultado.anchoNatural = Math.round(clampNumero(obj.anchoNatural, 1, 20000, 1));
  }
  if (
    typeof obj.altoNatural === "number" &&
    Number.isFinite(obj.altoNatural) &&
    obj.altoNatural > 0
  ) {
    resultado.altoNatural = Math.round(clampNumero(obj.altoNatural, 1, 20000, 1));
  }
  return resultado;
}

function sanitizarToken(raw: unknown): TokenMapa | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || !obj.id.trim()) return null;
  const archivoId =
    typeof obj.archivoId === "string" && obj.archivoId.trim()
      ? obj.archivoId.trim()
      : undefined;
  const urlCruda =
    typeof obj.imagenUrl === "string" && obj.imagenUrl.trim()
      ? obj.imagenUrl.trim()
      : "";
  const imagenUrl =
    urlCruda || (archivoId ? `/api/archivos/${archivoId}` : "");
  if (!imagenUrl) return null;

  const nombre =
    typeof obj.nombre === "string" && obj.nombre.trim()
      ? obj.nombre.trim().slice(0, 120)
      : "Token";
  const autorId =
    typeof obj.autorId === "string" && obj.autorId.trim()
      ? obj.autorId.trim()
      : "";
  if (!autorId) return null;

  const autorNombre =
    typeof obj.autorNombre === "string" && obj.autorNombre.trim()
      ? obj.autorNombre.trim().slice(0, 80)
      : "Jugador";
  const autorColor =
    typeof obj.autorColor === "string" && obj.autorColor.trim()
      ? obj.autorColor.trim().slice(0, 32)
      : "#96fbc7";

  const token: TokenMapa = {
    id: obj.id.trim(),
    nombre,
    ...(archivoId ? { archivoId } : {}),
    imagenUrl,
    x: clampNumero(obj.x, -10000, 10000, 50),
    y: clampNumero(obj.y, -10000, 10000, 50),
    celdasAncho: clampNumero(obj.celdasAncho, 0.25, 20, 1),
    celdasAlto: clampNumero(obj.celdasAlto, 0.25, 20, 1),
    escala: clampNumero(obj.escala, 0.1, 5, 1),
    autorId,
    autorNombre,
    autorColor
  };
  if (obj.esMonstruo === true) {
    token.esMonstruo = true;
  }
  return token;
}

function sanitizarPlantilla(raw: unknown): PlantillaTokenMapa | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || !obj.id.trim()) return null;
  const archivoId =
    typeof obj.archivoId === "string" && obj.archivoId.trim()
      ? obj.archivoId.trim()
      : undefined;
  const urlCruda =
    typeof obj.imagenUrl === "string" && obj.imagenUrl.trim()
      ? obj.imagenUrl.trim()
      : "";
  const imagenUrl =
    urlCruda || (archivoId ? `/api/archivos/${archivoId}` : "");
  if (!imagenUrl) return null;

  const nombre =
    typeof obj.nombre === "string" && obj.nombre.trim()
      ? obj.nombre.trim().slice(0, 120)
      : "Token";
  const autorId =
    typeof obj.autorId === "string" && obj.autorId.trim()
      ? obj.autorId.trim()
      : "";
  if (!autorId) return null;

  const plantilla: PlantillaTokenMapa = {
    id: obj.id.trim(),
    nombre,
    ...(archivoId ? { archivoId } : {}),
    imagenUrl,
    celdasAncho: clampNumero(obj.celdasAncho, 0.25, 20, 1),
    celdasAlto: clampNumero(obj.celdasAlto, 0.25, 20, 1),
    escala: clampNumero(obj.escala, 0.1, 5, 1),
    autorId
  };
  if (obj.esMonstruo === true) {
    plantilla.esMonstruo = true;
  }
  if (typeof obj.categoria === "string" && obj.categoria.trim()) {
    plantilla.categoria = obj.categoria.trim().slice(0, 40);
  }
  return plantilla;
}

function sanitizarIniciativaEntrada(raw: unknown): IniciativaEntrada | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || !obj.id.trim()) return null;
  const nombre =
    typeof obj.nombre === "string" && obj.nombre.trim()
      ? obj.nombre.trim().slice(0, 120)
      : "Participante";
  const valor = clampNumero(obj.valor, -999, 9999, 0);

  const entrada: IniciativaEntrada = {
    id: obj.id.trim().slice(0, 120),
    nombre,
    valor
  };

  if (typeof obj.color === "string" && obj.color.trim()) {
    entrada.color = obj.color.trim().slice(0, 32);
  }
  if (obj.esMonstruo === true) {
    entrada.esMonstruo = true;
  }
  if (typeof obj.jugadorId === "string" && obj.jugadorId.trim()) {
    entrada.jugadorId = obj.jugadorId.trim().slice(0, 120);
  }
  if (typeof obj.tokenId === "string" && obj.tokenId.trim()) {
    entrada.tokenId = obj.tokenId.trim().slice(0, 120);
  }

  return entrada;
}

export function sanitizarIniciativa(raw: unknown): MapaIniciativaEstado | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.activa !== "boolean" && !Array.isArray(obj.entradas)) {
    return undefined;
  }

  const entradas = Array.isArray(obj.entradas)
    ? obj.entradas
        .map(sanitizarIniciativaEntrada)
        .filter((e): e is IniciativaEntrada => e !== null)
        .slice(0, 100)
    : [];

  const activa = typeof obj.activa === "boolean" ? obj.activa : false;
  const ronda = Math.round(clampNumero(obj.ronda, 1, 9999, 1));
  const turnoIndice =
    entradas.length > 0
      ? Math.round(clampNumero(obj.turnoIndice, 0, entradas.length - 1, 0))
      : 0;

  return {
    activa,
    ronda,
    turnoIndice,
    entradas
  };
}

const COLOR_TRAZO_REGEX =
  /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{2,24}|rgba?\([^)]{1,40}\)|hsla?\([^)]{1,40}\))$/;
const MAX_TRAZOS_MAPA = 500;

export function sanitizarTrazo(raw: unknown): TrazoMapa | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || !obj.id.trim()) return null;
  if (!Array.isArray(obj.puntos)) return null;

  const puntos = obj.puntos
    .map(punto => {
      if (!punto || typeof punto !== "object" || Array.isArray(punto)) {
        return null;
      }
      const p = punto as Record<string, unknown>;
      if (
        typeof p.x !== "number" ||
        !Number.isFinite(p.x) ||
        typeof p.y !== "number" ||
        !Number.isFinite(p.y)
      ) {
        return null;
      }
      return {
        x: clampNumero(p.x, 0, 100, 0),
        y: clampNumero(p.y, 0, 100, 0)
      };
    })
    .filter((p): p is { x: number; y: number } => p !== null);

  if (puntos.length === 0) return null;

  const colorCrudo = typeof obj.color === "string" ? obj.color.trim() : "";
  const color = COLOR_TRAZO_REGEX.test(colorCrudo) ? colorCrudo : "#e8c56a";
  const grosor = clampNumero(obj.grosor, 1, 24, 3);

  const trazo: TrazoMapa = {
    id: obj.id.trim().slice(0, 120),
    color,
    grosor,
    puntos
  };

  if (typeof obj.autorId === "string" && obj.autorId.trim()) {
    trazo.autorId = obj.autorId.trim().slice(0, 120);
  }

  return trazo;
}

export function sanitizarMapaEstado(raw: unknown): EstadoMapaCompartido {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return crearMapaEstadoVacio();
  }
  const obj = raw as Record<string, unknown>;

  const tokens = Array.isArray(obj.tokens)
    ? obj.tokens
        .map(sanitizarToken)
        .filter((t): t is TokenMapa => t !== null)
    : [];

  const plantillas = Array.isArray(obj.plantillas)
    ? obj.plantillas
        .map(sanitizarPlantilla)
        .filter((p): p is PlantillaTokenMapa => p !== null)
    : [];

  const iniciativa = sanitizarIniciativa(obj.iniciativa);

  const trazos = Array.isArray(obj.trazos)
    ? obj.trazos
        .map(sanitizarTrazo)
        .filter((t): t is TrazoMapa => t !== null)
        .slice(-MAX_TRAZOS_MAPA)
    : [];

  return {
    fondo: sanitizarFondo(obj.fondo),
    rejilla: sanitizarRejilla(obj.rejilla),
    tokens,
    plantillas,
    ...(iniciativa ? { iniciativa } : {}),
    trazos,
    dibujoCongelado: Boolean(obj.dibujoCongelado)
  };
}

export interface MapaEstadoRepository {
  getEstado(mesaId: string): Promise<EstadoMapaCompartido>;
  saveEstado(mesaId: string, estado: EstadoMapaCompartido): Promise<void>;
}

export class MemoryMapaEstadoRepository implements MapaEstadoRepository {
  private readonly porMesa = new Map<string, EstadoMapaCompartido>();

  async getEstado(mesaId: string): Promise<EstadoMapaCompartido> {
    const guardado = this.porMesa.get(mesaId);
    return guardado ? sanitizarMapaEstado(guardado) : crearMapaEstadoVacio();
  }

  async saveEstado(mesaId: string, estado: EstadoMapaCompartido): Promise<void> {
    this.porMesa.set(mesaId, sanitizarMapaEstado(estado));
  }
}
