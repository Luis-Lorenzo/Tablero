import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  Grid3x3,
  GripVertical,
  ImagePlus,
  Lock,
  Map as MapIcon,
  Minus,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  RotateCw,
  Ruler,
  Sliders,
  Snowflake,
  Swords,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { nuevoId } from "./calibracion";
import { IconoDadoPoligono } from "./HudSalaCompartido";
import { reproducirSonidoPing } from "./sonido";
import type {
  AreaMapa,
  EstadoMapaCompartido,
  IniciativaEntrada,
  JugadorPreview,
  MapaFondoConfig,
  MapaIniciativaEstado,
  MapaRejillaConfig,
  PingVisual,
  PlantillaTokenMapa,
  TiradaAsiento,
  TokenMapa,
  TrazoPizarra
} from "./tipos";

export interface ArchivoItem {
  id: string;
  nombre: string;
  tipo: string;
  vista: string;
  tamano: number;
  url?: string;
}

export interface MapaProps {
  onVolver: () => void;
  pingsActivos?: PingVisual[];
  onEnviarPing?: (datos: { x: number; y: number; vista: "mapa" }) => void;
  colorJugador?: string;
  nombreJugador?: string;
  esMaster?: boolean;
  miUsuarioId?: string;
  estadoMapa: EstadoMapaCompartido;
  onCambiarFondoYRejilla: (
    fondo: MapaFondoConfig | null,
    rejilla: MapaRejillaConfig
  ) => void | Promise<void>;
  onCrearToken: (
    token: Omit<TokenMapa, "id" | "autorId" | "autorNombre" | "autorColor">,
    guardarPlantilla?: boolean,
    categoria?: string
  ) => void | Promise<void>;
  onActualizarToken: (
    tokenId: string,
    patch: Partial<
      Pick<
        TokenMapa,
        "x" | "y" | "celdasAncho" | "celdasAlto" | "escala" | "nombre" | "enLimbo"
      >
    >
  ) => void | Promise<void>;
  onEliminarToken: (tokenId: string) => void | Promise<void>;
  onEliminarPlantilla?: (plantillaId: string) => void | Promise<void>;
  onActualizarPlantilla?: (
    plantillaId: string,
    patch: { categoria?: string; nombre?: string }
  ) => void | Promise<void>;
  archivosDisponibles?: ArchivoItem[];
  onSubirImagenMapa?: (
    archivo: File,
    categoria: "escena" | "token"
  ) => Promise<{ archivoId?: string; url: string; titulo: string }>;
  jugadores?: JugadorPreview[];
  tiradasAsiento?: Record<string, TiradaAsiento>;
  onCambiarIniciativa?: (iniciativa: MapaIniciativaEstado) => void | Promise<void>;
  onTerminarTurnoIniciativa?: () => void | Promise<void>;
  onAgregarTrazo?: (trazo: TrazoPizarra) => void | Promise<void>;
  onEliminarTrazo?: (trazoId: string) => void | Promise<void>;
  onBorrarTrazos?: () => void | Promise<void>;
  onCambiarDibujoCongelado?: (congelado: boolean) => void | Promise<void>;
  onCrearArea?: (area: {
    tipo: "circulo" | "cono";
    x: number;
    y: number;
    celdas: number;
    angulo?: number;
    color?: string;
  }) => void | Promise<void>;
  onActualizarArea?: (
    areaId: string,
    patch: { x?: number; y?: number; celdas?: number; angulo?: number; color?: string }
  ) => void | Promise<void>;
  onEliminarArea?: (areaId: string) => void | Promise<void>;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ASPECTO_POR_DEFECTO = 16 / 9;
const PRESETS_TAMANO = [1, 2, 3, 4] as const;
const PRESETS_AREA = [1, 2, 3, 4, 6] as const;
const COLORES_AREA = [
  "#f97316",
  "#ef4444",
  "#38bdf8",
  "#22c55e",
  "#a855f7",
  "#f5c542"
] as const;
const COLORES_DIBUJO = [
  "#f5c542",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#ffffff",
  "#111827"
] as const;
const GROSORES_DIBUJO = [
  { etiqueta: "Fino", valor: 2.5 },
  { etiqueta: "Medio", valor: 5 },
  { etiqueta: "Grueso", valor: 9 }
] as const;
const CATEGORIAS_BANDEJA_PRESETS = [
  "Monstruos",
  "Enemigos",
  "PNJs",
  "Jefes",
  "Aliados"
] as const;

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function calcularFilasAuto(columnas: number, aspecto: number): number {
  const seguro = aspecto > 0.05 ? aspecto : ASPECTO_POR_DEFECTO;
  return Math.round(limitar(columnas / seguro, 4, 80));
}

function ajustarARejilla(
  x: number,
  y: number,
  celdasAncho: number,
  celdasAlto: number,
  rejilla: MapaRejillaConfig
): { x: number; y: number } {
  const cols = Math.max(4, rejilla.columnas);
  const filas = Math.max(4, rejilla.filas);
  const cellW = 100 / cols;
  const cellH = 100 / filas;
  const offX = (rejilla.offsetX / 100) * cellW;
  const offY = (rejilla.offsetY / 100) * cellH;

  const esParX = Math.round(celdasAncho) % 2 === 0;
  const esParY = Math.round(celdasAlto) % 2 === 0;

  let snapX: number;
  if (esParX) {
    const idx = Math.round((x - offX) / cellW);
    snapX = offX + idx * cellW;
  } else {
    const idx = Math.round((x - offX) / cellW - 0.5);
    snapX = offX + (idx + 0.5) * cellW;
  }

  let snapY: number;
  if (esParY) {
    const idx = Math.round((y - offY) / cellH);
    snapY = offY + idx * cellH;
  } else {
    const idx = Math.round((y - offY) / cellH - 0.5);
    snapY = offY + (idx + 0.5) * cellH;
  }

  return {
    x: limitar(snapX, 0, 100),
    y: limitar(snapY, 0, 100)
  };
}

function puedeEditarArea(
  area: AreaMapa,
  esMaster: boolean,
  miUsuarioId?: string
): boolean {
  return esMaster || Boolean(miUsuarioId && area.autorId === miUsuarioId);
}

function calcularCeldasLinea(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rejilla: MapaRejillaConfig
): Array<{ key: string; x: number; y: number; w: number; h: number }> {
  const cols = Math.max(4, rejilla.columnas);
  const filas = Math.max(4, rejilla.filas);
  const cellW = 100 / cols;
  const cellH = 100 / filas;
  const offX = (rejilla.offsetX / 100) * cellW;
  const offY = (rejilla.offsetY / 100) * cellH;

  const c1 = Math.floor((x1 - offX) / cellW);
  const r1 = Math.floor((y1 - offY) / cellH);
  const c2 = Math.floor((x2 - offX) / cellW);
  const r2 = Math.floor((y2 - offY) / cellH);

  const pasos = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
  const vistas = new Set<string>();
  const celdas: Array<{ key: string; x: number; y: number; w: number; h: number }> = [];

  for (let i = 0; i <= pasos; i += 1) {
    const t = pasos === 0 ? 0 : i / pasos;
    const col = Math.round(c1 + (c2 - c1) * t);
    const row = Math.round(r1 + (r2 - r1) * t);
    const key = `${col},${row}`;
    if (vistas.has(key)) continue;
    vistas.add(key);
    celdas.push({
      key,
      x: offX + col * cellW,
      y: offY + row * cellH,
      w: cellW,
      h: cellH
    });
  }

  return celdas;
}

function leerArchivoComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result === "string") {
        resolve(lector.result);
      } else {
        reject(new Error("No se pudo leer la imagen."));
      }
    };
    lector.onerror = () => reject(new Error("Error al leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

const COLORES_TOKEN_ESFERA = [
  "#e8c56a",
  "#e06c75",
  "#38bdf8",
  "#4ade80",
  "#c084fc",
  "#fb923c",
  "#f472b6",
  "#ffffff"
];

function generarImagenEsferaColor(color: string): string {
  const safe = color.replace(/[^#a-zA-Z0-9(),.% ]/g, "") || "#e8c56a";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx="34%" cy="28%" r="68%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.58"/><stop offset="45%" stop-color="${safe}" stop-opacity="1"/><stop offset="100%" stop-color="#000000" stop-opacity="0.52"/></radialGradient></defs><circle cx="50" cy="50" r="45" fill="${safe}" stroke="#0b0d12" stroke-width="5"/><circle cx="50" cy="50" r="43" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function IconoCofre({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Tapa arqueada y cuerpo del cofre */}
      <path d="M3 10V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2" />
      <rect x="3" y="10" width="18" height="10" rx="2" />
      {/* Bandas verticales */}
      <path d="M7.5 4.2V20" />
      <path d="M16.5 4.2V20" />
      {/* Cierre central */}
      <rect x="10.5" y="8.5" width="3" height="4" rx="0.8" />
    </svg>
  );
}

function formatearTimerTurno(segundos: number): string {
  const mins = Math.floor(segundos / 60);
  const secs = segundos % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function medirImagen(
  url: string
): Promise<{ ancho: number; alto: number } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function puedeEditarToken(
  token: TokenMapa,
  esMaster?: boolean,
  miUsuarioId?: string
): boolean {
  if (esMaster) return true;
  if (!miUsuarioId) return !token.autorId || token.autorId === "local";
  return token.autorId === miUsuarioId;
}

function esArchivoImagen(archivo: ArchivoItem): boolean {
  return archivo.vista === "imagen" || archivo.tipo.startsWith("image/");
}

function urlDeArchivo(archivo: ArchivoItem): string {
  return archivo.url ?? `/api/archivos/${encodeURIComponent(archivo.id)}`;
}

interface ArrastrePan {
  pointerId: number;
  inicioX: number;
  inicioY: number;
  panInicialX: number;
  panInicialY: number;
}

interface ArrastreToken {
  tokenId: string;
  pointerId: number;
  inicioClientX: number;
  inicioClientY: number;
  xInicial: number;
  yInicial: number;
  xActual: number;
  yActual: number;
  celdasAncho: number;
  celdasAlto: number;
  movido: boolean;
}

export function Mapa({
  onVolver,
  pingsActivos,
  onEnviarPing,
  colorJugador,
  nombreJugador,
  esMaster = false,
  miUsuarioId,
  estadoMapa,
  onCambiarFondoYRejilla,
  onCrearToken,
  onActualizarToken,
  onEliminarToken,
  onEliminarPlantilla,
  onActualizarPlantilla,
  archivosDisponibles = [],
  onSubirImagenMapa,
  jugadores = [],
  tiradasAsiento,
  onCambiarIniciativa,
  onTerminarTurnoIniciativa,
  onAgregarTrazo,
  onEliminarTrazo,
  onBorrarTrazos,
  onCambiarDibujoCongelado,
  onCrearArea,
  onActualizarArea,
  onEliminarArea
}: MapaProps) {
  const { tokens, plantillas } = estadoMapa;
  const tokensEnMapa = useMemo(() => tokens.filter(t => !t.enLimbo), [tokens]);
  const tokensEnLimbo = useMemo(() => tokens.filter(t => Boolean(t.enLimbo)), [tokens]);
  const trazos = estadoMapa.trazos ?? [];
  const areas = estadoMapa.areas ?? [];
  const dibujoCongelado = Boolean(estadoMapa.dibujoCongelado);
  const dibujoBloqueado = dibujoCongelado && !esMaster;

  const [modoPing, setModoPing] = useState(false);
  const [modoDibujo, setModoDibujo] = useState(false);
  const [reglaAbierta, setReglaAbierta] = useState(false);
  const [modoReglaLinea, setModoReglaLinea] = useState(false);
  const [colorArea, setColorArea] = useState<string>(COLORES_AREA[0]);
  const [reglaLinea, setReglaLinea] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const reglaLineaRef = useRef<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const pointerIdReglaRef = useRef<number | null>(null);
  const [areaSeleccionadaId, setAreaSeleccionadaId] = useState<string | null>(null);
  const [arrastreArea, setArrastreArea] = useState<{
    areaId: string;
    pointerId: number;
    inicioClientX: number;
    inicioClientY: number;
    xInicial: number;
    yInicial: number;
    xActual: number;
    yActual: number;
    movido: boolean;
  } | null>(null);
  const arrastreAreaRef = useRef<{
    areaId: string;
    pointerId: number;
    inicioClientX: number;
    inicioClientY: number;
    xInicial: number;
    yInicial: number;
    xActual: number;
    yActual: number;
    movido: boolean;
  } | null>(null);
  const [rotandoArea, setRotandoArea] = useState<{
    areaId: string;
    pointerId: number;
    centroClientX: number;
    centroClientY: number;
    anguloActual: number;
  } | null>(null);
  const rotandoAreaRef = useRef<{
    areaId: string;
    pointerId: number;
    centroClientX: number;
    centroClientY: number;
    anguloActual: number;
  } | null>(null);
  const [colorDibujo, setColorDibujo] = useState<string>(
    colorJugador || COLORES_DIBUJO[0]
  );
  const [grosorDibujo, setGrosorDibujo] = useState<number>(
    GROSORES_DIBUJO[1].valor
  );
  const [trazoEnCurso, setTrazoEnCurso] = useState<TrazoPizarra | null>(null);
  const trazoEnCursoRef = useRef<TrazoPizarra | null>(null);
  const pointerIdDibujoRef = useRef<number | null>(null);
  const [pingsLocales, setPingsLocales] = useState<PingVisual[]>([]);
  const [panelAbierto, setPanelAbierto] = useState<
    "fondo" | "tokens" | "bandeja" | null
  >(null);
  const [fondoBorrador, setFondoBorrador] = useState<MapaFondoConfig | null>(
    estadoMapa.fondo
  );
  const [rejillaBorrador, setRejillaBorrador] = useState<MapaRejillaConfig>(
    estadoMapa.rejilla
  );
  const [tokenSeleccionadoId, setTokenSeleccionadoId] = useState<string | null>(
    null
  );

  // Iniciativa
  const [iniciativaAbierta, setIniciativaAbierta] = useState(false);
  const [nombreIniciativa, setNombreIniciativa] = useState("");
  const [valorIniciativa, setValorIniciativa] = useState("10");
  const [monstruoIniciativa, setMonstruoIniciativa] = useState(true);
  const [arrastreIniciativaIdx, setArrastreIniciativaIdx] = useState<
    number | null
  >(null);
  const [sobreIniciativaIdx, setSobreIniciativaIdx] = useState<number | null>(
    null
  );

  const editandoFondo = esMaster && panelAbierto === "fondo";
  const fondoActivo = editandoFondo ? fondoBorrador : estadoMapa.fondo;
  const rejillaActiva = editandoFondo ? rejillaBorrador : estadoMapa.rejilla;

  // Viewport, zoom y pan
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const limboRef = useRef<HTMLElement>(null);
  const [sobreLimbo, setSobreLimbo] = useState(false);
  const [tamanoViewport, setTamanoViewport] = useState({ w: 1280, h: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [espacioPulsado, setEspacioPulsado] = useState(false);
  const [paneando, setPaneando] = useState(false);
  const [mapaBloqueado, setMapaBloqueado] = useState(true);
  const [limboFantasma, setLimboFantasma] = useState<{
    token: TokenMapa;
    x: number;
    y: number;
  } | null>(null);
  const arrastrePanRef = useRef<ArrastrePan | null>(null);

  // Dimensiones naturales de la imagen de fondo
  const [dimsNaturales, setDimsNaturales] = useState<{
    w: number;
    h: number;
  } | null>(
    fondoActivo?.anchoNatural && fondoActivo?.altoNatural
      ? { w: fondoActivo.anchoNatural, h: fondoActivo.altoNatural }
      : null
  );

  // Arrastre de token
  const [arrastreToken, setArrastreToken] = useState<ArrastreToken | null>(null);
  const arrastreTokenRef = useRef<ArrastreToken | null>(null);

  // Formulario de nuevo token
  const [nombreToken, setNombreToken] = useState("");
  const [celdasToken, setCeldasToken] = useState<number>(1);
  const [esMonstruo, setEsMonstruo] = useState(false);
  const [colorToken, setColorToken] = useState<string>(
    colorJugador || COLORES_TOKEN_ESFERA[0]
  );
  const [guardarPlantilla, setGuardarPlantilla] = useState(true);
  const [categoriaToken, setCategoriaToken] = useState("");
  const [filtroCategoriaBandeja, setFiltroCategoriaBandeja] =
    useState<string>("Todas");
  const [plantillaEditandoCatId, setPlantillaEditandoCatId] = useState<
    string | null
  >(null);
  const [categoriaEdicionValor, setCategoriaEdicionValor] = useState("");
  const [previewUrlToken, setPreviewUrlToken] = useState<string | null>(null);
  const [archivoIdToken, setArchivoIdToken] = useState<string | undefined>(
    undefined
  );
  const [subiendoToken, setSubiendoToken] = useState(false);
  const [subiendoFondo, setSubiendoFondo] = useState(false);
  const [errorPanel, setErrorPanel] = useState<string | null>(null);

  const inputFondoRef = useRef<HTMLInputElement>(null);
  const inputTokenRef = useRef<HTMLInputElement>(null);

  // Sincronizar dimensiones naturales cuando cambia el fondo activo
  useEffect(() => {
    if (fondoActivo?.anchoNatural && fondoActivo?.altoNatural) {
      setDimsNaturales({
        w: fondoActivo.anchoNatural,
        h: fondoActivo.altoNatural
      });
    } else if (!fondoActivo) {
      setDimsNaturales(null);
    }
  }, [fondoActivo?.url, fondoActivo?.anchoNatural, fondoActivo?.altoNatural]);

  // Medir viewport con ResizeObserver
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const actualizar = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTamanoViewport({ w: rect.width, h: rect.height });
      }
    };
    actualizar();
    const ro = new ResizeObserver(actualizar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspectoCanvas = useMemo(() => {
    if (
      fondoActivo &&
      dimsNaturales &&
      dimsNaturales.w > 0 &&
      dimsNaturales.h > 0
    ) {
      return dimsNaturales.w / dimsNaturales.h;
    }
    return ASPECTO_POR_DEFECTO;
  }, [fondoActivo, dimsNaturales]);

  // Tamaño base del lienzo en píxeles (a zoom = 1) preservando el aspecto exacto
  const tamanoCanvas = useMemo(() => {
    const maxW = Math.max(240, tamanoViewport.w * 0.94);
    const maxH = Math.max(200, tamanoViewport.h * 0.94);
    let w = maxW;
    let h = w / aspectoCanvas;
    if (h > maxH) {
      h = maxH;
      w = h * aspectoCanvas;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [tamanoViewport, aspectoCanvas]);

  const centrarVista = useCallback((nuevoZoom = 1) => {
    setZoom(nuevoZoom);
    setPan({ x: 0, y: 0 });
  }, []);

  const abrirPanelFondo = useCallback(() => {
    setErrorPanel(null);
    setFondoBorrador(estadoMapa.fondo);
    setRejillaBorrador(estadoMapa.rejilla);
    setPanelAbierto("fondo");
  }, [estadoMapa.fondo, estadoMapa.rejilla]);

  const cerrarPanelFondoSinConfirmar = useCallback(() => {
    setFondoBorrador(estadoMapa.fondo);
    setRejillaBorrador(estadoMapa.rejilla);
    setPanelAbierto(null);
  }, [estadoMapa.fondo, estadoMapa.rejilla]);

  // Teclado: Espacio para pan, Escape para cerrar/deseleccionar
  useEffect(() => {
    function esElementoEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    }

    function alBajarTecla(e: KeyboardEvent): void {
      if (e.code === "Space" && !esElementoEditable(e.target)) {
        e.preventDefault();
        setEspacioPulsado(true);
      } else if (e.key === "Escape") {
        if (panelAbierto === "fondo") {
          cerrarPanelFondoSinConfirmar();
        } else if (panelAbierto) {
          setPanelAbierto(null);
        } else if (iniciativaAbierta) {
          setIniciativaAbierta(false);
        } else if (tokenSeleccionadoId) {
          setTokenSeleccionadoId(null);
        } else if (modoDibujo) {
          setModoDibujo(false);
        } else if (modoPing) {
          setModoPing(false);
        }
      }
    }

    function alSubirTecla(e: KeyboardEvent): void {
      if (e.code === "Space") {
        setEspacioPulsado(false);
      }
    }

    window.addEventListener("keydown", alBajarTecla);
    window.addEventListener("keyup", alSubirTecla);
    return () => {
      window.removeEventListener("keydown", alBajarTecla);
      window.removeEventListener("keyup", alSubirTecla);
    };
  }, [
    panelAbierto,
    iniciativaAbierta,
    tokenSeleccionadoId,
    modoDibujo,
    modoPing,
    cerrarPanelFondoSinConfirmar
  ]);

  // Deseleccionar si el token desaparece o pierde permisos
  useEffect(() => {
    if (!tokenSeleccionadoId) return;
    const encontrado = tokens.find(t => t.id === tokenSeleccionadoId);
    if (!encontrado || !puedeEditarToken(encontrado, esMaster, miUsuarioId)) {
      setTokenSeleccionadoId(null);
    }
  }, [tokens, tokenSeleccionadoId, esMaster, miUsuarioId]);

  const aplicarZoom = useCallback((factor: number) => {
    setZoom(prevZoom =>
      limitar(Number((prevZoom * factor).toFixed(4)), ZOOM_MIN, ZOOM_MAX)
    );
  }, []);

  function alGirarRueda(evento: ReactWheelEvent<HTMLDivElement>): void {
    const factor = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    aplicarZoom(factor);
  }

  function emitirPingEn(clientX: number, clientY: number): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = limitar(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = limitar(((clientY - rect.top) / rect.height) * 100, 0, 100);

    if (onEnviarPing) {
      onEnviarPing({ x, y, vista: "mapa" });
      return;
    }

    const id = nuevoId();
    reproducirSonidoPing();
    setPingsLocales(prev => [
      ...prev,
      {
        id,
        x,
        y,
        color: colorJugador ?? "#e8c56a",
        vista: "mapa",
        autorNombre: nombreJugador
      }
    ]);
    window.setTimeout(() => {
      setPingsLocales(prev => prev.filter(p => p.id !== id));
    }, 2400);
  }

  const dibujandoActivo = modoDibujo && !dibujoBloqueado;

  const coloresPaleta = useMemo(() => {
    const lista = colorJugador
      ? [colorJugador, ...COLORES_DIBUJO]
      : [...COLORES_DIBUJO];
    return Array.from(new Set(lista));
  }, [colorJugador]);

  const ultimoTrazoDeshacer = useMemo(() => {
    if (trazos.length === 0) return null;
    if (esMaster || !miUsuarioId) {
      return trazos[trazos.length - 1];
    }
    for (let i = trazos.length - 1; i >= 0; i--) {
      if (trazos[i].autorId === miUsuarioId) {
        return trazos[i];
      }
    }
    return null;
  }, [trazos, esMaster, miUsuarioId]);

  const trazosVisibles = useMemo(
    () => (trazoEnCurso ? [...trazos, trazoEnCurso] : trazos),
    [trazos, trazoEnCurso]
  );

  function obtenerPuntoCanvas(
    clientX: number,
    clientY: number
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: limitar(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: limitar(((clientY - rect.top) / rect.height) * 100, 0, 100)
    };
  }

  function alBajarPunteroCanvas(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    if (modoReglaLinea && evento.button === 0 && !espacioPulsado) {
      const punto = obtenerPuntoCanvas(evento.clientX, evento.clientY);
      if (!punto) return;
      evento.stopPropagation();
      evento.preventDefault();
      evento.currentTarget.setPointerCapture(evento.pointerId);
      const linea = { x1: punto.x, y1: punto.y, x2: punto.x, y2: punto.y };
      pointerIdReglaRef.current = evento.pointerId;
      reglaLineaRef.current = linea;
      setReglaLinea(linea);
      return;
    }

    if (!dibujandoActivo || evento.button !== 0 || espacioPulsado) return;
    const punto = obtenerPuntoCanvas(evento.clientX, evento.clientY);
    if (!punto) return;

    evento.stopPropagation();
    evento.preventDefault();
    evento.currentTarget.setPointerCapture(evento.pointerId);

    const nuevoTrazo: TrazoPizarra = {
      id: nuevoId(),
      color: colorDibujo,
      grosor: grosorDibujo,
      puntos: [punto],
      autorId: miUsuarioId
    };
    pointerIdDibujoRef.current = evento.pointerId;
    trazoEnCursoRef.current = nuevoTrazo;
    setTrazoEnCurso(nuevoTrazo);
  }

  function alMoverPunteroCanvas(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    const reglaActiva = reglaLineaRef.current;
    if (reglaActiva && pointerIdReglaRef.current === evento.pointerId) {
      const punto = obtenerPuntoCanvas(evento.clientX, evento.clientY);
      if (!punto) return;
      const siguiente = { ...reglaActiva, x2: punto.x, y2: punto.y };
      reglaLineaRef.current = siguiente;
      setReglaLinea(siguiente);
      return;
    }

    const actual = trazoEnCursoRef.current;
    if (!actual || pointerIdDibujoRef.current !== evento.pointerId) return;
    const punto = obtenerPuntoCanvas(evento.clientX, evento.clientY);
    if (!punto) return;

    const ultimo = actual.puntos[actual.puntos.length - 1];
    if (
      ultimo &&
      Math.hypot(punto.x - ultimo.x, punto.y - ultimo.y) < 0.15
    ) {
      return;
    }

    const actualizado: TrazoPizarra = {
      ...actual,
      puntos: [...actual.puntos, punto]
    };
    trazoEnCursoRef.current = actualizado;
    setTrazoEnCurso(actualizado);
  }

  function alSoltarPunteroCanvas(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    if (reglaLineaRef.current && pointerIdReglaRef.current === evento.pointerId) {
      reglaLineaRef.current = null;
      pointerIdReglaRef.current = null;
      setReglaLinea(null);
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
      return;
    }

    const actual = trazoEnCursoRef.current;
    if (!actual || pointerIdDibujoRef.current !== evento.pointerId) return;

    trazoEnCursoRef.current = null;
    pointerIdDibujoRef.current = null;
    setTrazoEnCurso(null);

    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }

    if (actual.puntos.length > 0 && onAgregarTrazo) {
      void onAgregarTrazo(actual);
    }
  }

  function alBajarPunteroViewport(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    // Botón central o Espacio+click siempre panea
    const esPanForzado = evento.button === 1 || espacioPulsado;

    if (modoPing && evento.button === 0 && !espacioPulsado) {
      emitirPingEn(evento.clientX, evento.clientY);
      return;
    }

    if ((dibujandoActivo || modoReglaLinea) && evento.button === 0 && !espacioPulsado) {
      return;
    }

    if (mapaBloqueado) {
      setTokenSeleccionadoId(null);
      setAreaSeleccionadaId(null);
      return;
    }

    if (evento.button !== 0 && !esPanForzado) return;
    if (esPanForzado) {
      evento.preventDefault();
    }

    setTokenSeleccionadoId(null);
    setAreaSeleccionadaId(null);
    evento.currentTarget.setPointerCapture(evento.pointerId);
    arrastrePanRef.current = {
      pointerId: evento.pointerId,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      panInicialX: pan.x,
      panInicialY: pan.y
    };
    setPaneando(true);
  }

  function alMoverPunteroViewport(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    const panActivo = arrastrePanRef.current;
    if (panActivo && panActivo.pointerId === evento.pointerId) {
      const dx = evento.clientX - panActivo.inicioX;
      const dy = evento.clientY - panActivo.inicioY;
      setPan({
        x: panActivo.panInicialX + dx,
        y: panActivo.panInicialY + dy
      });
      return;
    }

    const tokActivo = arrastreTokenRef.current;
    if (tokActivo && tokActivo.pointerId === evento.pointerId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dxPx = evento.clientX - tokActivo.inicioClientX;
      const dyPx = evento.clientY - tokActivo.inicioClientY;
      const distancia = Math.hypot(dxPx, dyPx);
      const movido = tokActivo.movido || distancia > 4;

      const rawX = limitar(
        tokActivo.xInicial + (dxPx / rect.width) * 100,
        0,
        100
      );
      const rawY = limitar(
        tokActivo.yInicial + (dyPx / rect.height) * 100,
        0,
        100
      );

      const debeAjustar = rejillaActiva.imanActivo && !evento.altKey;
      const posFinal = debeAjustar
        ? ajustarARejilla(
          rawX,
          rawY,
          tokActivo.celdasAncho,
          tokActivo.celdasAlto,
          rejillaActiva
        )
        : { x: rawX, y: rawY };

      const actualizado: ArrastreToken = {
        ...tokActivo,
        xActual: posFinal.x,
        yActual: posFinal.y,
        movido
      };
      arrastreTokenRef.current = actualizado;
      setArrastreToken(actualizado);
      setSobreLimbo(movido && estaSobreLimbo(evento.clientX, evento.clientY));
      return;
    }

    const areaActiva = arrastreAreaRef.current;
    if (areaActiva && areaActiva.pointerId === evento.pointerId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dxPx = evento.clientX - areaActiva.inicioClientX;
      const dyPx = evento.clientY - areaActiva.inicioClientY;
      const movido = areaActiva.movido || Math.hypot(dxPx, dyPx) > 4;
      const xActual = limitar(areaActiva.xInicial + (dxPx / rect.width) * 100, 0, 100);
      const yActual = limitar(areaActiva.yInicial + (dyPx / rect.height) * 100, 0, 100);

      const actualizado = {
        ...areaActiva,
        xActual,
        yActual,
        movido
      };
      arrastreAreaRef.current = actualizado;
      setArrastreArea(actualizado);
      return;
    }

    const rotActiva = rotandoAreaRef.current;
    if (rotActiva && rotActiva.pointerId === evento.pointerId) {
      const dx = evento.clientX - rotActiva.centroClientX;
      const dy = evento.clientY - rotActiva.centroClientY;
      const anguloActual = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      const actualizado = { ...rotActiva, anguloActual };
      rotandoAreaRef.current = actualizado;
      setRotandoArea(actualizado);
    }
  }

  function iniciarArrastreDesdeLimbo(
    evento: ReactPointerEvent<HTMLButtonElement>,
    token: TokenMapa
  ): void {
    if (!puedeEditarToken(token, esMaster, miUsuarioId) || evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();

    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    let movido = false;

    const alMover = (ev: PointerEvent) => {
      const dx = ev.clientX - inicioX;
      const dy = ev.clientY - inicioY;
      if (!movido && Math.hypot(dx, dy) > 6) {
        movido = true;
      }
      if (movido) {
        setLimboFantasma({ token, x: ev.clientX, y: ev.clientY });
      }
    };

    const alSoltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alSoltar);
      setLimboFantasma(null);

      if (!movido) {
        void onActualizarToken(token.id, {
          enLimbo: false,
          x: 50,
          y: 50
        });
        return;
      }

      if (estaSobreLimbo(ev.clientX, ev.clientY)) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xCrudo = limitar(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
      const yCrudo = limitar(((ev.clientY - rect.top) / rect.height) * 100, 0, 100);
      const pos = rejillaActiva.imanActivo
        ? ajustarARejilla(
          xCrudo,
          yCrudo,
          token.celdasAncho,
          token.celdasAlto,
          rejillaActiva
        )
        : { x: xCrudo, y: yCrudo };
      void onActualizarToken(token.id, {
        enLimbo: false,
        x: pos.x,
        y: pos.y
      });
    };

    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alSoltar);
  }

  function estaSobreLimbo(clientX: number, clientY: number): boolean {
    const rect = limboRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function alSoltarPunteroViewport(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    const panActivo = arrastrePanRef.current;
    if (panActivo && panActivo.pointerId === evento.pointerId) {
      arrastrePanRef.current = null;
      setPaneando(false);
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
    }

    const tokActivo = arrastreTokenRef.current;
    if (tokActivo && tokActivo.pointerId === evento.pointerId) {
      arrastreTokenRef.current = null;
      setArrastreToken(null);
      setSobreLimbo(false);
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
      if (tokActivo.movido) {
        if (estaSobreLimbo(evento.clientX, evento.clientY)) {
          setTokenSeleccionadoId(prev => (prev === tokActivo.tokenId ? null : prev));
          void onActualizarToken(tokActivo.tokenId, { enLimbo: true });
          return;
        }
        void onActualizarToken(tokActivo.tokenId, {
          x: Number(tokActivo.xActual.toFixed(3)),
          y: Number(tokActivo.yActual.toFixed(3))
        });
      }
    }

    const areaActiva = arrastreAreaRef.current;
    if (areaActiva && areaActiva.pointerId === evento.pointerId) {
      arrastreAreaRef.current = null;
      setArrastreArea(null);
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
      if (areaActiva.movido && onActualizarArea) {
        void onActualizarArea(areaActiva.areaId, {
          x: Number(areaActiva.xActual.toFixed(3)),
          y: Number(areaActiva.yActual.toFixed(3))
        });
      }
    }

    const rotActiva = rotandoAreaRef.current;
    if (rotActiva && rotActiva.pointerId === evento.pointerId) {
      rotandoAreaRef.current = null;
      setRotandoArea(null);
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
      if (onActualizarArea) {
        void onActualizarArea(rotActiva.areaId, {
          angulo: rotActiva.anguloActual
        });
      }
    }
  }

  function colocarAreaEnMapa(tipo: "circulo" | "cono"): void {
    if (!onCrearArea) return;
    let x = 50;
    let y = 50;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (viewport && canvas) {
      const vRect = viewport.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      if (cRect.width > 0 && cRect.height > 0) {
        const cx = vRect.left + vRect.width / 2;
        const cy = vRect.top + vRect.height / 2;
        x = limitar(((cx - cRect.left) / cRect.width) * 100, 5, 95);
        y = limitar(((cy - cRect.top) / cRect.height) * 100, 5, 95);
      }
    }
    setModoReglaLinea(false);
    setReglaAbierta(false);
    void onCrearArea({
      tipo,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      celdas: tipo === "circulo" ? 2 : 3,
      angulo: 0,
      color: colorArea
    });
  }

  function alBajarPunteroArea(
    evento: ReactPointerEvent<HTMLDivElement>,
    area: AreaMapa
  ): void {
    if (modoPing || dibujandoActivo || modoReglaLinea || espacioPulsado || evento.button === 1) {
      return;
    }
    evento.stopPropagation();
    setTokenSeleccionadoId(null);
    setAreaSeleccionadaId(area.id);

    if (!puedeEditarArea(area, esMaster, miUsuarioId) || evento.button !== 0) {
      return;
    }

    const viewport = viewportRef.current;
    if (viewport) {
      viewport.setPointerCapture(evento.pointerId);
    }
    const inicio = {
      areaId: area.id,
      pointerId: evento.pointerId,
      inicioClientX: evento.clientX,
      inicioClientY: evento.clientY,
      xInicial: area.x,
      yInicial: area.y,
      xActual: area.x,
      yActual: area.y,
      movido: false
    };
    arrastreAreaRef.current = inicio;
    setArrastreArea(inicio);
  }

  function alBajarRotacionArea(
    evento: ReactPointerEvent<HTMLButtonElement>,
    area: AreaMapa
  ): void {
    if (!puedeEditarArea(area, esMaster, miUsuarioId) || evento.button !== 0) return;
    evento.stopPropagation();
    evento.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centroClientX = rect.left + (area.x / 100) * rect.width;
    const centroClientY = rect.top + (area.y / 100) * rect.height;
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.setPointerCapture(evento.pointerId);
    }
    const rot = {
      areaId: area.id,
      pointerId: evento.pointerId,
      centroClientX,
      centroClientY,
      anguloActual: area.angulo
    };
    rotandoAreaRef.current = rot;
    setRotandoArea(rot);
  }

  function alBajarPunteroToken(
    evento: ReactPointerEvent<HTMLDivElement>,
    token: TokenMapa
  ): void {
    if (modoPing || dibujandoActivo || espacioPulsado || evento.button === 1) {
      return;
    }
    evento.stopPropagation();

    if (!puedeEditarToken(token, esMaster, miUsuarioId)) {
      return;
    }

    setTokenSeleccionadoId(token.id);
    setPanelAbierto(prev =>
      prev === "tokens" || prev === "bandeja" ? null : prev
    );
    viewportRef.current?.setPointerCapture(evento.pointerId);

    const inicio: ArrastreToken = {
      tokenId: token.id,
      pointerId: evento.pointerId,
      inicioClientX: evento.clientX,
      inicioClientY: evento.clientY,
      xInicial: token.x,
      yInicial: token.y,
      xActual: token.x,
      yActual: token.y,
      celdasAncho: token.celdasAncho,
      celdasAlto: token.celdasAlto,
      movido: false
    };
    arrastreTokenRef.current = inicio;
    setArrastreToken(inicio);
  }

  function actualizarRejilla(parche: Partial<MapaRejillaConfig>): void {
    setRejillaBorrador(prev => {
      const siguiente: MapaRejillaConfig = { ...prev, ...parche };
      siguiente.columnas = Math.round(limitar(siguiente.columnas, 4, 80));
      if (siguiente.filasAuto) {
        siguiente.filas = calcularFilasAuto(siguiente.columnas, aspectoCanvas);
      } else {
        siguiente.filas = Math.round(limitar(siguiente.filas, 4, 80));
      }
      siguiente.offsetX = limitar(siguiente.offsetX, -50, 50);
      siguiente.offsetY = limitar(siguiente.offsetY, -50, 50);
      siguiente.opacidad = limitar(siguiente.opacidad, 0.05, 1);
      return siguiente;
    });
  }

  async function alSubirFondo(
    evento: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setErrorPanel(null);
    setSubiendoFondo(true);
    try {
      let nuevoFondo: MapaFondoConfig;
      if (onSubirImagenMapa) {
        const res = await onSubirImagenMapa(archivo, "escena");
        const dims = await medirImagen(res.url);
        nuevoFondo = {
          archivoId: res.archivoId,
          url: res.url,
          titulo: res.titulo,
          anchoNatural: dims?.ancho,
          altoNatural: dims?.alto
        };
      } else {
        const url = await leerArchivoComoDataUrl(archivo);
        const dims = await medirImagen(url);
        nuevoFondo = {
          url,
          titulo: archivo.name,
          anchoNatural: dims?.ancho,
          altoNatural: dims?.alto
        };
      }

      if (nuevoFondo.anchoNatural && nuevoFondo.altoNatural) {
        setDimsNaturales({
          w: nuevoFondo.anchoNatural,
          h: nuevoFondo.altoNatural
        });
      }

      const aspectoNuevo =
        nuevoFondo.anchoNatural && nuevoFondo.altoNatural
          ? nuevoFondo.anchoNatural / nuevoFondo.altoNatural
          : aspectoCanvas;

      setFondoBorrador(nuevoFondo);
      setRejillaBorrador(prev =>
        prev.filasAuto
          ? {
            ...prev,
            filas: calcularFilasAuto(prev.columnas, aspectoNuevo)
          }
          : prev
      );
    } catch (err) {
      setErrorPanel(
        err instanceof Error ? err.message : "No se pudo cargar el fondo."
      );
    } finally {
      setSubiendoFondo(false);
    }
  }

  async function alElegirArchivoFondo(archivo: ArchivoItem): Promise<void> {
    setErrorPanel(null);
    const url = urlDeArchivo(archivo);
    const dims = await medirImagen(url);
    const nuevoFondo: MapaFondoConfig = {
      archivoId: archivo.id,
      url,
      titulo: archivo.nombre,
      anchoNatural: dims?.ancho,
      altoNatural: dims?.alto
    };
    if (dims) {
      setDimsNaturales({ w: dims.ancho, h: dims.alto });
    }
    const aspectoNuevo = dims ? dims.ancho / dims.alto : aspectoCanvas;
    setFondoBorrador(nuevoFondo);
    setRejillaBorrador(prev =>
      prev.filasAuto
        ? { ...prev, filas: calcularFilasAuto(prev.columnas, aspectoNuevo) }
        : prev
    );
  }

  async function alSubirImagenToken(
    evento: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setErrorPanel(null);
    setSubiendoToken(true);
    try {
      if (onSubirImagenMapa) {
        const res = await onSubirImagenMapa(archivo, "token");
        setPreviewUrlToken(res.url);
        setArchivoIdToken(res.archivoId);
        const nombreBase = (res.titulo || archivo.name).replace(/\.[^.]+$/, "");
        setNombreToken(prev => (prev.trim() ? prev : nombreBase));
      } else {
        const url = await leerArchivoComoDataUrl(archivo);
        setPreviewUrlToken(url);
        setArchivoIdToken(undefined);
        const nombreBase = archivo.name.replace(/\.[^.]+$/, "");
        setNombreToken(prev => (prev.trim() ? prev : nombreBase));
      }
    } catch (err) {
      setErrorPanel(
        err instanceof Error ? err.message : "No se pudo cargar la imagen."
      );
    } finally {
      setSubiendoToken(false);
    }
  }

  async function alCrearNuevoToken(): Promise<void> {
    setErrorPanel(null);
    const imagenFinal = previewUrlToken || generarImagenEsferaColor(colorToken);
    const centro = rejillaActiva.imanActivo
      ? ajustarARejilla(50, 50, celdasToken, celdasToken, rejillaActiva)
      : { x: 50, y: 50 };

    const categoriaLimpia =
      esMaster && guardarPlantilla ? categoriaToken.trim() || undefined : undefined;

    try {
      await onCrearToken(
        {
          nombre: nombreToken.trim() || "Token",
          archivoId: previewUrlToken ? archivoIdToken : undefined,
          imagenUrl: imagenFinal,
          x: centro.x,
          y: centro.y,
          celdasAncho: celdasToken,
          celdasAlto: celdasToken,
          escala: 1,
          esMonstruo: esMaster ? esMonstruo : false
        },
        guardarPlantilla,
        categoriaLimpia
      );

      setNombreToken("");
      setPreviewUrlToken(null);
      setArchivoIdToken(undefined);
      setPanelAbierto(guardarPlantilla ? "bandeja" : null);
    } catch (err) {
      setErrorPanel(err instanceof Error ? err.message : "No se pudo crear el token.");
    }
  }

  async function alInvocarPlantilla(
    plantilla: PlantillaTokenMapa
  ): Promise<void> {
    const centro = rejillaActiva.imanActivo
      ? ajustarARejilla(
        50,
        50,
        plantilla.celdasAncho,
        plantilla.celdasAlto,
        rejillaActiva
      )
      : { x: 50, y: 50 };

    await onCrearToken(
      {
        nombre: plantilla.nombre,
        archivoId: plantilla.archivoId,
        imagenUrl: plantilla.imagenUrl,
        x: centro.x,
        y: centro.y,
        celdasAncho: plantilla.celdasAncho,
        celdasAlto: plantilla.celdasAlto,
        escala: plantilla.escala,
        esMonstruo: plantilla.esMonstruo
      },
      false
    );
  }

  const pingsVisibles = (pingsActivos ?? pingsLocales).filter(
    p => p.vista === "mapa"
  );

  const imagenesDisponibles = useMemo(
    () => archivosDisponibles.filter(esArchivoImagen),
    [archivosDisponibles]
  );

  const tokenSeleccionado = useMemo(
    () => tokens.find(t => t.id === tokenSeleccionadoId) ?? null,
    [tokens, tokenSeleccionadoId]
  );

  const plantillasVisibles = useMemo(() => {
    if (esMaster) return plantillas;
    return plantillas.filter(p =>
      !miUsuarioId
        ? !p.autorId || p.autorId === "local"
        : p.autorId === miUsuarioId
    );
  }, [esMaster, plantillas, miUsuarioId]);

  const categoriasBandeja = useMemo(() => {
    const set = new Set<string>(CATEGORIAS_BANDEJA_PRESETS);
    for (const pl of plantillas) {
      const cat = pl.categoria?.trim();
      if (cat) set.add(cat);
    }
    return Array.from(set);
  }, [plantillas]);

  const plantillasFiltradas = useMemo(() => {
    if (!esMaster || filtroCategoriaBandeja === "Todas") {
      return plantillasVisibles;
    }
    return plantillasVisibles.filter(
      p => (p.categoria?.trim() || "") === filtroCategoriaBandeja
    );
  }, [esMaster, filtroCategoriaBandeja, plantillasVisibles]);

  // Líneas de la rejilla SVG en píxeles del lienzo
  const lineasRejilla = useMemo(() => {
    if (!rejillaActiva.visible) return null;
    const cols = Math.max(4, rejillaActiva.columnas);
    const filas = Math.max(4, rejillaActiva.filas);
    const cellW = tamanoCanvas.w / cols;
    const cellH = tamanoCanvas.h / filas;
    const offX = (rejillaActiva.offsetX / 100) * cellW;
    const offY = (rejillaActiva.offsetY / 100) * cellH;

    const verticales: number[] = [];
    for (let i = -1; i <= cols + 1; i++) {
      const x = offX + i * cellW;
      if (x >= -1 && x <= tamanoCanvas.w + 1) {
        verticales.push(x);
      }
    }

    const horizontales: number[] = [];
    for (let j = -1; j <= filas + 1; j++) {
      const y = offY + j * cellH;
      if (y >= -1 && y <= tamanoCanvas.h + 1) {
        horizontales.push(y);
      }
    }

    return { verticales, horizontales };
  }, [rejillaActiva, tamanoCanvas]);

  const jugadoresActivos = useMemo(
    () => jugadores.filter(j => j.activo),
    [jugadores]
  );

  const masterIds = useMemo(() => {
    const ids = new Set<string>();
    for (const j of jugadoresActivos) {
      if (j.esMaster) {
        ids.add(j.id);
        if (j.usuarioId) ids.add(j.usuarioId);
      }
    }
    return ids;
  }, [jugadoresActivos]);

  const iniciativa: MapaIniciativaEstado = estadoMapa.iniciativa ?? {
    activa: false,
    ronda: 1,
    turnoIndice: 0,
    entradas: []
  };

  function emitirIniciativa(siguiente: MapaIniciativaEstado): void {
    const normalizada: MapaIniciativaEstado = {
      ...siguiente,
      ronda: Math.max(1, Math.round(siguiente.ronda)),
      turnoIndice:
        siguiente.entradas.length === 0
          ? 0
          : Math.max(
            0,
            Math.min(siguiente.entradas.length - 1, siguiente.turnoIndice)
          )
    };
    void onCambiarIniciativa?.(normalizada);
  }

  function agregarJugadoresActivosIniciativa(): void {
    const existentes = new Set(
      iniciativa.entradas
        .map(e => e.jugadorId)
        .filter((id): id is string => Boolean(id))
    );
    const nuevos: IniciativaEntrada[] = jugadoresActivos
      .filter(j => !j.esMaster && !existentes.has(j.id))
      .map(j => ({
        id: nuevoId(),
        nombre: !j.esMaster && j.apodo?.trim() ? j.apodo.trim() : j.nombre,
        valor: 10,
        color: j.color,
        esMonstruo: false,
        jugadorId: j.id
      }));
    if (nuevos.length === 0) return;
    emitirIniciativa({
      ...iniciativa,
      activa: true,
      entradas: [...iniciativa.entradas, ...nuevos]
    });
  }

  function agregarCombatienteIniciativa(): void {
    const valorNum = Number(valorIniciativa);
    const valorLimpio = Number.isFinite(valorNum) ? Math.round(valorNum) : 10;
    const nuevaEntrada: IniciativaEntrada = {
      id: nuevoId(),
      nombre:
        nombreIniciativa.trim() ||
        (monstruoIniciativa ? "Monstruo" : "Combatiente"),
      valor: valorLimpio,
      color: monstruoIniciativa ? "#e06c75" : "#e8c56a",
      esMonstruo: monstruoIniciativa
    };
    setNombreIniciativa("");
    emitirIniciativa({
      ...iniciativa,
      activa: true,
      entradas: [...iniciativa.entradas, nuevaEntrada]
    });
  }

  function agregarTokenIniciativa(token: TokenMapa): void {
    const valorNum = Number(valorIniciativa);
    const valorLimpio = Number.isFinite(valorNum) ? Math.round(valorNum) : 10;
    const esMonstruo = Boolean(token.esMonstruo);
    const nuevaEntrada: IniciativaEntrada = {
      id: nuevoId(),
      nombre: token.nombre.trim() || (esMonstruo ? "Monstruo" : "Token"),
      valor: valorLimpio,
      color: esMonstruo ? "#e06c75" : token.autorColor || "#e8c56a",
      esMonstruo,
      ...(esMonstruo ? {} : { jugadorId: token.autorId }),
      tokenId: token.id
    };
    emitirIniciativa({
      ...iniciativa,
      activa: true,
      entradas: [...iniciativa.entradas, nuevaEntrada]
    });
  }

  function ordenarIniciativa(): void {
    const ordenadas = [...iniciativa.entradas].sort(
      (a, b) => b.valor - a.valor
    );
    emitirIniciativa({
      ...iniciativa,
      turnoIndice: 0,
      entradas: ordenadas
    });
  }

  function reordenarIniciativa(fromIndex: number, toIndex: number): void {
    if (!esMaster || fromIndex === toIndex) return;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= iniciativa.entradas.length ||
      toIndex >= iniciativa.entradas.length
    ) {
      return;
    }
    const actualId = iniciativa.entradas[iniciativa.turnoIndice]?.id;
    const nuevas = [...iniciativa.entradas];
    const [movida] = nuevas.splice(fromIndex, 1);
    nuevas.splice(toIndex, 0, movida);
    const nuevoTurnoIndice = actualId
      ? Math.max(0, nuevas.findIndex(e => e.id === actualId))
      : iniciativa.turnoIndice;
    emitirIniciativa({
      ...iniciativa,
      turnoIndice: nuevoTurnoIndice,
      entradas: nuevas
    });
  }

  function avanzarTurnoIniciativa(): void {
    const total = iniciativa.entradas.length;
    if (total === 0) return;
    if (iniciativa.turnoIndice + 1 < total) {
      emitirIniciativa({
        ...iniciativa,
        activa: true,
        turnoIndice: iniciativa.turnoIndice + 1
      });
    } else {
      emitirIniciativa({
        ...iniciativa,
        activa: true,
        ronda: iniciativa.ronda + 1,
        turnoIndice: 0
      });
    }
  }

  function retrocederTurnoIniciativa(): void {
    const total = iniciativa.entradas.length;
    if (total === 0) return;
    if (iniciativa.turnoIndice > 0) {
      emitirIniciativa({
        ...iniciativa,
        turnoIndice: iniciativa.turnoIndice - 1
      });
    } else if (iniciativa.ronda > 1) {
      emitirIniciativa({
        ...iniciativa,
        ronda: iniciativa.ronda - 1,
        turnoIndice: total - 1
      });
    }
  }

  function eliminarEntradaIniciativa(id: string): void {
    const idx = iniciativa.entradas.findIndex(e => e.id === id);
    if (idx === -1) return;
    const restantes = iniciativa.entradas.filter(e => e.id !== id);
    let nuevoTurno = iniciativa.turnoIndice;
    if (idx < nuevoTurno) {
      nuevoTurno -= 1;
    } else if (nuevoTurno >= restantes.length) {
      nuevoTurno = Math.max(0, restantes.length - 1);
    }
    emitirIniciativa({
      ...iniciativa,
      turnoIndice: nuevoTurno,
      entradas: restantes
    });
  }

  function limpiarIniciativa(): void {
    setIniciativaAbierta(false);
    emitirIniciativa({
      activa: false,
      ronda: 1,
      turnoIndice: 0,
      entradas: []
    });
  }

  function alternarVisibilidadIniciativa(): void {
    emitirIniciativa({
      ...iniciativa,
      activa: !iniciativa.activa
    });
  }

  const mostrarBarraIniciativa =
    esMaster || iniciativa.activa || iniciativa.entradas.length > 0;

  const entradaActual = iniciativa.entradas[iniciativa.turnoIndice];
  const esMiTurnoJugador = useMemo(() => {
    if (esMaster || !iniciativa.activa || iniciativa.entradas.length === 0) {
      return false;
    }
    if (!entradaActual) return false;
    const tokenTurno = entradaActual.tokenId
      ? estadoMapa.tokens.find(t => t.id === entradaActual.tokenId)
      : undefined;
    if (miUsuarioId) {
      if (entradaActual.jugadorId === miUsuarioId) return true;
      if (tokenTurno && !tokenTurno.esMonstruo && tokenTurno.autorId === miUsuarioId) {
        return true;
      }
      return jugadoresActivos.some(j => {
        if (j.id !== miUsuarioId && j.usuarioId !== miUsuarioId) return false;
        return (
          entradaActual.jugadorId === j.id ||
          (j.usuarioId ? entradaActual.jugadorId === j.usuarioId : false) ||
          entradaActual.nombre === j.nombre ||
          Boolean(j.apodo?.trim() && entradaActual.nombre === j.apodo.trim())
        );
      });
    }
    if (nombreJugador && entradaActual.nombre === nombreJugador) return true;
    return jugadoresActivos.some(j => {
      const esMismoJugador = Boolean(
        nombreJugador &&
        (j.nombre === nombreJugador || j.apodo?.trim() === nombreJugador)
      );
      if (!esMismoJugador) return false;
      return (
        entradaActual.jugadorId === j.id ||
        entradaActual.nombre === j.nombre ||
        Boolean(j.apodo?.trim() && entradaActual.nombre === j.apodo.trim())
      );
    });
  }, [
    entradaActual,
    esMaster,
    estadoMapa.tokens,
    iniciativa.activa,
    iniciativa.entradas.length,
    jugadoresActivos,
    miUsuarioId,
    nombreJugador
  ]);

  const [segundosTurno, setSegundosTurno] = useState(0);

  useEffect(() => {
    setSegundosTurno(0);
    if (!esMiTurnoJugador) return;
    const id = window.setInterval(() => {
      setSegundosTurno(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [esMiTurnoJugador, iniciativa.turnoIndice, iniciativa.ronda]);

  return (
    <div className="mapa-page">
      {!esMaster && iniciativa.activa && iniciativa.entradas.length > 0 && (
        <div className="mapa-turno-panel">
          <button
            type="button"
            className="mapa-pasar-turno-btn"
            disabled={!esMiTurnoJugador}
            onClick={() => void onTerminarTurnoIniciativa?.()}
          >
            Pasar turno
          </button>
          <span
            className={`mapa-turno-timer${esMiTurnoJugador ? " activo" : ""}`}
          >
            {formatearTimerTurno(segundosTurno)}
          </span>
        </div>
      )}

      {/* Barra flotante superior izquierda (deja libre arriba-derecha y abajo) */}
      <div className="mapa-barra-flotante">
        <button type="button" className="pizarra-btn mapa-btn-volver" onClick={onVolver}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver</span>
        </button>

        <span className="mapa-barra-sep" aria-hidden="true" />

        <button
          type="button"
          className={`pizarra-tool-btn${modoPing ? " activo" : ""}`}
          onClick={() => {
            setModoPing(prev => {
              const siguiente = !prev;
              if (siguiente) {
                setModoDibujo(false);
                setModoReglaLinea(false);
                setReglaAbierta(false);
              }
              return siguiente;
            });
          }}
          title="Señalar un punto temporalmente con un ping"
        >
          <Radio size={14} strokeWidth={2.1} aria-hidden="true" />
          <span>Ping</span>
        </button>

        <button
          type="button"
          className={`pizarra-tool-btn${dibujandoActivo ? " activo" : ""}`}
          disabled={dibujoBloqueado}
          onClick={() => {
            if (dibujoBloqueado) return;
            setModoDibujo(prev => {
              const siguiente = !prev;
              if (siguiente) {
                setModoPing(false);
                setModoReglaLinea(false);
                setReglaAbierta(false);
              }
              return siguiente;
            });
          }}
          title={
            dibujoBloqueado
              ? "El Máster ha congelado el dibujo en el mapa"
              : "Dibujar sobre el mapa"
          }
        >
          <Pencil size={14} strokeWidth={2.1} aria-hidden="true" />
          <span>Dibujar</span>
        </button>

        <button
          type="button"
          className={`pizarra-tool-btn${reglaAbierta || modoReglaLinea ? " activo" : ""}`}
          onClick={() => {
            setModoPing(false);
            setModoDibujo(false);
            if (modoReglaLinea) {
              setModoReglaLinea(false);
              setReglaAbierta(false);
            } else {
              setReglaAbierta(prev => !prev);
            }
          }}
          title="Medir distancia en casillas o colocar áreas (círculo / cono)"
        >
          <Ruler size={14} strokeWidth={2.1} aria-hidden="true" />
          <span>Regla</span>
        </button>

        {dibujandoActivo && (
          <>
            <button
              type="button"
              className="pizarra-tool-btn"
              disabled={!ultimoTrazoDeshacer || dibujoBloqueado || !onEliminarTrazo}
              onClick={() => {
                if (ultimoTrazoDeshacer && onEliminarTrazo) {
                  void onEliminarTrazo(ultimoTrazoDeshacer.id);
                }
              }}
              title="Deshacer tu último trazo"
            >
              <Undo2 size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Deshacer</span>
            </button>

            {esMaster && (
              <button
                type="button"
                className="pizarra-tool-btn"
                disabled={trazos.length === 0 || !onBorrarTrazos}
                onClick={() => {
                  if (trazos.length > 0) {
                    void onBorrarTrazos?.();
                  }
                }}
                title="Borrar todos los trazos del mapa"
              >
                <Trash2 size={14} strokeWidth={2.1} aria-hidden="true" />
                <span>Borrar todo</span>
              </button>
            )}
          </>
        )}

        {esMaster && (
          <>
            <button
              type="button"
              className={`pizarra-tool-btn${dibujoCongelado ? " activo" : ""}`}
              disabled={!onCambiarDibujoCongelado}
              onClick={() => {
                void onCambiarDibujoCongelado?.(!dibujoCongelado);
              }}
              title={
                dibujoCongelado
                  ? "Descongelar dibujo para los jugadores"
                  : "Congelar dibujo para los jugadores"
              }
            >
              <Snowflake size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Congelar</span>
            </button>

            <button
              type="button"
              className={`pizarra-tool-btn${panelAbierto === "fondo" ? " activo" : ""}`}
              onClick={() => {
                if (panelAbierto === "fondo") {
                  cerrarPanelFondoSinConfirmar();
                } else {
                  abrirPanelFondo();
                }
              }}
              title="Configurar imagen de fondo y rejilla táctica"
            >
              <Grid3x3 size={14} aria-hidden="true" />
              <span>Fondo y rejilla</span>
            </button>
          </>
        )}

        <span className="mapa-barra-sep" aria-hidden="true" />

        <div className="mapa-zoom-grupo" role="group" aria-label="Zoom del mapa">
          <button
            type="button"
            className="mapa-zoom-btn"
            onClick={() => aplicarZoom(1 / 1.2)}
            title="Alejar"
            aria-label="Alejar"
          >
            <Minus size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mapa-zoom-btn mapa-zoom-reset"
            onClick={() => centrarVista(1)}
            title="Restablecer zoom al 100% y centrar"
          >
            <RotateCcw size={12} aria-hidden="true" />
            <span>{Math.round(zoom * 100)}%</span>
          </button>
          <button
            type="button"
            className="mapa-zoom-btn"
            onClick={() => aplicarZoom(1.2)}
            title="Acercar"
            aria-label="Acercar"
          >
            <Plus size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`mapa-zoom-btn mapa-candado-btn${mapaBloqueado ? " activo" : ""}`}
            onClick={() =>
              setMapaBloqueado(prev => {
                const siguiente = !prev;
                if (siguiente) {
                  setPan({ x: 0, y: 0 });
                }
                return siguiente;
              })
            }
            aria-pressed={mapaBloqueado}
            title={
              mapaBloqueado
                ? "Mapa bloqueado (pulsa para mover el mapa)"
                : "Mapa desbloqueado (pulsa para volver al centro y bloquear)"
            }
            aria-label={
              mapaBloqueado
                ? "Desbloquear movimiento del mapa"
                : "Bloquear movimiento del mapa"
            }
          >
            {mapaBloqueado ? (
              <Lock size={13} aria-hidden="true" />
            ) : (
              <Unlock size={13} aria-hidden="true" />
            )}
          </button>
        </div>

        {dibujandoActivo && (
          <div
            className="mapa-dibujo-paleta"
            role="group"
            aria-label="Opciones de dibujo"
          >
            <div className="mapa-dibujo-colores" title="Color del trazo">
              {coloresPaleta.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`mapa-color-swatch${colorDibujo === color ? " activo" : ""
                    }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Color ${color}`}
                  onClick={() => setColorDibujo(color)}
                />
              ))}
            </div>
            <span className="mapa-barra-sep" aria-hidden="true" />
            <div className="mapa-dibujo-grosores" title="Grosor del trazo">
              {GROSORES_DIBUJO.map(item => (
                <button
                  key={item.valor}
                  type="button"
                  className={`mapa-grosor-btn${grosorDibujo === item.valor ? " activo" : ""
                    }`}
                  onClick={() => setGrosorDibujo(item.valor)}
                >
                  {item.etiqueta}
                </button>
              ))}
            </div>
          </div>
        )}

        {(reglaAbierta || modoReglaLinea) && (
          <div
            className="mapa-regla-paleta"
            role="group"
            aria-label="Herramientas de regla y áreas"
          >
            <button
              type="button"
              className={`mapa-regla-opcion${modoReglaLinea ? " activo" : ""}`}
              onClick={() => {
                setModoPing(false);
                setModoDibujo(false);
                setModoReglaLinea(prev => !prev);
              }}
              title="Arrastra entre dos puntos para contar casillas"
            >
              <Ruler size={13} aria-hidden="true" />
              <span>Línea (2 pts)</span>
            </button>

            <button
              type="button"
              className="mapa-regla-opcion"
              disabled={!onCrearArea}
              onClick={() => colocarAreaEnMapa("circulo")}
              title="Colocar área circular semitranslúcida"
            >
              <span>◯ Círculo</span>
            </button>

            <button
              type="button"
              className="mapa-regla-opcion"
              disabled={!onCrearArea}
              onClick={() => colocarAreaEnMapa("cono")}
              title="Colocar área cónica semitranslúcida"
            >
              <span>◁ Cono</span>
            </button>

            <span className="mapa-barra-sep" aria-hidden="true" />

            <div className="mapa-dibujo-colores" title="Color del área">
              {COLORES_AREA.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`mapa-color-swatch${colorArea === color ? " activo" : ""}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Color de área ${color}`}
                  onClick={() => setColorArea(color)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barra de Iniciativa centrada debajo de la barra superior */}
      {mostrarBarraIniciativa && (
        <div
          className="mapa-iniciativa-barra"
          role="region"
          aria-label="Rastreador de iniciativa"
        >
          <div className="mapa-iniciativa-cabecera">
            <span className="mapa-iniciativa-ronda">
              <Swords size={13} aria-hidden="true" />
              <span>
                {iniciativa.entradas.length > 0 || iniciativa.activa
                  ? `Ronda ${iniciativa.ronda}`
                  : "Iniciativa"}
              </span>
            </span>

            {iniciativa.entradas.length > 0 && (
              <div className="mapa-iniciativa-lista">
                {iniciativa.entradas.map((entrada, idx) => {
                  const esTurno = idx === iniciativa.turnoIndice;
                  const dotColor =
                    entrada.color ??
                    (entrada.esMonstruo ? "#e06c75" : "#e8c56a");
                  return (
                    <span
                      key={entrada.id}
                      draggable={esMaster}
                      onDragStart={e => {
                        if (!esMaster) return;
                        setArrastreIniciativaIdx(idx);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(idx));
                      }}
                      onDragOver={e => {
                        if (!esMaster || arrastreIniciativaIdx === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (sobreIniciativaIdx !== idx) {
                          setSobreIniciativaIdx(idx);
                        }
                      }}
                      onDragLeave={() => {
                        if (sobreIniciativaIdx === idx) {
                          setSobreIniciativaIdx(null);
                        }
                      }}
                      onDrop={e => {
                        if (!esMaster) return;
                        e.preventDefault();
                        const fromIdx =
                          arrastreIniciativaIdx ??
                          Number(e.dataTransfer.getData("text/plain"));
                        setArrastreIniciativaIdx(null);
                        setSobreIniciativaIdx(null);
                        if (Number.isInteger(fromIdx)) {
                          reordenarIniciativa(fromIdx, idx);
                        }
                      }}
                      onDragEnd={() => {
                        setArrastreIniciativaIdx(null);
                        setSobreIniciativaIdx(null);
                      }}
                      className={`mapa-iniciativa-chip${esTurno ? " activo" : ""}${entrada.esMonstruo ? " monstruo" : ""
                        }${esMaster ? " arrastrable" : ""}${arrastreIniciativaIdx === idx ? " arrastrando" : ""
                        }${sobreIniciativaIdx === idx && arrastreIniciativaIdx !== idx ? " sobre-destino" : ""}`}
                      title={
                        esMaster
                          ? `${entrada.nombre} (${entrada.valor}) — Arrastra para reordenar`
                          : entrada.nombre
                      }
                    >
                      <span
                        className="mapa-iniciativa-dot"
                        style={{ backgroundColor: dotColor }}
                        aria-hidden="true"
                      />
                      <span className="mapa-iniciativa-nombre">
                        {entrada.nombre}
                      </span>
                      {esMaster && (
                        <span className="mapa-iniciativa-valor">
                          {entrada.valor}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {esMaster && (
              <div className="mapa-iniciativa-controles">
                {iniciativa.entradas.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="mapa-ini-btn"
                      onClick={retrocederTurnoIniciativa}
                      title="Turno anterior"
                      aria-label="Turno anterior"
                    >
                      <ChevronLeft size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="mapa-ini-btn mapa-ini-btn-sig"
                      onClick={avanzarTurnoIniciativa}
                      title="Siguiente turno"
                    >
                      <span>Siguiente</span>
                      <ChevronRight size={13} aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={`mapa-ini-btn${iniciativaAbierta ? " activo" : ""}`}
                  onClick={() => setIniciativaAbierta(prev => !prev)}
                  aria-expanded={iniciativaAbierta}
                  title="Gestionar iniciativa"
                >
                  <Sliders size={12} aria-hidden="true" />
                  {iniciativa.entradas.length === 0 && <span>Configurar</span>}
                </button>
              </div>
            )}
          </div>

          {esMaster && iniciativaAbierta && (
            <div
              className="mapa-iniciativa-popover"
              role="dialog"
              aria-label="Gestión de iniciativa"
            >
              <div className="mapa-panel-cabecera" style={{ padding: "0 0 6px 0" }}>
                <span className="mapa-panel-titulo">
                  <Swords size={13} aria-hidden="true" />
                  <span>Gestionar iniciativa</span>
                </span>
                <button
                  type="button"
                  className="mapa-panel-cerrar"
                  onClick={() => setIniciativaAbierta(false)}
                  aria-label="Cerrar iniciativa"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mapa-iniciativa-acciones-top">
                <button
                  type="button"
                  className="mapa-btn-sec"
                  onClick={agregarJugadoresActivosIniciativa}
                  disabled={jugadoresActivos.every(
                    j =>
                      j.esMaster ||
                      iniciativa.entradas.some(e => e.jugadorId === j.id)
                  )}
                >
                  <UserPlus size={12} aria-hidden="true" />
                  <span>Añadir jugadores</span>
                </button>
                <button
                  type="button"
                  className="mapa-btn-sec"
                  onClick={ordenarIniciativa}
                  disabled={iniciativa.entradas.length < 2}
                  title="Ordenar de mayor a menor iniciativa"
                >
                  <ArrowUpDown size={12} aria-hidden="true" />
                  <span>Ordenar</span>
                </button>
                <button
                  type="button"
                  className="mapa-btn-sec"
                  onClick={alternarVisibilidadIniciativa}
                  title={
                    iniciativa.activa
                      ? "Ocultar iniciativa a los jugadores"
                      : "Mostrar iniciativa a los jugadores"
                  }
                >
                  {iniciativa.activa ? (
                    <>
                      <EyeOff size={12} aria-hidden="true" />
                      <span>Ocultar</span>
                    </>
                  ) : (
                    <>
                      <Eye size={12} aria-hidden="true" />
                      <span>Mostrar</span>
                    </>
                  )}
                </button>
                {iniciativa.entradas.length > 0 && (
                  <button
                    type="button"
                    className="mapa-btn-peligro"
                    onClick={limpiarIniciativa}
                    title="Limpiar y cerrar iniciativa"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    <span>Limpiar</span>
                  </button>
                )}
              </div>

              <form
                className="mapa-iniciativa-form"
                onSubmit={e => {
                  e.preventDefault();
                  agregarCombatienteIniciativa();
                }}
              >
                <input
                  type="text"
                  className="mapa-input"
                  placeholder="Nombre (ej. Goblin)"
                  value={nombreIniciativa}
                  onChange={e => setNombreIniciativa(e.target.value)}
                />
                <input
                  type="number"
                  className="mapa-input mapa-iniciativa-num"
                  value={valorIniciativa}
                  onChange={e => setValorIniciativa(e.target.value)}
                  aria-label="Valor de iniciativa"
                />
                <label className="mapa-check">
                  <input
                    type="checkbox"
                    checked={monstruoIniciativa}
                    onChange={e => setMonstruoIniciativa(e.target.checked)}
                  />
                  <span>Monstruo</span>
                </label>
                <button type="submit" className="mapa-btn-primario">
                  <Plus size={13} aria-hidden="true" />
                  <span>Añadir</span>
                </button>
              </form>

              {tokensEnMapa.length > 0 && (
                <div className="mapa-iniciativa-tokens">
                  <span className="mapa-iniciativa-tokens-titulo">
                    Tokens en el mapa
                  </span>
                  <div className="mapa-iniciativa-tokens-lista">
                    {tokensEnMapa.map(token => {
                      const dotColor = token.esMonstruo
                        ? "#e06c75"
                        : token.autorColor || "#e8c56a";
                      const yaEnLista = iniciativa.entradas.some(
                        e => e.tokenId === token.id
                      );
                      return (
                        <button
                          key={token.id}
                          type="button"
                          className={`mapa-iniciativa-token-btn${token.esMonstruo ? " monstruo" : ""
                            }${yaEnLista ? " en-lista" : ""}`}
                          disabled={yaEnLista}
                          onClick={() => agregarTokenIniciativa(token)}
                          title={
                            yaEnLista
                              ? `${token.nombre} ya está en iniciativa`
                              : `Añadir ${token.nombre} a iniciativa`
                          }
                        >
                          <span
                            className="mapa-iniciativa-dot"
                            style={{ backgroundColor: dotColor }}
                            aria-hidden="true"
                          />
                          <span className="mapa-iniciativa-token-nombre">
                            {token.nombre}
                          </span>
                          {yaEnLista ? (
                            <Check size={11} aria-hidden="true" />
                          ) : (
                            <Plus size={11} aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {iniciativa.entradas.length > 0 && (
                <ul className="mapa-iniciativa-editor-lista">
                  {iniciativa.entradas.map((entrada, idx) => (
                    <li
                      key={entrada.id}
                      draggable={esMaster}
                      onDragStart={e => {
                        if (!esMaster) return;
                        setArrastreIniciativaIdx(idx);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(idx));
                      }}
                      onDragOver={e => {
                        if (!esMaster || arrastreIniciativaIdx === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (sobreIniciativaIdx !== idx) {
                          setSobreIniciativaIdx(idx);
                        }
                      }}
                      onDragLeave={() => {
                        if (sobreIniciativaIdx === idx) {
                          setSobreIniciativaIdx(null);
                        }
                      }}
                      onDrop={e => {
                        if (!esMaster) return;
                        e.preventDefault();
                        const fromIdx =
                          arrastreIniciativaIdx ??
                          Number(e.dataTransfer.getData("text/plain"));
                        setArrastreIniciativaIdx(null);
                        setSobreIniciativaIdx(null);
                        if (Number.isInteger(fromIdx)) {
                          reordenarIniciativa(fromIdx, idx);
                        }
                      }}
                      onDragEnd={() => {
                        setArrastreIniciativaIdx(null);
                        setSobreIniciativaIdx(null);
                      }}
                      className={`mapa-iniciativa-editor-item${idx === iniciativa.turnoIndice ? " activo" : ""
                        }${esMaster ? " arrastrable" : ""}${arrastreIniciativaIdx === idx ? " arrastrando" : ""
                        }${sobreIniciativaIdx === idx && arrastreIniciativaIdx !== idx ? " sobre-destino" : ""}`}
                    >
                      {esMaster && (
                        <GripVertical
                          size={12}
                          className="mapa-iniciativa-grip"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className="mapa-iniciativa-dot"
                        style={{
                          backgroundColor:
                            entrada.color ??
                            (entrada.esMonstruo ? "#e06c75" : "#e8c56a")
                        }}
                        aria-hidden="true"
                      />
                      <span className="mapa-iniciativa-editor-nombre">
                        {entrada.nombre}
                      </span>
                      <span className="mapa-iniciativa-editor-val">
                        {entrada.valor}
                      </span>
                      <button
                        type="button"
                        className="mapa-panel-cerrar"
                        onClick={() => eliminarEntradaIniciativa(entrada.id)}
                        aria-label={`Quitar a ${entrada.nombre}`}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                className="mapa-btn-confirmar"
                onClick={() => setIniciativaAbierta(false)}
              >
                <Check size={14} aria-hidden="true" />
                <span>Hecho</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Columna vertical de jugadores activos y tiradas recientes */}
      {jugadoresActivos.length > 0 && (
        <aside
          className={`mapa-jugadores-columna${esMaster ? " con-master" : ""}`}
          aria-label="Jugadores en mesa"
        >
          <svg
            className="mapa-jugadores-titulo-svg"
            viewBox="0 0 156 30"
            aria-hidden="true"
          >
            <path
              id="mapa-jugadores-arco"
              d="M 8,24 Q 78,8 148,24"
              fill="none"
            />
            <text>
              <textPath
                href="#mapa-jugadores-arco"
                startOffset="50%"
                textAnchor="middle"
              >
                JUGADORES
              </textPath>
            </text>
          </svg>
          {jugadoresActivos.map(j => {
            const tieneApodo = !j.esMaster && Boolean(j.apodo?.trim());
            const etiqueta = tieneApodo ? j.apodo!.trim() : j.nombre;
            const tirada =
              tiradasAsiento?.[j.id] ??
              (j.usuarioId ? tiradasAsiento?.[j.usuarioId] : undefined);

            const esMioJugador = Boolean(
              miUsuarioId && (j.usuarioId === miUsuarioId || j.id === miUsuarioId)
            );

            const colorDadoTirada = (() => {
              if (!tirada) return j.color || "#ffe9a8";
              const deTirada = (tirada as TiradaAsiento & { colorDado?: string })
                .colorDado;
              if (deTirada) return deTirada;
              if (esMioJugador && typeof window !== "undefined") {
                try {
                  const guardado = window.localStorage.getItem("pocketrol.colorDado");
                  if (guardado) return guardado;
                } catch {
                  // ignorar errores de acceso a localStorage
                }
              }
              return j.color || "#ffe9a8";
            })();

            return (
              <div
                key={j.id}
                className={`mapa-jugador-item${j.esMaster ? " master" : ""}${esMioJugador ? " es-mio" : ""}`}
                data-jugador-id={j.id}
                data-jugador-usuario-id={j.usuarioId ?? j.id}
                style={{ "--jugador-color": j.color } as CSSProperties}
              >
                <div className="mapa-jugador-ficha">
                  <span
                    className="mapa-jugador-esfera"
                    style={{ "--color": j.color } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span
                    className={`mapa-jugador-nombre${tieneApodo ? " con-apodo" : ""
                      }`}
                    title={
                      tieneApodo ? `${etiqueta} (${j.nombre})` : j.nombre
                    }
                  >
                    {etiqueta}
                  </span>
                </div>

                {tirada && (
                  <div
                    className={`mapa-jugador-tirada${tirada.especial === "critico" ? " critico" : ""
                      }${tirada.especial === "pifia" ? " pifia" : ""}`}
                    aria-label={`${etiqueta} sacó ${tirada.total}`}
                  >
                    <span
                      className="mapa-jugador-tirada-icono"
                      style={{
                        color: tirada.colorAristasDado || "#b794f4"
                      }}
                    >
                      <IconoDadoPoligono
                        caras={tirada.caras ?? 20}
                        color={colorDadoTirada}
                        colorAristas={tirada.colorAristasDado || "#b794f4"}
                      />
                    </span>
                    <span className="mapa-jugador-tirada-total">
                      {tirada.total}
                    </span>
                    {tirada.desglose && (
                      <span className="mapa-jugador-tirada-desglose">
                        {tirada.desglose}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      )}

      {/* Panel flotante: Fondo y rejilla (solo Máster) */}
      {esMaster && panelAbierto === "fondo" && (
        <aside className="mapa-panel" aria-label="Fondo y rejilla del mapa">
          <header className="mapa-panel-cabecera">
            <span className="mapa-panel-titulo">
              <Sliders size={14} aria-hidden="true" />
              Fondo y rejilla
            </span>
            <button
              type="button"
              className="mapa-panel-cerrar"
              onClick={cerrarPanelFondoSinConfirmar}
              aria-label="Cerrar panel"
            >
              <X size={14} />
            </button>
          </header>

          <div className="mapa-panel-cuerpo">
            {errorPanel && <p className="mapa-panel-error">{errorPanel}</p>}

            <section className="mapa-panel-bloque">
              <div className="mapa-panel-subtitulo">Imagen de fondo</div>
              <div className="mapa-panel-acciones">
                <button
                  type="button"
                  className="mapa-btn-sec"
                  onClick={() => inputFondoRef.current?.click()}
                  disabled={subiendoFondo}
                >
                  <Upload size={13} aria-hidden="true" />
                  <span>{subiendoFondo ? "Subiendo..." : "Subir imagen"}</span>
                </button>
                {fondoBorrador && (
                  <button
                    type="button"
                    className="mapa-btn-peligro"
                    onClick={() => setFondoBorrador(null)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    <span>Quitar</span>
                  </button>
                )}
              </div>
              <input
                ref={inputFondoRef}
                type="file"
                accept="image/*"
                hidden
                onChange={e => void alSubirFondo(e)}
              />

              {imagenesDisponibles.length > 0 && (
                <div className="mapa-archivos-lista">
                  <span className="mapa-panel-etiqueta">
                    O elegir de tus archivos:
                  </span>
                  <div className="mapa-archivos-chips">
                    {imagenesDisponibles.slice(0, 8).map(arch => (
                      <button
                        key={arch.id}
                        type="button"
                        className={`mapa-archivo-chip${fondoBorrador?.archivoId === arch.id ? " activo" : ""
                          }`}
                        onClick={() => void alElegirArchivoFondo(arch)}
                        title={arch.nombre}
                      >
                        {arch.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="mapa-panel-bloque">
              <div className="mapa-panel-fila-check">
                <label className="mapa-check">
                  <input
                    type="checkbox"
                    checked={rejillaBorrador.visible}
                    onChange={e =>
                      actualizarRejilla({ visible: e.target.checked })
                    }
                  />
                  <span>Mostrar rejilla</span>
                </label>

                <label className="mapa-check">
                  <input
                    type="checkbox"
                    checked={rejillaBorrador.imanActivo}
                    onChange={e =>
                      actualizarRejilla({ imanActivo: e.target.checked })
                    }
                  />
                  <span>Imán a celdas</span>
                </label>
              </div>

              <div className="mapa-grid-campos">
                <label className="mapa-campo">
                  <span>Columnas ({rejillaBorrador.columnas})</span>
                  <input
                    type="range"
                    min={4}
                    max={80}
                    value={rejillaBorrador.columnas}
                    onChange={e =>
                      actualizarRejilla({ columnas: Number(e.target.value) })
                    }
                  />
                </label>

                <div className="mapa-campo">
                  <div className="mapa-campo-fila-lbl">
                    <span>Filas ({rejillaBorrador.filas})</span>
                    <button
                      type="button"
                      className={`mapa-lock-btn${rejillaBorrador.filasAuto ? " activo" : ""}`}
                      onClick={() =>
                        actualizarRejilla({
                          filasAuto: !rejillaBorrador.filasAuto
                        })
                      }
                      title={
                        rejillaBorrador.filasAuto
                          ? "Filas automáticas (celdas cuadradas). Pulsa para editar manualmente."
                          : "Filas manuales. Pulsa para volver a celdas cuadradas."
                      }
                    >
                      {rejillaBorrador.filasAuto ? (
                        <>
                          <Lock size={11} aria-hidden="true" />
                          <span>Auto</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={11} aria-hidden="true" />
                          <span>Manual</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={80}
                    disabled={rejillaBorrador.filasAuto}
                    value={rejillaBorrador.filas}
                    onChange={e =>
                      actualizarRejilla({ filas: Number(e.target.value) })
                    }
                  />
                </div>

                <label className="mapa-campo">
                  <span>Desfase X ({Math.round(rejillaBorrador.offsetX)}%)</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={rejillaBorrador.offsetX}
                    onChange={e =>
                      actualizarRejilla({ offsetX: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="mapa-campo">
                  <span>Desfase Y ({Math.round(rejillaBorrador.offsetY)}%)</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={rejillaBorrador.offsetY}
                    onChange={e =>
                      actualizarRejilla({ offsetY: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="mapa-campo">
                  <span>
                    Opacidad ({Math.round(rejillaBorrador.opacidad * 100)}%)
                  </span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={rejillaBorrador.opacidad}
                    onChange={e =>
                      actualizarRejilla({ opacidad: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="mapa-campo mapa-campo-color">
                  <span>Color</span>
                  <input
                    type="color"
                    value={rejillaBorrador.color}
                    onChange={e =>
                      actualizarRejilla({ color: e.target.value })
                    }
                  />
                </label>
              </div>
            </section>
          </div>

          <footer className="mapa-panel-pie">
            <button
              type="button"
              className="mapa-btn-confirmar"
              onClick={() => {
                void onCambiarFondoYRejilla(fondoBorrador, rejillaBorrador);
                setPanelAbierto(null);
              }}
            >
              <Check size={14} aria-hidden="true" />
              <span>Confirmar</span>
            </button>
          </footer>
        </aside>
      )}

      {/* Panel flotante unificado: Almacén | + Nuevo */}
      {(panelAbierto === "tokens" || panelAbierto === "bandeja") && (
        <aside
          className="mapa-panel en-abajo"
          aria-label="Tokens y almacén"
        >
          <header className="mapa-panel-cabecera">
            <span className="mapa-panel-titulo">
              {panelAbierto === "bandeja" ? (
                <IconoCofre size={14} />
              ) : (
                <Users size={14} aria-hidden="true" />
              )}
              Tokens
            </span>
            <button
              type="button"
              className="mapa-panel-cerrar"
              onClick={() => {
                setPlantillaEditandoCatId(null);
                setPanelAbierto(null);
              }}
              aria-label="Cerrar panel"
            >
              <X size={14} />
            </button>
          </header>

          <div className="mapa-panel-tabs" role="tablist" aria-label="Vista de tokens">
            <button
              type="button"
              role="tab"
              aria-selected={panelAbierto === "bandeja"}
              className={`mapa-panel-tab${panelAbierto === "bandeja" ? " activo" : ""}`}
              onClick={() => {
                setErrorPanel(null);
                setPanelAbierto("bandeja");
              }}
            >
              <IconoCofre size={13} />
              <span>Almacén ({plantillasVisibles.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelAbierto === "tokens"}
              className={`mapa-panel-tab${panelAbierto === "tokens" ? " activo" : ""}`}
              onClick={() => {
                setErrorPanel(null);
                setPlantillaEditandoCatId(null);
                setPanelAbierto("tokens");
              }}
            >
              <Plus size={13} aria-hidden="true" />
              <span>Nuevo</span>
            </button>
          </div>

          <div className="mapa-panel-cuerpo">
            {errorPanel && <p className="mapa-panel-error">{errorPanel}</p>}

            {panelAbierto === "tokens" ? (
              <div className="mapa-token-form">
                <div className="mapa-token-preview-fila">
                  <div className="mapa-token-subir-wrap">
                    <button
                      type="button"
                      className="mapa-token-subir"
                      onClick={() => inputTokenRef.current?.click()}
                      disabled={subiendoToken}
                      title={
                        previewUrlToken
                          ? "Cambiar imagen del token"
                          : "Subir imagen (opcional; si no, usa esfera de color)"
                      }
                    >
                      {previewUrlToken ? (
                        <img src={previewUrlToken} alt="Vista previa" />
                      ) : (
                        <span
                          className="mapa-token-esfera-preview"
                          style={{ "--esfera-color": colorToken } as CSSProperties}
                        >
                          <ImagePlus size={15} aria-hidden="true" />
                        </span>
                      )}
                    </button>
                    {previewUrlToken && (
                      <button
                        type="button"
                        className="mapa-token-quitar-img"
                        onClick={() => {
                          setPreviewUrlToken(null);
                          setArchivoIdToken(undefined);
                        }}
                        title="Usar esfera de color en lugar de imagen"
                        aria-label="Quitar imagen y usar color"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <input
                    ref={inputTokenRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={e => void alSubirImagenToken(e)}
                  />
                  <div className="mapa-token-datos">
                    <input
                      type="text"
                      className="mapa-input"
                      placeholder="Nombre del token..."
                      value={nombreToken}
                      onChange={e => setNombreToken(e.target.value)}
                    />
                    <div className="mapa-tamano-presets" role="group" aria-label="Tamaño en casillas">
                      {PRESETS_TAMANO.map(n => (
                        <button
                          key={n}
                          type="button"
                          className={`mapa-preset-btn${celdasToken === n ? " activo" : ""
                            }`}
                          onClick={() => setCeldasToken(n)}
                        >
                          {n}×{n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!previewUrlToken && (
                  <div className="mapa-token-colores" role="group" aria-label="Color de esfera del token">
                    <span className="mapa-token-colores-etiqueta">Color</span>
                    <div className="mapa-token-colores-swatches">
                      {COLORES_TOKEN_ESFERA.map(color => (
                        <button
                          key={color}
                          type="button"
                          className={`mapa-color-swatch${colorToken.toLowerCase() === color.toLowerCase()
                            ? " activo"
                            : ""
                            }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Color ${color}`}
                          onClick={() => setColorToken(color)}
                        />
                      ))}
                      <input
                        type="color"
                        className="mapa-token-color-input"
                        value={colorToken}
                        onChange={e => setColorToken(e.target.value)}
                        title="Elegir color personalizado"
                        aria-label="Elegir color personalizado"
                      />
                    </div>
                  </div>
                )}

                {esMaster && (
                  <div className="mapa-token-tipo-grupo" role="group" aria-label="Tipo de token">
                    <button
                      type="button"
                      className={`mapa-token-tipo-btn aliado${!esMonstruo ? " activo" : ""}`}
                      onClick={() => setEsMonstruo(false)}
                    >
                      Aliado
                    </button>
                    <button
                      type="button"
                      className={`mapa-token-tipo-btn enemigo${esMonstruo ? " activo" : ""}`}
                      onClick={() => setEsMonstruo(true)}
                    >
                      Enemigo
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={guardarPlantilla}
                  className={`mapa-toggle-fila${guardarPlantilla ? " activo" : ""}`}
                  onClick={() => setGuardarPlantilla(prev => !prev)}
                >
                  <span>Guardar en Almacén</span>
                  <span className="mapa-toggle-switch" aria-hidden="true">
                    <span className="mapa-toggle-thumb" />
                  </span>
                </button>

                {esMaster && guardarPlantilla && (
                  <div className="mapa-bandeja-cat-campo">
                    <div className="mapa-bandeja-cat-presets">
                      {CATEGORIAS_BANDEJA_PRESETS.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          className={`mapa-bandeja-filtro-btn${categoriaToken === cat ? " activo" : ""
                            }`}
                          onClick={() =>
                            setCategoriaToken(prev => (prev === cat ? "" : cat))
                          }
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      className="mapa-input mapa-bandeja-cat-input"
                      placeholder="Categoría opcional (ej. Monstruos)..."
                      value={categoriaToken}
                      onChange={e => setCategoriaToken(e.target.value)}
                    />
                  </div>
                )}

                <button
                  type="button"
                  className="mapa-btn-primario"
                  disabled={subiendoToken}
                  onClick={() => void alCrearNuevoToken()}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>Añadir al mapa</span>
                </button>
              </div>
            ) : (
              <>
                {esMaster && (
                  <div
                    className="mapa-bandeja-filtros"
                    role="tablist"
                    aria-label="Filtrar por categoría"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filtroCategoriaBandeja === "Todas"}
                      className={`mapa-bandeja-filtro-btn${filtroCategoriaBandeja === "Todas" ? " activo" : ""
                        }`}
                      onClick={() => setFiltroCategoriaBandeja("Todas")}
                    >
                      Todas
                    </button>
                    {categoriasBandeja.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        role="tab"
                        aria-selected={filtroCategoriaBandeja === cat}
                        className={`mapa-bandeja-filtro-btn${filtroCategoriaBandeja === cat ? " activo" : ""
                          }`}
                        onClick={() => setFiltroCategoriaBandeja(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {plantillasFiltradas.length === 0 ? (
                  <p className="mapa-panel-vacio">
                    {plantillasVisibles.length === 0
                      ? "Aún no hay tokens en el Almacén. Crea uno en “+ Nuevo” con “Guardar en Almacén” activado."
                      : "No hay tokens en esta categoría."}
                  </p>
                ) : (
                  <div className="mapa-plantillas-grid">
                    {plantillasFiltradas.map(pl => {
                      const puedeBorrarPl =
                        esMaster ||
                        (!miUsuarioId
                          ? !pl.autorId || pl.autorId === "local"
                          : pl.autorId === miUsuarioId);
                      const editandoCat =
                        esMaster && plantillaEditandoCatId === pl.id;
                      return (
                        <div key={pl.id} className="mapa-plantilla-card">
                          <button
                            type="button"
                            className="mapa-plantilla-invocar"
                            onClick={() => void alInvocarPlantilla(pl)}
                            title={`Colocar ${pl.nombre} (${pl.celdasAncho}×${pl.celdasAlto}) en el centro`}
                          >
                            <img src={pl.imagenUrl} alt={pl.nombre} />
                            <span className="mapa-plantilla-nombre">
                              {pl.nombre}
                            </span>
                            <span className="mapa-plantilla-tam">
                              {pl.celdasAncho}×{pl.celdasAlto}
                            </span>
                          </button>

                          {esMaster &&
                            (editandoCat ? (
                              <input
                                type="text"
                                list="mapa-bandeja-cats-datalist"
                                className="mapa-input mapa-bandeja-cat-input"
                                placeholder="Categoría..."
                                autoFocus
                                value={categoriaEdicionValor}
                                onChange={e =>
                                  setCategoriaEdicionValor(e.target.value)
                                }
                                onBlur={() => {
                                  const cat = categoriaEdicionValor.trim();
                                  setPlantillaEditandoCatId(null);
                                  if (
                                    onActualizarPlantilla &&
                                    cat !== (pl.categoria?.trim() || "")
                                  ) {
                                    void onActualizarPlantilla(pl.id, {
                                      categoria: cat
                                    });
                                  }
                                }}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const cat = categoriaEdicionValor.trim();
                                    setPlantillaEditandoCatId(null);
                                    if (
                                      onActualizarPlantilla &&
                                      cat !== (pl.categoria?.trim() || "")
                                    ) {
                                      void onActualizarPlantilla(pl.id, {
                                        categoria: cat
                                      });
                                    }
                                  } else if (e.key === "Escape") {
                                    setPlantillaEditandoCatId(null);
                                  }
                                }}
                              />
                            ) : onActualizarPlantilla ? (
                              <button
                                type="button"
                                className={`mapa-bandeja-cat-badge${pl.categoria ? "" : " vacia"
                                  }`}
                                onClick={() => {
                                  setPlantillaEditandoCatId(pl.id);
                                  setCategoriaEdicionValor(pl.categoria || "");
                                }}
                                title="Cambiar categoría"
                              >
                                {pl.categoria || "Sin cat."}
                              </button>
                            ) : (
                              pl.categoria && (
                                <span className="mapa-bandeja-cat-badge">
                                  {pl.categoria}
                                </span>
                              )
                            ))}

                          {onEliminarPlantilla && puedeBorrarPl && (
                            <button
                              type="button"
                              className="mapa-plantilla-borrar"
                              onClick={() => void onEliminarPlantilla(pl.id)}
                              title="Eliminar plantilla"
                              aria-label={`Eliminar plantilla ${pl.nombre}`}
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {esMaster && (
                  <datalist id="mapa-bandeja-cats-datalist">
                    {categoriasBandeja.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </div>
        </aside>
      )}

      {/* Barra contextual flotante del token seleccionado */}
      {tokenSeleccionado && (
        <div
          className="mapa-token-barra"
          role="toolbar"
          aria-label={`Controles de ${tokenSeleccionado.nombre}`}
        >
          <span className="mapa-token-barra-nombre">
            {tokenSeleccionado.esMonstruo && (
              <Crown size={12} aria-hidden="true" />
            )}
            {tokenSeleccionado.nombre}
          </span>

          <div className="mapa-tamano-presets">
            {PRESETS_TAMANO.map(n => {
              const activo =
                tokenSeleccionado.celdasAncho === n &&
                tokenSeleccionado.celdasAlto === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`mapa-preset-btn${activo ? " activo" : ""}`}
                  onClick={() => {
                    const pos = rejillaActiva.imanActivo
                      ? ajustarARejilla(
                        tokenSeleccionado.x,
                        tokenSeleccionado.y,
                        n,
                        n,
                        rejillaActiva
                      )
                      : { x: tokenSeleccionado.x, y: tokenSeleccionado.y };
                    void onActualizarToken(tokenSeleccionado.id, {
                      celdasAncho: n,
                      celdasAlto: n,
                      x: Number(pos.x.toFixed(3)),
                      y: Number(pos.y.toFixed(3))
                    });
                  }}
                >
                  {n}×{n}
                </button>
              );
            })}
          </div>

          <label
            className="mapa-token-escala"
            title="Escala proporcional del token"
          >
            <span>{tokenSeleccionado.escala.toFixed(1)}×</span>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={tokenSeleccionado.escala}
              onChange={e =>
                void onActualizarToken(tokenSeleccionado.id, {
                  escala: Number(e.target.value)
                })
              }
            />
          </label>

          <button
            type="button"
            className="mapa-btn-sec"
            onClick={() => {
              const id = tokenSeleccionado.id;
              setTokenSeleccionadoId(null);
              void onActualizarToken(id, { enLimbo: true });
            }}
            title="Apartar token al Limbo"
          >
            <span>Limbo</span>
          </button>

          <button
            type="button"
            className="mapa-btn-peligro mapa-btn-icono"
            onClick={() => {
              const id = tokenSeleccionado.id;
              setTokenSeleccionadoId(null);
              void onEliminarToken(id);
            }}
            title="Eliminar token del mapa"
            aria-label="Eliminar token del mapa"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Viewport interactivo (Zoom + Pan) */}
      <div
        ref={viewportRef}
        className={`mapa-viewport${modoPing ? " modo-ping" : ""}${dibujandoActivo ? " modo-dibujo" : ""
          }${modoReglaLinea ? " modo-regla" : ""}${mapaBloqueado ? " bloqueado" : ""}${espacioPulsado && !mapaBloqueado ? " modo-pan" : ""}${paneando ? " paneando" : ""}`}
        onWheel={alGirarRueda}
        onPointerDown={alBajarPunteroViewport}
        onPointerMove={alMoverPunteroViewport}
        onPointerUp={alSoltarPunteroViewport}
        onPointerCancel={alSoltarPunteroViewport}
        onDragOver={e => {
          if (e.dataTransfer.types.includes("text/x-limbo-token-id")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={e => {
          const tokenId = e.dataTransfer.getData("text/x-limbo-token-id");
          if (!tokenId) return;
          e.preventDefault();
          const token = tokensEnLimbo.find(t => t.id === tokenId);
          if (!token || !puedeEditarToken(token, esMaster, miUsuarioId)) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const xCrudo = limitar(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
          const yCrudo = limitar(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
          const pos = rejillaActiva.imanActivo
            ? ajustarARejilla(
              xCrudo,
              yCrudo,
              token.celdasAncho,
              token.celdasAlto,
              rejillaActiva
            )
            : { x: xCrudo, y: yCrudo };
          void onActualizarToken(token.id, {
            enLimbo: false,
            x: pos.x,
            y: pos.y
          });
        }}
      >
        <div
          className="mapa-transform"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
          }}
        >
          <div
            ref={canvasRef}
            className={`mapa-canvas${fondoActivo ? "" : " sin-fondo"}`}
            style={{
              width: `${tamanoCanvas.w}px`,
              height: `${tamanoCanvas.h}px`
            }}
            onPointerDown={alBajarPunteroCanvas}
            onPointerMove={alMoverPunteroCanvas}
            onPointerUp={alSoltarPunteroCanvas}
            onPointerCancel={alSoltarPunteroCanvas}
          >
            {/* Capa 1: Fondo estático o lienzo por defecto */}
            {fondoActivo ? (
              <img
                src={fondoActivo.url}
                alt={fondoActivo.titulo ?? "Mapa táctico"}
                className="mapa-fondo-img"
                draggable={false}
                onLoad={e => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setDimsNaturales(prev =>
                      prev &&
                        prev.w === img.naturalWidth &&
                        prev.h === img.naturalHeight
                        ? prev
                        : { w: img.naturalWidth, h: img.naturalHeight }
                    );
                  }
                }}
              />
            ) : (
              <div className="mapa-sin-fondo-aviso">
                <MapIcon size={24} aria-hidden="true" />
                <span>
                  {esMaster
                    ? "Pulsa «Fondo y rejilla» para cargar un mapa táctico"
                    : "El Máster puede cargar un fondo..."}
                </span>
              </div>
            )}

            {/* Capa 2: Rejilla SVG recortada exactamente al lienzo */}
            {rejillaActiva.visible && lineasRejilla && (
              <svg
                className="mapa-rejilla-svg"
                width="100%"
                height="100%"
                viewBox={`0 0 ${tamanoCanvas.w} ${tamanoCanvas.h}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{ opacity: rejillaActiva.opacidad }}
              >
                {lineasRejilla.verticales.map((x, idx) => (
                  <line
                    key={`v-${idx}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={tamanoCanvas.h}
                    stroke={rejillaActiva.color}
                    strokeWidth={1 / Math.max(0.6, Math.min(2, zoom))}
                  />
                ))}
                {lineasRejilla.horizontales.map((y, idx) => (
                  <line
                    key={`h-${idx}`}
                    x1={0}
                    y1={y}
                    x2={tamanoCanvas.w}
                    y2={y}
                    stroke={rejillaActiva.color}
                    strokeWidth={1 / Math.max(0.6, Math.min(2, zoom))}
                  />
                ))}
              </svg>
            )}

            {/* Capa 2.5: Dibujo sobre el mapa */}
            <svg
              className="mapa-dibujo-svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {trazosVisibles.map(trazo =>
                trazo.puntos.length === 1 ? (
                  <circle
                    key={trazo.id}
                    cx={trazo.puntos[0].x}
                    cy={trazo.puntos[0].y}
                    r={Math.max(0.25, trazo.grosor * 0.08)}
                    fill={trazo.color}
                  />
                ) : (
                  <polyline
                    key={trazo.id}
                    points={trazo.puntos.map(p => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={trazo.color}
                    strokeWidth={trazo.grosor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              )}
            </svg>

            {/* Capa 2.75: Áreas semitranslúcidas (círculos y conos) */}
            {areas.map(area => {
              const editable = puedeEditarArea(area, esMaster, miUsuarioId);
              const seleccionada = area.id === areaSeleccionadaId;
              const enArrastre = arrastreArea?.areaId === area.id ? arrastreArea : null;
              const enRotacion = rotandoArea?.areaId === area.id ? rotandoArea : null;
              const posX = enArrastre ? enArrastre.xActual : area.x;
              const posY = enArrastre ? enArrastre.yActual : area.y;
              const anguloActual = enRotacion ? enRotacion.anguloActual : area.angulo;

              const cols = Math.max(4, rejillaActiva.columnas);
              const filas = Math.max(4, rejillaActiva.filas);
              const anchoPct = (area.celdas / cols) * 100;
              const altoPct = (area.celdas / filas) * 100;

              if (area.tipo === "circulo") {
                return (
                  <div
                    key={area.id}
                    className={`mapa-area mapa-area-circulo${seleccionada ? " seleccionada" : ""}${editable ? " editable" : ""}`}
                    style={{
                      left: `${posX}%`,
                      top: `${posY}%`,
                      width: `${anchoPct}%`,
                      height: `${altoPct}%`,
                      "--area-color": area.color
                    } as CSSProperties}
                    onPointerDown={e => alBajarPunteroArea(e, area)}
                    onClick={e => e.stopPropagation()}
                    title={`Círculo ${area.celdas}×${area.celdas} (${area.autorNombre})`}
                  >
                    <span className="mapa-area-etiqueta">
                      {area.celdas}×{area.celdas}
                    </span>

                    {editable && onEliminarArea && (
                      <button
                        type="button"
                        className="mapa-area-cerrar"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          if (areaSeleccionadaId === area.id) setAreaSeleccionadaId(null);
                          void onEliminarArea(area.id);
                        }}
                        title="Quitar área"
                        aria-label="Quitar área"
                      >
                        <X size={11} strokeWidth={2.5} aria-hidden="true" />
                      </button>
                    )}

                    {seleccionada && editable && onActualizarArea && (
                      <div
                        className="mapa-area-controles"
                        onPointerDown={e => e.stopPropagation()}
                      >
                        {PRESETS_AREA.map(tam => (
                          <button
                            key={tam}
                            type="button"
                            className={`mapa-area-tam-btn${area.celdas === tam ? " activo" : ""}`}
                            onClick={() => void onActualizarArea(area.id, { celdas: tam })}
                          >
                            {tam}×{tam}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="mapa-area-tam-btn"
                          disabled={area.celdas <= 1}
                          onClick={() =>
                            void onActualizarArea(area.id, {
                              celdas: Math.max(1, area.celdas - 1)
                            })
                          }
                          title="Reducir 1 casilla"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          className="mapa-area-tam-btn"
                          disabled={area.celdas >= 24}
                          onClick={() =>
                            void onActualizarArea(area.id, {
                              celdas: Math.min(24, area.celdas + 1)
                            })
                          }
                          title="Aumentar 1 casilla"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // Cono: vértice en (posX%, posY%), longitud = area.celdas casillas, apertura D&D (~53.1°, medio ancho = 0.5 * L)
              const conoAnchoPx = (anchoPct / 100) * tamanoCanvas.w;
              const conoAltoPx = (altoPct / 100) * tamanoCanvas.h;
              const longitudPx = Math.max(24, (conoAnchoPx + conoAltoPx) / 2);
              const medioFondoPx = longitudPx * 0.5;
              return (
                <div
                  key={area.id}
                  className={`mapa-area mapa-area-cono${seleccionada ? " seleccionada" : ""}${editable ? " editable" : ""}`}
                  style={{
                    left: `${posX}%`,
                    top: `${posY}%`,
                    width: `${longitudPx}px`,
                    height: `${longitudPx}px`,
                    "--area-color": area.color
                  } as CSSProperties}
                  onPointerDown={e => alBajarPunteroArea(e, area)}
                  onClick={e => e.stopPropagation()}
                  title={`Cono ${area.celdas}×${area.celdas} (${area.autorNombre})`}
                >
                  <div
                    className="mapa-area-cono-rot"
                    style={{ transform: `rotate(${anguloActual}deg)` }}
                  >
                    <svg
                      className="mapa-area-cono-svg"
                      viewBox={`0 ${-medioFondoPx - 4} ${longitudPx + 8} ${longitudPx + 8}`}
                      style={{
                        width: `${longitudPx + 8}px`,
                        height: `${longitudPx + 8}px`,
                        left: `-4px`,
                        top: `${-medioFondoPx - 4}px`
                      }}
                    >
                      <polygon
                        points={`0,0 ${longitudPx},${-medioFondoPx} ${longitudPx},${medioFondoPx}`}
                        fill={area.color}
                        fillOpacity={0.28}
                        stroke={area.color}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                      />
                    </svg>

                    {editable && onActualizarArea && (
                      <button
                        type="button"
                        className="mapa-area-rotar-handle"
                        style={{ left: `${longitudPx}px`, top: "0px" }}
                        onPointerDown={e => alBajarRotacionArea(e, area)}
                        title="Arrastra para orientar el cono"
                        aria-label="Orientar cono"
                      >
                        <RotateCw size={11} aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <span className="mapa-area-etiqueta cono">
                    {area.celdas}×{area.celdas}
                  </span>

                  {editable && onEliminarArea && (
                    <button
                      type="button"
                      className="mapa-area-cerrar cono"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        if (areaSeleccionadaId === area.id) setAreaSeleccionadaId(null);
                        void onEliminarArea(area.id);
                      }}
                      title="Quitar cono"
                      aria-label="Quitar cono"
                    >
                      <X size={11} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  )}

                  {seleccionada && editable && onActualizarArea && (
                    <div
                      className="mapa-area-controles"
                      onPointerDown={e => e.stopPropagation()}
                    >
                      {PRESETS_AREA.map(tam => (
                        <button
                          key={tam}
                          type="button"
                          className={`mapa-area-tam-btn${area.celdas === tam ? " activo" : ""}`}
                          onClick={() => void onActualizarArea(area.id, { celdas: tam })}
                        >
                          {tam}×{tam}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="mapa-area-tam-btn"
                        disabled={area.celdas <= 1}
                        onClick={() =>
                          void onActualizarArea(area.id, {
                            celdas: Math.max(1, area.celdas - 1)
                          })
                        }
                        title="Reducir 1 casilla"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="mapa-area-tam-btn"
                        disabled={area.celdas >= 24}
                        onClick={() =>
                          void onActualizarArea(area.id, {
                            celdas: Math.min(24, area.celdas + 1)
                          })
                        }
                        title="Aumentar 1 casilla"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="mapa-area-tam-btn"
                        onClick={() =>
                          void onActualizarArea(area.id, { angulo: area.angulo - 45 })
                        }
                        title="Girar -45°"
                      >
                        ↺
                      </button>
                      <button
                        type="button"
                        className="mapa-area-tam-btn"
                        onClick={() =>
                          void onActualizarArea(area.id, { angulo: area.angulo + 45 })
                        }
                        title="Girar +45°"
                      >
                        ↻
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Capa 2.8: Línea temporal de regla entre 2 puntos (desaparece al soltar) */}
            {reglaLinea && (() => {
              const celdas = calcularCeldasLinea(
                reglaLinea.x1,
                reglaLinea.y1,
                reglaLinea.x2,
                reglaLinea.y2,
                rejillaActiva
              );
              const total = celdas.length;
              const midX = (reglaLinea.x1 + reglaLinea.x2) / 2;
              const midY = (reglaLinea.y1 + reglaLinea.y2) / 2;
              return (
                <>
                  <svg
                    className="mapa-regla-svg"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {celdas.map(celda => (
                      <rect
                        key={celda.key}
                        x={celda.x}
                        y={celda.y}
                        width={celda.w}
                        height={celda.h}
                        className="mapa-regla-celda"
                      />
                    ))}
                    <line
                      x1={reglaLinea.x1}
                      y1={reglaLinea.y1}
                      x2={reglaLinea.x2}
                      y2={reglaLinea.y2}
                      className="mapa-regla-linea"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={reglaLinea.x1}
                      cy={reglaLinea.y1}
                      r={0.55}
                      className="mapa-regla-punto"
                    />
                    <circle
                      cx={reglaLinea.x2}
                      cy={reglaLinea.y2}
                      r={0.55}
                      className="mapa-regla-punto"
                    />
                  </svg>
                  <div
                    className="mapa-regla-etiqueta"
                    style={{ left: `${midX}%`, top: `${midY}%` }}
                  >
                    {total} {total === 1 ? "casilla" : "casillas"}
                  </div>
                </>
              );
            })()}

            {/* Capa 3: Tokens */}
            {tokensEnMapa.map(token => {
              const editable = puedeEditarToken(token, esMaster, miUsuarioId);
              const seleccionado = token.id === tokenSeleccionadoId;
              const enArrastre =
                arrastreToken?.tokenId === token.id ? arrastreToken : null;
              const escalaActual = token.escala;
              const posX = enArrastre ? enArrastre.xActual : token.x;
              const posY = enArrastre ? enArrastre.yActual : token.y;
              const anchoPct =
                (token.celdasAncho / Math.max(4, rejillaActiva.columnas)) *
                100 *
                escalaActual;
              const altoPct =
                (token.celdasAlto / Math.max(4, rejillaActiva.filas)) *
                100 *
                escalaActual;
              const esDeMaster = Boolean(
                token.esMonstruo ||
                masterIds.has(token.autorId) ||
                (esMaster && miUsuarioId && token.autorId === miUsuarioId) ||
                (esMaster && (!token.autorId || token.autorId === "local"))
              );
              const anchoTokenPx = (anchoPct / 100) * tamanoCanvas.w;
              const etiquetaFontPx = Math.max(
                8,
                Math.min(30, anchoTokenPx * 0.22)
              );

              return (
                <div
                  key={token.id}
                  className={`mapa-token${editable ? " editable" : ""}${seleccionado ? " seleccionado" : ""
                    }${enArrastre ? " arrastrando" : ""}${token.esMonstruo ? " monstruo" : ""
                    }${esDeMaster ? " de-master" : ""}`}
                  style={
                    {
                      left: `${posX}%`,
                      top: `${posY}%`,
                      width: `${anchoPct}%`,
                      height: `${altoPct}%`,
                      "--token-color": token.esMonstruo
                        ? "#e06c75"
                        : token.autorColor || "#e8c56a"
                    } as CSSProperties
                  }
                  title={
                    editable
                      ? `${token.nombre} (${token.celdasAncho}×${token.celdasAlto})`
                      : `${token.nombre} — de ${token.autorNombre || "otro jugador"}`
                  }
                  onPointerDown={e => alBajarPunteroToken(e, token)}
                >
                  <img
                    src={token.imagenUrl}
                    alt={token.nombre}
                    className="mapa-token-img"
                    draggable={false}
                  />
                  <span
                    className="mapa-token-etiqueta"
                    style={
                      esDeMaster
                        ? { fontSize: `${etiquetaFontPx.toFixed(1)}px` }
                        : undefined
                    }
                  >
                    {token.nombre}
                  </span>
                </div>
              );
            })}

            {/* Capa 4: Pings */}
            {pingsVisibles.map(ping => (
              <div
                key={ping.id}
                className="ping-onda"
                style={
                  {
                    left: `${ping.x}%`,
                    top: `${ping.y}%`,
                    "--ping-color": ping.color
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                <span className="ping-onda-anillo" />
                <span className="ping-onda-centro" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contenedor horizontal: Limbo de tokens al lado de Archivador */}
      <aside
        ref={limboRef}
        className={`mapa-limbo${sobreLimbo ? " destino-limbo" : ""}${esMaster ? " con-master" : ""
          }`}
        aria-label="Limbo de tokens"
        onPointerDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <span className="mapa-limbo-titulo">Limbo</span>
        {tokensEnLimbo.length === 0 ? (
          <span className="mapa-limbo-vacio">—</span>
        ) : (
          <div className="mapa-limbo-lista">
            {tokensEnLimbo.map(token => {
              const editable = puedeEditarToken(token, esMaster, miUsuarioId);
              return (
                <div
                  key={token.id}
                  className={`mapa-limbo-item${editable ? " editable" : ""}`}
                  title={
                    editable
                      ? `${token.nombre} — Arrastra al mapa o pulsa para devolverlo`
                      : `${token.nombre} (${token.autorNombre})`
                  }
                >
                  <button
                    type="button"
                    className="mapa-limbo-token-btn"
                    disabled={!editable}
                    onPointerDown={e => iniciarArrastreDesdeLimbo(e, token)}
                  >
                    <img src={token.imagenUrl} alt={token.nombre} draggable={false} />
                    <span className="mapa-limbo-nombre">{token.nombre}</span>
                  </button>
                  {editable && (
                    <button
                      type="button"
                      className="mapa-limbo-borrar"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => void onEliminarToken(token.id)}
                      aria-label={`Eliminar ${token.nombre} del Limbo`}
                      title="Eliminar definitivamente"
                    >
                      <X size={10} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* Dock inferior izquierdo: Crear token y Almacén encima de Dados rápidos */}
      <div className="mapa-tokens-dock" role="toolbar" aria-label="Crear token y almacén">
        <button
          type="button"
          className={`pizarra-tool-btn mapa-btn-crear-token${panelAbierto === "tokens" ? " activo" : ""}`}
          onClick={() => {
            setErrorPanel(null);
            setTokenSeleccionadoId(null);
            setPanelAbierto(prev => (prev === "tokens" ? null : "tokens"));
          }}
          title="Crear nuevos tokens en el mapa"
        >
          <Users size={16} aria-hidden="true" />
          <span>Crear token</span>
        </button>

        <button
          type="button"
          className={`pizarra-tool-btn mapa-btn-almacen${panelAbierto === "bandeja" ? " activo" : ""}`}
          onClick={() => {
            setErrorPanel(null);
            setTokenSeleccionadoId(null);
            setPlantillaEditandoCatId(null);
            setPanelAbierto(prev => (prev === "bandeja" ? null : "bandeja"));
          }}
          title="Abrir almacén de tokens guardados"
        >
          <IconoCofre size={16} />
          <span>Almacén</span>
          {plantillasVisibles.length > 0 && (
            <span className="mapa-bandeja-badge">
              {plantillasVisibles.length}
            </span>
          )}
        </button>
      </div>

      {/* Ayuda discreta de controles */}
      <div className="mapa-ayuda-controles" aria-hidden="true">
        <span>Rueda: zoom</span>
        <span>·</span>
        <span>Arrastrar fondo: mover</span>
        <span>·</span>
        <span>Alt+arrastrar token: libre</span>
      </div>

      {limboFantasma && (
        <div
          className="mapa-limbo-fantasma"
          style={{
            position: "fixed",
            left: limboFantasma.x,
            top: limboFantasma.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 95
          }}
        >
          <img
            src={limboFantasma.token.imagenUrl}
            alt={limboFantasma.token.nombre}
            style={{
              width: 44,
              height: 44,
              objectFit: "contain",
              filter: "drop-shadow(0 6px 14px rgb(0 0 0 / 70%))"
            }}
          />
        </div>
      )}
    </div>
  );
}
