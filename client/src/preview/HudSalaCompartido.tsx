import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Minus,
  Moon,
  Pencil,
  Plus,
  Search,
  Snowflake,
  Trash2,
  Upload,
  Users,
  VenetianMask,
  X
} from "lucide-react";
import type {
  CSSProperties,
  Dispatch,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { archivosApi } from "../api/archivos.api";
import type { PublicJugadorResumenInventario } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import { DocumentoVisorModal } from "./Archivador";
import { infoFormatoArchivo, nuevoId } from "./calibracion";
import { ChatSala } from "./ChatSala";
import { crearElementoDesdeArchivo, nuevoIdElemento } from "./compartir";
import { COLORES_POSIT, obtenerModoClaro } from "./datos";
import type { ArchivoItem } from "./Mapa";
import { Posit } from "./Pizarra";
import { PopoverPalomaEnviar } from "./PopoverPalomaEnviar";
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
  IconoPaloma,
  recortarImagenCuadrada
} from "./inventario";
import {
  cargarMacrosLocales,
  guardarMacrosLocales,
  ICONOS_MACROS,
  IconoMacro
} from "./macros";
import { reproducirSonidoConsumir, reproducirSonidoMonedas } from "./sonido";
import {
  reproducirSonidoRoll,
  reproducirSonidoRollSecreto,
  reproducirSonidoTirada
} from "./sonidoDados";
import { COLORES_DIVISA, COLORES_MACRO } from "./tipos";
import type {
  DivisaConfig,
  DocumentoMesa,
  ElementoMesa,
  JugadorPreview,
  MacroTirada,
  MensajeSala,
  ObjetoMochila,
  RectPizarra,
  TipoEspecialTirada,
  TiradaAsiento
} from "./tipos";

const CLAVE_COLOR_DADO = "pocketrol.colorDado";
const CLAVE_COLOR_ARISTAS_DADO = "pocketrol.colorAristasDado";

function cargarColorDadoLocal(fallback = "#e8c56a", clave = CLAVE_COLOR_DADO): string {
  try {
    const guardado = window.localStorage.getItem(clave);
    if (guardado && /^#[0-9a-fA-F]{6}$/.test(guardado)) {
      return guardado;
    }
  } catch {
    // Ignoramos errores de almacenamiento
  }
  return fallback;
}

export interface HudSalaCompartidoProps {
  jugadores: JugadorPreview[];
  esMaster?: boolean;
  miUsuarioId?: string;
  hostName?: string;
  yoAsientoId?: string;
  mensajesChat?: MensajeSala[];
  onEnviarChat?: (texto: string, destinatarioId: string | null) => void | Promise<void>;
  onTiradaPublica?: (tirada: {
    total: number;
    formula: string;
    dados: number[];
    bonificador: number;
    caras: number;
    especial: TipoEspecialTirada;
    soloMaster?: boolean;
    color?: string;
    colorDado?: string;
    colorAristasDado?: string;
  }) => void | Promise<void>;
  onTiradaLocal?: (tirada: TiradaAsiento & { color?: string; colorAristasDado?: string }) => void;
  macros?: MacroTirada[];
  onMacros?: (macros: MacroTirada[]) => void;
  onSacarMacroAMesa?: (macro: MacroTirada) => void;
  divisa?: number;
  divisaNombre?: string;
  divisasConfig?: DivisaConfig[];
  divisasSaldos?: Record<string, number>;
  onGuardarDivisasConfig?: (divisas: DivisaConfig[]) => void | Promise<void>;
  onCambiarDivisa?: (nueva: number, delta: number, divisaId?: string) => void | Promise<void>;
  onTransferirDivisa?: (
    destino: JugadorPreview,
    divisaId: string,
    cantidad: number
  ) => void | Promise<boolean | void>;
  onCambiarDivisaNombre?: (nuevo: string) => void | Promise<void>;
  mochila?: ObjetoMochila[];
  onMochila?: Dispatch<SetStateAction<ObjetoMochila[]>>;
  onEnviarObjetoMochila?: (
    destino: JugadorPreview,
    objeto: ObjetoMochila,
    cantidad?: number
  ) => void | Promise<void>;
  onConsultarResumenMaster?: () => Promise<PublicJugadorResumenInventario[]>;
  onSolicitarArchivos?: () => void;
  elementosMesa?: ElementoMesa[];
  onElementosMesa?: Dispatch<SetStateAction<ElementoMesa[]>>;
  archivosDisponibles?: ArchivoItem[];
  onEnviarElemento?: (destino: JugadorPreview, elemento: ElementoMesa) => void | Promise<void>;
  onAbrirArchivador?: () => void;
  onCompartirATodos?: (elemento: ElementoMesa) => void | Promise<void>;
  onAviso?: (texto: string) => void;
  chatRect?: RectPizarra;
  dockPos?: { x: number; y: number };
  dibujoCongelado?: boolean;
}

const DURACION_RESULTADO = 4500;
const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100] as const;

const DADOS_RAPIDOS = [
  { caras: 4, color: "#38d9a9", colorClaro: "#1E9E78", glow: "rgb(56 217 169 / 32%)" },
  { caras: 6, color: "#4dabf7", colorClaro: "#2A7FD1", glow: "rgb(77 171 247 / 32%)" },
  { caras: 8, color: "#b197fc", colorClaro: "#7A5CD6", glow: "rgb(177 151 252 / 34%)" },
  { caras: 10, color: "#ffa94d", colorClaro: "#D9791B", glow: "rgb(255 169 77 / 32%)" },
  { caras: 20, color: "#e8c56a", colorClaro: "#D9534F", glow: "rgb(232 197 106 / 34%)" }
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

function limitar(valor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, valor));
}

function detectarEspecialDado(caras: number, valor: number): TipoEspecialTirada {
  if (valor === caras) return "critico";
  if (valor === 1) return "pifia";
  return null;
}

function detectarEspecialTirada(caras: number, dados: number[]): TipoEspecialTirada {
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

function IconoD20({
  valor,
  color,
  colorAristas
}: {
  valor?: number | string;
  color?: string;
  colorAristas?: string;
}) {
  const aristas = colorAristas || "#b794f4";
  const estiloPoligono = color
    ? { fill: color, stroke: aristas }
    : colorAristas
      ? { stroke: aristas }
      : undefined;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polygon
        points="12,2 21,7 21,17 12,22 3,17 3,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={estiloPoligono}
      />
      <polygon
        points="12,6.5 17.5,15.5 6.5,15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <line x1="12" y1="2" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <line x1="21" y1="7" x2="17.5" y2="15.5" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <line x1="3" y1="7" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <line x1="12" y1="22" x2="17.5" y2="15.5" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      <line x1="12" y1="22" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
      {valor !== undefined && (
        <text
          x="12"
          y="14"
          textAnchor="middle"
          fontSize="5.4"
          fill="currentColor"
          fontFamily="'Press Start 2P', monospace"
        >
          {valor}
        </text>
      )}
    </svg>
  );
}

export function IconoDadoPoligono({
  caras,
  valor,
  color,
  colorAristas
}: {
  caras: number;
  valor?: number | string;
  color?: string;
  colorAristas?: string;
}) {
  const aristas = colorAristas || "#b794f4";
  const estiloPoligono = color
    ? { fill: color, stroke: aristas }
    : colorAristas
      ? { stroke: aristas }
      : undefined;
  const etiqueta =
    valor !== undefined ? (
      <text
        x="12"
        y={caras === 4 ? "16.8" : "14.5"}
        textAnchor="middle"
        fontSize="5.6"
        fill={color ? "#ffffff" : "currentColor"}
        stroke={color ? "#090612" : "none"}
        strokeWidth={color ? "0.9" : undefined}
        paintOrder={color ? "stroke fill" : undefined}
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
          style={estiloPoligono}
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
          style={estiloPoligono}
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
          style={estiloPoligono}
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
          style={estiloPoligono}
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
          style={estiloPoligono}
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
          style={estiloPoligono}
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
  return <IconoD20 valor={valor} color={color} colorAristas={colorAristas} />;
}

function IconoPosit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 4h14v11l-5 5H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M14 15v5l5-5h-5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoArchivador() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M9 13h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Superposición compartida del HUD de sala (Chat compacto, Dados, Macros,
 * Dados rápidos, Tirada flotante, Dinero, Mochila e inspección del Máster)
 * para vistas inmersivas como el Mapa táctico.
 */
export function HudSalaCompartido({
  jugadores,
  esMaster = false,
  miUsuarioId = "master",
  hostName,
  yoAsientoId = "master",
  mensajesChat,
  onEnviarChat,
  onTiradaPublica,
  onTiradaLocal,
  macros,
  onMacros,
  onSacarMacroAMesa,
  divisa,
  divisaNombre = "Divisa",
  divisasConfig,
  divisasSaldos,
  onGuardarDivisasConfig,
  onCambiarDivisa,
  onTransferirDivisa,
  onCambiarDivisaNombre,
  mochila,
  onMochila,
  onEnviarObjetoMochila,
  onConsultarResumenMaster,
  onSolicitarArchivos,
  elementosMesa = [],
  onElementosMesa,
  archivosDisponibles,
  onEnviarElemento,
  onAbrirArchivador,
  onCompartirATodos,
  onAviso,
  chatRect = { x: 76.5, y: 66, w: 22, h: 28 },
  dockPos = { x: 50, y: 92 },
  dibujoCongelado = false
}: HudSalaCompartidoProps) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [tiradaSecreta, setTiradaSecreta] = useState(false);
  const colorJugadorActual =
    jugadores.find(j => (j.userId ?? j.id) === miUsuarioId)?.color || "#e8c56a";
  const [colorDado, setColorDado] = useState<string>(() =>
    cargarColorDadoLocal(colorJugadorActual)
  );
  const [colorAristasDado, setColorAristasDado] = useState<string>(() =>
    cargarColorDadoLocal("#b794f4", CLAVE_COLOR_ARISTAS_DADO)
  );
  const [modoClaro, setModoClaro] = useState<boolean>(obtenerModoClaro);

  useEffect(() => {
    const alCambiarTema = () => setModoClaro(obtenerModoClaro());
    window.addEventListener("pocketrol:tema", alCambiarTema);
    return () => window.removeEventListener("pocketrol:tema", alCambiarTema);
  }, []);

  function actualizarColorDado(nuevoColor: string): void {
    setColorDado(nuevoColor);
    try {
      window.localStorage.setItem(CLAVE_COLOR_DADO, nuevoColor);
    } catch {
      // Ignoramos errores de almacenamiento
    }
  }

  function actualizarColorAristasDado(nuevoColor: string): void {
    setColorAristasDado(nuevoColor);
    try {
      window.localStorage.setItem(CLAVE_COLOR_ARISTAS_DADO, nuevoColor);
    } catch {
      // Ignoramos errores de almacenamiento
    }
  }
  const [cantidadDados, setCantidadDados] = useState(1);
  const [tipoDado, setTipoDado] = useState<number>(20);
  const [bonificador, setBonificador] = useState(0);
  const [compuestaAbierta, setCompuestaAbierta] = useState(false);
  const [gruposCompuesta, setGruposCompuesta] = useState<GrupoDado[]>([
    { id: "g-0", cantidad: 1, caras: 20 }
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
  const [macroColor, setMacroColor] = useState("");
  const [macroGrupos, setMacroGrupos] = useState<GrupoDado[]>([
    { id: "m-0", cantidad: 1, caras: 20 }
  ]);
  const [macroBonificador, setMacroBonificador] = useState(0);

  const CLAVE_CHAT_MAPA = "pocketrol.mapa.chat.v3";

  function cargarChatMapaRect(defecto: RectPizarra): RectPizarra {
    try {
      const bruto = window.localStorage.getItem(CLAVE_CHAT_MAPA);
      if (!bruto) return defecto;
      const parsed = JSON.parse(bruto) as Partial<RectPizarra>;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        typeof parsed.w === "number" &&
        typeof parsed.h === "number"
      ) {
        return {
          x: limitar(parsed.x, 0.5, Math.max(0.5, 99.5 - parsed.w)),
          y: limitar(parsed.y, 0.5, Math.max(0.5, 99.5 - parsed.h)),
          w: parsed.w,
          h: parsed.h
        };
      }
    } catch {
      // sin localStorage
    }
    return defecto;
  }

  function guardarChatMapaRect(rect: RectPizarra): void {
    try {
      window.localStorage.setItem(CLAVE_CHAT_MAPA, JSON.stringify(rect));
    } catch {
      // sin localStorage
    }
  }

  const [chatPos, setChatPos] = useState<RectPizarra>(() => cargarChatMapaRect(chatRect));

  function iniciarArrastreChat(evento: ReactPointerEvent): void {
    if (evento.button !== 0) return;
    if ((evento.target as HTMLElement | null)?.closest("button, input, a")) return;
    evento.preventDefault();
    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    const base = chatPos;
    let ultimo = base;

    function mover(ev: globalThis.PointerEvent): void {
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const dx = ((ev.clientX - inicioX) / vw) * 100;
      const dy = ((ev.clientY - inicioY) / vh) * 100;
      ultimo = {
        ...base,
        x: limitar(base.x + dx, 0.5, Math.max(0.5, 99.5 - base.w)),
        y: limitar(base.y + dy, 0.5, Math.max(0.5, 99.5 - base.h))
      };
      setChatPos(ultimo);
    }

    function soltar(): void {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      guardarChatMapaRect(ultimo);
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  function iniciarRedimensionChat(evento: ReactPointerEvent): void {
    if (evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    const base = chatPos;
    let ultimo = base;

    function mover(ev: globalThis.PointerEvent): void {
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const dx = ((ev.clientX - inicioX) / vw) * 100;
      const dy = ((ev.clientY - inicioY) / vh) * 100;
      ultimo = {
        ...base,
        w: limitar(base.w + dx, 14, Math.max(14, 99.5 - base.x)),
        h: limitar(base.h + dy, 14, Math.max(14, 99.5 - base.y))
      };
      setChatPos(ultimo);
    }

    function soltar(): void {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      guardarChatMapaRect(ultimo);
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  const [divisaLocal, setDivisaLocal] = useState<number>(cargarDivisaLocal);
  const [divisasConfigLocal, setDivisasConfigLocal] = useState<DivisaConfig[]>(() => [
    { id: "principal", nombre: divisaNombre, color: COLORES_DIVISA[0].hex }
  ]);
  const [divisasSaldosLocal, setDivisasSaldosLocal] = useState<Record<string, number>>({});
  const [divisaAbierta, setDivisaAbierta] = useState(false);
  const [huchaAbierta, setHuchaAbierta] = useState(false);
  const [indiceDivisa, setIndiceDivisa] = useState(0);
  const [nuevaDivisaNombre, setNuevaDivisaNombre] = useState("");
  const [nuevaDivisaColor, setNuevaDivisaColor] = useState<string>(COLORES_DIVISA[0].hex);
  const [divisaPaso, setDivisaPaso] = useState<1 | 10 | 100>(1);
  const [divisaCustomTexto, setDivisaCustomTexto] = useState("");
  const [divisaNombreEdit, setDivisaNombreEdit] = useState(divisaNombre);

  const [mochilaLocal, setMochilaLocal] = useState<ObjetoMochila[]>(cargarMochilaLocal);
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

  const [masterDivisasAbierto, setMasterDivisasAbierto] = useState(false);
  const [masterMochilasAbierto, setMasterMochilasAbierto] = useState(false);
  const [masterResumenJugadores, setMasterResumenJugadores] = useState<
    PublicJugadorResumenInventario[]
  >([]);
  const [masterResumenCargando, setMasterResumenCargando] = useState(false);
  const [masterJugadorMochilaId, setMasterJugadorMochilaId] = useState<string | null>(
    null
  );

  const [tirando, setTirando] = useState(false);
  const [tirada, setTirada] = useState<ResultadoTirada | null>(null);
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
  const [mensajesLocales, setMensajesLocales] = useState<MensajeSala[]>([]);

  const temporizador = useRef<number | null>(null);
  const ocultarResultado = useRef<number | null>(null);
  const avisoTimerRef = useRef<number | null>(null);
  const objetoImgInputRef = useRef<HTMLInputElement>(null);

  const macrosLista = macros ?? macrosLocales;
  const divisasLista: DivisaConfig[] =
    divisasConfig && divisasConfig.length > 0
      ? divisasConfig
      : divisasConfigLocal.map((d, idx) =>
        idx === 0 && d.id === "principal" ? { ...d, nombre: divisaNombre } : d
      );
  const indiceDivisaSeguro =
    divisasLista.length > 0 ? Math.min(indiceDivisa, divisasLista.length - 1) : 0;
  const divisaActiva: DivisaConfig = divisasLista[indiceDivisaSeguro] ?? {
    id: "principal",
    nombre: divisaNombre,
    color: COLORES_DIVISA[0].hex
  };
  const nombreDivisaActiva = divisaActiva.nombre || divisaNombre;
  const divisaActual =
    divisasSaldos && divisaActiva.id in divisasSaldos
      ? divisasSaldos[divisaActiva.id]
      : divisasSaldos && divisasConfig && divisasConfig.length > 0
        ? (divisasSaldos[divisaActiva.id] ?? 0)
        : divisaActiva.id === "principal"
          ? (divisa ?? divisaLocal)
          : (divisasSaldosLocal[divisaActiva.id] ?? 0);
  const mochilaActual = mochila ?? mochilaLocal;
  const mensajesVisibles = mensajesChat ?? mensajesLocales;
  const objetoSeleccionado =
    mochilaActual.find(item => item.id === objetoMochilaId) ?? null;

  const divisaDebounceRef = useRef<{ timer: number | null; acumulado: number }>({
    timer: null,
    acumulado: 0
  });
  const divisaActualRef = useRef(divisaActual);
  divisaActualRef.current = divisaActual;
  const divisaActivaIdRef = useRef(divisaActiva.id);
  divisaActivaIdRef.current = divisaActiva.id;
  const onCambiarDivisaRef = useRef(onCambiarDivisa);
  onCambiarDivisaRef.current = onCambiarDivisa;

  useEffect(() => {
    setDivisaNombreEdit(divisaNombre);
  }, [divisaNombre]);

  useEffect(() => {
    return () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      if (ocultarResultado.current !== null) window.clearTimeout(ocultarResultado.current);
      if (avisoTimerRef.current !== null) window.clearTimeout(avisoTimerRef.current);
      if (divisaDebounceRef.current.timer !== null) {
        window.clearTimeout(divisaDebounceRef.current.timer);
      }
    };
  }, []);

  function mostrarAviso(texto: string): void {
    if (onAviso) {
      onAviso(texto);
      return;
    }
    setAvisoLocal(texto);
    if (avisoTimerRef.current !== null) {
      window.clearTimeout(avisoTimerRef.current);
    }
    avisoTimerRef.current = window.setTimeout(() => setAvisoLocal(null), 3200);
  }

  function enviarChatLocal(texto: string, destinatarioId: string | null): void {
    const autor = jugadores.find(j => (j.userId ?? j.id) === miUsuarioId);
    const destino = destinatarioId
      ? jugadores.find(j => (j.userId ?? j.id) === destinatarioId)
      : null;
    setMensajesLocales(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        autorId: miUsuarioId,
        autorNombre: autor?.nombre ?? (esMaster ? "Máster" : "Jugador"),
        texto,
        destinatarioId,
        destinatarioNombre: destino?.nombre ?? null,
        createdAt: new Date().toISOString()
      }
    ]);
  }

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

  function abrirTiradaCompuesta(): void {
    setGruposCompuesta([{ id: `g-${Date.now()}-${tipoDado}`, cantidad: cantidadDados, caras: tipoDado }]);
    setBonificadorCompuesta(bonificador);
    setMacrosAbierto(false);
    setCompuestaAbierta(true);
  }

  function agregarDadoCompuesta(caras: number): void {
    setGruposCompuesta(prev => {
      const existente = prev.find(g => g.caras === caras);
      if (existente) {
        return prev.map(g =>
          g.caras === caras ? { ...g, cantidad: Math.min(20, g.cantidad + 1) } : g
        );
      }
      if (prev.length >= 6) return prev;
      return [...prev, { id: `g-${Date.now()}-${caras}`, cantidad: 1, caras }];
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
    setMacroColor("");
    setMacroGrupos([{ id: `m-${Date.now()}-0`, cantidad: 1, caras: 20 }]);
    setMacroBonificador(0);
    setMacrosAbierto(false);
    setMacroModalAbierto(true);
  }

  function abrirEditarMacro(macro: MacroTirada): void {
    setMacroEditandoId(macro.id);
    setMacroNombre(macro.nombre);
    setMacroIcono(macro.icono);
    setMacroColor(macro.color ?? "");
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
              ...(macroColor ? { color: macroColor } : { color: undefined }),
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
        ...(macroColor ? { color: macroColor } : {}),
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

    if (esSecretaMaster) {
      reproducirSonidoRollSecreto();
    } else {
      reproducirSonidoRoll();
    }

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
        reproducirSonidoTirada(resultadoFinal.especial);

        if (!esSecretaMaster) {
          const desgloseTexto =
            resultadoFinal.desgloseDados.length > 1 ||
              resultadoFinal.bonificador !== 0
              ? `${resultadoFinal.dados.join("+")}${resultadoFinal.bonificador > 0
                ? `+${resultadoFinal.bonificador}`
                : resultadoFinal.bonificador < 0
                  ? `${resultadoFinal.bonificador}`
                  : ""
              }`
              : undefined;
          onTiradaLocal?.({
            id: `${Date.now()}-${Math.random()}`,
            total: resultadoFinal.total,
            especial: resultadoFinal.especial,
            caras: resultadoFinal.caras,
            desglose: desgloseTexto,
            color: colorDado,
            colorDado,
            colorAristasDado
          });
          if (onTiradaPublica) {
            void onTiradaPublica({
              ...resultadoFinal,
              color: colorDado,
              colorDado,
              colorAristasDado,
              ...(esSoloMaster ? { soloMaster: true } : {})
            });
          } else {
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

  function emitirDivisaLocal(delta: number, total: number): void {
    if (delta === 0) return;
    reproducirSonidoMonedas(delta);
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
    const divisaIdActual = divisaActivaIdRef.current;
    const nuevo = Math.max(0, Math.min(999_999_999_999, Math.trunc(actual + deltaBruto)));
    const deltaReal = nuevo - actual;
    if (deltaReal === 0) return;

    if (divisasSaldos === undefined) {
      if (divisaIdActual === "principal") {
        if (divisa === undefined) {
          setDivisaLocal(nuevo);
          guardarDivisaLocal(nuevo);
        }
      } else {
        setDivisasSaldosLocal(prev => ({ ...prev, [divisaIdActual]: nuevo }));
      }
    }

    if (inmediato) {
      if (divisaDebounceRef.current.timer !== null) {
        window.clearTimeout(divisaDebounceRef.current.timer);
        divisaDebounceRef.current.timer = null;
      }
      const deltaTotal = divisaDebounceRef.current.acumulado + deltaReal;
      divisaDebounceRef.current.acumulado = 0;
      if (onCambiarDivisaRef.current) {
        void onCambiarDivisaRef.current(nuevo, deltaTotal, divisaIdActual);
      } else {
        emitirDivisaLocal(deltaTotal, nuevo);
      }
      return;
    }

    if (onCambiarDivisaRef.current && (divisa !== undefined || divisasSaldos !== undefined)) {
      void onCambiarDivisaRef.current(nuevo, 0, divisaIdActual);
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
        void onCambiarDivisaRef.current(divisaActualRef.current, deltaAcum, divisaIdActual);
      } else {
        emitirDivisaLocal(deltaAcum, divisaActualRef.current);
      }
    }, 750);
  }

  function actualizarDivisasConfig(siguiente: DivisaConfig[]): void {
    if (onGuardarDivisasConfig) {
      void onGuardarDivisasConfig(siguiente);
    } else {
      setDivisasConfigLocal(siguiente);
    }
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

  function crearObjetoMochila(evento: FormEvent): void {
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

  // --- Posits, documentos, objetos y macros sobre el mapa ---
  const [positActivo, setPositActivo] = useState<string | null>(null);
  const [visorDoc, setVisorDoc] = useState<DocumentoMesa | null>(null);
  const [objetoMesaActivo, setObjetoMesaActivo] = useState<
    Extract<ElementoMesa, { tipo: "objeto" }> | null
  >(null);
  const [archivadorMapaAbierto, setArchivadorMapaAbierto] = useState(false);
  const [enviarPopoverAbierto, setEnviarPopoverAbierto] = useState(false);
  const [enviarDestinoId, setEnviarDestinoId] = useState<string | null>(null);

  const onElementosMesaRef = useRef(onElementosMesa);
  const onEnviarElementoRef = useRef(onEnviarElemento);
  const jugadoresRef = useRef(jugadores);
  const arrastreElementoMovido = useRef(false);

  useEffect(() => {
    onElementosMesaRef.current = onElementosMesa;
    onEnviarElementoRef.current = onEnviarElemento;
    jugadoresRef.current = jugadores;
  }, [onElementosMesa, onEnviarElemento, jugadores]);

  const positsVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "posit" }> =>
      el.tipo === "posit" && !el.archivado
  );
  const docsVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "archivo" }> =>
      el.tipo === "archivo" && !el.archivado
  );
  const objetosVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "objeto" }> =>
      el.tipo === "objeto" && !el.archivado
  );
  const macrosVisibles = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "macro" }> =>
      el.tipo === "macro" && !el.archivado
  );
  const elementosArchivados = elementosMesa.filter(el => Boolean(el.archivado));
  const elementosEnviables = elementosMesa.filter(
    el => el.tipo !== "macro" && !el.archivado
  );
  const destinatariosDisponibles = jugadores.filter(
    j => j.activo && j.id !== yoAsientoId && j.usuarioId !== miUsuarioId
  );

  useEffect(() => {
    let ultimoSupr: { id: string; tipo: string } | null = null;
    function alPointerDown(evento: globalThis.PointerEvent) {
      const nodo = (evento.target as HTMLElement | null)?.closest<HTMLElement>("[data-supr-id]");
      if (nodo?.dataset.suprId && nodo.dataset.suprTipo) {
        ultimoSupr = { id: nodo.dataset.suprId, tipo: nodo.dataset.suprTipo };
      } else {
        ultimoSupr = null;
      }
    }
    function alSuprimir(evento: KeyboardEvent) {
      if (evento.key !== "Delete") return;
      const target = evento.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const hoverNodo = document.querySelector<HTMLElement>("[data-supr-id]:hover");
      const id = hoverNodo?.dataset.suprId ?? ultimoSupr?.id;
      const tipo = hoverNodo?.dataset.suprTipo ?? ultimoSupr?.tipo;
      if (!id || !tipo) return;
      evento.preventDefault();
      if (tipo === "posit") {
        onElementosMesaRef.current?.(prev => prev.filter(el => el.id !== id));
        setPositActivo(actual => (actual === id ? null : actual));
      } else if (tipo === "archivo") {
        onElementosMesaRef.current?.(prev =>
          prev.map(el => (el.id === id ? { ...el, archivado: true } : el))
        );
      } else if (tipo === "objeto" || tipo === "macro") {
        onElementosMesaRef.current?.(prev => prev.filter(el => el.id !== id));
      }
      ultimoSupr = null;
    }
    window.addEventListener("pointerdown", alPointerDown);
    window.addEventListener("keydown", alSuprimir);
    return () => {
      window.removeEventListener("pointerdown", alPointerDown);
      window.removeEventListener("keydown", alSuprimir);
    };
  }, []);

  function detectarJugadorEnPunto(clientX: number, clientY: number): JugadorPreview | null {
    const nodos = document.querySelectorAll<HTMLElement>("[data-jugador-id]");
    for (const nodo of nodos) {
      const rect = nodo.getBoundingClientRect();
      if (
        clientX >= rect.left - 6 &&
        clientX <= rect.right + 6 &&
        clientY >= rect.top - 6 &&
        clientY <= rect.bottom + 6
      ) {
        const jid = nodo.dataset.jugadorId;
        const juid = nodo.dataset.jugadorUsuarioId;
        const encontrado = jugadoresRef.current.find(
          j =>
            (j.id === jid || (juid && j.usuarioId === juid)) &&
            j.activo &&
            j.id !== yoAsientoId &&
            j.usuarioId !== miUsuarioId
        );
        if (encontrado) return encontrado;
      }
    }
    return null;
  }

  function iniciarArrastreElemento(
    evento: ReactPointerEvent,
    elemento: ElementoMesa
  ): void {
    if (evento.button !== 0) return;
    if (
      elemento.tipo === "posit" &&
      (evento.target as HTMLElement | null)?.closest("textarea, button, input")
    ) {
      return;
    }
    evento.preventDefault();
    evento.stopPropagation();

    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    const baseX = elemento.x;
    const baseY = elemento.y;
    arrastreElementoMovido.current = false;
    if (elemento.tipo === "posit") {
      setPositActivo(elemento.id);
    }

    function mover(ev: globalThis.PointerEvent): void {
      if (
        !arrastreElementoMovido.current &&
        Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) > 4
      ) {
        arrastreElementoMovido.current = true;
        if (elemento.tipo !== "macro") {
          document.body.dataset.mapaArrastrandoEnvio = "true";
        }
      }
      if (!arrastreElementoMovido.current) return;
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const nx = limitar(baseX + ((ev.clientX - inicioX) / vw) * 100, 3, 97);
      const ny = limitar(baseY + ((ev.clientY - inicioY) / vh) * 100, 3, 97);
      onElementosMesaRef.current?.(prev =>
        prev.map(el => (el.id === elemento.id ? { ...el, x: nx, y: ny } : el))
      );
    }

    function soltar(ev: globalThis.PointerEvent): void {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      delete document.body.dataset.mapaArrastrandoEnvio;

      if (
        arrastreElementoMovido.current &&
        elemento.tipo !== "macro" &&
        onEnviarElementoRef.current
      ) {
        const destino = detectarJugadorEnPunto(ev.clientX, ev.clientY);
        if (destino) {
          onElementosMesaRef.current?.(prev =>
            prev.map(el =>
              el.id === elemento.id ? { ...el, x: baseX, y: baseY } : el
            )
          );
          void onEnviarElementoRef.current(destino, {
            ...elemento,
            x: baseX,
            y: baseY
          });
        }
      }

      window.setTimeout(() => {
        arrastreElementoMovido.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  function iniciarArrastreMacroMenu(
    evento: ReactPointerEvent,
    macro: MacroTirada
  ): void {
    if (evento.button !== 0) return;
    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    arrastreElementoMovido.current = false;

    function mover(ev: globalThis.PointerEvent): void {
      if (
        !arrastreElementoMovido.current &&
        Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) > 6
      ) {
        arrastreElementoMovido.current = true;
        setMacrosAbierto(false);
      }
    }

    function soltar(ev: globalThis.PointerEvent): void {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);

      if (arrastreElementoMovido.current) {
        const vw = Math.max(1, window.innerWidth);
        const vh = Math.max(1, window.innerHeight);
        const x = limitar((ev.clientX / vw) * 100, 6, 94);
        const y = limitar((ev.clientY / vh) * 100, 10, 90);
        if (onElementosMesaRef.current) {
          onElementosMesaRef.current(prev => [
            ...prev,
            {
              id: nuevoIdElemento(),
              tipo: "macro",
              macroId: macro.id,
              nombre: macro.nombre,
              icono: macro.icono,
              ...(macro.color ? { color: macro.color } : {}),
              grupos: macro.grupos,
              bonificador: macro.bonificador,
              x,
              y
            }
          ]);
          mostrarAviso(`Macro «${macro.nombre}» colocada en el mapa.`);
        } else if (onSacarMacroAMesa) {
          onSacarMacroAMesa(macro);
        }
      }

      window.setTimeout(() => {
        arrastreElementoMovido.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  function crearPositMapa(): void {
    if (!onElementosMesa) {
      mostrarAviso("No se pueden crear posits en esta vista.");
      return;
    }
    const posit: Extract<ElementoMesa, { tipo: "posit" }> = {
      id: `posit-${nuevoId()}`,
      tipo: "posit",
      texto: "",
      color: COLORES_POSIT[3].valor,
      x: 46 + (Math.random() - 0.5) * 14,
      y: 44 + (Math.random() - 0.5) * 14,
      giro: (Math.random() - 0.5) * 4
    };
    onElementosMesa(prev => [...prev, posit]);
    setPositActivo(posit.id);
  }

  function cambiarTextoPositMapa(id: string, texto: string): void {
    onElementosMesa?.(prev =>
      prev.map(el => (el.id === id && el.tipo === "posit" ? { ...el, texto } : el))
    );
  }

  function cambiarColorPositMapa(id: string, color: string): void {
    onElementosMesa?.(prev =>
      prev.map(el => (el.id === id && el.tipo === "posit" ? { ...el, color } : el))
    );
  }

  function redimensionarPositMapa(id: string, ancho: number, alto: number): void {
    onElementosMesa?.(prev =>
      prev.map(el =>
        el.id === id && el.tipo === "posit" ? { ...el, ancho, alto } : el
      )
    );
  }

  function archivarPositMapa(id: string): void {
    onElementosMesa?.(prev =>
      prev.map(el =>
        el.id === id && el.tipo === "posit" ? { ...el, archivado: true } : el
      )
    );
    setPositActivo(actual => (actual === id ? null : actual));
    mostrarAviso("Posit guardado en el archivador.");
  }

  function borrarPositMapa(id: string): void {
    onElementosMesa?.(prev => prev.filter(el => el.id !== id));
    setPositActivo(actual => (actual === id ? null : actual));
  }

  function archivarDocMapa(id: string): void {
    onElementosMesa?.(prev =>
      prev.map(el =>
        el.id === id && el.tipo === "archivo" ? { ...el, archivado: true } : el
      )
    );
    setVisorDoc(actual => (actual?.id === id ? null : actual));
  }

  function sacarArchivoAMapa(archivo: ArchivoItem): void {
    if (!onElementosMesa) return;
    const elemento = crearElementoDesdeArchivo(
      { ...archivo, createdAt: new Date().toISOString() },
      {
        x: 46 + (Math.random() - 0.5) * 14,
        y: 44 + (Math.random() - 0.5) * 14
      }
    );
    onElementosMesa(prev => [...prev, elemento]);
    setArchivadorMapaAbierto(false);
    mostrarAviso(`«${archivo.nombre}» sacado al mapa.`);
  }

  function desarchivarElementoMapa(id: string): void {
    onElementosMesa?.(prev =>
      prev.map(el => (el.id === id ? { ...el, archivado: false } : el))
    );
    setArchivadorMapaAbierto(false);
  }

  function guardarObjetoMapaEnMochila(
    obj: Extract<ElementoMesa, { tipo: "objeto" }>
  ): void {
    actualizarListaMochila(prev => [
      ...prev,
      {
        id: `obj-${nuevoId()}`,
        nombre: obj.nombre,
        descripcion: obj.descripcion,
        cantidad: obj.cantidad,
        emoji: obj.emoji,
        archivoId: obj.archivoId,
        archivoNombre: obj.archivoNombre,
        imagenLocal: obj.imagenLocal
      }
    ]);
    onElementosMesa?.(prev => prev.filter(el => el.id !== obj.id));
    setObjetoMesaActivo(null);
    mostrarAviso(`«${obj.nombre}» guardado en la mochila.`);
  }

  return (
    <div
      className="hud-mapa-capa"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 24 }}
    >
      {/* Capa flotante de posits, documentos, objetos y rombos de macros */}
      <div
        className="mapa-elementos-capa"
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 23 }}
      >
        {positsVisibles.map(posit => (
          <Posit
            key={posit.id}
            posit={posit}
            enMesa
            activo={positActivo === posit.id}
            onActivar={setPositActivo}
            onTexto={cambiarTextoPositMapa}
            onColor={cambiarColorPositMapa}
            onCompartirATodos={
              esMaster && onCompartirATodos
                ? id => {
                  const positElem = positsVisibles.find(el => el.id === id);
                  if (positElem) void onCompartirATodos(positElem);
                }
                : undefined
            }
            onArchivar={archivarPositMapa}
            onBorrar={borrarPositMapa}
            onArrastrar={evento => iniciarArrastreElemento(evento, posit)}
            onRedimensionar={redimensionarPositMapa}
          />
        ))}

        {docsVisibles.map(doc => {
          const formato = infoFormatoArchivo(doc.vista);
          return (
            <div
              key={doc.id}
              data-supr-id={doc.id}
              data-supr-tipo="archivo"
              className="ficha-doc"
              style={
                {
                  left: `${doc.x}%`,
                  top: `${doc.y}%`,
                  "--doc-color": formato.color,
                  pointerEvents: "auto"
                } as CSSProperties
              }
              onPointerDown={evento => iniciarArrastreElemento(evento, doc)}
            >
              <div
                className="ficha-doc-barra"
                onPointerDown={evento => evento.stopPropagation()}
              >
                {esMaster && onCompartirATodos && (
                  <button
                    type="button"
                    className="doc-master-icono"
                    title="Dar a todos"
                    aria-label="Dar a todos"
                    onClick={evento => {
                      evento.stopPropagation();
                      void onCompartirATodos(doc);
                    }}
                  >
                    <Users size={13} strokeWidth={2.1} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="posit-archivar"
                  title="Archivar documento"
                  aria-label="Archivar documento"
                  onClick={evento => {
                    evento.stopPropagation();
                    archivarDocMapa(doc.id);
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
                  if (arrastreElementoMovido.current) return;
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
            data-supr-id={obj.id}
            data-supr-tipo="objeto"
            className="mesa-objeto"
            style={{ left: `${obj.x}%`, top: `${obj.y}%`, pointerEvents: "auto" }}
            title={`${obj.nombre} (x${obj.cantidad})`}
            onPointerDown={evento => iniciarArrastreElemento(evento, obj)}
            onClick={() => {
              if (!arrastreElementoMovido.current) {
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

        {macrosVisibles.map(macroElem => (
          <div
            key={macroElem.id}
            data-supr-id={macroElem.id}
            data-supr-tipo="macro"
            className="mesa-macro-rombo"
            style={{
              left: `${macroElem.x}%`,
              top: `${macroElem.y}%`,
              pointerEvents: "auto"
            }}
            onPointerDown={evento => iniciarArrastreElemento(evento, macroElem)}
            onClick={() => {
              if (arrastreElementoMovido.current) return;
              lanzarMacro({
                id: macroElem.macroId,
                nombre: macroElem.nombre,
                icono: macroElem.icono,
                grupos: macroElem.grupos,
                bonificador: macroElem.bonificador
              });
            }}
            title={`Lanzar ${macroElem.nombre}`}
            role="button"
            tabIndex={0}
            aria-label={`Lanzar ${macroElem.nombre}`}
            onKeyDown={evento => {
              if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                lanzarMacro({
                  id: macroElem.macroId,
                  nombre: macroElem.nombre,
                  icono: macroElem.icono,
                  grupos: macroElem.grupos,
                  bonificador: macroElem.bonificador
                });
              }
            }}
          >
            <button
              type="button"
              className="mesa-macro-rombo-cerrar"
              title="Quitar macro de la mesa"
              aria-label={`Quitar ${macroElem.nombre} de la mesa`}
              onPointerDown={evento => evento.stopPropagation()}
              onClick={evento => {
                evento.stopPropagation();
                onElementosMesa?.(prev =>
                  prev.filter(el => el.id !== macroElem.id)
                );
              }}
            >
              <X size={11} strokeWidth={2.5} aria-hidden="true" />
            </button>
            <div
              className="mesa-macro-rombo-cuadro"
              style={macroElem.color ? { background: macroElem.color } : undefined}
            >
              <span className="mesa-macro-rombo-icono">
                <IconoMacro id={macroElem.icono} size={20} />
              </span>
            </div>
            <span className="mesa-macro-rombo-nombre">{macroElem.nombre}</span>
          </div>
        ))}
      </div>
      <div className="chat-en-mapa" style={{ pointerEvents: "none" }}>
        <ChatSala
          rect={chatPos}
          jugadores={jugadores}
          miUsuarioId={miUsuarioId}
          mensajes={mensajesVisibles}
          onEnviarMensaje={onEnviarChat ?? enviarChatLocal}
          onIniciarArrastre={iniciarArrastreChat}
          onIniciarRedimension={iniciarRedimensionChat}
        />
      </div>

      <div
        className="sala-hud-derecha"
        aria-label="Divisa y mochila"
        style={{ pointerEvents: "auto" }}
      >
        {dibujoCongelado && (
          <span
            className="hud-dibujo-congelado-icono"
            title="Dibujo en el mapa congelado por el Máster"
            aria-label="Dibujo congelado"
          >
            <Snowflake size={44} strokeWidth={2.2} aria-hidden="true" />
          </span>
        )}
        <div className="hud-economia-fila">
          <button
            type="button"
            className={`hud-hucha-btn${huchaAbierta ? " activo" : ""}`}
            onClick={() => {
              setDivisaAbierta(false);
              setMochilaAbierta(false);
              setMasterDivisasAbierto(false);
              setMasterMochilasAbierto(false);
              setHuchaAbierta(v => !v);
            }}
            aria-expanded={huchaAbierta}
            title="Cartera (ver todas tus divisas)"
            aria-label="Cartera (ver todas tus divisas)"
          >
            <span className="hud-hucha-label">Cartera</span>
            <svg
              width="24"
              height="24"
              viewBox="0 0 16 16"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <rect x="4" y="2" width="8" height="2" fill="#d4a03a" />
              <rect x="2" y="4" width="12" height="9" fill="#8b5a2b" />
              <rect x="3" y="5" width="10" height="7" fill="#a86f38" />
              <rect x="2" y="4" width="12" height="1" fill="#181020" />
              <rect x="2" y="13" width="12" height="1" fill="#181020" />
              <rect x="1" y="5" width="1" height="8" fill="#181020" />
              <rect x="14" y="5" width="1" height="8" fill="#181020" />
              <rect x="10" y="7" width="4" height="3" fill="#f7d060" />
              <rect x="11" y="8" width="1" height="1" fill="#181020" />
            </svg>
          </button>

          <div className="hud-divisa-caja">
            <span className="hud-divisa-titulo">
              <span
                className="hud-divisa-color-punto"
                style={{ backgroundColor: divisaActiva.color }}
                aria-hidden="true"
              />
              <span>{nombreDivisaActiva}</span>
            </span>
            <div className="hud-divisa-fila">
              {divisasLista.length > 1 && (
                <button
                  type="button"
                  className="hud-divisa-paso hud-divisa-flecha"
                  onClick={() =>
                    setIndiceDivisa(i => (i - 1 + divisasLista.length) % divisasLista.length)
                  }
                  aria-label="Divisa anterior"
                  title="Divisa anterior"
                >
                  <ChevronLeft size={13} strokeWidth={2.6} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="hud-divisa-paso"
                onClick={() => modificarDivisa(-divisaPaso)}
                aria-label={`Restar ${divisaPaso} ${nombreDivisaActiva}`}
                title={`Restar ${divisaPaso}`}
              >
                <Minus size={13} strokeWidth={2.6} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`hud-divisa-centro${divisaAbierta ? " activo" : ""}`}
                onClick={() => {
                  setMochilaAbierta(false);
                  setHuchaAbierta(false);
                  setDivisaAbierta(v => !v);
                }}
                title={`${nombreDivisaActiva}: ${divisaActual.toLocaleString("es-ES")}`}
                aria-expanded={divisaAbierta}
              >
                <span className="hud-divisa-icono-wrap">
                  <IconoMonedasPixel size={38} color={divisaActiva.color} />
                </span>
                <span className="hud-divisa-valor">
                  {formatearDivisaCompacta(divisaActual)}
                </span>
              </button>
              <button
                type="button"
                className="hud-divisa-paso"
                onClick={() => modificarDivisa(divisaPaso)}
                aria-label={`Sumar ${divisaPaso} ${nombreDivisaActiva}`}
                title={`Sumar ${divisaPaso}`}
              >
                <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
              </button>
              {divisasLista.length > 1 && (
                <button
                  type="button"
                  className="hud-divisa-paso hud-divisa-flecha"
                  onClick={() =>
                    setIndiceDivisa(i => (i + 1) % divisasLista.length)
                  }
                  aria-label="Divisa siguiente"
                  title="Divisa siguiente"
                >
                  <ChevronRight size={13} strokeWidth={2.6} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className={`hud-mochila-btn${mochilaAbierta ? " activo" : ""}`}
          onClick={() => {
            setDivisaAbierta(false);
            setHuchaAbierta(false);
            setMasterDivisasAbierto(false);
            setMasterMochilasAbierto(false);
            setEnviarPopoverAbierto(false);
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
              <IconoBilletePixel size={24} />
              <span className="hud-master-label">Dinero mesa</span>
            </button>
            <button
              type="button"
              className={`hud-master-cuadro${masterMochilasAbierto ? " activo" : ""}`}
              onClick={() => alternarPanelMaster("mochilas")}
              aria-expanded={masterMochilasAbierto}
              title="Inspeccionar mochila y objetos de jugadores conectados"
              aria-label="Inspeccionar mochila y objetos de jugadores conectados"
            >
              <IconoLupaPixel size={24} />
              <span className="hud-master-label">Objetos mesa</span>
            </button>
          </div>
        )}

        <button
          type="button"
          className={`hud-enviar-btn${enviarPopoverAbierto ? " activo" : ""}`}
          onClick={() => {
            setDivisaAbierta(false);
            setHuchaAbierta(false);
            setMochilaAbierta(false);
            setMasterDivisasAbierto(false);
            setMasterMochilasAbierto(false);
            setEnviarPopoverAbierto(v => {
              const siguiente = !v;
              if (siguiente && !enviarDestinoId && destinatariosDisponibles.length > 0) {
                setEnviarDestinoId(destinatariosDisponibles[0].id);
              }
              return siguiente;
            });
          }}
          aria-expanded={enviarPopoverAbierto}
          title="Enviar objeto, nota o documento a otro jugador"
        >
          <IconoPaloma size={20} />
          <span>Enviar</span>
        </button>
      </div>

      {enviarPopoverAbierto && (
        <PopoverPalomaEnviar
          esMaster={esMaster}
          hostName={hostName}
          destinatarios={destinatariosDisponibles}
          destinoId={enviarDestinoId}
          onCambiarDestinoId={setEnviarDestinoId}
          mochila={mochilaActual}
          elementosEnviables={elementosEnviables}
          divisasLista={divisasLista}
          saldoDeDivisa={idDivisa =>
            divisasSaldos && idDivisa in divisasSaldos
              ? divisasSaldos[idDivisa]
              : divisasSaldos && divisasConfig && divisasConfig.length > 0
                ? (divisasSaldos[idDivisa] ?? 0)
                : idDivisa === "principal"
                  ? (divisa ?? divisaLocal)
                  : (divisasSaldosLocal[idDivisa] ?? 0)
          }
          onEnviarChat={onEnviarChat ?? enviarChatLocal}
          onEnviarObjetoMochila={onEnviarObjetoMochila}
          onEnviarElemento={onEnviarElemento}
          onTransferirDivisa={onTransferirDivisa}
          onMostrarAviso={mostrarAviso}
          onCerrar={() => setEnviarPopoverAbierto(false)}
          style={{
            pointerEvents: "auto",
            top: 184,
            maxHeight: "65vh",
            overflowY: "auto"
          }}
        />
      )}

      {huchaAbierta && (
        <div
          className="divisa-popover hud-hucha-popover"
          role="dialog"
          aria-label="Hucha de divisas"
          style={{ pointerEvents: "auto" }}
        >
          <div className="dados-selector-cabecera">
            <span>Hucha</span>
            <button
              type="button"
              className="dados-cerrar"
              onClick={() => setHuchaAbierta(false)}
              aria-label="Cerrar hucha"
            >
              <X size={14} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
          <ul className="master-divisa-lista">
            {divisasLista.map((d, idx) => {
              const saldo =
                divisasSaldos && d.id in divisasSaldos
                  ? divisasSaldos[d.id]
                  : divisasSaldos && divisasConfig && divisasConfig.length > 0
                    ? (divisasSaldos[d.id] ?? 0)
                    : d.id === "principal"
                      ? (divisa ?? divisaLocal)
                      : (divisasSaldosLocal[d.id] ?? 0);
              return (
                <li key={d.id} className="master-divisa-item">
                  <button
                    type="button"
                    className="master-divisa-jugador"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      padding: 0,
                      cursor: "pointer"
                    }}
                    onClick={() => {
                      setIndiceDivisa(idx);
                      setHuchaAbierta(false);
                    }}
                  >
                    <span
                      className="compartir-jugador-punto"
                      style={{ backgroundColor: d.color }}
                      aria-hidden="true"
                    />
                    <span>{d.nombre}</span>
                  </button>
                  <span
                    className="master-divisa-monto"
                    title={`${saldo.toLocaleString("es-ES")} ${d.nombre}`}
                  >
                    {saldo.toLocaleString("es-ES")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {masterDivisasAbierto && esMaster && (
        <div
          className="mochila-backdrop"
          style={{ pointerEvents: "auto" }}
          onClick={() => setMasterDivisasAbierto(false)}
        >
          <div
            className="mochila-modal master-inspeccion-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Divisas de jugadores conectados"
            onClick={e => e.stopPropagation()}
          >
            <div className="mochila-cabecera">
              <span className="mochila-titulo">
                <IconoBilletePixel size={22} />
                <span>Dinero en mesa</span>
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
                  onClick={() => setMasterDivisasAbierto(false)}
                  aria-label="Cerrar resumen de divisa"
                >
                  <X size={14} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>
            </div>
            {masterResumenCargando && masterResumenJugadores.length === 0 ? (
              <p className="dados-ayuda">Consultando sala…</p>
            ) : masterResumenJugadores.length === 0 ? (
              <p className="dados-ayuda">No hay jugadores conectados ahora mismo.</p>
            ) : (
              <ul className="master-divisa-lista">
                {masterResumenJugadores.map(j => {
                  const saldosJugador = (
                    j as PublicJugadorResumenInventario & {
                      divisasSaldos?: Record<string, number>;
                    }
                  ).divisasSaldos;
                  return (
                    <li key={j.userId} className="master-divisa-item master-divisa-item-multi">
                      <span className="master-divisa-jugador">
                        <span
                          className="compartir-jugador-punto"
                          style={{ backgroundColor: j.color }}
                          aria-hidden="true"
                        />
                        <span>{j.nombre}</span>
                      </span>
                      <div className="master-divisa-saldos">
                        {divisasLista.map((d, idx) => {
                          const valor =
                            saldosJugador && d.id in saldosJugador
                              ? saldosJugador[d.id]
                              : idx === 0
                                ? j.divisa
                                : 0;
                          return (
                            <span
                              key={d.id}
                              className="master-divisa-monto"
                              title={`${valor.toLocaleString("es-ES")} ${d.nombre}`}
                              style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <span
                                className="compartir-jugador-punto"
                                style={{ backgroundColor: d.color, width: "7px", height: "7px" }}
                                aria-hidden="true"
                              />
                              <span>{formatearDivisaCompacta(valor)}</span>
                              <small style={{ opacity: 0.72 }}>{d.nombre}</small>
                            </span>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {masterMochilasAbierto && esMaster && (
        <div
          className="mochila-backdrop"
          style={{ pointerEvents: "auto" }}
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
                          className={`master-inspeccion-tab${seleccionado?.userId === j.userId ? " activo" : ""
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

      {divisaAbierta && (
        <div
          className="divisa-popover"
          role="dialog"
          aria-label={`Gestionar ${nombreDivisaActiva}`}
          style={{ pointerEvents: "auto" }}
        >
          <div className="dados-selector-cabecera">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span
                className="compartir-jugador-punto"
                style={{ backgroundColor: divisaActiva.color }}
                aria-hidden="true"
              />
              <span>{nombreDivisaActiva}</span>
            </span>
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
            <span
              className="hud-divisa-icono-wrap"
              style={{ filter: `drop-shadow(0 0 3px ${divisaActiva.color})` }}
            >
              <IconoMonedasPixel size={22} />
            </span>
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

          {esMaster && (
            <div className="divisa-master-gestion" style={{ marginTop: "8px", borderTop: "1px solid rgb(255 255 255 / 12%)", paddingTop: "8px" }}>
              <span className="dados-campo-etiqueta">Divisas de la mesa</span>
              {divisasLista.length > 1 && (
                <ul className="master-divisa-lista" style={{ marginTop: "4px", marginBottom: "6px" }}>
                  {divisasLista.map((d, idx) => (
                    <li key={d.id} className="master-divisa-item">
                      <span className="master-divisa-jugador">
                        <span
                          className="compartir-jugador-punto"
                          style={{ backgroundColor: d.color }}
                          aria-hidden="true"
                        />
                        <span>{d.nombre}</span>
                      </span>
                      {idx > 0 && (
                        <button
                          type="button"
                          className="macro-accion-btn borrar"
                          title={`Eliminar ${d.nombre}`}
                          aria-label={`Eliminar ${d.nombre}`}
                          onClick={() => {
                            const siguiente = divisasLista.filter(item => item.id !== d.id);
                            actualizarDivisasConfig(siguiente);
                            setIndiceDivisa(prev => Math.min(prev, Math.max(0, siguiente.length - 1)));
                          }}
                        >
                          <Trash2 size={12} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="divisa-master-nombre"
                onSubmit={e => {
                  e.preventDefault();
                  const nombreLimpio = nuevaDivisaNombre.trim();
                  if (!nombreLimpio) return;
                  const nueva: DivisaConfig = {
                    id: `div-${nuevoId()}`,
                    nombre: nombreLimpio,
                    color: nuevaDivisaColor
                  };
                  const siguiente = [...divisasLista, nueva];
                  actualizarDivisasConfig(siguiente);
                  setNuevaDivisaNombre("");
                  setIndiceDivisa(siguiente.length - 1);
                }}
              >
                <div className="divisa-master-nombre-fila">
                  <input
                    type="text"
                    maxLength={24}
                    value={nuevaDivisaNombre}
                    onChange={e => setNuevaDivisaNombre(e.target.value)}
                    placeholder="Nueva divisa..."
                    aria-label="Nombre de nueva divisa"
                  />
                  <button type="submit" title="Añadir divisa" aria-label="Añadir divisa">
                    <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px" }}>
                  {COLORES_DIVISA.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.nombre}
                      aria-label={c.nombre}
                      onClick={() => setNuevaDivisaColor(c.hex)}
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "4px",
                        backgroundColor: c.hex,
                        border:
                          nuevaDivisaColor === c.hex
                            ? "2px solid #fff"
                            : "1px solid rgb(0 0 0 / 45%)",
                        cursor: "pointer",
                        padding: 0
                      }}
                    />
                  ))}
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {mochilaAbierta && (
        <div
          className="mochila-backdrop"
          style={{ pointerEvents: "auto" }}
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
                      title={`${item.nombre} (x${item.cantidad}) — Pulsa para ver`}
                      onClick={() => setObjetoMochilaId(item.id)}
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

      {selectorAbierto && (() => {
        const formulaActual = formatearFormulaCompuesta(
          compuestaAbierta
            ? gruposCompuesta
            : [{ id: "normal", cantidad: cantidadDados, caras: tipoDado }],
          compuestaAbierta ? bonificadorCompuesta : bonificador
        );
        return (
          <form
            className={`dados-selector dados-selector-unificado en-mapa${dockPos.y < 30 ? " debajo" : ""}${tiradaSecreta ? " secreta" : ""}`}
            style={{ pointerEvents: "auto" }}
            onSubmit={evento => {
              evento.preventDefault();
              if (compuestaAbierta) {
                tirarDado(gruposCompuesta, bonificadorCompuesta);
              } else {
                tirarDado();
              }
            }}
          >
            <div className="dados-selector-cabecera">
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <span>Tirada de dados</span>
                <div
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                  role="group"
                  aria-label="Colores de tus dados"
                >
                  <label
                    title="Color principal (fondo del dado)"
                    aria-label="Color principal del dado"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "20px",
                      height: "20px",
                      padding: 0,
                      borderRadius: "5px",
                      border: modoClaro
                        ? "1.5px solid #8E96A8"
                        : tiradaSecreta
                          ? "1.5px solid #c084fc"
                          : "1.5px solid #e8c56a",
                      backgroundColor: colorDado,
                      boxShadow: modoClaro
                        ? "0 2px 5px rgb(100 110 130 / 28%)"
                        : "1.5px 1.5px 0 #090612",
                      cursor: "pointer",
                      overflow: "hidden"
                    }}
                  >
                    <input
                      type="color"
                      value={colorDado}
                      onChange={e => actualizarColorDado(e.target.value)}
                      aria-label="Elegir color principal del dado"
                      style={{
                        opacity: 0,
                        width: "100%",
                        height: "100%",
                        padding: 0,
                        border: "none",
                        cursor: "pointer"
                      }}
                    />
                  </label>
                  <label
                    title="Color secundario (aristas del dado)"
                    aria-label="Color secundario de las aristas del dado"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "20px",
                      height: "20px",
                      padding: 0,
                      borderRadius: "5px",
                      border: `2.5px solid ${colorAristasDado}`,
                      backgroundColor: modoClaro ? "#D8DCE6" : "#14101f",
                      boxShadow: modoClaro
                        ? "0 2px 5px rgb(100 110 130 / 28%)"
                        : "1.5px 1.5px 0 #090612",
                      cursor: "pointer",
                      overflow: "hidden"
                    }}
                  >
                    <input
                      type="color"
                      value={colorAristasDado}
                      onChange={e => actualizarColorAristasDado(e.target.value)}
                      aria-label="Elegir color secundario de aristas del dado"
                      style={{
                        opacity: 0,
                        width: "100%",
                        height: "100%",
                        padding: 0,
                        border: "none",
                        cursor: "pointer"
                      }}
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                className="dados-cerrar"
                onClick={() => setSelectorAbierto(false)}
                aria-label="Cerrar selector de dados"
              >
                <X size={13} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div className="dados-visibilidad-tabs" role="group" aria-label="Visibilidad de la tirada">
              <button
                type="button"
                className={`dados-visibilidad-tab${!tiradaSecreta ? " activo" : ""}`}
                onClick={() => setTiradaSecreta(false)}
                aria-pressed={!tiradaSecreta}
              >
                <Eye size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Pública</span>
              </button>
              <button
                type="button"
                className={`dados-visibilidad-tab secreta${tiradaSecreta ? " activo" : ""}`}
                onClick={() => setTiradaSecreta(true)}
                aria-pressed={tiradaSecreta}
              >
                <VenetianMask size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Privada</span>
              </button>
            </div>

            {tiradaSecreta && (
              <div className="dados-secreta-aviso">
                {esMaster
                  ? "Tirada privada: solo visible para ti"
                  : "Tirada privada: solo visible para el Máster"}
              </div>
            )}

            <div className="dados-formula-barra">
              <span className="dados-formula-texto" title={formulaActual}>
                {formulaActual}
              </span>
              <button
                type="button"
                className={`dados-compuesta-toggle${compuestaAbierta ? " activo" : ""}`}
                onClick={() => {
                  if (compuestaAbierta) {
                    setCompuestaAbierta(false);
                  } else {
                    abrirTiradaCompuesta();
                  }
                }}
                aria-pressed={compuestaAbierta}
              >
                Tirada compuesta
              </button>
            </div>

            <div className="dados-fila">
              <span className="dados-campo-etiqueta">
                {compuestaAbierta ? "Pulsa para añadir a la tirada compuesta" : "Tipo de dado"}
              </span>
              <div className="dados-tipos" role="group" aria-label="Tipo de dado">
                {TIPOS_DADO.map(caras => {
                  const grupo = compuestaAbierta
                    ? gruposCompuesta.find(g => g.caras === caras)
                    : null;
                  const activo = compuestaAbierta ? Boolean(grupo) : tipoDado === caras;
                  return (
                    <button
                      key={caras}
                      type="button"
                      className={`dado-tipo-btn${activo ? " activo" : ""}`}
                      onClick={() => {
                        if (compuestaAbierta) {
                          agregarDadoCompuesta(caras);
                        } else {
                          setTipoDado(caras);
                        }
                      }}
                    >
                      d{caras}
                      {grupo && <span className="dado-tipo-cant">×{grupo.cantidad}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {compuestaAbierta ? (
              <div className="dados-compuesta-items">
                {gruposCompuesta.map(grupo => (
                  <div key={grupo.id} className="dados-compuesta-item">
                    <span className="dados-compuesta-item-dado">
                      {grupo.cantidad}d{grupo.caras}
                    </span>
                    <div className="dados-compuesta-item-controles">
                      <button
                        type="button"
                        onClick={() =>
                          actualizarGrupoCompuesta(grupo.id, {
                            cantidad: Math.max(1, grupo.cantidad - 1)
                          })
                        }
                        aria-label={`Menos d${grupo.caras}`}
                      >
                        <Minus size={11} strokeWidth={2.5} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          actualizarGrupoCompuesta(grupo.id, {
                            cantidad: Math.min(20, grupo.cantidad + 1)
                          })
                        }
                        aria-label={`Más d${grupo.caras}`}
                      >
                        <Plus size={11} strokeWidth={2.5} aria-hidden="true" />
                      </button>
                      {gruposCompuesta.length > 1 && (
                        <button
                          type="button"
                          className="quitar"
                          onClick={() => eliminarGrupoCompuesta(grupo.id)}
                          aria-label={`Quitar d${grupo.caras}`}
                          title={`Quitar d${grupo.caras}`}
                        >
                          <X size={11} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className={compuestaAbierta ? "dados-fila" : "dados-steppers-par"}>
              {!compuestaAbierta && (
                <div className="dados-fila">
                  <span className="dados-campo-etiqueta">Cantidad</span>
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
              )}

              <div className="dados-fila">
                <span className="dados-campo-etiqueta">Bonificador</span>
                <div className="dados-stepper">
                  <button
                    type="button"
                    onClick={() =>
                      compuestaAbierta
                        ? setBonificadorCompuesta(b => Math.max(-99, b - 1))
                        : setBonificador(b => Math.max(-99, b - 1))
                    }
                    aria-label="Reducir bonificador"
                  >
                    <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                  <input
                    type="number"
                    min={-99}
                    max={99}
                    value={compuestaAbierta ? bonificadorCompuesta : bonificador}
                    onChange={e => {
                      const valor = parseInt(e.target.value, 10);
                      const limpio = Number.isNaN(valor) ? 0 : limitar(valor, -99, 99);
                      if (compuestaAbierta) {
                        setBonificadorCompuesta(limpio);
                      } else {
                        setBonificador(limpio);
                      }
                    }}
                    aria-label="Bonificador"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      compuestaAbierta
                        ? setBonificadorCompuesta(b => Math.min(99, b + 1))
                        : setBonificador(b => Math.min(99, b + 1))
                    }
                    aria-label="Aumentar bonificador"
                  >
                    <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className={`dados-lanzar${tiradaSecreta ? " secreta" : ""}`}
              disabled={tirando}
            >
              {tiradaSecreta
                ? esMaster
                  ? `Tirar en secreto · ${formulaActual}`
                  : `Tirar al Máster · ${formulaActual}`
                : `Tirar · ${formulaActual}`}
            </button>
          </form>
        );
      })()}

      {macrosAbierto && (
        <div
          className={`dados-selector macros-selector en-mapa${dockPos.y < 30 ? " debajo" : ""}${macroSecreta ? " secreta" : ""}`}
          style={{ pointerEvents: "auto" }}
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
                        onPointerDown={evento => iniciarArrastreMacroMenu(evento, macro)}
                        onClick={() => {
                          if (arrastreElementoMovido.current) return;
                          lanzarMacro(macro);
                        }}
                        disabled={tirando}
                        title={`Clic para lanzar · Arrastra al mapa (${formula})`}
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

      {macroModalAbierto && (
        <div
          className="dados-compuesta-backdrop"
          style={{ pointerEvents: "auto" }}
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

            <div className="macro-campo-icono">
              <span className="dados-campo-etiqueta">Color de fondo</span>
              <div className="macro-color-grid" role="radiogroup" aria-label="Color de la macro">
                {COLORES_MACRO.map(c => {
                  const seleccionado = macroColor === c.hex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`macro-color-opcion${seleccionado ? " activo" : ""}`}
                      style={{ background: c.hex || "rgb(16 12 24 / 95%)" }}
                      onClick={() => setMacroColor(c.hex)}
                      title={c.nombre}
                      aria-label={c.nombre}
                      aria-checked={seleccionado}
                      role="radio"
                    />
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
            className={`tirada-panel en-mapa${dockPos.y < 30 ? " debajo" : ""}${tirada.secreta ? " secreta" : ""}${!tirando && tirada.especial ? ` ${tirada.especial}` : ""}`}
            style={{ pointerEvents: "auto" }}
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

      <div
        className="sala-dock en-mapa"
        style={{ pointerEvents: "auto" }}
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

        {esMaster && (
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
              title="Dados privados (tirada secreta del Máster)"
              aria-label="Dados privados"
            >
              <IconoD20 />
              <span className="dock-secreto-badge" aria-hidden="true">
                <VenetianMask size={13} strokeWidth={2.4} />
              </span>
            </button>
            <span className="dock-etiqueta">Secreto</span>
          </div>
        )}

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

        <div className="dock-item">
          <button
            type="button"
            className="dock-btn"
            onClick={() => {
              setSelectorAbierto(false);
              setCompuestaAbierta(false);
              setMacrosAbierto(false);
              setArchivadorMapaAbierto(false);
              crearPositMapa();
            }}
            title="Crear posit personal"
            aria-label="Crear posit"
          >
            <IconoPosit />
          </button>
          <span className="dock-etiqueta">Posits</span>
        </div>

        {(onAbrirArchivador || archivosDisponibles !== undefined || onElementosMesa) && (
          <div className="dock-item">
            <button
              type="button"
              className={`dock-btn${archivadorMapaAbierto ? " activo" : ""}`}
              onClick={() => {
                setSelectorAbierto(false);
                setCompuestaAbierta(false);
                setMacrosAbierto(false);
                if (archivosDisponibles !== undefined || onElementosMesa) {
                  setArchivadorMapaAbierto(abierto => {
                    const siguiente = !abierto;
                    if (siguiente) onSolicitarArchivos?.();
                    return siguiente;
                  });
                } else {
                  onAbrirArchivador?.();
                }
              }}
              aria-expanded={archivadorMapaAbierto}
              title="Abrir archivador y documentos"
              aria-label="Archivador"
            >
              <IconoArchivador />
              {elementosArchivados.length > 0 && (
                <span className="dock-badge">{elementosArchivados.length}</span>
              )}
            </button>
            <span className="dock-etiqueta">Archivador</span>
          </div>
        )}
      </div>

      <div className="dados-rapidos-contenedor" style={{ pointerEvents: "auto" }}>
        <span className="dados-rapidos-titulo">Dados rápidos</span>
        <div className="dados-rapidos" role="group" aria-label="Dados rápidos">
          {DADOS_RAPIDOS.map(dado => (
            <button
              key={dado.caras}
              type="button"
              className="dado-rapido-btn"
              style={
                {
                  "--dado-color": modoClaro ? dado.colorClaro : dado.color,
                  "--dado-glow": modoClaro ? "rgb(60 40 90 / 24%)" : dado.glow
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
      </div>

      {archivadorMapaAbierto && (
        <div
          className="divisa-popover mapa-archivador-popover"
          role="dialog"
          aria-label="Archivador rápido en mapa"
          style={{
            pointerEvents: "auto",
            left: "50%",
            bottom: 106,
            top: "auto",
            right: "auto",
            transform: "translateX(-50%)",
            width: "min(360px, 92vw)",
            maxHeight: "55vh",
            overflowY: "auto"
          }}
        >
          <div className="dados-selector-cabecera">
            <span>Archivador</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {onAbrirArchivador && (
                <button
                  type="button"
                  className="macro-accion-btn"
                  onClick={() => {
                    setArchivadorMapaAbierto(false);
                    onAbrirArchivador();
                  }}
                  title="Ir al archivador completo"
                >
                  Abrir todo
                </button>
              )}
              <button
                type="button"
                className="dados-cerrar"
                onClick={() => setArchivadorMapaAbierto(false)}
                aria-label="Cerrar archivador"
              >
                <X size={14} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </div>

          {elementosArchivados.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, opacity: 0.78, fontWeight: 700 }}>
                Archivados en mesa
              </span>
              {elementosArchivados.map(el => {
                const etiqueta =
                  el.tipo === "posit"
                    ? el.texto.trim() || "Posit sin texto"
                    : el.tipo === "macro"
                      ? el.nombre
                      : el.nombre;
                return (
                  <button
                    key={el.id}
                    type="button"
                    className="macro-lanzar-btn"
                    style={{ width: "100%", justifyContent: "space-between" }}
                    onClick={() => desarchivarElementoMapa(el.id)}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {etiqueta}
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.75, flexShrink: 0 }}>
                      Sacar
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11, opacity: 0.78, fontWeight: 700 }}>
              Documentos disponibles
            </span>
            {!archivosDisponibles || archivosDisponibles.length === 0 ? (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                No hay archivos subidos todavía.
              </p>
            ) : (
              archivosDisponibles.map(archivo => (
                <button
                  key={archivo.id}
                  type="button"
                  className="macro-lanzar-btn"
                  style={{ width: "100%", justifyContent: "space-between" }}
                  onClick={() => sacarArchivoAMapa(archivo)}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      minWidth: 0,
                      overflow: "hidden"
                    }}
                  >
                    <FileText size={14} aria-hidden="true" />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {archivo.nombre}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.75, flexShrink: 0 }}>
                    {archivo.vista.toUpperCase()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {visorDoc && (
        <div style={{ pointerEvents: "auto" }}>
          <DocumentoVisorModal
            archivo={visorDoc}
            esMaster={esMaster}
            onCerrar={() => setVisorDoc(null)}
          />
        </div>
      )}

      {objetoMesaActivo && (
        <div
          className="archivo-visor"
          style={{ pointerEvents: "auto" }}
          onClick={() => setObjetoMesaActivo(null)}
        >
          <div
            className="archivo-visor-ventana mochila-mesa-modal"
            role="dialog"
            aria-label={objetoMesaActivo.nombre}
            onClick={evento => evento.stopPropagation()}
          >
            <header className="archivo-visor-barra">
              <span className="archivo-visor-titulo">
                {objetoMesaActivo.nombre} (x{objetoMesaActivo.cantidad})
              </span>
              <button
                type="button"
                className="archivo-visor-cerrar"
                onClick={() => setObjetoMesaActivo(null)}
              >
                Cerrar
              </button>
            </header>
            <div className="archivo-visor-marco">
              <div className="mochila-mesa-cuerpo">
                {objetoMesaActivo.imagenLocal || objetoMesaActivo.archivoId ? (
                  <img
                    className="mochila-mesa-img"
                    src={
                      objetoMesaActivo.imagenLocal ??
                      archivosApi.url(objetoMesaActivo.archivoId ?? "")
                    }
                    alt={objetoMesaActivo.nombre}
                  />
                ) : (
                  <span className="mochila-mesa-emoji">
                    {objetoMesaActivo.emoji ?? "🎒"}
                  </span>
                )}
                {objetoMesaActivo.descripcion && (
                  <p className="mochila-mesa-desc">
                    {objetoMesaActivo.descripcion}
                  </p>
                )}
                <div className="mochila-mesa-acciones">
                  <button
                    type="button"
                    className="archivo-visor-descargar"
                    onClick={() => guardarObjetoMapaEnMochila(objetoMesaActivo)}
                  >
                    Guardar en mochila
                  </button>
                  {esMaster && onCompartirATodos && (
                    <button
                      type="button"
                      className="archivo-visor-descargar"
                      onClick={() => {
                        void onCompartirATodos(objetoMesaActivo);
                        setObjetoMesaActivo(null);
                      }}
                    >
                      Dar a todos
                    </button>
                  )}
                  <button
                    type="button"
                    className="archivo-visor-cerrar"
                    onClick={() => {
                      onElementosMesa?.(prev =>
                        prev.filter(el => el.id !== objetoMesaActivo.id)
                      );
                      setObjetoMesaActivo(null);
                    }}
                  >
                    Retirar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {avisoLocal && (
        <div className="sala-aviso sala-aviso-ok" style={{ pointerEvents: "auto" }}>
          {avisoLocal}
        </div>
      )}
    </div>
  );
}
