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
  Crown,
  Grid3x3,
  ImagePlus,
  Lock,
  Map as MapIcon,
  Minus,
  Plus,
  Radio,
  RotateCcw,
  Sliders,
  Trash2,
  Unlock,
  Upload,
  Users,
  X
} from "lucide-react";
import { nuevoId } from "./calibracion";
import { reproducirSonidoPing } from "./sonido";
import type {
  EstadoMapaCompartido,
  MapaFondoConfig,
  MapaRejillaConfig,
  PingVisual,
  PlantillaTokenMapa,
  TokenMapa
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
    guardarPlantilla?: boolean
  ) => void | Promise<void>;
  onActualizarToken: (
    tokenId: string,
    patch: Partial<
      Pick<
        TokenMapa,
        "x" | "y" | "celdasAncho" | "celdasAlto" | "escala" | "nombre"
      >
    >
  ) => void | Promise<void>;
  onEliminarToken: (tokenId: string) => void | Promise<void>;
  onEliminarPlantilla?: (plantillaId: string) => void | Promise<void>;
  archivosDisponibles?: ArchivoItem[];
  onSubirImagenMapa?: (
    archivo: File,
    categoria: "escena" | "token"
  ) => Promise<{ archivoId?: string; url: string; titulo: string }>;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ASPECTO_POR_DEFECTO = 16 / 9;
const PRESETS_TAMANO = [1, 2, 3, 4] as const;

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
  archivosDisponibles = [],
  onSubirImagenMapa
}: MapaProps) {
  const { fondo, rejilla, tokens, plantillas } = estadoMapa;

  const [modoPing, setModoPing] = useState(false);
  const [pingsLocales, setPingsLocales] = useState<PingVisual[]>([]);
  const [panelAbierto, setPanelAbierto] = useState<"fondo" | "tokens" | null>(
    null
  );
  const [tokenSeleccionadoId, setTokenSeleccionadoId] = useState<string | null>(
    null
  );

  // Viewport, zoom y pan
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [tamanoViewport, setTamanoViewport] = useState({ w: 1280, h: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panInicializado, setPanInicializado] = useState(false);
  const [espacioPulsado, setEspacioPulsado] = useState(false);
  const [paneando, setPaneando] = useState(false);
  const arrastrePanRef = useRef<ArrastrePan | null>(null);

  // Dimensiones naturales de la imagen de fondo
  const [dimsNaturales, setDimsNaturales] = useState<{
    w: number;
    h: number;
  } | null>(
    fondo?.anchoNatural && fondo?.altoNatural
      ? { w: fondo.anchoNatural, h: fondo.altoNatural }
      : null
  );

  // Arrastre de token
  const [arrastreToken, setArrastreToken] = useState<ArrastreToken | null>(null);
  const arrastreTokenRef = useRef<ArrastreToken | null>(null);

  // Formulario de nuevo token
  const [nombreToken, setNombreToken] = useState("");
  const [celdasToken, setCeldasToken] = useState<number>(1);
  const [esMonstruo, setEsMonstruo] = useState(false);
  const [guardarPlantilla, setGuardarPlantilla] = useState(true);
  const [previewUrlToken, setPreviewUrlToken] = useState<string | null>(null);
  const [archivoIdToken, setArchivoIdToken] = useState<string | undefined>(
    undefined
  );
  const [subiendoToken, setSubiendoToken] = useState(false);
  const [subiendoFondo, setSubiendoFondo] = useState(false);
  const [errorPanel, setErrorPanel] = useState<string | null>(null);

  const inputFondoRef = useRef<HTMLInputElement>(null);
  const inputTokenRef = useRef<HTMLInputElement>(null);

  // Sincronizar dimensiones naturales cuando cambia el fondo desde fuera
  useEffect(() => {
    if (fondo?.anchoNatural && fondo?.altoNatural) {
      setDimsNaturales({ w: fondo.anchoNatural, h: fondo.altoNatural });
    } else if (!fondo) {
      setDimsNaturales(null);
    }
  }, [fondo?.url, fondo?.anchoNatural, fondo?.altoNatural]);

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
    if (fondo && dimsNaturales && dimsNaturales.w > 0 && dimsNaturales.h > 0) {
      return dimsNaturales.w / dimsNaturales.h;
    }
    return ASPECTO_POR_DEFECTO;
  }, [fondo, dimsNaturales]);

  // Tamaño base del lienzo en píxeles (a zoom = 1) preservando el aspecto exacto
  const tamanoCanvas = useMemo(() => {
    const maxW = Math.max(520, tamanoViewport.w * 0.84);
    const maxH = Math.max(340, tamanoViewport.h * 0.8);
    let w = maxW;
    let h = w / aspectoCanvas;
    if (h > maxH) {
      h = maxH;
      w = h * aspectoCanvas;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [tamanoViewport, aspectoCanvas]);

  const centrarVista = useCallback(
    (nuevoZoom = 1) => {
      setZoom(nuevoZoom);
      setPan({
        x: Math.round((tamanoViewport.w - tamanoCanvas.w * nuevoZoom) / 2),
        y: Math.round((tamanoViewport.h - tamanoCanvas.h * nuevoZoom) / 2)
      });
    },
    [tamanoViewport, tamanoCanvas]
  );

  // Centrar automáticamente la primera vez que tenemos medidas reales
  useEffect(() => {
    if (!panInicializado && tamanoViewport.w > 0 && tamanoCanvas.w > 0) {
      centrarVista(1);
      setPanInicializado(true);
    }
  }, [panInicializado, tamanoViewport, tamanoCanvas, centrarVista]);

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
        if (panelAbierto) {
          setPanelAbierto(null);
        } else if (tokenSeleccionadoId) {
          setTokenSeleccionadoId(null);
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
  }, [panelAbierto, tokenSeleccionadoId, modoPing]);

  // Deseleccionar si el token desaparece o pierde permisos
  useEffect(() => {
    if (!tokenSeleccionadoId) return;
    const encontrado = tokens.find(t => t.id === tokenSeleccionadoId);
    if (!encontrado || !puedeEditarToken(encontrado, esMaster, miUsuarioId)) {
      setTokenSeleccionadoId(null);
    }
  }, [tokens, tokenSeleccionadoId, esMaster, miUsuarioId]);

  const zoomAlrededorDe = useCallback(
    (factor: number, cx: number, cy: number) => {
      setZoom(prevZoom => {
        const nextZoom = limitar(
          Number((prevZoom * factor).toFixed(4)),
          ZOOM_MIN,
          ZOOM_MAX
        );
        if (nextZoom === prevZoom) return prevZoom;
        setPan(prevPan => {
          const wx = (cx - prevPan.x) / prevZoom;
          const wy = (cy - prevPan.y) / prevZoom;
          return {
            x: cx - wx * nextZoom,
            y: cy - wy * nextZoom
          };
        });
        return nextZoom;
      });
    },
    []
  );

  function alGirarRueda(evento: ReactWheelEvent<HTMLDivElement>): void {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = evento.clientX - rect.left;
    const cy = evento.clientY - rect.top;
    const factor = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAlrededorDe(factor, cx, cy);
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

  function alBajarPunteroViewport(
    evento: ReactPointerEvent<HTMLDivElement>
  ): void {
    // Botón central o Espacio+click siempre panea
    const esPanForzado = evento.button === 1 || espacioPulsado;

    if (modoPing && evento.button === 0 && !espacioPulsado) {
      emitirPingEn(evento.clientX, evento.clientY);
      return;
    }

    if (evento.button !== 0 && !esPanForzado) return;
    if (esPanForzado) {
      evento.preventDefault();
    }

    setTokenSeleccionadoId(null);
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

      const debeAjustar = rejilla.imanActivo && !evento.altKey;
      const posFinal = debeAjustar
        ? ajustarARejilla(
            rawX,
            rawY,
            tokActivo.celdasAncho,
            tokActivo.celdasAlto,
            rejilla
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
    }
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
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
      if (tokActivo.movido) {
        void onActualizarToken(tokActivo.tokenId, {
          x: Number(tokActivo.xActual.toFixed(3)),
          y: Number(tokActivo.yActual.toFixed(3))
        });
      }
    }
  }

  function alBajarPunteroToken(
    evento: ReactPointerEvent<HTMLDivElement>,
    token: TokenMapa
  ): void {
    if (modoPing || espacioPulsado || evento.button === 1) return;
    evento.stopPropagation();

    if (!puedeEditarToken(token, esMaster, miUsuarioId)) {
      return;
    }

    setTokenSeleccionadoId(token.id);
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
    const siguiente: MapaRejillaConfig = { ...rejilla, ...parche };
    siguiente.columnas = Math.round(limitar(siguiente.columnas, 4, 80));
    if (siguiente.filasAuto) {
      siguiente.filas = calcularFilasAuto(siguiente.columnas, aspectoCanvas);
    } else {
      siguiente.filas = Math.round(limitar(siguiente.filas, 4, 80));
    }
    siguiente.offsetX = limitar(siguiente.offsetX, -50, 50);
    siguiente.offsetY = limitar(siguiente.offsetY, -50, 50);
    siguiente.opacidad = limitar(siguiente.opacidad, 0.05, 1);
    void onCambiarFondoYRejilla(fondo, siguiente);
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
      const nuevaRejilla = rejilla.filasAuto
        ? {
            ...rejilla,
            filas: calcularFilasAuto(rejilla.columnas, aspectoNuevo)
          }
        : rejilla;

      await onCambiarFondoYRejilla(nuevoFondo, nuevaRejilla);
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
    const nuevaRejilla = rejilla.filasAuto
      ? { ...rejilla, filas: calcularFilasAuto(rejilla.columnas, aspectoNuevo) }
      : rejilla;
    await onCambiarFondoYRejilla(nuevoFondo, nuevaRejilla);
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
        if (!nombreToken.trim()) {
          setNombreToken(res.titulo.replace(/\.[^.]+$/, ""));
        }
      } else {
        const url = await leerArchivoComoDataUrl(archivo);
        setPreviewUrlToken(url);
        setArchivoIdToken(undefined);
        if (!nombreToken.trim()) {
          setNombreToken(archivo.name.replace(/\.[^.]+$/, ""));
        }
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
    if (!previewUrlToken) {
      setErrorPanel("Selecciona una imagen para el token.");
      return;
    }
    setErrorPanel(null);
    const centro = rejilla.imanActivo
      ? ajustarARejilla(50, 50, celdasToken, celdasToken, rejilla)
      : { x: 50, y: 50 };

    await onCrearToken(
      {
        nombre: nombreToken.trim() || "Token",
        archivoId: archivoIdToken,
        imagenUrl: previewUrlToken,
        x: centro.x,
        y: centro.y,
        celdasAncho: celdasToken,
        celdasAlto: celdasToken,
        escala: 1,
        esMonstruo: esMaster ? esMonstruo : false
      },
      guardarPlantilla
    );

    setNombreToken("");
    setPreviewUrlToken(null);
    setArchivoIdToken(undefined);
  }

  async function alInvocarPlantilla(
    plantilla: PlantillaTokenMapa
  ): Promise<void> {
    const centro = rejilla.imanActivo
      ? ajustarARejilla(
          50,
          50,
          plantilla.celdasAncho,
          plantilla.celdasAlto,
          rejilla
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

  // Líneas de la rejilla SVG en píxeles del lienzo
  const lineasRejilla = useMemo(() => {
    if (!rejilla.visible) return null;
    const cols = Math.max(4, rejilla.columnas);
    const filas = Math.max(4, rejilla.filas);
    const cellW = tamanoCanvas.w / cols;
    const cellH = tamanoCanvas.h / filas;
    const offX = (rejilla.offsetX / 100) * cellW;
    const offY = (rejilla.offsetY / 100) * cellH;

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
  }, [rejilla, tamanoCanvas]);

  return (
    <div className="mapa-page">
      {/* Barra flotante superior izquierda (deja libre arriba-derecha y abajo) */}
      <div className="mapa-barra-flotante">
        <button type="button" className="pizarra-btn" onClick={onVolver}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver</span>
        </button>

        <span className="mapa-barra-sep" aria-hidden="true" />

        <button
          type="button"
          className={`pizarra-tool-btn${modoPing ? " activo" : ""}`}
          onClick={() => setModoPing(prev => !prev)}
          title="Señalar un punto temporalmente con un ping"
        >
          <Radio size={14} strokeWidth={2.1} aria-hidden="true" />
          <span>Ping</span>
        </button>

        <button
          type="button"
          className={`pizarra-tool-btn${panelAbierto === "tokens" ? " activo" : ""}`}
          onClick={() => {
            setErrorPanel(null);
            setPanelAbierto(prev => (prev === "tokens" ? null : "tokens"));
          }}
          title="Gestionar e invocar tokens en el mapa"
        >
          <Users size={14} aria-hidden="true" />
          <span>Tokens</span>
        </button>

        {esMaster && (
          <button
            type="button"
            className={`pizarra-tool-btn${panelAbierto === "fondo" ? " activo" : ""}`}
            onClick={() => {
              setErrorPanel(null);
              setPanelAbierto(prev => (prev === "fondo" ? null : "fondo"));
            }}
            title="Configurar imagen de fondo y rejilla táctica"
          >
            <Grid3x3 size={14} aria-hidden="true" />
            <span>Fondo y rejilla</span>
          </button>
        )}

        <span className="mapa-barra-sep" aria-hidden="true" />

        <div className="mapa-zoom-grupo" role="group" aria-label="Zoom del mapa">
          <button
            type="button"
            className="mapa-zoom-btn"
            onClick={() =>
              zoomAlrededorDe(
                1 / 1.2,
                tamanoViewport.w / 2,
                tamanoViewport.h / 2
              )
            }
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
            onClick={() =>
              zoomAlrededorDe(1.2, tamanoViewport.w / 2, tamanoViewport.h / 2)
            }
            title="Acercar"
            aria-label="Acercar"
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

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
              onClick={() => setPanelAbierto(null)}
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
                {fondo && (
                  <button
                    type="button"
                    className="mapa-btn-peligro"
                    onClick={() => void onCambiarFondoYRejilla(null, rejilla)}
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
                        className={`mapa-archivo-chip${
                          fondo?.archivoId === arch.id ? " activo" : ""
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
                    checked={rejilla.visible}
                    onChange={e =>
                      actualizarRejilla({ visible: e.target.checked })
                    }
                  />
                  <span>Mostrar rejilla</span>
                </label>

                <label className="mapa-check">
                  <input
                    type="checkbox"
                    checked={rejilla.imanActivo}
                    onChange={e =>
                      actualizarRejilla({ imanActivo: e.target.checked })
                    }
                  />
                  <span>Imán a celdas</span>
                </label>
              </div>

              <div className="mapa-grid-campos">
                <label className="mapa-campo">
                  <span>Columnas ({rejilla.columnas})</span>
                  <input
                    type="range"
                    min={4}
                    max={80}
                    value={rejilla.columnas}
                    onChange={e =>
                      actualizarRejilla({ columnas: Number(e.target.value) })
                    }
                  />
                </label>

                <div className="mapa-campo">
                  <div className="mapa-campo-fila-lbl">
                    <span>Filas ({rejilla.filas})</span>
                    <button
                      type="button"
                      className={`mapa-lock-btn${rejilla.filasAuto ? " activo" : ""}`}
                      onClick={() =>
                        actualizarRejilla({ filasAuto: !rejilla.filasAuto })
                      }
                      title={
                        rejilla.filasAuto
                          ? "Filas automáticas (celdas cuadradas). Pulsa para editar manualmente."
                          : "Filas manuales. Pulsa para volver a celdas cuadradas."
                      }
                    >
                      {rejilla.filasAuto ? (
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
                    disabled={rejilla.filasAuto}
                    value={rejilla.filas}
                    onChange={e =>
                      actualizarRejilla({ filas: Number(e.target.value) })
                    }
                  />
                </div>

                <label className="mapa-campo">
                  <span>Desfase X ({Math.round(rejilla.offsetX)}%)</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={rejilla.offsetX}
                    onChange={e =>
                      actualizarRejilla({ offsetX: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="mapa-campo">
                  <span>Desfase Y ({Math.round(rejilla.offsetY)}%)</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={rejilla.offsetY}
                    onChange={e =>
                      actualizarRejilla({ offsetY: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="mapa-campo">
                  <span>Opacidad ({Math.round(rejilla.opacidad * 100)}%)</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={rejilla.opacidad}
                    onChange={e =>
                      actualizarRejilla({ opacidad: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="mapa-campo mapa-campo-color">
                  <span>Color</span>
                  <input
                    type="color"
                    value={rejilla.color}
                    onChange={e =>
                      actualizarRejilla({ color: e.target.value })
                    }
                  />
                </label>
              </div>
            </section>
          </div>
        </aside>
      )}

      {/* Panel flotante: Tokens */}
      {panelAbierto === "tokens" && (
        <aside className="mapa-panel" aria-label="Bandeja y creación de tokens">
          <header className="mapa-panel-cabecera">
            <span className="mapa-panel-titulo">
              <Users size={14} aria-hidden="true" />
              Tokens
            </span>
            <button
              type="button"
              className="mapa-panel-cerrar"
              onClick={() => setPanelAbierto(null)}
              aria-label="Cerrar panel"
            >
              <X size={14} />
            </button>
          </header>

          <div className="mapa-panel-cuerpo">
            {errorPanel && <p className="mapa-panel-error">{errorPanel}</p>}

            <section className="mapa-panel-bloque">
              <div className="mapa-panel-subtitulo">Crear nuevo token</div>
              <div className="mapa-token-form">
                <div className="mapa-token-preview-fila">
                  <button
                    type="button"
                    className="mapa-token-subir"
                    onClick={() => inputTokenRef.current?.click()}
                    disabled={subiendoToken}
                    title="Elegir imagen del token"
                  >
                    {previewUrlToken ? (
                      <img src={previewUrlToken} alt="Vista previa" />
                    ) : (
                      <ImagePlus size={18} aria-hidden="true" />
                    )}
                  </button>
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
                    <div className="mapa-tamano-presets">
                      {PRESETS_TAMANO.map(n => (
                        <button
                          key={n}
                          type="button"
                          className={`mapa-preset-btn${
                            celdasToken === n ? " activo" : ""
                          }`}
                          onClick={() => setCeldasToken(n)}
                        >
                          {n}×{n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mapa-panel-fila-check">
                  {esMaster && (
                    <label className="mapa-check">
                      <input
                        type="checkbox"
                        checked={esMonstruo}
                        onChange={e => setEsMonstruo(e.target.checked)}
                      />
                      <span>Monstruo / PNJ</span>
                    </label>
                  )}
                  <label className="mapa-check">
                    <input
                      type="checkbox"
                      checked={guardarPlantilla}
                      onChange={e => setGuardarPlantilla(e.target.checked)}
                    />
                    <span>Guardar en bandeja</span>
                  </label>
                </div>

                <button
                  type="button"
                  className="mapa-btn-primario"
                  disabled={!previewUrlToken || subiendoToken}
                  onClick={() => void alCrearNuevoToken()}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>Añadir al mapa</span>
                </button>
              </div>
            </section>

            <section className="mapa-panel-bloque">
              <div className="mapa-panel-subtitulo">
                Bandeja guardada ({plantillas.length})
              </div>
              {plantillas.length === 0 ? (
                <p className="mapa-panel-vacio">
                  Aún no hay plantillas guardadas. Marca &ldquo;Guardar en
                  bandeja&rdquo; al crear un token.
                </p>
              ) : (
                <div className="mapa-plantillas-grid">
                  {plantillas.map(pl => {
                    const puedeBorrarPl =
                      esMaster ||
                      (!miUsuarioId
                        ? !pl.autorId || pl.autorId === "local"
                        : pl.autorId === miUsuarioId);
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
            </section>
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
                  onClick={() =>
                    void onActualizarToken(tokenSeleccionado.id, {
                      celdasAncho: n,
                      celdasAlto: n
                    })
                  }
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
        className={`mapa-viewport${modoPing ? " modo-ping" : ""}${
          espacioPulsado ? " modo-pan" : ""
        }${paneando ? " paneando" : ""}`}
        onWheel={alGirarRueda}
        onPointerDown={alBajarPunteroViewport}
        onPointerMove={alMoverPunteroViewport}
        onPointerUp={alSoltarPunteroViewport}
        onPointerCancel={alSoltarPunteroViewport}
      >
        <div
          className="mapa-transform"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
          }}
        >
          <div
            ref={canvasRef}
            className={`mapa-canvas${fondo ? "" : " sin-fondo"}`}
            style={{
              width: `${tamanoCanvas.w}px`,
              height: `${tamanoCanvas.h}px`
            }}
          >
            {/* Capa 1: Fondo estático o lienzo por defecto */}
            {fondo ? (
              <img
                src={fondo.url}
                alt={fondo.titulo ?? "Mapa táctico"}
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
            {rejilla.visible && lineasRejilla && (
              <svg
                className="mapa-rejilla-svg"
                width="100%"
                height="100%"
                viewBox={`0 0 ${tamanoCanvas.w} ${tamanoCanvas.h}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{ opacity: rejilla.opacidad }}
              >
                {lineasRejilla.verticales.map((x, idx) => (
                  <line
                    key={`v-${idx}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={tamanoCanvas.h}
                    stroke={rejilla.color}
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
                    stroke={rejilla.color}
                    strokeWidth={1 / Math.max(0.6, Math.min(2, zoom))}
                  />
                ))}
              </svg>
            )}

            {/* Capa 3: Tokens */}
            {tokens.map(token => {
              const editable = puedeEditarToken(token, esMaster, miUsuarioId);
              const seleccionado = token.id === tokenSeleccionadoId;
              const enArrastre =
                arrastreToken?.tokenId === token.id ? arrastreToken : null;
              const posX = enArrastre ? enArrastre.xActual : token.x;
              const posY = enArrastre ? enArrastre.yActual : token.y;
              const anchoPct =
                (token.celdasAncho / Math.max(4, rejilla.columnas)) *
                100 *
                token.escala;
              const altoPct =
                (token.celdasAlto / Math.max(4, rejilla.filas)) *
                100 *
                token.escala;

              return (
                <div
                  key={token.id}
                  className={`mapa-token${editable ? " editable" : ""}${
                    seleccionado ? " seleccionado" : ""
                  }${enArrastre ? " arrastrando" : ""}${
                    token.esMonstruo ? " monstruo" : ""
                  }`}
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
                  <span className="mapa-token-etiqueta">{token.nombre}</span>
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

      {/* Ayuda discreta de controles */}
      <div className="mapa-ayuda-controles" aria-hidden="true">
        <span>Rueda: zoom</span>
        <span>·</span>
        <span>Arrastrar fondo: mover</span>
        <span>·</span>
        <span>Alt+arrastrar token: libre</span>
      </div>
    </div>
  );
}
