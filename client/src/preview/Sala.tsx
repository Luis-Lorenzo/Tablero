import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  Crown,
  Eye,
  Image as ImageIcon,
  Minus,
  Moon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { archivosApi } from "../api/archivos.api";
import type { PublicArchivo } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import { DocumentoVisorModal, PanelImagenesMasterModal } from "./Archivador";
import { infoFormatoArchivo, nuevoId, urlImagenEscena } from "./calibracion";
import { ChatSala } from "./ChatSala";
import {
  crearElementoDesdeArchivo,
  mensajeSolicitudTransferencia,
  nuevoIdElemento,
  tipoCortoArchivo
} from "./compartir";
import { CALIBRACION_INICIAL, COLORES_POSIT, FONDO_SALA } from "./datos";
import type { PublicJugadorResumenInventario } from "../api/types";
import {
  cargarDivisaLocal,
  cargarMochilaLocal,
  EMOJIS_OBJETO_SUGERIDOS,
  formatearDivisaCompacta,
  guardarDivisaLocal,
  guardarMochilaLocal,
  IconoBilletePixel,
  IconoLupaPixel,
  IconoMochilaPixel,
  IconoMonedasPixel,
  recortarImagenCuadrada
} from "./inventario";
import {
  cargarMacrosLocales,
  guardarMacrosLocales,
  ICONOS_MACROS,
  IconoMacro
} from "./macros";
import { Posit } from "./Pizarra";
import {
  establecerSonidoSilenciado,
  estaSonidoSilenciado,
  reproducirSonidoConsumir,
  reproducirSonidoMonedas,
  reproducirSonidoNotificacion
} from "./sonido";
import { reproducirSonidoRoll, reproducirSonidoTirada } from "./sonidoDados";
import type {
  Asiento,
  Calibracion,
  DivisaAsientoDelta,
  DocumentoMesa,
  ElementoMesa,
  ImagenEscenaPreview,
  JugadorPreview,
  MacroTirada,
  MensajeSala,
  ObjetoMochila,
  PositPreview,
  Punto,
  QuadMapa,
  RectPizarra,
  SolicitudTransferencia,
  TipoEspecialTirada,
  TiradaAsiento
} from "./tipos";

interface SalaProps {
  jugadores: JugadorPreview[];
  calibracion: Calibracion;
  onCalibracion: Dispatch<SetStateAction<Calibracion>>;
  onAbrirPizarra: () => void;
  onAbrirMapa: () => void;
  onAbrirArchivador?: () => void;
  onVolver: () => void;
  hostName?: string;
  yoAsientoId?: string;
  posits?: PositPreview[];
  elementosMesa?: ElementoMesa[];
  onElementosMesa?: Dispatch<SetStateAction<ElementoMesa[]>>;
  archivosDisponibles?: Array<PublicArchivo & { contenidoLocal?: string }>;
  onSolicitarArchivos?: () => void;
  onEnviarElemento?: (destino: JugadorPreview, elemento: ElementoMesa) => void | Promise<void>;
  solicitudPendiente?: SolicitudTransferencia | null;
  onAceptarSolicitud?: (solicitud: SolicitudTransferencia) => void;
  onRechazarSolicitud?: (solicitud: SolicitudTransferencia) => void;
  onSimularRecepcion?: () => void;
  esMaster?: boolean;
  miUsuarioId?: string;
  mensajesChat?: MensajeSala[];
  onEnviarChat?: (texto: string, destinatarioId: string | null) => void | Promise<void>;
  tiradasAsiento?: Record<string, TiradaAsiento>;
  onTiradaPublica?: (tirada: {
    total: number;
    formula: string;
    dados: number[];
    bonificador: number;
    caras: number;
    especial: TipoEspecialTirada;
    soloMaster?: boolean;
  }) => void | Promise<void>;
  colorJugador?: string;
  nombreJugador?: string;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  proyeccionOculta?: boolean;
  onReabrirProyeccion?: () => void;
  macros?: MacroTirada[];
  onMacros?: (macros: MacroTirada[]) => void;
  divisa?: number;
  divisaNombre?: string;
  onCambiarDivisa?: (nueva: number, delta: number) => void | Promise<void>;
  onCambiarDivisaNombre?: (nombre: string) => void | Promise<void>;
  divisaAsiento?: Record<string, DivisaAsientoDelta>;
  mochila?: ObjetoMochila[];
  onMochila?: Dispatch<SetStateAction<ObjetoMochila[]>>;
  onEnviarObjetoMochila?: (
    destino: JugadorPreview,
    objeto: ObjetoMochila,
    cantidad?: number
  ) => void | Promise<void>;
  onConsultarResumenMaster?: () => Promise<PublicJugadorResumenInventario[]>;
}

/** Tamaño de referencia para convertir píxeles de arrastre en porcentajes. */
interface Medidas {
  width: number;
  height: number;
}

type Arrastre =
  | {
    tipo: "asiento";
    id: string;
    inicioX: number;
    inicioY: number;
    base: Asiento;
    medidas: Medidas;
  }
  | {
    tipo: "dock";
    inicioX: number;
    inicioY: number;
    base: Asiento;
    medidas: Medidas;
  }
  | {
    tipo: "pizarra" | "pizarra-tam" | "chat" | "chat-tam";
    inicioX: number;
    inicioY: number;
    base: RectPizarra;
    medidas: Medidas;
  }
  | {
    tipo: "mapa-vertice";
    indice: number;
    inicioX: number;
    inicioY: number;
    base: Punto;
    medidas: Medidas;
  }
  | {
    tipo: "posit-mesa";
    id: string;
    inicioX: number;
    inicioY: number;
    base: Punto;
    medidas: Medidas;
  }
  | {
    tipo: "doc-mesa";
    id: string;
    inicioX: number;
    inicioY: number;
    movido: boolean;
    base: Punto;
    medidas: Medidas;
  }
  | {
    tipo: "mesa-elemento";
    id: string;
    elemento: ElementoMesa;
    inicioX: number;
    inicioY: number;
    base: Punto;
    medidas: Medidas;
    movido: boolean;
  }
  | {
    tipo: "bandeja-elemento";
    elemento: ElementoMesa;
    inicioX: number;
    inicioY: number;
  }
  | {
    tipo: "objeto-mesa";
    id: string;
    inicioX: number;
    inicioY: number;
    movido: boolean;
    base: Punto;
    medidas: Medidas;
  }
  | {
    tipo: "mochila-objeto";
    objeto: ObjetoMochila;
    inicioX: number;
    inicioY: number;
    movido: boolean;
  };

/** Segundos que el resultado del dado sigue en pantalla antes de irse. */
const DURACION_RESULTADO = 4500;
/** Duración del D20 animado encima del círculo de cada jugador. */
const DURACION_D20_ASIENTO = 3500;

/** Tipos de dado habituales en juegos de rol. */
const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100] as const;

/** Dados rápidos en la esquina inferior izquierda (con su color distintivo). */
const DADOS_RAPIDOS = [
  { caras: 4, color: "#38d9a9", glow: "rgb(56 217 169 / 32%)" },
  { caras: 6, color: "#4dabf7", glow: "rgb(77 171 247 / 32%)" },
  { caras: 8, color: "#b197fc", glow: "rgb(177 151 252 / 34%)" },
  { caras: 10, color: "#ffa94d", glow: "rgb(255 169 77 / 32%)" },
  { caras: 20, color: "#e8c56a", glow: "rgb(232 197 106 / 34%)" }
] as const;

interface GrupoDado {
  id: string;
  cantidad: number;
  caras: number;
}

interface DadoIndividual {
  valor: number;
  caras: number;
  especial: TipoEspecialTirada;
}

interface ResultadoTirada {
  total: number;
  dados: number[];
  desgloseDados: DadoIndividual[];
  bonificador: number;
  caras: number;
  especial: TipoEspecialTirada;
  formula: string;
  secreta?: boolean;
  compuesta?: boolean;
}

function detectarEspecialDado(caras: number, valor: number): TipoEspecialTirada {
  if (valor === caras) return "critico";
  if (valor === 1) return "pifia";
  return null;
}

function detectarEspecialTirada(caras: number, dados: number[]): TipoEspecialTirada {
  // Solo los lanzamientos de un único dado tienen estado/sonido global de crítico o pifia.
  if (dados.length !== 1) return null;
  return detectarEspecialDado(caras, dados[0]);
}

function formatearFormulaCompuesta(
  grupos: GrupoDado[],
  bonificador: number
): string {
  const base = grupos.map(g => `${g.cantidad}d${g.caras}`).join(" + ");
  if (bonificador > 0) return `${base} + ${bonificador}`;
  if (bonificador < 0) return `${base} - ${Math.abs(bonificador)}`;
  return base;
}

function lanzarGruposDados(
  grupos: GrupoDado[],
  bonificador: number
): ResultadoTirada {
  const desgloseDados: DadoIndividual[] = [];
  for (const grupo of grupos) {
    const cantidad = Math.round(limitar(grupo.cantidad, 1, 20));
    for (let i = 0; i < cantidad; i += 1) {
      const valor = 1 + Math.floor(Math.random() * grupo.caras);
      desgloseDados.push({
        valor,
        caras: grupo.caras,
        especial: detectarEspecialDado(grupo.caras, valor)
      });
    }
  }
  const dados = desgloseDados.map(d => d.valor);
  const suma = dados.reduce((acc, valor) => acc + valor, 0);
  const esMultiple = grupos.length > 1 || desgloseDados.length > 1;
  const carasPrincipal = esMultiple ? 20 : (grupos[0]?.caras ?? 20);
  return {
    total: suma + bonificador,
    dados,
    desgloseDados,
    bonificador,
    caras: carasPrincipal,
    especial:
      desgloseDados.length === 1
        ? detectarEspecialTirada(carasPrincipal, dados)
        : null,
    formula: formatearFormulaCompuesta(grupos, bonificador),
    compuesta: grupos.length > 1
  };
}

function IconoDadoPoligono({
  caras,
  valor
}: {
  caras: number;
  valor?: number | string;
}) {
  const etiqueta =
    valor !== undefined ? (
      <text
        x="12"
        y={caras === 4 ? "16.8" : "14.5"}
        textAnchor="middle"
        fontSize="5.6"
        fill="currentColor"
        stroke="none"
        fontFamily="'Press Start 2P', monospace"
      >
        {valor}
      </text>
    ) : null;

  if (caras === 4) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <polygon
          points="12,3 21.5,19.5 2.5,19.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {etiqueta}
      </svg>
    );
  }
  if (caras === 6) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        {etiqueta}
      </svg>
    );
  }
  if (caras === 8) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <polygon
          points="12,2.2 21.5,12 12,21.8 2.5,12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {etiqueta}
      </svg>
    );
  }
  if (caras === 10) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <polygon
          points="12,2.5 20.5,10 17,20.5 7,20.5 3.5,10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {etiqueta}
      </svg>
    );
  }
  if (caras === 12) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <polygon
          points="12,2 19,5 22,12 19,19 12,22 5,19 2,12 5,5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {etiqueta}
      </svg>
    );
  }
  if (caras === 100) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle
          cx="12"
          cy="12"
          r="7.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          strokeDasharray="2 2"
        />
        {etiqueta}
      </svg>
    );
  }
  return <IconoD20 valor={valor} />;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function estiloRect(rect: RectPizarra): CSSProperties {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`
  };
}

function moverRect(base: RectPizarra, dx: number, dy: number): RectPizarra {
  const x = limitar(base.x + dx, 0, 100 - base.w);
  const y = limitar(base.y + dy, 0, 100 - base.h);
  return { ...base, x, y };
}

function redimensionarRect(
  base: RectPizarra,
  dx: number,
  dy: number,
  minW = 6,
  minH = 6
): RectPizarra {
  const w = limitar(base.w + dx, minW, 100 - base.x);
  const h = limitar(base.h + dy, minH, 100 - base.y);
  return { ...base, w, h };
}

/** Puntos para un `<polygon>` con `viewBox="0 0 100 100"`. */
function puntosSvg(quad: QuadMapa): string {
  return quad.vertices.map(v => `${v.x},${v.y}`).join(" ");
}

function centroide(quad: QuadMapa): Punto {
  const suma = quad.vertices.reduce(
    (acumulado, vertice) => ({
      x: acumulado.x + vertice.x,
      y: acumulado.y + vertice.y
    }),
    { x: 0, y: 0 }
  );

  return { x: suma.x / 4, y: suma.y / 4 };
}

function IconoD20({ valor = 20 }: { valor?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polygon
        points="12,2 21,7 21,17 12,22 3,17 3,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fontSize="5.6"
        fill="currentColor"
        stroke="none"
        fontFamily="'Press Start 2P', monospace"
      >
        {valor}
      </text>
    </svg>
  );
}

function IconoPosit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 4h16v10l-6 6H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M20 14h-6v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoArchivador() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 7a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M3 11h18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconoMasterEscena() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
      <path
        d="M4.5 17.5l4.8-4.5 3.6 3.2 2.9-2.8 3.7 4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function textoLegible(color: string): string {
  const limpio = color.replace("#", "");
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map(c => c + c)
          .join("")
      : limpio;

  const r = parseInt(completo.slice(0, 2), 16) || 0;
  const g = parseInt(completo.slice(2, 4), 16) || 0;
  const b = parseInt(completo.slice(4, 6), 16) || 0;
  const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luz > 0.62 ? "#2a2433" : "#fbf8f2";
}

function TextoArchivoMesa({
  archivoId,
  nombre,
  contenidoLocal
}: {
  archivoId: string;
  nombre: string;
  contenidoLocal?: string;
}) {
  const [texto, setTexto] = useState<string>(contenidoLocal ?? "Cargando…");

  useEffect(() => {
    if (contenidoLocal !== undefined) return undefined;
    let activo = true;
    (async () => {
      try {
        const res = await fetch(archivosApi.url(archivoId), {
          credentials: "include"
        });
        if (!res.ok) return;
        const contenido = await res.text();
        if (activo) setTexto(contenido);
      } catch {
        if (activo) setTexto("No se pudo leer el archivo de texto.");
      }
    })();
    return () => {
      activo = false;
    };
  }, [archivoId, contenidoLocal]);

  return (
    <pre className="texto-visor" aria-label={nombre}>
      {texto}
    </pre>
  );
}

export function Sala({
  jugadores,
  calibracion,
  onCalibracion,
  onAbrirPizarra,
  onAbrirMapa,
  onAbrirArchivador,
  onVolver,
  hostName,
  yoAsientoId = "master",
  elementosMesa = [],
  onElementosMesa,
  archivosDisponibles = [],
  onSolicitarArchivos,
  onEnviarElemento,
  solicitudPendiente = null,
  onAceptarSolicitud,
  onRechazarSolicitud,
  onSimularRecepcion,
  esMaster = false,
  miUsuarioId = "master",
  mensajesChat,
  onEnviarChat,
  tiradasAsiento,
  onTiradaPublica,
  colorJugador,
  nombreJugador,
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen,
  proyeccionOculta,
  onReabrirProyeccion,
  macros,
  onMacros,
  divisa,
  divisaNombre = "Divisa",
  onCambiarDivisa,
  onCambiarDivisaNombre,
  divisaAsiento,
  mochila,
  onMochila,
  onEnviarObjetoMochila,
  onConsultarResumenMaster
}: SalaProps) {
  const [ajuste, setAjuste] = useState(
    () => new URLSearchParams(window.location.search).get("ajuste") === "1"
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const [anclaCompartir, setAnclaCompartir] = useState<{
    x: number;
    y: number;
    origen: "pelota" | "chat";
  } | null>(null);
  const [dragSobreDropzone, setDragSobreDropzone] = useState(false);
  const [punteroSobreDropzone, setPunteroSobreDropzone] = useState(false);
  const [subiendoDrop, setSubiendoDrop] = useState(false);
  const [subiendoBarra, setSubiendoBarra] = useState(false);
  const [archivosSubidosLocal, setArchivosSubidosLocal] = useState<
    Array<PublicArchivo & { contenidoLocal?: string }>
  >([]);
  const onSolicitarArchivosRef = useRef(onSolicitarArchivos);
  onSolicitarArchivosRef.current = onSolicitarArchivos;

  useEffect(() => {
    onSolicitarArchivosRef.current?.();
  }, []);

  const archivosLista = [
    ...archivosSubidosLocal.filter(
      a => !archivosDisponibles.some(disp => disp.id === a.id)
    ),
    ...archivosDisponibles
  ];
  const [nuevoPositTexto, setNuevoPositTexto] = useState("");
  const [nuevoPositColor, setNuevoPositColor] = useState<string>(COLORES_POSIT[3].valor);
  const [jugadorSeleccionadoId, setJugadorSeleccionadoId] = useState<string | null>(null);
  const [arrastrandoItemId, setArrastrandoItemId] = useState<string | null>(null);
  const [asientoSobreId, setAsientoSobreId] = useState<string | null>(null);
  const [fantasma, setFantasma] = useState<{ x: number; y: number; etiqueta: string } | null>(
    null
  );
  const [itemAbierto, setItemAbierto] = useState<ElementoMesa | null>(null);
  const [tiradaSecreta, setTiradaSecreta] = useState(false);
  const [sonidoSilenciado, setSonidoSilenciado] = useState<boolean>(
    estaSonidoSilenciado
  );

  function alternarSilencio(): void {
    const siguiente = !sonidoSilenciado;
    setSonidoSilenciado(siguiente);
    establecerSonidoSilenciado(siguiente);
  }
  const [cantidadDados, setCantidadDados] = useState(1);
  const [tipoDado, setTipoDado] = useState<number>(20);
  const [bonificador, setBonificador] = useState(0);
  const [compuestaAbierta, setCompuestaAbierta] = useState(false);
  const [gruposCompuesta, setGruposCompuesta] = useState<GrupoDado[]>([
    { id: "c-0", cantidad: 1, caras: 20 }
  ]);
  const [bonificadorCompuesta, setBonificadorCompuesta] = useState(0);
  const [macrosLocales, setMacrosLocales] = useState<MacroTirada[]>(cargarMacrosLocales);
  const [macrosAbierto, setMacrosAbierto] = useState(false);
  const [macroSecreta, setMacroSecreta] = useState(false);
  const [macroFiltro, setMacroFiltro] = useState("");
  const [macroModalAbierto, setMacroModalAbierto] = useState(false);
  const [macroEditandoId, setMacroEditandoId] = useState<string | null>(null);
  const [macroNombre, setMacroNombre] = useState("");
  const [macroIcono, setMacroIcono] = useState("sword");
  const [macroGrupos, setMacroGrupos] = useState<GrupoDado[]>([
    { id: "m-0", cantidad: 1, caras: 20 }
  ]);
  const [macroBonificador, setMacroBonificador] = useState(0);
  const macrosLista = macros ?? macrosLocales;

  const [divisaLocal, setDivisaLocal] = useState<number>(cargarDivisaLocal);
  const divisaActual = divisa ?? divisaLocal;
  const [divisaAbierta, setDivisaAbierta] = useState(false);
  const [divisaPaso, setDivisaPaso] = useState<1 | 10 | 100>(1);
  const [divisaCustomTexto, setDivisaCustomTexto] = useState("");
  const [divisaNombreEdit, setDivisaNombreEdit] = useState(divisaNombre);
  const [divisaAsientoLocales, setDivisaAsientoLocales] = useState<
    Record<string, DivisaAsientoDelta>
  >({});

  const [mochilaLocal, setMochilaLocal] = useState<ObjetoMochila[]>(cargarMochilaLocal);
  const mochilaActual = mochila ?? mochilaLocal;
  const [mochilaAbierta, setMochilaAbierta] = useState(false);
  const [objetoMochilaId, setObjetoMochilaId] = useState<string | null>(null);
  const [creandoObjeto, setCreandoObjeto] = useState(false);
  const [nuevoObjNombre, setNuevoObjNombre] = useState("");
  const [nuevoObjDesc, setNuevoObjDesc] = useState("");
  const [nuevoObjCantidad, setNuevoObjCantidad] = useState(1);
  const [nuevoObjEmoji, setNuevoObjEmoji] = useState("🧪");
  const [nuevoObjArchivo, setNuevoObjArchivo] = useState<{
    archivoId?: string;
    archivoNombre?: string;
    imagenLocal?: string;
  } | null>(null);
  const [subiendoObjetoImg, setSubiendoObjetoImg] = useState(false);
  const [pasandoObjetoId, setPasandoObjetoId] = useState<string | null>(null);
  const [objetoMesaActivo, setObjetoMesaActivo] = useState<
    Extract<ElementoMesa, { tipo: "objeto" }> | null
  >(null);
  const [masterDivisasAbierto, setMasterDivisasAbierto] = useState(false);
  const [masterMochilasAbierto, setMasterMochilasAbierto] = useState(false);
  const [masterResumenJugadores, setMasterResumenJugadores] = useState<
    PublicJugadorResumenInventario[]
  >([]);
  const [masterResumenCargando, setMasterResumenCargando] = useState(false);
  const [masterJugadorMochilaId, setMasterJugadorMochilaId] = useState<string | null>(
    null
  );

  async function cargarResumenMaster(): Promise<void> {
    if (!onConsultarResumenMaster) {
      const simulados: PublicJugadorResumenInventario[] = jugadores
        .filter(j => j.activo && !j.esMaster)
        .map(j => ({
          userId: j.usuarioId ?? j.id,
          nombre: j.nombre,
          color: j.color,
          divisa: 0,
          mochila: [],
          objetosMesa: []
        }));
      setMasterResumenJugadores(simulados);
      if (simulados.length > 0 && !masterJugadorMochilaId) {
        setMasterJugadorMochilaId(simulados[0].userId);
      }
      return;
    }

    setMasterResumenCargando(true);
    try {
      const lista = await onConsultarResumenMaster();
      setMasterResumenJugadores(lista);
      setMasterJugadorMochilaId(actual =>
        actual && lista.some(j => j.userId === actual)
          ? actual
          : (lista[0]?.userId ?? null)
      );
    } catch {
      mostrarAviso("No se pudo consultar el resumen de jugadores.");
    } finally {
      setMasterResumenCargando(false);
    }
  }

  function alternarPanelMaster(modo: "divisas" | "mochilas"): void {
    setDivisaAbierta(false);
    setMochilaAbierta(false);
    if (modo === "divisas") {
      setMasterMochilasAbierto(false);
      setMasterDivisasAbierto(v => {
        const next = !v;
        if (next) void cargarResumenMaster();
        return next;
      });
    } else {
      setMasterDivisasAbierto(false);
      setMasterMochilasAbierto(v => {
        const next = !v;
        if (next) void cargarResumenMaster();
        return next;
      });
    }
  }

  const divisaDebounceRef = useRef<{ timer: number | null; acumulado: number }>({
    timer: null,
    acumulado: 0
  });
  const divisaActualRef = useRef(divisaActual);
  divisaActualRef.current = divisaActual;
  const onCambiarDivisaRef = useRef(onCambiarDivisa);
  onCambiarDivisaRef.current = onCambiarDivisa;
  const onEnviarObjetoMochilaRef = useRef(onEnviarObjetoMochila);
  onEnviarObjetoMochilaRef.current = onEnviarObjetoMochila;
  const objetoImgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDivisaNombreEdit(divisaNombre);
  }, [divisaNombre]);
  const [tirando, setTirando] = useState(false);
  const [tirada, setTirada] = useState<ResultadoTirada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sobreMapa, setSobreMapa] = useState(false);
  const [mensajesLocales, setMensajesLocales] = useState<MensajeSala[]>([]);
  const [tiradasAsientoLocales, setTiradasAsientoLocales] = useState<
    Record<string, TiradaAsiento>
  >({});
  const [positActivo, setPositActivo] = useState<string | null>(null);
  const [visorDoc, setVisorDoc] = useState<DocumentoMesa | null>(null);
  const [visorEscena, setVisorEscena] = useState(false);
  const [panelMasterAbierto, setPanelMasterAbierto] = useState(false);

  const plano = useRef<HTMLDivElement>(null);
  const asientoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const barraFileInputRef = useRef<HTMLInputElement>(null);
  const capaPosits = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const arrastreDocMovido = useRef(false);
  const temporizador = useRef<number | null>(null);
  const ocultarResultado = useRef<number | null>(null);
  const avisoTimer = useRef<number | null>(null);
  const timersAsiento = useRef<Record<string, number>>({});

  const jugadoresRef = useRef(jugadores);
  const yoAsientoIdRef = useRef(yoAsientoId);
  const onElementosMesaRef = useRef(onElementosMesa);
  const onEnviarElementoRef = useRef(onEnviarElemento);
  const elementosMesaRef = useRef(elementosMesa);
  const jugadorSeleccionadoRef = useRef<JugadorPreview | null>(null);

  useEffect(() => {
    jugadoresRef.current = jugadores;
    yoAsientoIdRef.current = yoAsientoId;
    onElementosMesaRef.current = onElementosMesa;
    onEnviarElementoRef.current = onEnviarElemento;
    elementosMesaRef.current = elementosMesa;
  }, [
    jugadores,
    yoAsientoId,
    onElementosMesa,
    onEnviarElemento,
    elementosMesa
  ]);

  const solicitudPendienteId = solicitudPendiente?.id ?? null;
  useEffect(() => {
    if (solicitudPendienteId) {
      reproducirSonidoNotificacion();
    }
  }, [solicitudPendienteId]);

  useEffect(() => {
    if (!itemAbierto || itemAbierto.tipo !== "archivo" || itemAbierto.vista !== "docx") {
      return undefined;
    }

    let desmontado = false;
    (async () => {
      try {
        const modulo = await import("docx-preview");
        if (desmontado) return;
        const contenedor = document.getElementById("sala-docx-contenedor");
        if (!contenedor) return;
        contenedor.innerHTML = "";

        const respuesta = await fetch(archivosApi.url(itemAbierto.archivoId), {
          credentials: "include"
        });
        if (!respuesta.ok || desmontado) return;
        const blob = await respuesta.blob();
        if (desmontado) return;

        await (modulo as { renderAsync: (b: Blob, c: HTMLElement) => Promise<void> }).renderAsync(
          blob,
          contenedor
        );
      } catch (e) {
        console.error("No se pudo previsualizar .docx", e);
      }
    })();

    return () => {
      desmontado = true;
    };
  }, [itemAbierto]);

  useEffect(() => {
    if (
      !selectorAbierto &&
      !compuestaAbierta &&
      !itemAbierto &&
      !macrosAbierto &&
      !macroModalAbierto &&
      !divisaAbierta &&
      !mochilaAbierta &&
      !objetoMesaActivo
    ) {
      return;
    }
    function alPulsarEscape(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      if (itemAbierto) {
        setItemAbierto(null);
      } else if (objetoMesaActivo) {
        setObjetoMesaActivo(null);
      } else if (macroModalAbierto) {
        setMacroModalAbierto(false);
      } else if (compuestaAbierta) {
        setCompuestaAbierta(false);
      } else if (mochilaAbierta) {
        setMochilaAbierta(false);
      } else if (divisaAbierta) {
        setDivisaAbierta(false);
      } else if (macrosAbierto) {
        setMacrosAbierto(false);
      } else if (selectorAbierto) {
        setSelectorAbierto(false);
      }
    }
    window.addEventListener("keydown", alPulsarEscape);
    return () => window.removeEventListener("keydown", alPulsarEscape);
  }, [
    selectorAbierto,
    compuestaAbierta,
    itemAbierto,
    macrosAbierto,
    macroModalAbierto,
    divisaAbierta,
    mochilaAbierta,
    objetoMesaActivo
  ]);

  useEffect(() => {
    function buscarAsientoDestino(clientX: number, clientY: number): string | null {
      for (const jugador of jugadoresRef.current) {
        if (!jugador.activo || jugador.id === yoAsientoIdRef.current) continue;
        const nodo = asientoRefs.current.get(jugador.id);
        if (!nodo) continue;
        const rect = nodo.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radio = Math.max(36, rect.width * 0.65);
        if (Math.hypot(clientX - cx, clientY - cy) <= radio) {
          return jugador.id;
        }
      }
      return null;
    }

    function estaSobreDropzone(clientX: number, clientY: number): boolean {
      const rect = dropzoneRef.current?.getBoundingClientRect();
      if (!rect) return false;
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    }

    function mover(evento: PointerEvent) {
      const actual = arrastre.current;
      if (!actual) return;

      if (actual.tipo === "bandeja-elemento") {
        const dist = Math.hypot(evento.clientX - actual.inicioX, evento.clientY - actual.inicioY);
        if (dist > 4) {
          setArrastrandoItemId(actual.elemento.id);
          setFantasma({
            x: evento.clientX,
            y: evento.clientY,
            etiqueta:
              actual.elemento.tipo === "posit"
                ? actual.elemento.texto || "Nota"
                : actual.elemento.nombre
          });
          setAsientoSobreId(buscarAsientoDestino(evento.clientX, evento.clientY));
          setPunteroSobreDropzone(estaSobreDropzone(evento.clientX, evento.clientY));
        }
        return;
      }

      if (actual.tipo === "mochila-objeto") {
        if (
          !actual.movido &&
          Math.hypot(
            evento.clientX - actual.inicioX,
            evento.clientY - actual.inicioY
          ) > 6
        ) {
          actual.movido = true;
          setMochilaAbierta(false);
        }
        if (!actual.movido) return;

        const etiqueta = `${actual.objeto.emoji ? `${actual.objeto.emoji} ` : ""}${actual.objeto.nombre}`;
        setFantasma({ x: evento.clientX, y: evento.clientY, etiqueta });
        setAsientoSobreId(buscarAsientoDestino(evento.clientX, evento.clientY));
        setPunteroSobreDropzone(estaSobreDropzone(evento.clientX, evento.clientY));
        return;
      }

      const dx = ((evento.clientX - actual.inicioX) / actual.medidas.width) * 100;
      const dy = ((evento.clientY - actual.inicioY) / actual.medidas.height) * 100;

      if (actual.tipo === "mesa-elemento") {
        const dist = Math.hypot(evento.clientX - actual.inicioX, evento.clientY - actual.inicioY);
        if (dist > 4) {
          actual.movido = true;
          setArrastrandoItemId(actual.id);
          const x = limitar(actual.base.x + dx, 5, 95);
          const y = limitar(actual.base.y + dy, 8, 92);
          onElementosMesaRef.current?.(prev =>
            prev.map(item => (item.id === actual.id ? { ...item, x, y } : item))
          );
          setAsientoSobreId(buscarAsientoDestino(evento.clientX, evento.clientY));
          setPunteroSobreDropzone(estaSobreDropzone(evento.clientX, evento.clientY));
        }
        return;
      }

      if (actual.tipo === "asiento") {
        const x = limitar(actual.base.x + dx, 2, 98);
        const y = limitar(actual.base.y + dy, 2, 98);
        onCalibracion(prev => ({
          ...prev,
          asientos: { ...prev.asientos, [actual.id]: { x, y } }
        }));
        return;
      }

      if (actual.tipo === "dock") {
        const x = limitar(actual.base.x + dx, 4, 96);
        const y = limitar(actual.base.y + dy, 6, 96);
        onCalibracion(prev => ({ ...prev, dock: { x, y } }));
        return;
      }

      if (actual.tipo === "mapa-vertice") {
        const x = limitar(actual.base.x + dx, 0, 100);
        const y = limitar(actual.base.y + dy, 0, 100);

        onCalibracion(prev => {
          const vertices = [...prev.mapa.vertices] as [
            Punto,
            Punto,
            Punto,
            Punto
          ];
          vertices[actual.indice] = { x, y };
          return { ...prev, mapa: { vertices } };
        });
        return;
      }

      if (actual.tipo === "posit-mesa") {
        setArrastrandoItemId(actual.id);
        const x = limitar(actual.base.x + dx, 8, 92);
        const y = limitar(actual.base.y + dy, 12, 88);
        onElementosMesaRef.current?.(prev =>
          prev.map(el => (el.id === actual.id ? { ...el, x, y } : el))
        );
        setAsientoSobreId(buscarAsientoDestino(evento.clientX, evento.clientY));
        setPunteroSobreDropzone(estaSobreDropzone(evento.clientX, evento.clientY));
        return;
      }

      if (actual.tipo === "doc-mesa") {
        if (
          !actual.movido &&
          Math.hypot(
            evento.clientX - actual.inicioX,
            evento.clientY - actual.inicioY
          ) > 5
        ) {
          actual.movido = true;
          arrastreDocMovido.current = true;
        }
        if (!actual.movido) return;

        setArrastrandoItemId(actual.id);
        const x = limitar(actual.base.x + dx, 6, 94);
        const y = limitar(actual.base.y + dy, 12, 88);
        onElementosMesaRef.current?.(prev =>
          prev.map(el => (el.id === actual.id ? { ...el, x, y } : el))
        );
        setAsientoSobreId(buscarAsientoDestino(evento.clientX, evento.clientY));
        setPunteroSobreDropzone(estaSobreDropzone(evento.clientX, evento.clientY));
        return;
      }

      if (actual.tipo === "objeto-mesa") {
        if (
          !actual.movido &&
          Math.hypot(
            evento.clientX - actual.inicioX,
            evento.clientY - actual.inicioY
          ) > 5
        ) {
          actual.movido = true;
          arrastreDocMovido.current = true;
        }
        if (!actual.movido) return;

        setArrastrandoItemId(actual.id);
        const x = limitar(actual.base.x + dx, 6, 94);
        const y = limitar(actual.base.y + dy, 12, 88);
        onElementosMesaRef.current?.(prev =>
          prev.map(el => (el.id === actual.id ? { ...el, x, y } : el))
        );
        setAsientoSobreId(buscarAsientoDestino(evento.clientX, evento.clientY));
        setPunteroSobreDropzone(estaSobreDropzone(evento.clientX, evento.clientY));
        return;
      }

      if (actual.tipo === "pizarra") {
        onCalibracion(prev => ({
          ...prev,
          pizarra: moverRect(actual.base, dx, dy)
        }));
        return;
      }

      if (actual.tipo === "pizarra-tam") {
        onCalibracion(prev => ({
          ...prev,
          pizarra: redimensionarRect(actual.base, dx, dy)
        }));
        return;
      }

      if (actual.tipo === "chat") {
        onCalibracion(prev => ({
          ...prev,
          chat: moverRect(actual.base, dx, dy)
        }));
        return;
      }

      onCalibracion(prev => ({
        ...prev,
        chat: redimensionarRect(actual.base, dx, dy, 14, 14)
      }));
    }

    function soltar(evento: PointerEvent) {
      const actual = arrastre.current;
      arrastre.current = null;
      setArrastrandoItemId(null);
      setAsientoSobreId(null);
      setFantasma(null);
      setPunteroSobreDropzone(false);

      if (!actual) return;

      const enDropzone = estaSobreDropzone(evento.clientX, evento.clientY);

      if (actual.tipo === "mesa-elemento") {
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        const destinoDrop = enDropzone ? jugadorSeleccionadoRef.current : null;
        if (actual.movido && (destinoId || enDropzone)) {
          // Restauramos la posición original en nuestra mesa y disparamos la transferencia.
          onElementosMesaRef.current?.(prev =>
            prev.map(item =>
              item.id === actual.id
                ? { ...item, x: actual.base.x, y: actual.base.y }
                : item
            )
          );
          const destino =
            destinoDrop ??
            jugadoresRef.current.find(j => j.id === destinoId);
          if (destino) {
            void onEnviarElementoRef.current?.(destino, actual.elemento);
          } else if (enDropzone) {
            mostrarAviso("Elige primero un jugador para enviarle el elemento.");
          }
          return;
        }

        if (!actual.movido) {
          setItemAbierto(actual.elemento);
        }
        return;
      }

      if (actual.tipo === "bandeja-elemento") {
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        const destino =
          (enDropzone ? jugadorSeleccionadoRef.current : null) ??
          (destinoId ? jugadoresRef.current.find(j => j.id === destinoId) : null);
        if (destino) {
          void onEnviarElementoRef.current?.(destino, actual.elemento);
        } else if (enDropzone) {
          mostrarAviso("Elige primero un jugador para enviarle el elemento.");
        }
        return;
      }

      if (actual.tipo === "mochila-objeto") {
        if (!actual.movido) return;
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        const destino =
          (enDropzone ? jugadorSeleccionadoRef.current : null) ??
          (destinoId ? jugadoresRef.current.find(j => j.id === destinoId) : null);
        if (destino) {
          if (onEnviarObjetoMochilaRef.current) {
            void onEnviarObjetoMochilaRef.current(destino, actual.objeto, 1);
          } else {
            mostrarAviso(`Objeto ${actual.objeto.nombre} pasado a ${destino.nombre}.`);
          }
          return;
        }
        if (enDropzone) {
          mostrarAviso("Elige primero un jugador para enviarle el objeto.");
          return;
        }

        const rectMesa = capaPosits.current?.getBoundingClientRect();
        const x = rectMesa
          ? limitar(((evento.clientX - rectMesa.left) / rectMesa.width) * 100, 8, 92)
          : 50;
        const y = rectMesa
          ? limitar(((evento.clientY - rectMesa.top) / rectMesa.height) * 100, 14, 86)
          : 55;
        onElementosMesaRef.current?.(prev => [
          ...prev,
          {
            id: nuevoIdElemento(),
            tipo: "objeto",
            nombre: actual.objeto.nombre,
            descripcion: actual.objeto.descripcion,
            cantidad: actual.objeto.cantidad,
            ...(actual.objeto.emoji ? { emoji: actual.objeto.emoji } : {}),
            ...(actual.objeto.archivoId ? { archivoId: actual.objeto.archivoId } : {}),
            ...(actual.objeto.archivoNombre
              ? { archivoNombre: actual.objeto.archivoNombre }
              : {}),
            ...(actual.objeto.imagenLocal
              ? { imagenLocal: actual.objeto.imagenLocal }
              : {}),
            x,
            y
          }
        ]);
        const quitarId = actual.objeto.id;
        if (onMochila) {
          onMochila(prev => prev.filter(item => item.id !== quitarId));
        } else {
          setMochilaLocal(prev => {
            const next = prev.filter(item => item.id !== quitarId);
            guardarMochilaLocal(next);
            return next;
          });
        }
        mostrarAviso(`${actual.objeto.nombre} colocado en la mesa.`);
        return;
      }

      if (actual.tipo === "objeto-mesa") {
        if (!actual.movido) return;
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        if (destinoId || enDropzone) {
          const destino =
            (enDropzone ? jugadorSeleccionadoRef.current : null) ??
            (destinoId ? jugadoresRef.current.find(j => j.id === destinoId) : null);
          const item = elementosMesaRef.current.find(el => el.id === actual.id);
          if (destino && item && item.tipo === "objeto") {
            onElementosMesaRef.current?.(prev =>
              prev.map(el =>
                el.id === actual.id
                  ? { ...el, x: actual.base.x, y: actual.base.y }
                  : el
              )
            );
            void onEnviarElementoRef.current?.(destino, item);
          } else if (enDropzone && !destino) {
            mostrarAviso("Elige primero un jugador para enviarle el objeto.");
          }
        }
        return;
      }

      if (actual.tipo === "posit-mesa") {
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        if (destinoId || enDropzone) {
          onElementosMesaRef.current?.(prev =>
            prev.map(el =>
              el.id === actual.id ? { ...el, x: actual.base.x, y: actual.base.y } : el
            )
          );
          const posit = elementosMesaRef.current.find(
            (el): el is Extract<ElementoMesa, { tipo: "posit" }> =>
              el.id === actual.id && el.tipo === "posit"
          );
          const destino =
            (enDropzone ? jugadorSeleccionadoRef.current : null) ??
            (destinoId ? jugadoresRef.current.find(j => j.id === destinoId) : null);
          if (posit && destino && onEnviarElementoRef.current) {
            void onEnviarElementoRef.current(destino, {
              ...posit,
              x: actual.base.x,
              y: actual.base.y
            });
          } else if (enDropzone && !destino) {
            mostrarAviso("Elige primero un jugador para enviarle la nota.");
          }
        }
        return;
      }

      if (actual.tipo === "doc-mesa") {
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        if (actual.movido && (destinoId || enDropzone)) {
          onElementosMesaRef.current?.(prev =>
            prev.map(el =>
              el.id === actual.id ? { ...el, x: actual.base.x, y: actual.base.y } : el
            )
          );
          const doc = elementosMesaRef.current.find(
            (el): el is Extract<ElementoMesa, { tipo: "archivo" }> =>
              el.id === actual.id && el.tipo === "archivo"
          );
          const destino =
            (enDropzone ? jugadorSeleccionadoRef.current : null) ??
            (destinoId ? jugadoresRef.current.find(j => j.id === destinoId) : null);
          if (doc && destino && onEnviarElementoRef.current) {
            void onEnviarElementoRef.current(destino, {
              ...doc,
              id: nuevoIdElemento(),
              x: actual.base.x,
              y: actual.base.y
            });
          } else if (enDropzone && !destino) {
            mostrarAviso("Elige primero un jugador para enviarle el documento.");
          }
          arrastreDocMovido.current = false;
          return;
        }
      }

      if (arrastreDocMovido.current) {
        window.setTimeout(() => {
          arrastreDocMovido.current = false;
        }, 0);
      }
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [onCalibracion]);

  useEffect(() => {
    const timersMap = timersAsiento.current;
    return () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      if (ocultarResultado.current !== null) {
        window.clearTimeout(ocultarResultado.current);
      }
      if (avisoTimer.current !== null) window.clearTimeout(avisoTimer.current);
      for (const timerId of Object.values(timersMap)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  function mostrarAviso(texto: string): void {
    setAviso(texto);
    if (avisoTimer.current !== null) window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 3200);
  }

  function medidasPlano(): Medidas | null {
    const rect = plano.current?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  }

  function iniciarAsiento(id: string, evento: ReactPointerEvent): void {
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "asiento",
      id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.asientos[id] ?? { x: 50, y: 50 },
      medidas
    };
  }

  function iniciarDock(evento: ReactPointerEvent): void {
    evento.stopPropagation();
    arrastre.current = {
      tipo: "dock",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.dock,
      medidas: { width: window.innerWidth, height: window.innerHeight }
    };
  }

  function iniciarPizarra(evento: ReactPointerEvent): void {
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "pizarra",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.pizarra,
      medidas
    };
  }

  function iniciarPizarraTam(evento: ReactPointerEvent): void {
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "pizarra-tam",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.pizarra,
      medidas
    };
  }

  function iniciarChat(evento: ReactPointerEvent): void {
    evento.stopPropagation();
    arrastre.current = {
      tipo: "chat",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.chat,
      medidas: { width: window.innerWidth, height: window.innerHeight }
    };
  }

  function iniciarChatTam(evento: ReactPointerEvent): void {
    evento.stopPropagation();
    arrastre.current = {
      tipo: "chat-tam",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.chat,
      medidas: { width: window.innerWidth, height: window.innerHeight }
    };
  }

  function iniciarVertice(indice: number, evento: ReactPointerEvent): void {
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "mapa-vertice",
      indice,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.mapa.vertices[indice],
      medidas
    };
  }

  function mostrarD20Local(
    asientoId: string,
    total: number,
    especial: TipoEspecialTirada = null,
    caras = 20,
    desglose?: string
  ): void {
    const prevTimer = timersAsiento.current[asientoId];
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
    }
    const tiradaId = `${Date.now()}-${Math.random()}`;
    setTiradasAsientoLocales(prev => ({
      ...prev,
      [asientoId]: { id: tiradaId, total, especial, caras, desglose }
    }));
    timersAsiento.current[asientoId] = window.setTimeout(() => {
      setTiradasAsientoLocales(prev => {
        if (prev[asientoId]?.id !== tiradaId) return prev;
        const copia = { ...prev };
        delete copia[asientoId];
        return copia;
      });
      delete timersAsiento.current[asientoId];
    }, DURACION_D20_ASIENTO);
  }

  function enviarChatLocal(texto: string, destinatarioId: string | null): void {
    const autor = jugadores.find(j => (j.userId ?? j.id) === miUsuarioId);
    const receptor = destinatarioId
      ? jugadores.find(j => (j.userId ?? j.id) === destinatarioId)
      : undefined;

    setMensajesLocales(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        autorId: miUsuarioId,
        autorNombre: autor?.nombre ?? "Tú",
        texto,
        destinatarioId,
        destinatarioNombre: receptor?.nombre ?? null,
        createdAt: new Date().toISOString()
      }
    ]);
  }

  function abrirTiradaCompuesta(): void {
    setGruposCompuesta([
      { id: `c-${Date.now()}-0`, cantidad: 1, caras: 20 },
      { id: `c-${Date.now()}-1`, cantidad: 1, caras: 6 }
    ]);
    setBonificadorCompuesta(0);
    setSelectorAbierto(false);
    setCompuestaAbierta(true);
  }

  function agregarGrupoCompuesta(): void {
    setGruposCompuesta(prev => {
      if (prev.length >= 6) return prev;
      return [...prev, { id: `c-${Date.now()}-${prev.length}`, cantidad: 1, caras: 6 }];
    });
  }

  function actualizarGrupoCompuesta(
    id: string,
    patch: Partial<Pick<GrupoDado, "cantidad" | "caras">>
  ): void {
    setGruposCompuesta(prev =>
      prev.map(g => (g.id === id ? { ...g, ...patch } : g))
    );
  }

  function eliminarGrupoCompuesta(id: string): void {
    setGruposCompuesta(prev => (prev.length > 1 ? prev.filter(g => g.id !== id) : prev));
  }

  function actualizarMacrosLista(nuevas: MacroTirada[]): void {
    if (onMacros) {
      onMacros(nuevas);
    } else {
      setMacrosLocales(nuevas);
      guardarMacrosLocales(nuevas);
    }
  }

  function abrirNuevaMacro(): void {
    setMacroEditandoId(null);
    setMacroNombre("");
    setMacroIcono("sword");
    setMacroGrupos([{ id: `m-${Date.now()}-0`, cantidad: 1, caras: 20 }]);
    setMacroBonificador(0);
    setMacrosAbierto(false);
    setMacroModalAbierto(true);
  }

  function abrirEditarMacro(macro: MacroTirada): void {
    setMacroEditandoId(macro.id);
    setMacroNombre(macro.nombre);
    setMacroIcono(macro.icono);
    setMacroGrupos(
      macro.grupos.map((g, idx) => ({
        id: `m-${Date.now()}-${idx}`,
        cantidad: g.cantidad,
        caras: g.caras
      }))
    );
    setMacroBonificador(macro.bonificador);
    setMacrosAbierto(false);
    setMacroModalAbierto(true);
  }

  function duplicarMacro(macro: MacroTirada): void {
    const copia: MacroTirada = {
      ...macro,
      id: nuevoId(),
      nombre: `${macro.nombre} (copia)`.slice(0, 40),
      grupos: macro.grupos.map(g => ({ ...g }))
    };
    actualizarMacrosLista([...macrosLista, copia]);
  }

  function eliminarMacro(id: string): void {
    actualizarMacrosLista(macrosLista.filter(m => m.id !== id));
  }

  function agregarGrupoMacro(): void {
    setMacroGrupos(prev => {
      if (prev.length >= 6) return prev;
      return [...prev, { id: `m-${Date.now()}-${prev.length}`, cantidad: 1, caras: 6 }];
    });
  }

  function actualizarGrupoMacro(
    id: string,
    patch: Partial<Pick<GrupoDado, "cantidad" | "caras">>
  ): void {
    setMacroGrupos(prev =>
      prev.map(g => (g.id === id ? { ...g, ...patch } : g))
    );
  }

  function eliminarGrupoMacro(id: string): void {
    setMacroGrupos(prev => (prev.length > 1 ? prev.filter(g => g.id !== id) : prev));
  }

  function guardarMacroFormulario(): void {
    const formula = formatearFormulaCompuesta(macroGrupos, macroBonificador);
    const nombreLimpio = (macroNombre.trim() || formula).slice(0, 40);
    const gruposLimpios = macroGrupos.map(g => ({
      cantidad: Math.round(limitar(g.cantidad, 1, 20)),
      caras: g.caras
    }));
    const modLimpio = Math.round(limitar(macroBonificador, -99, 99));

    if (macroEditandoId) {
      actualizarMacrosLista(
        macrosLista.map(m =>
          m.id === macroEditandoId
            ? {
                ...m,
                nombre: nombreLimpio,
                icono: macroIcono,
                grupos: gruposLimpios,
                bonificador: modLimpio
              }
            : m
        )
      );
    } else {
      const nueva: MacroTirada = {
        id: nuevoId(),
        nombre: nombreLimpio,
        icono: macroIcono,
        grupos: gruposLimpios,
        bonificador: modLimpio
      };
      actualizarMacrosLista([...macrosLista, nueva]);
    }
    setMacroModalAbierto(false);
    setMacrosAbierto(true);
  }

  function lanzarMacro(macro: MacroTirada): void {
    setMacrosAbierto(false);
    const gruposMacro: GrupoDado[] = macro.grupos.map((g, idx) => ({
      id: `m-roll-${idx}`,
      cantidad: g.cantidad,
      caras: g.caras
    }));
    tirarDado(gruposMacro, macro.bonificador, {
      forzarPublica: !macroSecreta,
      forzarSecreta: macroSecreta,
      nombreMacro: macro.nombre
    });
  }

  function tirarDado(
    gruposOverride?: GrupoDado[],
    bonificadorOverride?: number,
    opciones?: {
      rapido?: boolean;
      forzarPublica?: boolean;
      forzarSecreta?: boolean;
      nombreMacro?: string;
    }
  ): void {
    if (tirando) return;

    if (ocultarResultado.current !== null) {
      window.clearTimeout(ocultarResultado.current);
      ocultarResultado.current = null;
    }

    const gruposActivos = (
      gruposOverride ?? [{ id: "normal", cantidad: cantidadDados, caras: tipoDado }]
    ).map(g => ({
      ...g,
      cantidad: Math.round(limitar(g.cantidad, 1, 20))
    }));
    const mod = Math.round(limitar(bonificadorOverride ?? bonificador, -99, 99));
    const oculta = opciones?.forzarPublica
      ? false
      : opciones?.forzarSecreta
        ? true
        : tiradaSecreta;
    const esSecretaMaster = esMaster && oculta;
    const esSoloMaster = !esMaster && oculta;
    const totalPasos = opciones?.rapido ? 8 : 12;
    const intervaloMs = opciones?.rapido ? 55 : 70;

    reproducirSonidoRoll();

    setSelectorAbierto(false);
    setCompuestaAbierta(false);
    setMacrosAbierto(false);
    setTirando(true);
    let pasos = 0;

    const tick = () => {
      setTirada({
        ...lanzarGruposDados(gruposActivos, mod),
        secreta: esSecretaMaster || esSoloMaster
      });
      pasos += 1;

      if (pasos < totalPasos) {
        temporizador.current = window.setTimeout(tick, intervaloMs);
      } else {
        const resultadoBruto = lanzarGruposDados(gruposActivos, mod);
        const resultadoFinal: ResultadoTirada = opciones?.nombreMacro
          ? {
              ...resultadoBruto,
              formula: `${opciones.nombreMacro} · ${resultadoBruto.formula}`
            }
          : resultadoBruto;
        setTirada({
          ...resultadoFinal,
          secreta: esSecretaMaster || esSoloMaster
        });
        setTirando(false);

        if (!esSecretaMaster) {
          if (onTiradaPublica) {
            void onTiradaPublica({
              ...resultadoFinal,
              ...(esSoloMaster ? { soloMaster: true } : {})
            });
          } else {
            const miAsiento =
              jugadores.find(j => (j.userId ?? j.id) === miUsuarioId)?.id ??
              "master";
            const tieneDesglose =
              resultadoFinal.dados.length > 1 || resultadoFinal.bonificador !== 0;
            const modTxt =
              resultadoFinal.bonificador > 0
                ? ` + ${resultadoFinal.bonificador}`
                : resultadoFinal.bonificador < 0
                  ? ` - ${Math.abs(resultadoFinal.bonificador)}`
                  : "";
            const desglose = tieneDesglose
              ? `${resultadoFinal.dados.join(" + ")}${modTxt} = ${resultadoFinal.total}`
              : undefined;
            mostrarD20Local(
              miAsiento,
              resultadoFinal.total,
              resultadoFinal.especial,
              resultadoFinal.caras,
              desglose
            );
            reproducirSonidoTirada(resultadoFinal.especial);
            const autor = jugadores.find(j => (j.userId ?? j.id) === miUsuarioId);
            setMensajesLocales(prev => [
              ...prev,
              {
                id: `${Date.now()}-${Math.random()}`,
                autorId: miUsuarioId,
                autorNombre: autor?.nombre ?? "Máster",
                texto: `Tiró ${resultadoFinal.formula} → ${resultadoFinal.total}`,
                destinatarioId: esSoloMaster ? "master" : null,
                destinatarioNombre: esSoloMaster ? (hostName ?? "Máster") : null,
                createdAt: new Date().toISOString(),
                esSistema: true
              }
            ]);
          }
        }

        ocultarResultado.current = window.setTimeout(() => {
          setTirada(null);
          ocultarResultado.current = null;
        }, DURACION_RESULTADO);
      }
    };

    tick();
  }

  async function copiarConfiguracion(): Promise<void> {
    const texto = JSON.stringify(calibracion, null, 2);

    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Configuración copiada al portapapeles.");
    } catch {
      mostrarAviso("No se pudo copiar. La configuración está en la consola.");
      console.log(texto);
    }
  }

  function crearPositMesa(): void {
    if (!onElementosMesa) return;
    setSelectorAbierto(false);
    const desplazamiento = (positsVisibles.length % 5) * 3;
    const posit: ElementoMesa = {
      id: nuevoId(),
      tipo: "posit",
      texto: "",
      color: COLORES_POSIT[3].valor,
      x: limitar(24 + desplazamiento, 8, 92),
      y: limitar(34 + desplazamiento, 12, 88),
      giro: (Math.random() - 0.5) * 4,
      archivado: false,
      autorNombre: esMaster ? "Máster" : nombreJugador,
      autorColor: esMaster ? "#e8c56a" : colorJugador,
      esMaster: Boolean(esMaster)
    };
    onElementosMesa(prev => [...prev, posit]);
    setPositActivo(posit.id);
  }

  function iniciarPositMesa(
    evento: ReactPointerEvent,
    posit: PositPreview
  ): void {
    const rect = capaPosits.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    evento.stopPropagation();
    arrastre.current = {
      tipo: "posit-mesa",
      id: posit.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: { x: posit.x, y: posit.y },
      medidas: { width: rect.width, height: rect.height }
    };
    setPositActivo(posit.id);
  }

  function cambiarTextoPositMesa(id: string, texto: string): void {
    onElementosMesa?.(prev =>
      prev.map(el =>
        el.id === id && el.tipo === "posit" ? { ...el, texto } : el
      )
    );
  }

  function cambiarColorPositMesa(id: string, color: string): void {
    onElementosMesa?.(prev =>
      prev.map(el =>
        el.id === id && el.tipo === "posit" ? { ...el, color } : el
      )
    );
  }

  function archivarPositMesa(id: string): void {
    onElementosMesa?.(prev =>
      prev.map(el =>
        el.id === id ? { ...el, archivado: true } : el
      )
    );
    setPositActivo(actual => (actual === id ? null : actual));
    mostrarAviso("Posit archivado.");
  }

  function borrarPositMesa(id: string): void {
    onElementosMesa?.(prev => prev.filter(el => el.id !== id));
    setPositActivo(actual => (actual === id ? null : actual));
  }

  function iniciarDocMesa(
    evento: ReactPointerEvent,
    doc: { id: string; x: number; y: number }
  ): void {
    const rect = capaPosits.current?.getBoundingClientRect();
    if (!rect) return;

    evento.stopPropagation();
    setPositActivo(null);
    arrastreDocMovido.current = false;
    arrastre.current = {
      tipo: "doc-mesa",
      id: doc.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      movido: false,
      base: { x: doc.x, y: doc.y },
      medidas: { width: rect.width, height: rect.height }
    };
  }

  function archivarDocMesa(id: string): void {
    onElementosMesa?.(prev =>
      prev.map(el => (el.id === id ? { ...el, archivado: true } : el))
    );
    setVisorDoc(actual => (actual?.id === id ? null : actual));
    mostrarAviso("Documento archivado.");
  }

  const centro = centroide(calibracion.mapa);
  const jugadorSeleccionado =
    jugadores.find(j => j.activo && j.id === jugadorSeleccionadoId && j.id !== yoAsientoId) ??
    null;
  jugadorSeleccionadoRef.current = jugadorSeleccionado;

  function abrirCompartirDesdePelota(jugadorId: string): void {
    if (compartirAbierto && jugadorSeleccionadoId === jugadorId) {
      setCompartirAbierto(false);
      setJugadorSeleccionadoId(null);
      setAnclaCompartir(null);
      return;
    }

    const nodo = asientoRefs.current.get(jugadorId);
    if (nodo) {
      const rect = nodo.getBoundingClientRect();
      setAnclaCompartir({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10,
        origen: "pelota"
      });
    } else {
      setAnclaCompartir(null);
    }

    setJugadorSeleccionadoId(jugadorId);
    setSelectorAbierto(false);
    setCompartirAbierto(true);
    onSolicitarArchivos?.();
  }

  function alternarCompartirDesdeChat(ancla?: { left: number; bottom: number }): void {
    setCompartirAbierto(abierto => {
      const siguiente = !abierto;
      if (siguiente) {
        setAnclaCompartir(
          ancla
            ? { x: ancla.left, y: ancla.bottom + 8, origen: "chat" }
            : null
        );
        setSelectorAbierto(false);
        onSolicitarArchivos?.();
      } else {
        setAnclaCompartir(null);
      }
      return siguiente;
    });
  }

  async function enviarArchivosEnDrop(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    if (!jugadorSeleccionado) {
      mostrarAviso("Elige primero un jugador para enviarle el archivo.");
      return;
    }
    if (!onEnviarElemento) return;

    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";
    setSubiendoDrop(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const subido = await archivosApi.subir(file);
          setArchivosSubidosLocal(prev =>
            prev.some(a => a.id === subido.id) ? prev : [subido, ...prev]
          );
          onSolicitarArchivos?.();
          await onEnviarElemento(
            jugadorSeleccionado,
            crearElementoDesdeArchivo(subido, { x: 78, y: 78 })
          );
        } catch (subidaError) {
          if (!esPreview) {
            mostrarAviso(
              `No se pudo subir "${file.name}": ${describeError(subidaError)}`
            );
            continue;
          }
          const tipo = file.type || "application/octet-stream";
          const vista = tipo.startsWith("image/")
            ? "imagen"
            : tipo === "application/pdf"
              ? "pdf"
              : tipo.startsWith("text/")
                ? "texto"
                : "descarga";
          await onEnviarElemento(jugadorSeleccionado, {
            id: nuevoIdElemento(),
            tipo: "archivo",
            archivoId: nuevoIdElemento(),
            nombre: file.name,
            mime: tipo,
            vista,
            tamano: file.size,
            x: 78,
            y: 78,
            contenidoLocal: URL.createObjectURL(file)
          });
        }
      }
    } finally {
      setSubiendoDrop(false);
    }
  }

  async function subirArchivosDesdeBarra(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;

    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";
    setSubiendoBarra(true);
    let subidos = 0;
    try {
      for (const file of Array.from(files)) {
        const tipoLocal = file.type || "application/octet-stream";
        const vistaLocal = tipoLocal.startsWith("image/")
          ? "imagen"
          : tipoLocal === "application/pdf" || file.name.endsWith(".pdf")
            ? "pdf"
            : file.name.endsWith(".docx")
              ? "docx"
              : tipoLocal.startsWith("text/") || file.name.endsWith(".txt")
                ? "texto"
                : "ninguna";

        try {
          const creado = await archivosApi.subir(file);
          setArchivosSubidosLocal(prev =>
            prev.some(a => a.id === creado.id) ? prev : [creado, ...prev]
          );
          onSolicitarArchivos?.();
          onElementosMesa?.(prev => {
            const paso = prev.filter(el => el.tipo === "archivo" && !el.archivado).length % 5;
            return [
              ...prev,
              {
                id: creado.id,
                tipo: "archivo",
                archivoId: creado.id,
                nombre: creado.nombre,
                mime: creado.tipo,
                vista: creado.vista,
                tamano: creado.tamano,
                x: 28 + paso * 4.5,
                y: 66 - paso * 3
              }
            ];
          });
          subidos += 1;
        } catch (subidaError) {
          if (!esPreview) {
            mostrarAviso(
              `No se pudo subir "${file.name}": ${describeError(subidaError)}`
            );
            continue;
          }
          const url = URL.createObjectURL(file);
          onElementosMesa?.(prev => {
            const paso = prev.filter(el => el.tipo === "archivo" && !el.archivado).length % 5;
            const idLocal = nuevoId();
            return [
              ...prev,
              {
                id: idLocal,
                tipo: "archivo",
                archivoId: idLocal,
                nombre: file.name,
                mime: tipoLocal,
                vista: vistaLocal,
                tamano: file.size,
                x: 28 + paso * 4.5,
                y: 66 - paso * 3,
                contenidoLocal: url
              }
            ];
          });
          subidos += 1;
        }
      }

      if (subidos > 0) {
        mostrarAviso(
          subidos === 1
            ? "Archivo subido y puesto en la mesa."
            : `${subidos} archivos subidos y puestos en la mesa.`
        );
      }
    } finally {
      setSubiendoBarra(false);
    }
  }

  function iniciarBandejaElemento(
    elemento: ElementoMesa,
    evento: ReactPointerEvent
  ): void {
    if (ajuste) return;
    evento.stopPropagation();
    arrastre.current = {
      tipo: "bandeja-elemento",
      elemento,
      inicioX: evento.clientX,
      inicioY: evento.clientY
    };
  }

  function colocarEnMesa(elemento: ElementoMesa): void {
    onElementosMesa?.(prev => {
      const paso = prev.length % 5;
      return [
        ...prev,
        {
          ...elemento,
          id: nuevoIdElemento(),
          x: 78 - paso * 2.5,
          y: 78 - paso * 2.2
        }
      ];
    });
  }

  function crearPositEnMesa(evento: React.FormEvent): void {
    evento.preventDefault();
    const texto = nuevoPositTexto.trim();
    if (!texto) return;

    colocarEnMesa({
      id: nuevoIdElemento(),
      tipo: "posit",
      texto,
      color: nuevoPositColor,
      giro: -1.5,
      x: 78,
      y: 78
    });
    setNuevoPositTexto("");
  }

  function emitirDivisaLocal(delta: number, total: number): void {
    if (delta === 0) return;
    reproducirSonidoMonedas();
    const miAsiento =
      jugadores.find(j => (j.userId ?? j.id) === miUsuarioId)?.id ?? "master";
    const idDelta = `${Date.now()}-${Math.random()}`;
    setDivisaAsientoLocales(prev => ({
      ...prev,
      [miAsiento]: { id: idDelta, delta }
    }));
    window.setTimeout(() => {
      setDivisaAsientoLocales(prev => {
        if (prev[miAsiento]?.id !== idDelta) return prev;
        const copia = { ...prev };
        delete copia[miAsiento];
        return copia;
      });
    }, 3200);
    const autor = jugadores.find(j => (j.userId ?? j.id) === miUsuarioId);
    const signo = delta > 0 ? `+${delta}` : String(delta);
    setMensajesLocales(prev => [
      ...prev,
      {
        id: `divisa-${Date.now()}-${Math.random()}`,
        autorId: miUsuarioId,
        autorNombre: autor?.nombre ?? "Máster",
        texto: `${signo} ${divisaNombre} (Total: ${total})`,
        destinatarioId: null,
        destinatarioNombre: null,
        createdAt: new Date().toISOString(),
        esSistema: true,
        esDivisa: true
      }
    ]);
  }

  function modificarDivisa(deltaBruto: number, inmediato = false): void {
    const actual = divisaActualRef.current;
    const nuevo = Math.max(0, Math.min(999_999_999_999, Math.trunc(actual + deltaBruto)));
    const deltaReal = nuevo - actual;
    if (deltaReal === 0) return;

    if (divisa === undefined) {
      setDivisaLocal(nuevo);
      guardarDivisaLocal(nuevo);
    }

    if (inmediato) {
      if (divisaDebounceRef.current.timer !== null) {
        window.clearTimeout(divisaDebounceRef.current.timer);
        divisaDebounceRef.current.timer = null;
      }
      const deltaTotal = divisaDebounceRef.current.acumulado + deltaReal;
      divisaDebounceRef.current.acumulado = 0;
      if (onCambiarDivisaRef.current) {
        void onCambiarDivisaRef.current(nuevo, deltaTotal);
      } else {
        emitirDivisaLocal(deltaTotal, nuevo);
      }
      return;
    }

    if (onCambiarDivisaRef.current && divisa !== undefined) {
      // Actualización optimista pasando delta 0 hasta que venza el debounce
      void onCambiarDivisaRef.current(nuevo, 0);
    }

    divisaDebounceRef.current.acumulado += deltaReal;
    if (divisaDebounceRef.current.timer !== null) {
      window.clearTimeout(divisaDebounceRef.current.timer);
    }
    divisaDebounceRef.current.timer = window.setTimeout(() => {
      const deltaAcum = divisaDebounceRef.current.acumulado;
      divisaDebounceRef.current.acumulado = 0;
      divisaDebounceRef.current.timer = null;
      if (deltaAcum === 0) return;
      if (onCambiarDivisaRef.current) {
        void onCambiarDivisaRef.current(divisaActualRef.current, deltaAcum);
      } else {
        emitirDivisaLocal(deltaAcum, divisaActualRef.current);
      }
    }, 750);
  }

  function actualizarListaMochila(updater: (prev: ObjetoMochila[]) => ObjetoMochila[]): void {
    if (onMochila) {
      onMochila(updater);
    } else {
      setMochilaLocal(prev => {
        const next = updater(prev);
        guardarMochilaLocal(next);
        return next;
      });
    }
  }

  async function subirImagenObjeto(file: File): Promise<void> {
    setSubiendoObjetoImg(true);
    try {
      const cuadrada = await recortarImagenCuadrada(file);
      if (onCambiarDivisa) {
        const subido = await archivosApi.subir(cuadrada);
        setNuevoObjArchivo({
          archivoId: subido.id,
          archivoNombre: subido.nombre
        });
        onSolicitarArchivos?.();
      } else {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Error leyendo imagen"));
          reader.readAsDataURL(cuadrada);
        });
        setNuevoObjArchivo({
          archivoNombre: cuadrada.name,
          imagenLocal: dataUrl
        });
      }
    } catch (e) {
      mostrarAviso(describeError(e));
    } finally {
      setSubiendoObjetoImg(false);
    }
  }

  function crearObjetoMochila(evento: React.FormEvent): void {
    evento.preventDefault();
    const nombre = nuevoObjNombre.trim().slice(0, 60);
    if (!nombre) return;
    const cantidad = Math.max(1, Math.min(9999, Math.trunc(nuevoObjCantidad || 1)));
    const nuevo: ObjetoMochila = {
      id: nuevoIdElemento(),
      nombre,
      descripcion: nuevoObjDesc.trim().slice(0, 1000),
      cantidad,
      ...(nuevoObjArchivo?.archivoId
        ? {
            archivoId: nuevoObjArchivo.archivoId,
            archivoNombre: nuevoObjArchivo.archivoNombre
          }
        : nuevoObjArchivo?.imagenLocal
          ? {
              imagenLocal: nuevoObjArchivo.imagenLocal,
              archivoNombre: nuevoObjArchivo.archivoNombre
            }
          : { emoji: nuevoObjEmoji })
    };
    actualizarListaMochila(prev => [...prev, nuevo]);
    setNuevoObjNombre("");
    setNuevoObjDesc("");
    setNuevoObjCantidad(1);
    setNuevoObjArchivo(null);
    setCreandoObjeto(false);
    setObjetoMochilaId(nuevo.id);
  }

  function consumirObjetoMochila(id: string): void {
    reproducirSonidoConsumir();
    actualizarListaMochila(prev =>
      prev.flatMap(item => {
        if (item.id !== id) return [item];
        const restante = item.cantidad - 1;
        if (restante <= 0) {
          setObjetoMochilaId(null);
          return [];
        }
        return [{ ...item, cantidad: restante }];
      })
    );
  }

  function eliminarObjetoMochila(id: string): void {
    actualizarListaMochila(prev => prev.filter(item => item.id !== id));
    setObjetoMochilaId(actual => (actual === id ? null : actual));
    setPasandoObjetoId(actual => (actual === id ? null : actual));
  }

  function ponerObjetoEnMesa(objeto: ObjetoMochila): void {
    colocarEnMesa({
      id: nuevoIdElemento(),
      tipo: "objeto",
      nombre: objeto.nombre,
      descripcion: objeto.descripcion,
      cantidad: objeto.cantidad,
      ...(objeto.emoji ? { emoji: objeto.emoji } : {}),
      ...(objeto.archivoId ? { archivoId: objeto.archivoId } : {}),
      ...(objeto.archivoNombre ? { archivoNombre: objeto.archivoNombre } : {}),
      ...(objeto.imagenLocal ? { imagenLocal: objeto.imagenLocal } : {}),
      x: 78,
      y: 78
    });
    eliminarObjetoMochila(objeto.id);
    setMochilaAbierta(false);
  }

  function guardarObjetoMesaEnMochila(
    obj: Extract<ElementoMesa, { tipo: "objeto" }>
  ): void {
    actualizarListaMochila(prev => [
      ...prev,
      {
        id: nuevoIdElemento(),
        nombre: obj.nombre,
        descripcion: obj.descripcion,
        cantidad: obj.cantidad,
        ...(obj.emoji ? { emoji: obj.emoji } : {}),
        ...(obj.archivoId ? { archivoId: obj.archivoId } : {}),
        ...(obj.archivoNombre ? { archivoNombre: obj.archivoNombre } : {}),
        ...(obj.imagenLocal ? { imagenLocal: obj.imagenLocal } : {})
      }
    ]);
    onElementosMesa?.(prev => prev.filter(el => el.id !== obj.id));
    setObjetoMesaActivo(null);
  }

  function consumirObjetoMesa(
    obj: Extract<ElementoMesa, { tipo: "objeto" }>
  ): void {
    reproducirSonidoConsumir();
    const restante = obj.cantidad - 1;
    if (restante <= 0) {
      onElementosMesa?.(prev => prev.filter(el => el.id !== obj.id));
      setObjetoMesaActivo(null);
    } else {
      const actualizado = { ...obj, cantidad: restante };
      onElementosMesa?.(prev =>
        prev.map(el => (el.id === obj.id ? actualizado : el))
      );
      setObjetoMesaActivo(actualizado);
    }
  }

  function iniciarObjetoMesa(
    evento: ReactPointerEvent,
    obj: { id: string; x: number; y: number }
  ): void {
    const rect = capaPosits.current?.getBoundingClientRect();
    if (!rect) return;
    evento.stopPropagation();
    setPositActivo(null);
    arrastreDocMovido.current = false;
    arrastre.current = {
      tipo: "objeto-mesa",
      id: obj.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      movido: false,
      base: { x: obj.x, y: obj.y },
      medidas: { width: rect.width, height: rect.height }
    };
  }

  function iniciarMochilaObjeto(
    evento: ReactPointerEvent,
    objeto: ObjetoMochila
  ): void {
    if (evento.button !== 0) return;
    arrastre.current = {
      tipo: "mochila-objeto",
      objeto,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      movido: false
    };
  }

  const mensajesVisibles = mensajesChat ?? mensajesLocales;
  const tiradasVisibles = tiradasAsiento ?? tiradasAsientoLocales;
  const divisaAsientoVisibles = divisaAsiento ?? divisaAsientoLocales;
  const positsVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "posit" }> =>
      el.tipo === "posit" && !el.archivado
  );
  const positsArchivadosCount = elementosMesa.filter(
    el => el.tipo === "posit" && Boolean(el.archivado)
  ).length;
  const docsVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "archivo" }> =>
      el.tipo === "archivo" && !el.archivado
  );
  const objetosVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "objeto" }> =>
      el.tipo === "objeto" && !el.archivado
  );
  const objetoSeleccionado =
    mochilaActual.find(item => item.id === objetoMochilaId) ?? null;

  return (
    <div
      className="sala"
      onPointerDown={evento => {
        if (!(evento.target as HTMLElement).closest(".posit")) {
          setPositActivo(null);
        }
      }}
    >
      <div className="sala-escena">
        <div
          ref={plano}
          className={`sala-plano${ajuste ? " ajuste" : ""}`}
          style={{ backgroundImage: `url(${FONDO_SALA})` }}
        >
          {ajuste ? (
            <div
              className="rect-calibrado rect-pizarra"
              style={estiloRect(calibracion.pizarra)}
              onPointerDown={iniciarPizarra}
            >
              <span className="rect-calibrado-etiqueta">pizarra</span>
              <span className="rect-tirador" onPointerDown={iniciarPizarraTam} />
            </div>
          ) : imagenEscena ? (
            <div
              className="sala-hotspot hotspot-pizarra con-escena"
              style={estiloRect(calibracion.pizarra)}
            >
              <button
                type="button"
                className="sala-pizarra-escena-btn"
                onClick={() => setVisorEscena(true)}
                title={
                  imagenEscena.titulo
                    ? `Ver en grande: ${imagenEscena.titulo}`
                    : "Ver imagen de escena en grande"
                }
              >
                <img
                  className="sala-pizarra-escena-img"
                  src={urlImagenEscena(imagenEscena)}
                  alt={imagenEscena.titulo ?? "Escena de campaña"}
                />
                {imagenEscena.titulo && (
                  <span className="sala-pizarra-escena-titulo">
                    {imagenEscena.titulo}
                  </span>
                )}
              </button>

              <div className="sala-pizarra-acciones">
                <button
                  type="button"
                  className="sala-pizarra-chip"
                  onClick={() => setVisorEscena(true)}
                >
                  Ampliar
                </button>
                <button
                  type="button"
                  className="sala-pizarra-chip"
                  onClick={onAbrirPizarra}
                >
                  Pizarra
                </button>
                {esMaster && onCambiarEscena && (
                  <button
                    type="button"
                    className="sala-pizarra-chip quitar"
                    title="Quitar escena de la pizarra"
                    aria-label="Quitar escena de la pizarra"
                    onClick={() => onCambiarEscena(null)}
                  >
                    <X size={12} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="sala-hotspot hotspot-pizarra"
              style={estiloRect(calibracion.pizarra)}
              onClick={onAbrirPizarra}
              title="Abrir la pizarra"
            >
              <span>Abrir pizarra</span>
            </button>
          )}

          <svg
            className="mapa-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden={ajuste ? "true" : undefined}
          >
            <polygon
              className={ajuste ? "mapa-poligono-ajuste" : "mapa-poligono"}
              points={puntosSvg(calibracion.mapa)}
              role={ajuste ? undefined : "button"}
              tabIndex={ajuste ? undefined : 0}
              aria-label={ajuste ? undefined : "Abrir el mapa"}
              onClick={ajuste ? undefined : onAbrirMapa}
              onKeyDown={
                ajuste
                  ? undefined
                  : evento => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      onAbrirMapa();
                    }
                  }
              }
              onPointerEnter={ajuste ? undefined : () => setSobreMapa(true)}
              onPointerLeave={ajuste ? undefined : () => setSobreMapa(false)}
              onFocus={ajuste ? undefined : () => setSobreMapa(true)}
              onBlur={ajuste ? undefined : () => setSobreMapa(false)}
            />
          </svg>

          {ajuste ? (
            <>
              <span
                className="mapa-etiqueta-ajuste"
                style={{ left: `${centro.x}%`, top: `${centro.y}%` }}
              >
                mapa
              </span>
              {calibracion.mapa.vertices.map((vertice, indice) => (
                <span
                  key={indice}
                  className="mapa-vertice"
                  style={{ left: `${vertice.x}%`, top: `${vertice.y}%` }}
                  onPointerDown={evento => iniciarVertice(indice, evento)}
                />
              ))}
            </>
          ) : (
            sobreMapa && (
              <span
                className="mapa-etiqueta-flotante"
                style={{ left: `${centro.x}%`, top: `${centro.y}%` }}
              >
                Abrir mapa
              </span>
            )
          )}

          {jugadores
            .filter(jugador => jugador.activo)
            .map(jugador => {
              const asiento = calibracion.asientos[jugador.id] ?? { x: 50, y: 50 };
              const esMio = jugador.id === yoAsientoId;
              const seleccionado = !ajuste && jugadorSeleccionado?.id === jugador.id;
              const destinoValido = !ajuste && arrastrandoItemId !== null && !esMio;
              const destinoActivo = destinoValido && asientoSobreId === jugador.id;
              const tiradaSobreAsiento = tiradasVisibles[jugador.id];
              const divisaDeltaSobreAsiento = divisaAsientoVisibles[jugador.id];
              const estilo = {
                left: `${asiento.x}%`,
                top: `${asiento.y}%`,
                "--color": jugador.color
              } as CSSProperties;

              return (
                <div
                  key={jugador.id}
                  ref={nodo => {
                    if (nodo) {
                      asientoRefs.current.set(jugador.id, nodo);
                    } else {
                      asientoRefs.current.delete(jugador.id);
                    }
                  }}
                  data-asiento-id={jugador.id}
                  role={ajuste || esMio ? undefined : "button"}
                  tabIndex={ajuste || esMio ? undefined : 0}
                  aria-pressed={ajuste || esMio ? undefined : seleccionado}
                  aria-label={
                    ajuste || esMio
                      ? undefined
                      : `Seleccionar a ${jugador.nombre}`
                  }
                  className={[
                    "asiento",
                    jugador.esMaster ? "master" : "",
                    ajuste ? "ajustable" : "",
                    !ajuste && !esMio ? "interactivo" : "",
                    seleccionado ? "seleccionado" : "",
                    destinoValido ? "destino-valido" : "",
                    destinoActivo ? "destino-activo" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={estilo}
                  onPointerDown={
                    ajuste ? evento => iniciarAsiento(jugador.id, evento) : undefined
                  }
                  onClick={
                    ajuste || esMio
                      ? undefined
                      : () => abrirCompartirDesdePelota(jugador.id)
                  }
                  onKeyDown={
                    ajuste || esMio
                      ? undefined
                      : evento => {
                          if (evento.key === "Enter" || evento.key === " ") {
                            evento.preventDefault();
                            abrirCompartirDesdePelota(jugador.id);
                          }
                        }
                  }
                >
                  {tiradaSobreAsiento && !ajuste && (
                    <div
                      key={tiradaSobreAsiento.id}
                      className={`asiento-d20${tiradaSobreAsiento.especial ? ` ${tiradaSobreAsiento.especial}` : ""}`}
                      aria-label={`Tirada de ${jugador.nombre}: ${tiradaSobreAsiento.total}`}
                    >
                      {tiradaSobreAsiento.desglose && (
                        <span className="asiento-d20-suma">
                          {tiradaSobreAsiento.desglose}
                        </span>
                      )}
                      <IconoDadoPoligono
                        caras={tiradaSobreAsiento.caras ?? 20}
                        valor={tiradaSobreAsiento.total}
                      />
                    </div>
                  )}
                  {divisaDeltaSobreAsiento && !ajuste && (
                    <div
                      key={divisaDeltaSobreAsiento.id}
                      className={`asiento-divisa-delta${divisaDeltaSobreAsiento.delta > 0 ? " positivo" : " negativo"}`}
                      aria-label={`Cambio de divisa de ${jugador.nombre}: ${divisaDeltaSobreAsiento.delta}`}
                    >
                      {divisaDeltaSobreAsiento.delta > 0
                        ? `+${divisaDeltaSobreAsiento.delta}`
                        : divisaDeltaSobreAsiento.delta}
                    </div>
                  )}
                  <span className="esfera" />
                  <span className="asiento-nombre">
                    {jugador.nombre}
                    {esMio ? " (tú)" : ""}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="sala-vineta" aria-hidden="true" />

      {ajuste ? (
        <div
          className="rect-calibrado rect-chat rect-chat-pantalla"
          style={estiloRect(calibracion.chat)}
          onPointerDown={iniciarChat}
        >
          <span className="rect-calibrado-etiqueta">chat</span>
          <span className="rect-tirador" onPointerDown={iniciarChatTam} />
        </div>
      ) : (
        <ChatSala
          rect={calibracion.chat}
          jugadores={jugadores}
          miUsuarioId={miUsuarioId}
          mensajes={mensajesVisibles}
          onEnviarMensaje={onEnviarChat ?? enviarChatLocal}
          onIniciarArrastre={iniciarChat}
          onIniciarRedimension={iniciarChatTam}
          compartirAbierto={compartirAbierto && !ajuste}
          onToggleCompartir={alternarCompartirDesdeChat}
        />
      )}

          <div className={`sala-barra${esMaster ? " sala-barra-master" : ""}`}>
            <div className="sala-barra-grupo">
              <button type="button" className="sala-btn" onClick={onVolver}>
                <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>Sala de espera</span>
              </button>
              <span className="sala-titulo-visible">
                SALA DE {hostName ? hostName.toUpperCase() : "MESA"}
              </span>
              {esMaster && (
                <span className="master-pill-badge">
                  <Crown size={12} strokeWidth={2.2} aria-hidden="true" />
                  <span>MODO MÁSTER</span>
                </span>
              )}
              <button
                type="button"
                className={`sala-btn${ajuste ? " activo" : ""}`}
                onClick={() => setAjuste(valor => !valor)}
              >
                {ajuste ? "Terminar ajuste" : "Ajustar"}
              </button>

              <input
                ref={barraFileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                multiple
                hidden
                onChange={e => {
                  void subirArchivosDesdeBarra(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="sala-btn sala-btn-subir"
                disabled={subiendoBarra}
                onClick={() => barraFileInputRef.current?.click()}
                title="Subir archivo desde tu equipo a la sala"
              >
                <Upload size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>{subiendoBarra ? "Subiendo…" : "Subir archivo"}</span>
              </button>

              <button
                type="button"
                className={`sala-btn${sonidoSilenciado ? " activo" : ""}`}
                onClick={alternarSilencio}
                title={
                  sonidoSilenciado
                    ? "Sonidos silenciados (pulsa para activar)"
                    : "Silenciar sonidos"
                }
                aria-label={
                  sonidoSilenciado ? "Activar sonidos" : "Silenciar sonidos"
                }
                aria-pressed={sonidoSilenciado}
              >
                {sonidoSilenciado ? (
                  <VolumeX size={14} strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <Volume2 size={14} strokeWidth={2.2} aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                className={`sala-btn hud-barra-movil${divisaAbierta ? " activo" : ""}`}
                onClick={() => {
                  setMochilaAbierta(false);
                  setDivisaAbierta(v => !v);
                }}
                title={`${divisaNombre}: ${divisaActual.toLocaleString("es-ES")}`}
              >
                <IconoMonedasPixel size={20} />
                <span>{formatearDivisaCompacta(divisaActual)}</span>
              </button>

              <button
                type="button"
                className={`sala-btn hud-barra-movil${mochilaAbierta ? " activo" : ""}`}
                onClick={() => {
                  setDivisaAbierta(false);
                  setMasterDivisasAbierto(false);
                  setMasterMochilasAbierto(false);
                  setMochilaAbierta(v => !v);
                }}
                title="Abrir mochila"
              >
                <IconoMochilaPixel size={20} />
                <span>{mochilaActual.length}</span>
              </button>

              {esMaster && (
                <>
                  <button
                    type="button"
                    className={`sala-btn hud-barra-movil${masterDivisasAbierto ? " activo" : ""}`}
                    onClick={() => alternarPanelMaster("divisas")}
                    title={`Ver ${divisaNombre} de jugadores`}
                    aria-label={`Ver ${divisaNombre} de jugadores`}
                  >
                    <IconoBilletePixel size={18} />
                  </button>
                  <button
                    type="button"
                    className={`sala-btn hud-barra-movil${masterMochilasAbierto ? " activo" : ""}`}
                    onClick={() => alternarPanelMaster("mochilas")}
                    title="Inspeccionar mochilas de jugadores"
                    aria-label="Inspeccionar mochilas de jugadores"
                  >
                    <IconoLupaPixel size={18} />
                  </button>
                </>
              )}

              {esMaster && imagenProyectada && (
                <div className="master-proyeccion-pill">
                  <span className="master-proyeccion-texto">
                    <Sparkles size={12} strokeWidth={2.2} aria-hidden="true" />
                    <span>
                      Proyectando: {imagenProyectada.titulo ?? "Imagen"}
                    </span>
                  </span>
                  {proyeccionOculta && onReabrirProyeccion && (
                    <button
                      type="button"
                      className="master-pill-mini-btn"
                      onClick={onReabrirProyeccion}
                    >
                      Ver
                    </button>
                  )}
                  {onProyectarImagen && (
                    <button
                      type="button"
                      className="master-pill-mini-btn quitar"
                      onClick={() => onProyectarImagen(null)}
                    >
                      Retirar
                    </button>
                  )}
                </div>
              )}

              {!esMaster && imagenProyectada && proyeccionOculta && onReabrirProyeccion && (
                <button
                  type="button"
                  className="sala-btn sala-btn-revelacion"
                  onClick={onReabrirProyeccion}
                >
                  <Eye size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>Ver imagen del Máster</span>
                </button>
              )}
            </div>
          </div>

          {!ajuste && (
            <div className="sala-hud-derecha" aria-label="Divisa y mochila">
              <div className="hud-divisa-caja">
                <span className="hud-divisa-titulo">{divisaNombre}</span>
                <div className="hud-divisa-fila">
                  <button
                    type="button"
                    className="hud-divisa-paso"
                    onClick={() => modificarDivisa(-divisaPaso)}
                    aria-label={`Restar ${divisaPaso} ${divisaNombre}`}
                    title={`Restar ${divisaPaso}`}
                  >
                    <Minus size={13} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`hud-divisa-centro${divisaAbierta ? " activo" : ""}`}
                    onClick={() => {
                      setMochilaAbierta(false);
                      setDivisaAbierta(v => !v);
                    }}
                    title={`${divisaNombre}: ${divisaActual.toLocaleString("es-ES")}`}
                    aria-expanded={divisaAbierta}
                  >
                    <IconoMonedasPixel size={38} />
                    <span className="hud-divisa-valor">
                      {formatearDivisaCompacta(divisaActual)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="hud-divisa-paso"
                    onClick={() => modificarDivisa(divisaPaso)}
                    aria-label={`Sumar ${divisaPaso} ${divisaNombre}`}
                    title={`Sumar ${divisaPaso}`}
                  >
                    <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                className={`hud-mochila-btn${mochilaAbierta ? " activo" : ""}`}
                onClick={() => {
                  setDivisaAbierta(false);
                  setMasterDivisasAbierto(false);
                  setMasterMochilasAbierto(false);
                  setMochilaAbierta(v => !v);
                }}
                aria-expanded={mochilaAbierta}
                title="Abrir mochila"
              >
                <IconoMochilaPixel size={40} />
                <span className="hud-mochila-texto">Mochila</span>
                {mochilaActual.length > 0 && (
                  <span className="hud-mochila-badge">{mochilaActual.length}</span>
                )}
              </button>

              {esMaster && (
                <div className="hud-master-fila" aria-label="Inspección del Máster">
                  <button
                    type="button"
                    className={`hud-master-cuadro${masterDivisasAbierto ? " activo" : ""}`}
                    onClick={() => alternarPanelMaster("divisas")}
                    aria-expanded={masterDivisasAbierto}
                    title={`Ver ${divisaNombre} de jugadores conectados`}
                    aria-label={`Ver ${divisaNombre} de jugadores conectados`}
                  >
                    <IconoBilletePixel size={26} />
                  </button>
                  <button
                    type="button"
                    className={`hud-master-cuadro${masterMochilasAbierto ? " activo" : ""}`}
                    onClick={() => alternarPanelMaster("mochilas")}
                    aria-expanded={masterMochilasAbierto}
                    title="Inspeccionar mochila y objetos de jugadores conectados"
                    aria-label="Inspeccionar mochila y objetos de jugadores conectados"
                  >
                    <IconoLupaPixel size={26} />
                  </button>
                </div>
              )}
            </div>
          )}

          {masterDivisasAbierto && esMaster && !ajuste && (
            <div
              className="divisa-popover master-resumen-popover"
              role="dialog"
              aria-label={`${divisaNombre} de jugadores conectados`}
            >
              <div className="dados-selector-cabecera">
                <span>{divisaNombre} · Conectados</span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="compartir-btn-sec"
                    onClick={() => void cargarResumenMaster()}
                    disabled={masterResumenCargando}
                  >
                    {masterResumenCargando ? "…" : "Actualizar"}
                  </button>
                  <button
                    type="button"
                    className="dados-cerrar"
                    onClick={() => setMasterDivisasAbierto(false)}
                    aria-label="Cerrar resumen de divisa"
                  >
                    <X size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {masterResumenCargando && masterResumenJugadores.length === 0 ? (
                <p className="dados-ayuda">Consultando sala…</p>
              ) : masterResumenJugadores.length === 0 ? (
                <p className="dados-ayuda">No hay jugadores conectados ahora mismo.</p>
              ) : (
                <ul className="master-divisa-lista">
                  {masterResumenJugadores.map(j => (
                    <li key={j.userId} className="master-divisa-item">
                      <span className="master-divisa-jugador">
                        <span
                          className="compartir-jugador-punto"
                          style={{ backgroundColor: j.color }}
                          aria-hidden="true"
                        />
                        <span>{j.nombre}</span>
                      </span>
                      <span
                        className="master-divisa-monto"
                        title={`${j.divisa.toLocaleString("es-ES")} ${divisaNombre}`}
                      >
                        {formatearDivisaCompacta(j.divisa)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {masterMochilasAbierto && esMaster && !ajuste && (
            <div
              className="mochila-backdrop"
              onClick={() => setMasterMochilasAbierto(false)}
            >
              <div
                className="mochila-modal master-inspeccion-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Inspeccionar inventario de jugadores conectados"
                onClick={e => e.stopPropagation()}
              >
                <div className="mochila-cabecera">
                  <span className="mochila-titulo">
                    <IconoLupaPixel size={22} />
                    <span>Inspeccionar jugadores</span>
                  </span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="mochila-volver-btn"
                      onClick={() => void cargarResumenMaster()}
                      disabled={masterResumenCargando}
                    >
                      {masterResumenCargando ? "Actualizando…" : "Actualizar"}
                    </button>
                    <button
                      type="button"
                      className="dados-cerrar"
                      onClick={() => setMasterMochilasAbierto(false)}
                      aria-label="Cerrar inspección"
                    >
                      <X size={14} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {masterResumenCargando && masterResumenJugadores.length === 0 ? (
                  <p className="dados-ayuda">Consultando mochilas…</p>
                ) : masterResumenJugadores.length === 0 ? (
                  <p className="dados-ayuda">
                    No hay jugadores conectados en la sala ahora mismo.
                  </p>
                ) : (
                  (() => {
                    const seleccionado =
                      masterResumenJugadores.find(
                        j => j.userId === masterJugadorMochilaId
                      ) ?? masterResumenJugadores[0];
                    return (
                      <>
                        <div className="master-inspeccion-tabs">
                          {masterResumenJugadores.map(j => (
                            <button
                              key={j.userId}
                              type="button"
                              className={`master-inspeccion-tab${
                                seleccionado?.userId === j.userId ? " activo" : ""
                              }`}
                              onClick={() => setMasterJugadorMochilaId(j.userId)}
                            >
                              <span
                                className="compartir-jugador-punto"
                                style={{ backgroundColor: j.color }}
                                aria-hidden="true"
                              />
                              <span>{j.nombre}</span>
                            </button>
                          ))}
                        </div>

                        {seleccionado && (
                          <div className="master-inspeccion-cuerpo">
                            <div className="master-inspeccion-subcabecera">
                              <span>
                                {divisaNombre}:{" "}
                                <strong>
                                  {seleccionado.divisa.toLocaleString("es-ES")}
                                </strong>
                              </span>
                            </div>

                            <h4 className="master-inspeccion-seccion">
                              En mochila ({seleccionado.mochila.length})
                            </h4>
                            {seleccionado.mochila.length === 0 ? (
                              <p className="dados-ayuda">Mochila vacía.</p>
                            ) : (
                              <div className="mochila-grid">
                                {seleccionado.mochila.map(obj => (
                                  <div key={obj.id} className="mochila-item-celda">
                                    <div
                                      className="mochila-slot"
                                      title={
                                        obj.descripcion
                                          ? `${obj.nombre}: ${obj.descripcion}`
                                          : obj.nombre
                                      }
                                    >
                                      {obj.archivoId ? (
                                        <img
                                          src={archivosApi.url(obj.archivoId)}
                                          alt={obj.nombre}
                                        />
                                      ) : (
                                        <span className="mochila-slot-emoji">
                                          {obj.emoji ?? "🎒"}
                                        </span>
                                      )}
                                      <span className="mochila-slot-cant">
                                        {obj.cantidad}
                                      </span>
                                    </div>
                                    <span className="mochila-slot-nombre" title={obj.nombre}>
                                      {obj.nombre}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <h4 className="master-inspeccion-seccion">
                              En su mesa ({seleccionado.objetosMesa.length})
                            </h4>
                            {seleccionado.objetosMesa.length === 0 ? (
                              <p className="dados-ayuda">Sin objetos en mesa.</p>
                            ) : (
                              <div className="mochila-grid">
                                {seleccionado.objetosMesa.map(obj => (
                                  <div key={obj.id} className="mochila-item-celda">
                                    <div
                                      className="mochila-slot"
                                      title={
                                        obj.descripcion
                                          ? `${obj.nombre}: ${obj.descripcion}`
                                          : obj.nombre
                                      }
                                    >
                                      {obj.archivoId ? (
                                        <img
                                          src={archivosApi.url(obj.archivoId)}
                                          alt={obj.nombre}
                                        />
                                      ) : (
                                        <span className="mochila-slot-emoji">
                                          {obj.emoji ?? "🎒"}
                                        </span>
                                      )}
                                      <span className="mochila-slot-cant">
                                        {obj.cantidad}
                                      </span>
                                    </div>
                                    <span className="mochila-slot-nombre" title={obj.nombre}>
                                      {obj.nombre}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
          )}

          {divisaAbierta && !ajuste && (
            <div
              className="divisa-popover"
              role="dialog"
              aria-label={`Gestionar ${divisaNombre}`}
            >
              <div className="dados-selector-cabecera">
                <span>{divisaNombre}</span>
                <button
                  type="button"
                  className="dados-cerrar"
                  onClick={() => setDivisaAbierta(false)}
                  aria-label="Cerrar panel de divisa"
                >
                  <X size={14} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>

              <div className="divisa-exacto">
                <IconoMonedasPixel size={22} />
                <span>{divisaActual.toLocaleString("es-ES")}</span>
              </div>

              <div className="divisa-paso-row">
                <span className="dados-campo-etiqueta">Paso +/-</span>
                <div className="divisa-paso-btns">
                  {([1, 10, 100] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`dado-tipo-btn${divisaPaso === p ? " activo" : ""}`}
                      onClick={() => setDivisaPaso(p)}
                    >
                      x{p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divisa-atajos">
                {[-100, -10, 10, 100].map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`divisa-atajo-btn${d < 0 ? " resta" : " suma"}`}
                    onClick={() => modificarDivisa(d, true)}
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>

              <form
                className="divisa-custom-form"
                onSubmit={e => {
                  e.preventDefault();
                  const n = parseInt(divisaCustomTexto, 10);
                  if (!Number.isNaN(n) && n > 0) {
                    modificarDivisa(n, true);
                    setDivisaCustomTexto("");
                  }
                }}
              >
                <input
                  type="number"
                  min={1}
                  max={999_999_999}
                  value={divisaCustomTexto}
                  onChange={e => setDivisaCustomTexto(e.target.value)}
                  placeholder="Cantidad..."
                  aria-label="Cantidad personalizada"
                />
                <button
                  type="button"
                  className="divisa-emoji-btn resta"
                  title="Restar cantidad"
                  aria-label="Restar cantidad personalizada"
                  onClick={() => {
                    const n = parseInt(divisaCustomTexto, 10);
                    if (!Number.isNaN(n) && n > 0) {
                      modificarDivisa(-n, true);
                      setDivisaCustomTexto("");
                    }
                  }}
                >
                  ➖
                </button>
                <button
                  type="button"
                  className="divisa-emoji-btn suma"
                  title="Sumar cantidad"
                  aria-label="Sumar cantidad personalizada"
                  onClick={() => {
                    const n = parseInt(divisaCustomTexto, 10);
                    if (!Number.isNaN(n) && n > 0) {
                      modificarDivisa(n, true);
                      setDivisaCustomTexto("");
                    }
                  }}
                >
                  ➕
                </button>
              </form>

              {esMaster && onCambiarDivisaNombre && (
                <form
                  className="divisa-master-nombre"
                  onSubmit={e => {
                    e.preventDefault();
                    void onCambiarDivisaNombre(divisaNombreEdit);
                  }}
                >
                  <span className="dados-campo-etiqueta">Nombre (Máster)</span>
                  <div className="divisa-master-nombre-fila">
                    <input
                      type="text"
                      maxLength={24}
                      value={divisaNombreEdit}
                      onChange={e => setDivisaNombreEdit(e.target.value)}
                      placeholder="Divisa, Oro, Créditos..."
                    />
                    <button type="submit" title="Guardar nombre" aria-label="Guardar nombre">
                      <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {mochilaAbierta && !ajuste && (
            <div
              className="mochila-backdrop"
              onClick={() => setMochilaAbierta(false)}
            >
              <div
                className="mochila-modal"
                role="dialog"
                aria-label="Mochila"
                onClick={e => e.stopPropagation()}
              >
                <div className="mochila-cabecera">
                  <div className="mochila-titulo">
                    <IconoMochilaPixel size={22} />
                    <span>Mochila</span>
                  </div>
                  <div className="macros-cabecera-acciones">
                    <button
                      type="button"
                      className="macros-crear-btn"
                      onClick={() => {
                        setCreandoObjeto(v => !v);
                        setObjetoMochilaId(null);
                      }}
                    >
                      <Plus size={12} strokeWidth={2.6} aria-hidden="true" />
                      <span>{creandoObjeto ? "Volver" : "Nuevo"}</span>
                    </button>
                    <button
                      type="button"
                      className="dados-cerrar"
                      onClick={() => setMochilaAbierta(false)}
                      aria-label="Cerrar mochila"
                    >
                      <X size={14} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {creandoObjeto ? (
                  <form className="mochila-crear-form" onSubmit={crearObjetoMochila}>
                    <label className="macro-campo-nombre">
                      <span className="dados-campo-etiqueta">Nombre del objeto</span>
                      <input
                        type="text"
                        maxLength={60}
                        required
                        value={nuevoObjNombre}
                        onChange={e => setNuevoObjNombre(e.target.value)}
                        placeholder="Ej. Poción curativa, Llave de hierro..."
                        autoFocus
                      />
                    </label>

                    <div className="mochila-crear-fila">
                      <label className="macro-campo-nombre">
                        <span className="dados-campo-etiqueta">Cantidad</span>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={nuevoObjCantidad}
                          onChange={e => {
                            const v = parseInt(e.target.value, 10);
                            setNuevoObjCantidad(Number.isNaN(v) ? 1 : limitar(v, 1, 9999));
                          }}
                        />
                      </label>

                      <div className="mochila-img-subida">
                        <span className="dados-campo-etiqueta">Imagen (cuadrada)</span>
                        <input
                          ref={objetoImgInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          hidden
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) void subirImagenObjeto(f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className="mochila-subir-btn"
                          disabled={subiendoObjetoImg}
                          onClick={() => objetoImgInputRef.current?.click()}
                        >
                          <Upload size={13} aria-hidden="true" />
                          <span>
                            {subiendoObjetoImg
                              ? "Recortando..."
                              : nuevoObjArchivo
                                ? "Cambiar foto"
                                : "Subir foto"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {!nuevoObjArchivo ? (
                      <div className="mochila-emojis-grid" role="radiogroup" aria-label="Emoji del objeto">
                        {EMOJIS_OBJETO_SUGERIDOS.map(em => (
                          <button
                            key={em}
                            type="button"
                            className={`mochila-emoji-btn${nuevoObjEmoji === em ? " activo" : ""}`}
                            onClick={() => setNuevoObjEmoji(em)}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mochila-preview-upload">
                        <img
                          src={
                            nuevoObjArchivo.imagenLocal ??
                            archivosApi.url(nuevoObjArchivo.archivoId ?? "")
                          }
                          alt="Vista previa"
                        />
                        <button
                          type="button"
                          className="mochila-quitar-img"
                          onClick={() => setNuevoObjArchivo(null)}
                        >
                          Usar emoji en su lugar
                        </button>
                      </div>
                    )}

                    <label className="macro-campo-nombre">
                      <span className="dados-campo-etiqueta">Descripción</span>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={nuevoObjDesc}
                        onChange={e => setNuevoObjDesc(e.target.value)}
                        placeholder="Efecto, peso, notas..."
                      />
                    </label>

                    <button type="submit" className="dados-lanzar">
                      Guardar en mochila
                    </button>
                  </form>
                ) : objetoSeleccionado ? (
                  <div className="mochila-detalle">
                    <div className="mochila-detalle-top">
                      <button
                        type="button"
                        className="mochila-volver-btn"
                        onClick={() => {
                          setObjetoMochilaId(null);
                          setPasandoObjetoId(null);
                        }}
                      >
                        <ArrowLeft size={13} aria-hidden="true" />
                        <span>Todos los objetos</span>
                      </button>
                      <button
                        type="button"
                        className="mochila-eliminar-cruz"
                        onClick={() => eliminarObjetoMochila(objetoSeleccionado.id)}
                        title="Eliminar objeto de la mochila"
                        aria-label="Eliminar objeto"
                      >
                        <X size={14} strokeWidth={2.6} aria-hidden="true" />
                        <span>Eliminar</span>
                      </button>
                    </div>

                    <div className="mochila-detalle-cabecera">
                      <div className="mochila-detalle-cuadro">
                        {objetoSeleccionado.imagenLocal || objetoSeleccionado.archivoId ? (
                          <img
                            src={
                              objetoSeleccionado.imagenLocal ??
                              archivosApi.url(objetoSeleccionado.archivoId ?? "")
                            }
                            alt={objetoSeleccionado.nombre}
                          />
                        ) : (
                          <span className="mochila-detalle-emoji">
                            {objetoSeleccionado.emoji ?? "🎒"}
                          </span>
                        )}
                      </div>
                      <div className="mochila-detalle-info">
                        <h3>{objetoSeleccionado.nombre}</h3>
                        <label className="mochila-cantidad-edit">
                          <span className="dados-campo-etiqueta">Cantidad</span>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={objetoSeleccionado.cantidad}
                            onChange={e => {
                              const v = parseInt(e.target.value, 10);
                              const cant = Number.isNaN(v) ? 1 : limitar(v, 1, 9999);
                              actualizarListaMochila(prev =>
                                prev.map(it =>
                                  it.id === objetoSeleccionado.id
                                    ? { ...it, cantidad: cant }
                                    : it
                                )
                              );
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <label className="macro-campo-nombre">
                      <span className="dados-campo-etiqueta">Descripción</span>
                      <textarea
                        rows={4}
                        maxLength={1000}
                        value={objetoSeleccionado.descripcion}
                        onChange={e => {
                          const desc = e.target.value;
                          actualizarListaMochila(prev =>
                            prev.map(it =>
                              it.id === objetoSeleccionado.id
                                ? { ...it, descripcion: desc }
                                : it
                            )
                          );
                        }}
                        placeholder="Añade una descripción..."
                      />
                    </label>

                    <div className="mochila-detalle-acciones">
                      <button
                        type="button"
                        className="mochila-accion-sec"
                        onClick={() => ponerObjetoEnMesa(objetoSeleccionado)}
                      >
                        Poner en mesa
                      </button>
                      <button
                        type="button"
                        className="mochila-accion-sec"
                        onClick={() =>
                          setPasandoObjetoId(p =>
                            p === objetoSeleccionado.id ? null : objetoSeleccionado.id
                          )
                        }
                      >
                        Pasar a jugador
                      </button>
                    </div>

                    {pasandoObjetoId === objetoSeleccionado.id && (
                      <div className="mochila-destinos">
                        {jugadores
                          .filter(j => j.activo && j.id !== yoAsientoId)
                          .map(j => (
                            <button
                              key={j.id}
                              type="button"
                              className="mochila-destino-chip"
                              onClick={() => {
                                if (onEnviarObjetoMochila) {
                                  void onEnviarObjetoMochila(j, objetoSeleccionado, 1);
                                } else {
                                  mostrarAviso(
                                    `${objetoSeleccionado.nombre} enviado a ${j.nombre}.`
                                  );
                                }
                                setPasandoObjetoId(null);
                              }}
                            >
                              {j.nombre}
                            </button>
                          ))}
                      </div>
                    )}

                    <button
                      type="button"
                      className="mochila-consumir-btn"
                      onClick={() => consumirObjetoMochila(objetoSeleccionado.id)}
                    >
                      Consumir (-1)
                    </button>
                  </div>
                ) : mochilaActual.length === 0 ? (
                  <p className="macros-vacio">
                    Tu mochila está vacía. Pulsa <strong>+ Nuevo</strong> para añadir objetos o sube una imagen cuadrada.
                  </p>
                ) : (
                  <div className="mochila-grid">
                    {mochilaActual.map(item => (
                      <div key={item.id} className="mochila-item-celda">
                        <button
                          type="button"
                          className="mochila-slot"
                          title={`${item.nombre} (x${item.cantidad}) — Arrastra a la mesa o pulsa para ver`}
                          onPointerDown={e => iniciarMochilaObjeto(e, item)}
                          onClick={() => {
                            if (!arrastre.current) {
                              setObjetoMochilaId(item.id);
                            }
                          }}
                        >
                          {item.imagenLocal || item.archivoId ? (
                            <img
                              src={
                                item.imagenLocal ?? archivosApi.url(item.archivoId ?? "")
                              }
                              alt={item.nombre}
                              draggable={false}
                            />
                          ) : (
                            <span className="mochila-slot-emoji">{item.emoji ?? "🎒"}</span>
                          )}
                          <span className="mochila-slot-cant">{item.cantidad}</span>
                        </button>
                        <span className="mochila-slot-nombre" title={item.nombre}>
                          {item.nombre}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {ajuste && (
            <div className="ajuste-panel">
              <p>
                Arrastra las esferas a su silla, mueve el recuadro de la pizarra y
                cada una de las cuatro esquinas del mapa, y coloca la bandeja de
                dados. Se guarda solo en este navegador.
              </p>
              <div className="ajuste-botones">
                <button type="button" className="ajuste-btn" onClick={copiarConfiguracion}>
                  Copiar configuración
                </button>
                <button
                  type="button"
                  className="ajuste-btn"
                  onClick={() => onCalibracion(CALIBRACION_INICIAL)}
                >
                  Restablecer
                </button>
              </div>
            </div>
          )}

          {selectorAbierto && !ajuste && (
            <form
              className={`dados-selector${calibracion.dock.y < 30 ? " debajo" : ""}${tiradaSecreta ? " secreta" : ""}`}
              style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
              onSubmit={evento => {
                evento.preventDefault();
                tirarDado();
              }}
            >
              <div className="dados-selector-cabecera">
                <span>Tirada de dados</span>
                <button
                  type="button"
                  className="dados-cerrar"
                  onClick={() => setSelectorAbierto(false)}
                  aria-label="Cerrar selector de dados"
                >
                  <X size={13} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>

              <div className="dados-fila">
                <span className="dados-campo-etiqueta">Dados</span>
                <div className="dados-stepper">
                  <button
                    type="button"
                    onClick={() => setCantidadDados(n => Math.max(1, n - 1))}
                    aria-label="Menos dados"
                  >
                    <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={cantidadDados}
                    onChange={e => {
                      const valor = parseInt(e.target.value, 10);
                      setCantidadDados(Number.isNaN(valor) ? 1 : limitar(valor, 1, 20));
                    }}
                    aria-label="Número de dados"
                  />
                  <button
                    type="button"
                    onClick={() => setCantidadDados(n => Math.min(20, n + 1))}
                    aria-label="Más dados"
                  >
                    <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="dados-fila">
                <span className="dados-campo-etiqueta">Tipo</span>
                <div className="dados-tipos" role="group" aria-label="Tipo de dado">
                  {TIPOS_DADO.map(caras => (
                    <button
                      key={caras}
                      type="button"
                      className={`dado-tipo-btn${tipoDado === caras ? " activo" : ""}`}
                      onClick={() => setTipoDado(caras)}
                    >
                      d{caras}
                    </button>
                  ))}
                </div>
              </div>

              <div className="dados-fila">
                <span className="dados-campo-etiqueta">Bonificador</span>
                <div className="dados-stepper">
                  <button
                    type="button"
                    onClick={() => setBonificador(b => Math.max(-99, b - 1))}
                    aria-label="Reducir bonificador"
                  >
                    <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                  <input
                    type="number"
                    min={-99}
                    max={99}
                    value={bonificador}
                    onChange={e => {
                      const valor = parseInt(e.target.value, 10);
                      setBonificador(Number.isNaN(valor) ? 0 : limitar(valor, -99, 99));
                    }}
                    aria-label="Bonificador"
                  />
                  <button
                    type="button"
                    onClick={() => setBonificador(b => Math.min(99, b + 1))}
                    aria-label="Aumentar bonificador"
                  >
                    <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="dados-agregar-grupo"
                onClick={abrirTiradaCompuesta}
              >
                <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                <span>Tirada compuesta</span>
              </button>

              <button
                type="button"
                className={`dados-secreto-toggle${!esMaster ? " luna" : ""}${tiradaSecreta ? " activo" : ""}`}
                onClick={() => setTiradaSecreta(s => !s)}
                aria-pressed={tiradaSecreta}
              >
                {esMaster ? (
                  <>
                    <span className="dados-secreto-punto" aria-hidden="true" />
                    <span>Dados negros (solo Máster)</span>
                  </>
                ) : (
                  <>
                    <Moon size={13} strokeWidth={2.2} aria-hidden="true" />
                    <span>Solo para el Máster (susurro)</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                className={`dados-lanzar${tiradaSecreta ? " secreta" : ""}`}
                disabled={tirando}
              >
                {tiradaSecreta
                  ? esMaster
                    ? "Tirar en secreto "
                    : "Tirar al Máster "
                  : "Tirar "}
                {formatearFormulaCompuesta(
                  [{ id: "normal", cantidad: cantidadDados, caras: tipoDado }],
                  bonificador
                )}
              </button>
            </form>
          )}

          {compuestaAbierta && !ajuste && (
            <div
              className="dados-compuesta-backdrop"
              onClick={() => setCompuestaAbierta(false)}
            >
              <form
                className="dados-compuesta-modal"
                role="dialog"
                aria-label="Tirada compuesta"
                onClick={evento => evento.stopPropagation()}
                onSubmit={evento => {
                  evento.preventDefault();
                  tirarDado(gruposCompuesta, bonificadorCompuesta);
                }}
              >
                <div className="dados-selector-cabecera">
                  <span>Tirada compuesta</span>
                  <button
                    type="button"
                    className="dados-cerrar"
                    onClick={() => setCompuestaAbierta(false)}
                    aria-label="Cerrar tirada compuesta"
                  >
                    <X size={14} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>

                <div className="dados-grupos-lista">
                  {gruposCompuesta.map((grupo, idx) => (
                    <div key={grupo.id} className="dados-grupo-card">
                      <div className="dados-grupo-top">
                        <span className="dados-campo-etiqueta">Dado {idx + 1}</span>
                        {gruposCompuesta.length > 1 && (
                          <button
                            type="button"
                            className="dados-grupo-quitar"
                            onClick={() => eliminarGrupoCompuesta(grupo.id)}
                            aria-label={`Quitar dado ${idx + 1}`}
                            title="Quitar este dado"
                          >
                            <X size={12} strokeWidth={2.4} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <div className="dados-stepper">
                        <button
                          type="button"
                          onClick={() =>
                            actualizarGrupoCompuesta(grupo.id, {
                              cantidad: Math.max(1, grupo.cantidad - 1)
                            })
                          }
                          aria-label="Menos dados"
                        >
                          <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={grupo.cantidad}
                          onChange={e => {
                            const valor = parseInt(e.target.value, 10);
                            actualizarGrupoCompuesta(grupo.id, {
                              cantidad: Number.isNaN(valor) ? 1 : limitar(valor, 1, 20)
                            });
                          }}
                          aria-label="Número de dados"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            actualizarGrupoCompuesta(grupo.id, {
                              cantidad: Math.min(20, grupo.cantidad + 1)
                            })
                          }
                          aria-label="Más dados"
                        >
                          <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="dados-tipos" role="group" aria-label="Tipo de dado">
                        {TIPOS_DADO.map(caras => (
                          <button
                            key={caras}
                            type="button"
                            className={`dado-tipo-btn${grupo.caras === caras ? " activo" : ""}`}
                            onClick={() => actualizarGrupoCompuesta(grupo.id, { caras })}
                          >
                            d{caras}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {gruposCompuesta.length < 6 && (
                  <button
                    type="button"
                    className="dados-agregar-grupo"
                    onClick={agregarGrupoCompuesta}
                  >
                    <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                    <span>Añadir otro dado</span>
                  </button>
                )}

                <div className="dados-fila">
                  <span className="dados-campo-etiqueta">Bonificador</span>
                  <div className="dados-stepper">
                    <button
                      type="button"
                      onClick={() => setBonificadorCompuesta(b => Math.max(-99, b - 1))}
                      aria-label="Reducir bonificador"
                    >
                      <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                    <input
                      type="number"
                      min={-99}
                      max={99}
                      value={bonificadorCompuesta}
                      onChange={e => {
                        const valor = parseInt(e.target.value, 10);
                        setBonificadorCompuesta(
                          Number.isNaN(valor) ? 0 : limitar(valor, -99, 99)
                        );
                      }}
                      aria-label="Bonificador"
                    />
                    <button
                      type="button"
                      onClick={() => setBonificadorCompuesta(b => Math.min(99, b + 1))}
                      aria-label="Aumentar bonificador"
                    >
                      <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className={`dados-secreto-toggle${!esMaster ? " luna" : ""}${tiradaSecreta ? " activo" : ""}`}
                  onClick={() => setTiradaSecreta(s => !s)}
                  aria-pressed={tiradaSecreta}
                >
                  {esMaster ? (
                    <>
                      <span className="dados-secreto-punto" aria-hidden="true" />
                      <span>Dados negros (solo Máster)</span>
                    </>
                  ) : (
                    <>
                      <Moon size={13} strokeWidth={2.2} aria-hidden="true" />
                      <span>Solo para el Máster (susurro)</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  className={`dados-lanzar${tiradaSecreta ? " secreta" : ""}`}
                  disabled={tirando}
                >
                  {tiradaSecreta
                    ? esMaster
                      ? "Tirar en secreto "
                      : "Tirar al Máster "
                    : "Tirar "}
                  {formatearFormulaCompuesta(gruposCompuesta, bonificadorCompuesta)}
                </button>
              </form>
            </div>
          )}

          {macrosAbierto && !ajuste && (
            <div
              className={`dados-selector macros-selector${calibracion.dock.y < 30 ? " debajo" : ""}${macroSecreta ? " secreta" : ""}`}
              style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
              role="dialog"
              aria-label="Macros de tirada"
            >
              <div className="dados-selector-cabecera">
                <span>Macros</span>
                <div className="macros-cabecera-acciones">
                  <button
                    type="button"
                    className="macros-crear-btn"
                    onClick={abrirNuevaMacro}
                  >
                    <Plus size={12} strokeWidth={2.6} aria-hidden="true" />
                    <span>Crear</span>
                  </button>
                  <button
                    type="button"
                    className="dados-cerrar"
                    onClick={() => setMacrosAbierto(false)}
                    aria-label="Cerrar macros"
                  >
                    <X size={14} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                className={`dados-secreto-toggle${!esMaster ? " luna" : ""}${macroSecreta ? " activo" : ""}`}
                onClick={() => setMacroSecreta(s => !s)}
                aria-pressed={macroSecreta}
              >
                {esMaster ? (
                  <>
                    <span className="dados-secreto-punto" aria-hidden="true" />
                    <span>Tirada secreta (solo Máster)</span>
                  </>
                ) : (
                  <>
                    <Moon size={13} strokeWidth={2.2} aria-hidden="true" />
                    <span>Solo para el Máster (susurro)</span>
                  </>
                )}
              </button>

              {macrosLista.length > 6 && (
                <div className="macros-buscador">
                  <Search size={13} strokeWidth={2.2} aria-hidden="true" />
                  <input
                    type="search"
                    value={macroFiltro}
                    onChange={e => setMacroFiltro(e.target.value)}
                    placeholder="Buscar macro..."
                    aria-label="Buscar macro"
                  />
                </div>
              )}

              <div className="macros-lista">
                {macrosLista.length === 0 ? (
                  <p className="macros-vacio">
                    Aún no tienes macros guardadas. Pulsa Crear para configurar una tirada rápida.
                  </p>
                ) : (
                  (() => {
                    const filtro = macroFiltro.trim().toLowerCase();
                    const visibles = filtro
                      ? macrosLista.filter(m => m.nombre.toLowerCase().includes(filtro))
                      : macrosLista;
                    if (visibles.length === 0) {
                      return (
                        <p className="macros-vacio">
                          Ninguna macro coincide con «{macroFiltro}».
                        </p>
                      );
                    }
                    return visibles.map(macro => {
                      const formula = formatearFormulaCompuesta(
                        macro.grupos.map((g, idx) => ({
                          id: `${macro.id}-${idx}`,
                          cantidad: g.cantidad,
                          caras: g.caras
                        })),
                        macro.bonificador
                      );
                      return (
                        <div key={macro.id} className="macro-fila">
                          <button
                            type="button"
                            className="macro-lanzar-btn"
                            onClick={() => lanzarMacro(macro)}
                            disabled={tirando}
                            title={`Lanzar ${macro.nombre} (${formula})`}
                          >
                            <span className="macro-icono-badge">
                              <IconoMacro id={macro.icono} size={15} />
                            </span>
                            <span className="macro-texto">
                              <span className="macro-nombre">{macro.nombre}</span>
                              <span className="macro-formula">{formula}</span>
                            </span>
                          </button>
                          <div className="macro-acciones">
                            <button
                              type="button"
                              className="macro-accion-btn"
                              onClick={() => abrirEditarMacro(macro)}
                              title="Editar macro"
                              aria-label={`Editar ${macro.nombre}`}
                            >
                              <Pencil size={12} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="macro-accion-btn"
                              onClick={() => duplicarMacro(macro)}
                              title="Duplicar macro"
                              aria-label={`Duplicar ${macro.nombre}`}
                            >
                              <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="macro-accion-btn borrar"
                              onClick={() => eliminarMacro(macro.id)}
                              title="Eliminar macro"
                              aria-label={`Eliminar ${macro.nombre}`}
                            >
                              <Trash2 size={12} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          )}

          {macroModalAbierto && !ajuste && (
            <div
              className="dados-compuesta-backdrop"
              onClick={() => setMacroModalAbierto(false)}
            >
              <form
                className="dados-compuesta-modal macros-modal"
                role="dialog"
                aria-label={macroEditandoId ? "Editar macro" : "Crear macro"}
                onClick={evento => evento.stopPropagation()}
                onSubmit={evento => {
                  evento.preventDefault();
                  guardarMacroFormulario();
                }}
              >
                <div className="dados-selector-cabecera">
                  <span>{macroEditandoId ? "Editar macro" : "Nueva macro"}</span>
                  <button
                    type="button"
                    className="dados-cerrar"
                    onClick={() => setMacroModalAbierto(false)}
                    aria-label="Cerrar editor de macro"
                  >
                    <X size={14} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>

                <label className="macro-campo-nombre">
                  <span className="dados-campo-etiqueta">Nombre</span>
                  <input
                    type="text"
                    maxLength={40}
                    value={macroNombre}
                    onChange={e => setMacroNombre(e.target.value)}
                    placeholder="Ej. Espada larga, Bola de fuego..."
                    autoFocus
                  />
                </label>

                <div className="macro-campo-icono">
                  <span className="dados-campo-etiqueta">Icono</span>
                  <div className="macro-icono-grid" role="radiogroup" aria-label="Icono de la macro">
                    {ICONOS_MACROS.map(item => {
                      const seleccionado = macroIcono === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`macro-icono-opcion${seleccionado ? " activo" : ""}`}
                          onClick={() => setMacroIcono(item.id)}
                          title={item.label}
                          aria-label={item.label}
                          aria-checked={seleccionado}
                          role="radio"
                        >
                          <IconoMacro id={item.id} size={15} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="dados-grupos-lista">
                  {macroGrupos.map((grupo, idx) => (
                    <div key={grupo.id} className="dados-grupo-card">
                      <div className="dados-grupo-top">
                        <span className="dados-campo-etiqueta">Dado {idx + 1}</span>
                        {macroGrupos.length > 1 && (
                          <button
                            type="button"
                            className="dados-grupo-quitar"
                            onClick={() => eliminarGrupoMacro(grupo.id)}
                            aria-label={`Quitar dado ${idx + 1}`}
                            title="Quitar este dado"
                          >
                            <X size={12} strokeWidth={2.4} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <div className="dados-stepper">
                        <button
                          type="button"
                          onClick={() =>
                            actualizarGrupoMacro(grupo.id, {
                              cantidad: Math.max(1, grupo.cantidad - 1)
                            })
                          }
                          aria-label="Menos dados"
                        >
                          <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={grupo.cantidad}
                          onChange={e => {
                            const valor = parseInt(e.target.value, 10);
                            actualizarGrupoMacro(grupo.id, {
                              cantidad: Number.isNaN(valor) ? 1 : limitar(valor, 1, 20)
                            });
                          }}
                          aria-label="Número de dados"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            actualizarGrupoMacro(grupo.id, {
                              cantidad: Math.min(20, grupo.cantidad + 1)
                            })
                          }
                          aria-label="Más dados"
                        >
                          <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="dados-tipos" role="group" aria-label="Tipo de dado">
                        {TIPOS_DADO.map(caras => (
                          <button
                            key={caras}
                            type="button"
                            className={`dado-tipo-btn${grupo.caras === caras ? " activo" : ""}`}
                            onClick={() => actualizarGrupoMacro(grupo.id, { caras })}
                          >
                            d{caras}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {macroGrupos.length < 6 && (
                  <button
                    type="button"
                    className="dados-agregar-grupo"
                    onClick={agregarGrupoMacro}
                  >
                    <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                    <span>Añadir otro dado</span>
                  </button>
                )}

                <div className="dados-fila">
                  <span className="dados-campo-etiqueta">Bonificador</span>
                  <div className="dados-stepper">
                    <button
                      type="button"
                      onClick={() => setMacroBonificador(b => Math.max(-99, b - 1))}
                      aria-label="Reducir bonificador"
                    >
                      <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                    <input
                      type="number"
                      min={-99}
                      max={99}
                      value={macroBonificador}
                      onChange={e => {
                        const valor = parseInt(e.target.value, 10);
                        setMacroBonificador(
                          Number.isNaN(valor) ? 0 : limitar(valor, -99, 99)
                        );
                      }}
                      aria-label="Bonificador"
                    />
                    <button
                      type="button"
                      onClick={() => setMacroBonificador(b => Math.min(99, b + 1))}
                      aria-label="Aumentar bonificador"
                    >
                      <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <button type="submit" className="dados-lanzar">
                  {macroEditandoId ? "Guardar macro (" : "Guardar "}
                  {formatearFormulaCompuesta(macroGrupos, macroBonificador)}
                  {macroEditandoId ? ")" : ""}
                </button>
              </form>
            </div>
          )}

          {tirada !== null &&
            !selectorAbierto &&
            !compuestaAbierta &&
            !macrosAbierto &&
            !macroModalAbierto && (
            <div
              className={`tirada-panel${calibracion.dock.y < 30 ? " debajo" : ""}${tirada.secreta ? " secreta" : ""}${!tirando && tirada.especial ? ` ${tirada.especial}` : ""}`}
              style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
            >
              <span className="tirada-icono">
                <IconoDadoPoligono caras={tirada.caras} />
              </span>
              <span className={`tirada-num${tirando ? " girando" : ""}`}>
                {tirada.total}
              </span>
              <div className="tirada-detalle">
                <span className="tirada-etiqueta">
                  {tirada.secreta ? "SECRETO · " : ""}
                  {tirando ? "tirando…" : tirada.formula}
                </span>
                {!tirando && (tirada.desgloseDados.length > 1 || tirada.bonificador !== 0) && (
                  <div className="tirada-desglose-chips">
                    {tirada.desgloseDados.map((dado, i) => (
                      <span
                        key={`${dado.caras}-${i}`}
                        className={`tirada-dado-chip${dado.especial ? ` ${dado.especial}` : ""}`}
                        title={`d${dado.caras}: ${dado.valor}`}
                      >
                        {tirada.compuesta && (
                          <span className="tirada-dado-tipo">d{dado.caras}</span>
                        )}
                        <span>{dado.valor}</span>
                      </span>
                    ))}
                    {tirada.bonificador !== 0 && (
                      <span className="tirada-desglose-mod">
                        {tirada.bonificador > 0
                          ? `+ ${tirada.bonificador}`
                          : `− ${Math.abs(tirada.bonificador)}`}
                      </span>
                    )}
                    <span className="tirada-desglose-total">= {tirada.total}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!ajuste && (
            <div className="sala-posits-capa" ref={capaPosits}>
              {positsVisibles.map(posit => (
                <Posit
                  key={posit.id}
                  posit={posit}
                  enMesa
                  activo={positActivo === posit.id}
                  onActivar={setPositActivo}
                  onTexto={cambiarTextoPositMesa}
                  onColor={cambiarColorPositMesa}
                  onArchivar={archivarPositMesa}
                  onBorrar={borrarPositMesa}
                  onArrastrar={iniciarPositMesa}
                />
              ))}

              {docsVisibles.map(doc => {
                const formato = infoFormatoArchivo(doc.vista);
                return (
                  <div
                    key={doc.id}
                    className="ficha-doc"
                    style={
                      {
                        left: `${doc.x}%`,
                        top: `${doc.y}%`,
                        "--doc-color": formato.color
                      } as CSSProperties
                    }
                    onPointerDown={evento => iniciarDocMesa(evento, doc)}
                  >
                    <div
                      className="ficha-doc-barra"
                      onPointerDown={evento => evento.stopPropagation()}
                    >
                      {esMaster && doc.vista === "imagen" && onProyectarImagen && (
                        <button
                          type="button"
                          className={`doc-master-icono${imagenProyectada?.id === doc.archivoId ? " activo" : ""
                            }`}
                          title={
                            imagenProyectada?.id === doc.archivoId
                              ? "Retirar proyección para todos"
                              : "Mostrar a todos (Opción A)"
                          }
                          aria-label={
                            imagenProyectada?.id === doc.archivoId
                              ? "Retirar proyección"
                              : "Mostrar a todos"
                          }
                          onClick={evento => {
                            evento.stopPropagation();
                            onProyectarImagen(
                              imagenProyectada?.id === doc.archivoId
                                ? null
                                : { id: doc.archivoId, titulo: doc.nombre }
                            );
                          }}
                        >
                          <Sparkles
                            size={13}
                            strokeWidth={2.1}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                      {esMaster && doc.vista === "imagen" && onCambiarEscena && (
                        <button
                          type="button"
                          className={`doc-master-icono${imagenEscena?.id === doc.archivoId ? " activo" : ""
                            }`}
                          title={
                            imagenEscena?.id === doc.archivoId
                              ? "Quitar de la pizarra de la sala"
                              : "Fijar en la pizarra de la sala (Opción B)"
                          }
                          aria-label={
                            imagenEscena?.id === doc.archivoId
                              ? "Quitar de pizarra"
                              : "Fijar en pizarra"
                          }
                          onClick={evento => {
                            evento.stopPropagation();
                            onCambiarEscena(
                              imagenEscena?.id === doc.archivoId
                                ? null
                                : { id: doc.archivoId, titulo: doc.nombre }
                            );
                          }}
                        >
                          <ImageIcon
                            size={13}
                            strokeWidth={2.1}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        className="posit-archivar"
                        title="Archivar documento"
                        aria-label="Archivar documento"
                        onClick={evento => {
                          evento.stopPropagation();
                          archivarDocMesa(doc.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path
                            d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`ficha-doc-hoja ${formato.clase}`}
                      title={`Abrir ${doc.nombre}`}
                      aria-label={`Abrir ${doc.nombre}`}
                      onClick={() => {
                        if (arrastreDocMovido.current) return;
                        setVisorDoc({
                          id: doc.archivoId,
                          nombre: doc.nombre,
                          tipo: doc.mime,
                          vista: doc.vista,
                          tamano: doc.tamano,
                          x: doc.x,
                          y: doc.y,
                          url: doc.contenidoLocal
                        });
                      }}
                    >
                      <span className="ficha-doc-codigo">{formato.codigo}</span>
                    </button>

                    <span className="ficha-doc-nombre" title={doc.nombre}>
                      {doc.nombre}
                    </span>
                  </div>
                );
              })}

              {objetosVisibles.map(obj => (
                <div
                  key={obj.id}
                  className="mesa-objeto"
                  style={{ left: `${obj.x}%`, top: `${obj.y}%` }}
                  title={`${obj.nombre} (x${obj.cantidad})`}
                  onPointerDown={evento => iniciarObjetoMesa(evento, obj)}
                  onClick={() => {
                    if (!arrastreDocMovido.current) {
                      setObjetoMesaActivo(obj);
                    }
                  }}
                >
                  <div className="mesa-objeto-cuadro">
                    {obj.imagenLocal || obj.archivoId ? (
                      <img
                        src={obj.imagenLocal ?? archivosApi.url(obj.archivoId ?? "")}
                        alt={obj.nombre}
                        draggable={false}
                      />
                    ) : (
                      <span className="mesa-objeto-emoji">{obj.emoji ?? "🎒"}</span>
                    )}
                    <span className="mochila-slot-cant">{obj.cantidad}</span>
                  </div>
                  <span className="mesa-objeto-nombre">{obj.nombre}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className={`sala-dock${ajuste ? " ajustable" : ""}`}
            style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
            onPointerDown={ajuste ? iniciarDock : undefined}
          >
            <div className="dock-item">
              <button
                type="button"
                className={`dock-btn${selectorAbierto && !tiradaSecreta ? " activo" : ""}`}
                onClick={() => {
                  setMacrosAbierto(false);
                  if (selectorAbierto && !tiradaSecreta) {
                    setSelectorAbierto(false);
                  } else {
                    setTiradaSecreta(false);
                    setSelectorAbierto(true);
                  }
                }}
                aria-expanded={selectorAbierto && !tiradaSecreta}
                title="Seleccionar tirada de dados"
                aria-label="Dados"
              >
                <IconoD20 />
              </button>
              <span className="dock-etiqueta">Dados</span>
            </div>

            <div className="dock-item">
              <button
                type="button"
                className={`dock-btn${macrosAbierto ? " activo" : ""}`}
                onClick={() => {
                  setSelectorAbierto(false);
                  setCompuestaAbierta(false);
                  setMacrosAbierto(abierto => !abierto);
                }}
                aria-expanded={macrosAbierto}
                title="Macros de tirada personalizadas"
                aria-label="Macros"
              >
                <Bookmark size={18} strokeWidth={2.1} aria-hidden="true" />
              </button>
              <span className="dock-etiqueta">Macros</span>
            </div>

            {esMaster ? (
              <div className="dock-item">
                <button
                  type="button"
                  className={`dock-btn dock-btn-secreto${selectorAbierto && tiradaSecreta ? " activo" : ""}`}
                  onClick={() => {
                    setMacrosAbierto(false);
                    if (selectorAbierto && tiradaSecreta) {
                      setSelectorAbierto(false);
                    } else {
                      setTiradaSecreta(true);
                      setSelectorAbierto(true);
                    }
                  }}
                  aria-expanded={selectorAbierto && tiradaSecreta}
                  title="Dados negros (tirada secreta del Máster)"
                  aria-label="Dados negros"
                >
                  <IconoD20 />
                </button>
                <span className="dock-etiqueta">Secreto</span>
              </div>
            ) : (
              <div className="dock-item">
                <button
                  type="button"
                  className={`dock-btn dock-btn-secreto${selectorAbierto && tiradaSecreta ? " activo" : ""}`}
                  onClick={() => {
                    setMacrosAbierto(false);
                    if (selectorAbierto && tiradaSecreta) {
                      setSelectorAbierto(false);
                    } else {
                      setTiradaSecreta(true);
                      setSelectorAbierto(true);
                    }
                  }}
                  aria-expanded={selectorAbierto && tiradaSecreta}
                  title="Tirada solo para el Máster (susurro privado)"
                  aria-label="Tirada solo para el Máster"
                >
                  <Moon size={18} strokeWidth={2.1} aria-hidden="true" />
                </button>
                <span className="dock-etiqueta">Al Máster</span>
              </div>
            )}

            <div className="dock-item">
              <button
                type="button"
                className="dock-btn"
                onClick={crearPositMesa}
                title="Crear posit personal"
                aria-label="Crear posit"
              >
                <IconoPosit />
              </button>
              <span className="dock-etiqueta">Posits</span>
            </div>

            {onAbrirArchivador && (
              <div className="dock-item">
                <button
                  type="button"
                  className="dock-btn"
                  onClick={onAbrirArchivador}
                  title="Abrir archivador"
                  aria-label="Archivador"
                >
                  <IconoArchivador />
                  {positsArchivadosCount > 0 && (
                    <span className="dock-badge">{positsArchivadosCount}</span>
                  )}
                </button>
                <span className="dock-etiqueta">Archivador</span>
              </div>
            )}

            {esMaster && (onCambiarEscena || onProyectarImagen) && (
              <>
                <span className="dock-separador-master" aria-hidden="true" />
                <div className="dock-item">
                  <button
                    type="button"
                    className={`dock-btn dock-btn-master${panelMasterAbierto ? " activo" : ""}`}
                    onClick={() => setPanelMasterAbierto(true)}
                    title="Dirección del Máster: proyectar o fijar imágenes en la sala"
                    aria-label="Escena del Máster"
                  >
                    <IconoMasterEscena />
                    {(imagenEscena || imagenProyectada) && (
                      <span className="dock-badge master">
                        {(imagenEscena ? 1 : 0) + (imagenProyectada ? 1 : 0)}
                      </span>
                    )}
                  </button>
                  <span className="dock-etiqueta master">
                    <Crown size={10} strokeWidth={2.2} aria-hidden="true" />
                    <span>Escena</span>
                  </span>
                </div>
              </>
            )}
          </div>

          {!ajuste && (
            <div className="dados-rapidos" role="group" aria-label="Dados rápidos">
              {DADOS_RAPIDOS.map(dado => (
                <button
                  key={dado.caras}
                  type="button"
                  className="dado-rapido-btn"
                  style={
                    {
                      "--dado-color": dado.color,
                      "--dado-glow": dado.glow
                    } as CSSProperties
                  }
                  onClick={() =>
                    tirarDado([{ id: `rapido-${dado.caras}`, cantidad: 1, caras: dado.caras }], 0, {
                      rapido: true,
                      forzarPublica: true
                    })
                  }
                  disabled={tirando}
                  title={`Tirada rápida 1d${dado.caras}`}
                  aria-label={`Tirar 1d${dado.caras}`}
                >
                  <span className="dado-rapido-icono">
                    <IconoDadoPoligono caras={dado.caras} />
                  </span>
                  <span className="dado-rapido-etiqueta">d{dado.caras}</span>
                </button>
              ))}
            </div>
          )}

      {compartirAbierto && !ajuste && (
        <div
          className={`compartir-panel${
            anclaCompartir?.origen === "pelota" ? " anclado-pelota" : " desde-chat"
          }`}
          style={
            anclaCompartir?.origen === "pelota"
              ? {
                  left: `clamp(190px, ${anclaCompartir.x}px, calc(100vw - 190px))`,
                  top: `${Math.max(56, Math.min(anclaCompartir.y, window.innerHeight - 310))}px`
                }
              : anclaCompartir?.origen === "chat"
                ? {
                    left: `${Math.max(12, Math.min(anclaCompartir.x, window.innerWidth - 386))}px`,
                    top: `${Math.max(56, Math.min(anclaCompartir.y, window.innerHeight - 340))}px`
                  }
                : {
                    left: `${calibracion.chat.x}%`,
                    top: `${Math.min(calibracion.chat.y + calibracion.chat.h + 1.5, 62)}%`
                  }
          }
          role="dialog"
          aria-label="Notas y archivos para pasar"
        >
          <div className="compartir-panel-cabecera">
            <h3 className="compartir-panel-titulo">
              {jugadorSeleccionado ? `Pasar a ${jugadorSeleccionado.nombre}` : "Pasar a jugadores"}
            </h3>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {onSimularRecepcion && (
                <button
                  type="button"
                  className="compartir-btn-sec"
                  onClick={onSimularRecepcion}
                  title="Simular que otro jugador te envía algo"
                >
                  Simular recepción
                </button>
              )}
              <button
                type="button"
                className="dados-cerrar"
                onClick={() => {
                  setCompartirAbierto(false);
                  setAnclaCompartir(null);
                }}
                aria-label="Cerrar panel de compartir"
              >
                <X size={13} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </div>

          {jugadorSeleccionado ? (
            <div className="compartir-destino-pill">
              <span>
                Destino seleccionado: <strong>{jugadorSeleccionado.nombre}</strong>
              </span>
              <button
                type="button"
                className="compartir-btn-sec"
                onClick={() => {
                  setJugadorSeleccionadoId(null);
                  setAnclaCompartir(null);
                }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="compartir-destinos-bloque">
              <span className="compartir-subtitulo">
                Elige un jugador o arrastra un elemento hacia su círculo:
              </span>
              <div className="compartir-jugadores-rapidos">
                {jugadores
                  .filter(j => j.activo && j.id !== yoAsientoId)
                  .map(j => (
                    <button
                      key={j.id}
                      type="button"
                      className="compartir-jugador-chip"
                      onClick={() => setJugadorSeleccionadoId(j.id)}
                    >
                      <span
                        className="compartir-jugador-punto"
                        style={{ backgroundColor: j.color }}
                        aria-hidden="true"
                      />
                      <span>{j.nombre}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {onElementosMesa && (
            <form className="compartir-nuevo-posit" onSubmit={crearPositEnMesa}>
              <input
                type="text"
                value={nuevoPositTexto}
                onChange={e => setNuevoPositTexto(e.target.value)}
                placeholder="Nueva nota rápida en mesa…"
                maxLength={300}
              />
              <button
                type="button"
                className="compartir-btn-sec"
                style={{ background: nuevoPositColor, color: textoLegible(nuevoPositColor) }}
                onClick={() => {
                  const idx = COLORES_POSIT.findIndex(c => c.valor === nuevoPositColor);
                  setNuevoPositColor(COLORES_POSIT[(idx + 1) % COLORES_POSIT.length].valor);
                }}
                title="Cambiar color de nota"
              >
                Color
              </button>
              <button type="submit" className="compartir-btn-sec">
                Poner
              </button>
            </form>
          )}

          <div
            ref={dropzoneRef}
            className={`compartir-dropzone${
              dragSobreDropzone || punteroSobreDropzone ? " sobre" : ""
            }${!jugadorSeleccionado ? " sin-destino" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={e => {
              e.preventDefault();
              setDragSobreDropzone(true);
            }}
            onDragLeave={() => setDragSobreDropzone(false)}
            onDrop={e => {
              e.preventDefault();
              setDragSobreDropzone(false);
              void enviarArchivosEnDrop(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={e => {
                void enviarArchivosEnDrop(e.target.files);
                e.target.value = "";
              }}
            />
            <Upload size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              {subiendoDrop
                ? "Enviando archivo…"
                : jugadorSeleccionado
                  ? `Arrastra aquí un posit, documento o archivo para ${jugadorSeleccionado.nombre}`
                  : "Elige un jugador arriba y arrastra aquí un posit, documento o archivo"}
            </span>
          </div>

          <div className="compartir-seccion">
            <span className="compartir-subtitulo">Objetos de tu mochila</span>
            {mochilaActual.length === 0 ? (
              <span className="compartir-subtitulo">
                No tienes objetos en tu mochila todavía.
              </span>
            ) : (
              <ul className="compartir-lista">
                {mochilaActual.map(obj => (
                  <li key={obj.id} className="compartir-item">
                    <div
                      className="compartir-item-arrastre"
                      onPointerDown={e => iniciarMochilaObjeto(e, obj)}
                      title="Arrastra hacia el círculo de un jugador o al recuadro"
                    >
                      <span className="mesa-elemento-badge">
                        {obj.emoji ?? "🎒"}
                      </span>
                      <span className="compartir-item-nombre">
                        {obj.nombre}
                        {obj.cantidad > 1 ? ` (x${obj.cantidad})` : ""}
                      </span>
                    </div>
                    {jugadorSeleccionado && (
                      <button
                        type="button"
                        className="compartir-btn-sec"
                        onClick={() => {
                          if (onEnviarObjetoMochila) {
                            void onEnviarObjetoMochila(jugadorSeleccionado, obj, 1);
                          } else {
                            mostrarAviso(
                              `${obj.nombre} enviado a ${jugadorSeleccionado.nombre}.`
                            );
                          }
                        }}
                      >
                        Enviar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="compartir-seccion">
            <span className="compartir-subtitulo">Archivos</span>
            {archivosLista.length === 0 ? (
              <span className="compartir-subtitulo">
                No hay archivos subidos todavía.
              </span>
            ) : (
              <ul className="compartir-lista">
                {archivosLista.map(archivo => {
                  const elem = crearElementoDesdeArchivo(archivo, { x: 78, y: 78 });
                  return (
                    <li key={archivo.id} className="compartir-item">
                      <div
                        className="compartir-item-arrastre"
                        onPointerDown={e => iniciarBandejaElemento(elem, e)}
                        title="Arrastra hacia el círculo de un jugador"
                      >
                        <span className="mesa-elemento-badge">
                          {tipoCortoArchivo(archivo.tipo, archivo.nombre)}
                        </span>
                        <span className="compartir-item-nombre">{archivo.nombre}</span>
                      </div>
                      {onElementosMesa && (
                        <button
                          type="button"
                          className="compartir-btn-sec"
                          onClick={() => colocarEnMesa(elem)}
                        >
                          En mesa
                        </button>
                      )}
                      {jugadorSeleccionado && onEnviarElemento && (
                        <button
                          type="button"
                          className="compartir-btn-sec"
                          onClick={() => void onEnviarElemento(jugadorSeleccionado, elem)}
                        >
                          Enviar
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {fantasma && (
        <div
          className="arrastre-fantasma"
          style={{ left: `${fantasma.x}px`, top: `${fantasma.y}px` }}
        >
          {fantasma.etiqueta}
        </div>
      )}

      {solicitudPendiente && (
        <div
          className="transferencia-dialogo"
          role="alertdialog"
          aria-modal="false"
          aria-label="Solicitud de transferencia"
        >
          <p className="transferencia-texto">
            {mensajeSolicitudTransferencia(solicitudPendiente)}
          </p>
          {solicitudPendiente.tipo === "posit" && solicitudPendiente.textoPosit && (
            <p className="transferencia-preview-posit">
              «{solicitudPendiente.textoPosit}»
            </p>
          )}
          {solicitudPendiente.tipo === "objeto" && solicitudPendiente.objeto && (
            <p className="transferencia-preview-posit">
              {solicitudPendiente.objeto.emoji ? `${solicitudPendiente.objeto.emoji} ` : ""}
              {solicitudPendiente.objeto.nombre}
              {solicitudPendiente.objeto.cantidad > 1
                ? ` (x${solicitudPendiente.objeto.cantidad})`
                : ""}
            </p>
          )}
          <div className="transferencia-acciones">
            <button
              type="button"
              className="transferencia-btn-rechazar"
              onClick={() => onRechazarSolicitud?.(solicitudPendiente)}
            >
              Rechazar
            </button>
            <button
              type="button"
              className="transferencia-btn-aceptar"
              onClick={() => onAceptarSolicitud?.(solicitudPendiente)}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {objetoMesaActivo && (
        <div className="archivo-visor" onClick={() => setObjetoMesaActivo(null)}>
          <div
            className="archivo-visor-caja mochila-mesa-visor"
            onClick={e => e.stopPropagation()}
          >
            <header className="archivo-visor-cabecera">
              <span className="archivo-visor-nombre">
                {objetoMesaActivo.nombre} (x{objetoMesaActivo.cantidad})
              </span>
              <button
                type="button"
                className="archivo-visor-cerrar"
                onClick={() => setObjetoMesaActivo(null)}
                aria-label="Cerrar objeto"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </header>
            <div className="mochila-mesa-cuerpo">
              <div className="mochila-detalle-cuadro">
                {objetoMesaActivo.imagenLocal || objetoMesaActivo.archivoId ? (
                  <img
                    src={
                      objetoMesaActivo.imagenLocal ??
                      archivosApi.url(objetoMesaActivo.archivoId ?? "")
                    }
                    alt={objetoMesaActivo.nombre}
                  />
                ) : (
                  <span className="mochila-detalle-emoji">
                    {objetoMesaActivo.emoji ?? "🎒"}
                  </span>
                )}
              </div>
              <div className="mochila-detalle-acciones">
                <button
                  type="button"
                  className="mochila-consumir-btn"
                  onClick={() => consumirObjetoMesa(objetoMesaActivo)}
                >
                  Consumir (-1)
                </button>
                <button
                  type="button"
                  className="mochila-accion-sec"
                  onClick={() => guardarObjetoMesaEnMochila(objetoMesaActivo)}
                >
                  Guardar en mochila
                </button>
                <button
                  type="button"
                  className="transferencia-btn-rechazar"
                  onClick={() => {
                    onElementosMesa?.(prev =>
                      prev.filter(el => el.id !== objetoMesaActivo.id)
                    );
                    setObjetoMesaActivo(null);
                  }}
                >
                  Eliminar objeto
                </button>
              </div>
              {objetoMesaActivo.descripcion && (
                <p className="mochila-mesa-desc">{objetoMesaActivo.descripcion}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {itemAbierto && (
        <div className="archivo-visor" onClick={() => setItemAbierto(null)}>
          <div className="archivo-visor-caja" onClick={e => e.stopPropagation()}>
            <header className="archivo-visor-cabecera">
              <span className="archivo-visor-nombre">
                {itemAbierto.tipo === "posit" ? "Nota en mesa" : itemAbierto.nombre}
              </span>
              <div className="archivo-visor-acciones">
                {itemAbierto.tipo === "archivo" && !itemAbierto.contenidoLocal && (
                  <a
                    className="archivo-visor-descargar"
                    href={archivosApi.url(itemAbierto.archivoId, true)}
                    download={itemAbierto.nombre}
                  >
                    Descargar
                  </a>
                )}
                {jugadorSeleccionado && onEnviarElemento && (
                  <button
                    type="button"
                    className="archivo-visor-descargar"
                    onClick={() => {
                      void onEnviarElemento(jugadorSeleccionado, itemAbierto);
                      setItemAbierto(null);
                    }}
                  >
                    Pasar a {jugadorSeleccionado.nombre}
                  </button>
                )}
                <button
                  type="button"
                  className="archivo-visor-cerrar"
                  onClick={() => setItemAbierto(null)}
                >
                  Cerrar
                </button>
              </div>
            </header>

            <div className="archivo-visor-marco">
              {itemAbierto.tipo === "posit" ? (
                <textarea
                  className="mesa-visor-posit-editor"
                  style={{
                    background: itemAbierto.color,
                    color: textoLegible(itemAbierto.color)
                  }}
                  value={itemAbierto.texto}
                  onChange={e => {
                    const texto = e.target.value;
                    setItemAbierto(prev =>
                      prev && prev.tipo === "posit" ? { ...prev, texto } : prev
                    );
                    onElementosMesa?.(prev =>
                      prev.map(item =>
                        item.id === itemAbierto.id && item.tipo === "posit"
                          ? { ...item, texto }
                          : item
                      )
                    );
                  }}
                />
              ) : itemAbierto.tipo === "objeto" ? (
                <div className="mochila-mesa-cuerpo">
                  <p className="mochila-mesa-desc">
                    {itemAbierto.descripcion || itemAbierto.nombre}
                  </p>
                </div>
              ) : itemAbierto.vista === "imagen" ? (
                <img
                  src={
                    itemAbierto.contenidoLocal ??
                    archivosApi.url(itemAbierto.archivoId)
                  }
                  alt={itemAbierto.nombre}
                />
              ) : itemAbierto.vista === "pdf" ? (
                <iframe
                  src={archivosApi.url(itemAbierto.archivoId)}
                  title={itemAbierto.nombre}
                />
              ) : itemAbierto.vista === "texto" ? (
                <TextoArchivoMesa
                  archivoId={itemAbierto.archivoId}
                  nombre={itemAbierto.nombre}
                  contenidoLocal={itemAbierto.contenidoLocal}
                />
              ) : itemAbierto.vista === "docx" ? (
                <div id="sala-docx-contenedor" className="docx-contenedor" />
              ) : (
                <p className="muted">
                  Este tipo de archivo no se puede previsualizar aquí. Usa «Descargar».
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {aviso && <div className="sala-aviso">{aviso}</div>}

          {visorDoc && (
            <DocumentoVisorModal
              archivo={visorDoc}
              esMaster={esMaster}
              imagenEscena={imagenEscena}
              imagenProyectada={imagenProyectada}
              onCambiarEscena={onCambiarEscena}
              onProyectarImagen={onProyectarImagen}
              onCerrar={() => setVisorDoc(null)}
            />
          )}

          {visorEscena && imagenEscena && (
            <DocumentoVisorModal
              archivo={{
                id: imagenEscena.id,
                nombre: imagenEscena.titulo ?? "Escena de campaña",
                vista: "imagen",
                url: urlImagenEscena(imagenEscena)
              }}
              esMaster={esMaster}
              imagenEscena={imagenEscena}
              imagenProyectada={imagenProyectada}
              onCambiarEscena={onCambiarEscena}
              onProyectarImagen={onProyectarImagen}
              onCerrar={() => setVisorEscena(false)}
            />
          )}

          {panelMasterAbierto && esMaster && (
            <PanelImagenesMasterModal
              imagenEscena={imagenEscena}
              imagenProyectada={imagenProyectada}
              onCambiarEscena={onCambiarEscena}
              onProyectarImagen={onProyectarImagen}
              onCerrar={() => setPanelMasterAbierto(false)}
            />
          )}
    </div>
  );
}
