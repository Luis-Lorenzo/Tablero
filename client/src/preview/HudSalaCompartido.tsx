import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  Minus,
  Moon,
  Pencil,
  Plus,
  Search,
  Snowflake,
  Trash2,
  Upload,
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
import { nuevoId } from "./calibracion";
import { ChatSala } from "./ChatSala";
import { nuevoIdElemento } from "./compartir";
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
import { reproducirSonidoConsumir, reproducirSonidoMonedas } from "./sonido";
import { reproducirSonidoRoll, reproducirSonidoTirada } from "./sonidoDados";
import type {
  JugadorPreview,
  MacroTirada,
  MensajeSala,
  ObjetoMochila,
  RectPizarra,
  TipoEspecialTirada,
  TiradaAsiento
} from "./tipos";

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
  }) => void | Promise<void>;
  onTiradaLocal?: (tirada: TiradaAsiento) => void;
  macros?: MacroTirada[];
  onMacros?: (macros: MacroTirada[]) => void;
  divisa?: number;
  divisaNombre?: string;
  onCambiarDivisa?: (nueva: number, delta: number) => void | Promise<void>;
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
  onAviso?: (texto: string) => void;
  chatRect?: RectPizarra;
  dockPos?: { x: number; y: number };
  dibujoCongelado?: boolean;
}

const DURACION_RESULTADO = 4500;
const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100] as const;

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

function IconoD20({ valor = 20 }: { valor?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polygon
        points="12,2 21,7 21,17 12,22 3,17 3,7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
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
    </svg>
  );
}

export function IconoDadoPoligono({
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
  divisa,
  divisaNombre = "Divisa",
  onCambiarDivisa,
  onCambiarDivisaNombre,
  mochila,
  onMochila,
  onEnviarObjetoMochila,
  onConsultarResumenMaster,
  onSolicitarArchivos,
  onAviso,
  chatRect = { x: 76.5, y: 66, w: 22, h: 28 },
  dockPos = { x: 50, y: 92 },
  dibujoCongelado = false
}: HudSalaCompartidoProps) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [tiradaSecreta, setTiradaSecreta] = useState(false);
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

  const [divisaLocal, setDivisaLocal] = useState<number>(cargarDivisaLocal);
  const [divisaAbierta, setDivisaAbierta] = useState(false);
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
  const divisaActual = divisa ?? divisaLocal;
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
    setGruposCompuesta([{ id: `g-${Date.now()}-0`, cantidad: cantidadDados, caras: tipoDado }]);
    setBonificadorCompuesta(bonificador);
    setSelectorAbierto(false);
    setMacrosAbierto(false);
    setCompuestaAbierta(true);
  }

  function agregarGrupoCompuesta(): void {
    setGruposCompuesta(prev => {
      if (prev.length >= 6) return prev;
      return [...prev, { id: `g-${Date.now()}-${prev.length}`, cantidad: 1, caras: 6 }];
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
          const desgloseTexto =
            resultadoFinal.desgloseDados.length > 1 ||
            resultadoFinal.bonificador !== 0
              ? `${resultadoFinal.dados.join("+")}${
                  resultadoFinal.bonificador > 0
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
            desglose: desgloseTexto
          });
          if (onTiradaPublica) {
            void onTiradaPublica({
              ...resultadoFinal,
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
    reproducirSonidoMonedas();
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

  return (
    <div
      className="hud-mapa-capa"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 24 }}
    >
      <div className="chat-en-mapa" style={{ pointerEvents: "none" }}>
        <ChatSala
          rect={chatPos}
          jugadores={jugadores}
          miUsuarioId={miUsuarioId}
          mensajes={mensajesVisibles}
          onEnviarMensaje={onEnviarChat ?? enviarChatLocal}
          onIniciarArrastre={iniciarArrastreChat}
        />
      </div>

      <div
        className="sala-hud-derecha"
        aria-label="Divisa y mochila"
        style={{ pointerEvents: "auto" }}
      >
        {!esMaster && dibujoCongelado && (
          <span
            className="hud-dibujo-congelado-icono"
            title="Dibujo en el mapa congelado por el Máster"
            aria-label="Dibujo congelado"
          >
            <Snowflake size={16} strokeWidth={2.3} aria-hidden="true" />
          </span>
        )}
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

      {masterDivisasAbierto && esMaster && (
        <div
          className="divisa-popover master-resumen-popover"
          role="dialog"
          aria-label={`${divisaNombre} de jugadores conectados`}
          style={{ pointerEvents: "auto" }}
        >
          <div className="dados-selector-cabecera">
            <span>{divisaNombre} · Conectados</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                className="master-actualizar-btn"
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

      {divisaAbierta && (
        <div
          className="divisa-popover"
          role="dialog"
          aria-label={`Gestionar ${divisaNombre}`}
          style={{ pointerEvents: "auto" }}
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

      {selectorAbierto && (
        <form
          className={`dados-selector en-mapa${dockPos.y < 30 ? " debajo" : ""}${tiradaSecreta ? " secreta" : ""}`}
          style={{ pointerEvents: "auto" }}
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

      {compuestaAbierta && (
        <div
          className="dados-compuesta-backdrop"
          style={{ pointerEvents: "auto" }}
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
              title="Dados negros (tirada secreta del Máster)"
              aria-label="Dados negros"
            >
              <IconoD20 />
            </button>
            <span className="dock-etiqueta">Secreto</span>
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
      </div>

      {avisoLocal && (
        <div className="sala-aviso sala-aviso-ok" style={{ pointerEvents: "auto" }}>
          {avisoLocal}
        </div>
      )}
    </div>
  );
}
