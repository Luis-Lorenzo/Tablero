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
}

export interface EstadoMapaCompartido {
  fondo: MapaFondoConfig | null;
  rejilla: MapaRejillaConfig;
  tokens: TokenMapa[];
  plantillas: PlantillaTokenMapa[];
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
    plantillas: []
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
  return plantilla;
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

  return {
    fondo: sanitizarFondo(obj.fondo),
    rejilla: sanitizarRejilla(obj.rejilla),
    tokens,
    plantillas
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
