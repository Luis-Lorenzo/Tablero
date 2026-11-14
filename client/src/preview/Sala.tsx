import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { DocumentoVisorModal, PanelImagenesMasterModal } from "./Archivador";
import { infoFormatoArchivo, nuevoId, urlImagenEscena } from "./calibracion";
import { ChatSala } from "./ChatSala";
import { CALIBRACION_INICIAL, COLORES_POSIT, FONDO_SALA } from "./datos";
import { Posit } from "./Pizarra";
import { reproducirSonidoTirada } from "./sonidoDados";
import type {
  Asiento,
  Calibracion,
  DocumentoMesa,
  ImagenEscenaPreview,
  JugadorPreview,
  MensajeSala,
  PositPreview,
  Punto,
  QuadMapa,
  RectPizarra,
  TipoEspecialTirada,
  TiradaAsiento
} from "./tipos";

interface SalaProps {
  jugadores: JugadorPreview[];
  calibracion: Calibracion;
  onCalibracion: Dispatch<SetStateAction<Calibracion>>;
  positsMesa?: PositPreview[];
  onPositsMesa?: Dispatch<SetStateAction<PositPreview[]>>;
  documentosMesa?: DocumentoMesa[];
  onDocumentosMesa?: Dispatch<SetStateAction<DocumentoMesa[]>>;
  onAbrirPizarra: () => void;
  onAbrirMapa: () => void;
  onAbrirArchivador?: () => void;
  onVolver: () => void;
  hostName?: string;
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
  }) => void | Promise<void>;
  colorJugador?: string;
  nombreJugador?: string;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  proyeccionOculta?: boolean;
  onReabrirProyeccion?: () => void;
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
  };

/** Segundos que el resultado del dado sigue en pantalla antes de irse. */
const DURACION_RESULTADO = 4500;
/** Duración del D20 animado encima del círculo de cada jugador. */
const DURACION_D20_ASIENTO = 3500;

/** Tipos de dado habituales en juegos de rol. */
const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100] as const;

interface ResultadoTirada {
  total: number;
  dados: number[];
  bonificador: number;
  caras: number;
  especial: TipoEspecialTirada;
  formula: string;
  secreta?: boolean;
}

function detectarEspecialTirada(caras: number, dados: number[]): TipoEspecialTirada {
  if (caras !== 20 || dados.length === 0) return null;
  if (dados.includes(20)) return "critico";
  if (dados.includes(1)) return "pifia";
  return null;
}

function formatearFormula(
  cantidad: number,
  caras: number,
  bonificador: number
): string {
  const base = `${cantidad}d${caras}`;
  if (bonificador > 0) return `${base} + ${bonificador}`;
  if (bonificador < 0) return `${base} - ${Math.abs(bonificador)}`;
  return base;
}

function lanzarDados(
  cantidad: number,
  caras: number,
  bonificador: number
): ResultadoTirada {
  const dados = Array.from(
    { length: cantidad },
    () => 1 + Math.floor(Math.random() * caras)
  );
  const suma = dados.reduce((acc, valor) => acc + valor, 0);
  return {
    total: suma + bonificador,
    dados,
    bonificador,
    caras,
    especial: detectarEspecialTirada(caras, dados),
    formula: formatearFormula(cantidad, caras, bonificador)
  };
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
        y="15.4"
        textAnchor="middle"
        fontSize="7"
        fill="currentColor"
        stroke="none"
        fontFamily="Cinzel Decorative, serif"
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

export function Sala({
  jugadores,
  calibracion,
  onCalibracion,
  positsMesa,
  onPositsMesa,
  documentosMesa,
  onDocumentosMesa,
  onAbrirPizarra,
  onAbrirMapa,
  onAbrirArchivador,
  onVolver,
  hostName,
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
  onReabrirProyeccion
}: SalaProps) {
  const [ajuste, setAjuste] = useState(
    () => new URLSearchParams(window.location.search).get("ajuste") === "1"
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [tiradaSecreta, setTiradaSecreta] = useState(false);
  const [cantidadDados, setCantidadDados] = useState(1);
  const [tipoDado, setTipoDado] = useState<number>(20);
  const [bonificador, setBonificador] = useState(0);
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
  const capaPosits = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const arrastreDocMovido = useRef(false);
  const temporizador = useRef<number | null>(null);
  const ocultarResultado = useRef<number | null>(null);
  const avisoTimer = useRef<number | null>(null);
  const timersAsiento = useRef<Record<string, number>>({});

  useEffect(() => {
    function mover(evento: PointerEvent) {
      const actual = arrastre.current;
      if (!actual) return;

      const dx = ((evento.clientX - actual.inicioX) / actual.medidas.width) * 100;
      const dy = ((evento.clientY - actual.inicioY) / actual.medidas.height) * 100;

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
        const x = limitar(actual.base.x + dx, 8, 92);
        const y = limitar(actual.base.y + dy, 12, 88);
        onPositsMesa?.(prev =>
          prev.map(posit =>
            posit.id === actual.id ? { ...posit, x, y } : posit
          )
        );
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

        const x = limitar(actual.base.x + dx, 6, 94);
        const y = limitar(actual.base.y + dy, 12, 88);
        onDocumentosMesa?.(prev =>
          prev.map(doc => (doc.id === actual.id ? { ...doc, x, y } : doc))
        );
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

    function soltar() {
      arrastre.current = null;
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
  }, [onCalibracion, onPositsMesa, onDocumentosMesa]);

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
    especial: TipoEspecialTirada = null
  ): void {
    const prevTimer = timersAsiento.current[asientoId];
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
    }
    const tiradaId = `${Date.now()}-${Math.random()}`;
    setTiradasAsientoLocales(prev => ({
      ...prev,
      [asientoId]: { id: tiradaId, total, especial }
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

  function tirarDado(): void {
    if (tirando) return;

    if (ocultarResultado.current !== null) {
      window.clearTimeout(ocultarResultado.current);
      ocultarResultado.current = null;
    }

    const cantidad = Math.round(limitar(cantidadDados, 1, 20));
    const caras = tipoDado;
    const mod = Math.round(limitar(bonificador, -99, 99));
    const esSecreta = esMaster && tiradaSecreta;

    setSelectorAbierto(false);
    setTirando(true);
    let pasos = 0;

    const tick = () => {
      setTirada({ ...lanzarDados(cantidad, caras, mod), secreta: esSecreta });
      pasos += 1;

      if (pasos < 12) {
        temporizador.current = window.setTimeout(tick, 70);
      } else {
        const resultadoFinal = lanzarDados(cantidad, caras, mod);
        setTirada({ ...resultadoFinal, secreta: esSecreta });
        setTirando(false);

        if (!esSecreta) {
          if (onTiradaPublica) {
            void onTiradaPublica(resultadoFinal);
          } else {
            const miAsiento =
              jugadores.find(j => (j.userId ?? j.id) === miUsuarioId)?.id ??
              "master";
            mostrarD20Local(miAsiento, resultadoFinal.total, resultadoFinal.especial);
            reproducirSonidoTirada(resultadoFinal.especial);
            const autor = jugadores.find(j => (j.userId ?? j.id) === miUsuarioId);
            setMensajesLocales(prev => [
              ...prev,
              {
                id: `${Date.now()}-${Math.random()}`,
                autorId: miUsuarioId,
                autorNombre: autor?.nombre ?? "Máster",
                texto: `Tiró ${resultadoFinal.formula} → ${resultadoFinal.total}`,
                destinatarioId: null,
                destinatarioNombre: null,
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
    if (!onPositsMesa) return;
    setSelectorAbierto(false);
    const desplazamiento = (positsVisibles.length % 5) * 3;
    const posit: PositPreview = {
      id: nuevoId(),
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
    onPositsMesa(prev => [...prev, posit]);
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
    onPositsMesa?.(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, texto } : posit))
    );
  }

  function cambiarColorPositMesa(id: string, color: string): void {
    onPositsMesa?.(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, color } : posit))
    );
  }

  function archivarPositMesa(id: string): void {
    onPositsMesa?.(prev =>
      prev.map(posit =>
        posit.id === id ? { ...posit, archivado: true } : posit
      )
    );
    setPositActivo(actual => (actual === id ? null : actual));
    mostrarAviso("Posit archivado.");
  }

  function borrarPositMesa(id: string): void {
    onPositsMesa?.(prev => prev.filter(posit => posit.id !== id));
    setPositActivo(actual => (actual === id ? null : actual));
  }

  function iniciarDocMesa(
    evento: ReactPointerEvent,
    doc: DocumentoMesa
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
    onDocumentosMesa?.(prev => prev.filter(doc => doc.id !== id));
    setVisorDoc(actual => (actual?.id === id ? null : actual));
    mostrarAviso("Documento archivado.");
  }

  const centro = centroide(calibracion.mapa);
  const mensajesVisibles = mensajesChat ?? mensajesLocales;
  const tiradasVisibles = tiradasAsiento ?? tiradasAsientoLocales;
  const positsVisibles = (positsMesa ?? []).filter(posit => !posit.archivado);
  const positsArchivadosCount = (positsMesa ?? []).filter(
    posit => posit.archivado
  ).length;
  const docsVisibles = documentosMesa ?? [];

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
                    ×
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
              const tiradaSobreAsiento = tiradasVisibles[jugador.id];
              const estilo = {
                left: `${asiento.x}%`,
                top: `${asiento.y}%`,
                "--color": jugador.color
              } as CSSProperties;

              return (
                <div
                  key={jugador.id}
                  className={[
                    "asiento",
                    jugador.esMaster ? "master" : "",
                    ajuste ? "ajustable" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={estilo}
                  onPointerDown={
                    ajuste ? evento => iniciarAsiento(jugador.id, evento) : undefined
                  }
                >
                  {tiradaSobreAsiento && !ajuste && (
                    <div
                      key={tiradaSobreAsiento.id}
                      className={`asiento-d20${tiradaSobreAsiento.especial ? ` ${tiradaSobreAsiento.especial}` : ""}`}
                      aria-label={`Tirada de ${jugador.nombre}: ${tiradaSobreAsiento.total}`}
                    >
                      <IconoD20 valor={tiradaSobreAsiento.total} />
                    </div>
                  )}
                  <span className="esfera" />
                  <span className="asiento-nombre">{jugador.nombre}</span>
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
        />
      )}

          <div className={`sala-barra${esMaster ? " sala-barra-master" : ""}`}>
            <div className="sala-barra-grupo">
              <button type="button" className="sala-btn" onClick={onVolver}>
                ← Sala de espera
              </button>
              <span className="sala-titulo-visible">
                SALA DE {hostName ? hostName.toUpperCase() : "MESA"}
              </span>
              {esMaster && (
                <span className="master-pill-badge">👑 MODO MÁSTER</span>
              )}
              <button
                type="button"
                className={`sala-btn${ajuste ? " activo" : ""}`}
                onClick={() => setAjuste(valor => !valor)}
              >
                {ajuste ? "Terminar ajuste" : "Ajustar"}
              </button>

              {esMaster && imagenProyectada && (
                <div className="master-proyeccion-pill">
                  <span className="master-proyeccion-texto">
                    ✦ Proyectando: {imagenProyectada.titulo ?? "Imagen"}
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
                  👁 Ver imagen del Máster
                </button>
              )}
            </div>
          </div>

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
              className={`dados-selector${calibracion.dock.y < 30 ? " debajo" : ""}`}
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
                  ×
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
                    −
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
                    +
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
                    −
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
                    +
                  </button>
                </div>
              </div>

              {esMaster && (
                <button
                  type="button"
                  className={`dados-secreto-toggle${tiradaSecreta ? " activo" : ""}`}
                  onClick={() => setTiradaSecreta(s => !s)}
                  aria-pressed={tiradaSecreta}
                >
                  <span className="dados-secreto-punto" aria-hidden="true" />
                  <span>Dados negros (solo Máster)</span>
                </button>
              )}

              <button
                type="submit"
                className={`dados-lanzar${esMaster && tiradaSecreta ? " secreta" : ""}`}
                disabled={tirando}
              >
                {esMaster && tiradaSecreta ? "Tirar en secreto " : "Tirar "}
                {formatearFormula(cantidadDados, tipoDado, bonificador)}
              </button>
            </form>
          )}

          {tirada !== null && !selectorAbierto && (
            <div
              className={`tirada-panel${calibracion.dock.y < 30 ? " debajo" : ""}${tirada.secreta ? " secreta" : ""}${!tirando && tirada.especial ? ` ${tirada.especial}` : ""}`}
              style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
            >
              <span className="tirada-icono">
                <IconoD20 />
              </span>
              <span className={`tirada-num${tirando ? " girando" : ""}`}>
                {tirada.total}
              </span>
              <div className="tirada-detalle">
                <span className="tirada-etiqueta">
                  {tirada.secreta ? "SECRETO · " : ""}
                  {tirando ? "tirando…" : tirada.formula}
                </span>
                {!tirando && (tirada.dados.length > 1 || tirada.bonificador !== 0) && (
                  <span className="tirada-desglose">
                    [{tirada.dados.join(", ")}]
                    {tirada.bonificador > 0
                      ? ` + ${tirada.bonificador}`
                      : tirada.bonificador < 0
                        ? ` − ${Math.abs(tirada.bonificador)}`
                        : ""}
                  </span>
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
                          className={`doc-master-icono${imagenProyectada?.id === doc.id ? " activo" : ""
                            }`}
                          title={
                            imagenProyectada?.id === doc.id
                              ? "Retirar proyección para todos"
                              : "Mostrar a todos (Opción A)"
                          }
                          aria-label={
                            imagenProyectada?.id === doc.id
                              ? "Retirar proyección"
                              : "Mostrar a todos"
                          }
                          onClick={evento => {
                            evento.stopPropagation();
                            onProyectarImagen(
                              imagenProyectada?.id === doc.id
                                ? null
                                : { id: doc.id, titulo: doc.nombre }
                            );
                          }}
                        >
                          ✦
                        </button>
                      )}
                      {esMaster && doc.vista === "imagen" && onCambiarEscena && (
                        <button
                          type="button"
                          className={`doc-master-icono${imagenEscena?.id === doc.id ? " activo" : ""
                            }`}
                          title={
                            imagenEscena?.id === doc.id
                              ? "Quitar de la pizarra de la sala"
                              : "Fijar en la pizarra de la sala (Opción B)"
                          }
                          aria-label={
                            imagenEscena?.id === doc.id
                              ? "Quitar de pizarra"
                              : "Fijar en pizarra"
                          }
                          onClick={evento => {
                            evento.stopPropagation();
                            onCambiarEscena(
                              imagenEscena?.id === doc.id
                                ? null
                                : { id: doc.id, titulo: doc.nombre }
                            );
                          }}
                        >
                          🖼
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
                        setVisorDoc(doc);
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
                  <span className="dock-etiqueta master">Escena 👑</span>
                </div>
              </>
            )}
          </div>

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
