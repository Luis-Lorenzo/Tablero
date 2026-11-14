import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { archivosApi } from "../api/archivos.api";
import type { PublicArchivo } from "../api/types";
import { CALIBRACION_INICIAL, COLORES_POSIT, FONDO_SALA } from "./datos";
import {
  crearElementoDesdeArchivo,
  mensajeSolicitudTransferencia,
  nuevoIdElemento,
  tipoCortoArchivo
} from "./compartir";
import type {
  Asiento,
  Calibracion,
  ElementoMesa,
  JugadorPreview,
  PositPreview,
  Punto,
  QuadMapa,
  RectPizarra,
  SolicitudTransferencia
} from "./tipos";

interface SalaProps {
  jugadores: JugadorPreview[];
  calibracion: Calibracion;
  onCalibracion: Dispatch<SetStateAction<Calibracion>>;
  onAbrirPizarra: () => void;
  onAbrirMapa: () => void;
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
      tipo: "pizarra" | "pizarra-tam";
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
    };

/** Segundos que el resultado del dado sigue en pantalla antes de irse. */
const DURACION_RESULTADO = 4500;

/** Tipos de dado habituales en juegos de rol. */
const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100] as const;

interface ResultadoTirada {
  total: number;
  dados: number[];
  bonificador: number;
  formula: string;
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
  dy: number
): RectPizarra {
  const w = limitar(base.w + dx, 6, 100 - base.x);
  const h = limitar(base.h + dy, 6, 100 - base.y);
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

function IconoD20() {
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
        20
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

function IconoCompartir() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 15V10m0 0-2.5 2.5M12 10l2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
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
  onVolver,
  hostName,
  yoAsientoId = "master",
  posits = [],
  elementosMesa = [],
  onElementosMesa,
  archivosDisponibles = [],
  onSolicitarArchivos,
  onEnviarElemento,
  solicitudPendiente = null,
  onAceptarSolicitud,
  onRechazarSolicitud,
  onSimularRecepcion
}: SalaProps) {
  const [ajuste, setAjuste] = useState(
    () => new URLSearchParams(window.location.search).get("ajuste") === "1"
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const [nuevoPositTexto, setNuevoPositTexto] = useState("");
  const [nuevoPositColor, setNuevoPositColor] = useState<string>(COLORES_POSIT[3].valor);
  const [jugadorSeleccionadoId, setJugadorSeleccionadoId] = useState<string | null>(null);
  const [arrastrandoItemId, setArrastrandoItemId] = useState<string | null>(null);
  const [asientoSobreId, setAsientoSobreId] = useState<string | null>(null);
  const [fantasma, setFantasma] = useState<{ x: number; y: number; etiqueta: string } | null>(
    null
  );
  const [itemAbierto, setItemAbierto] = useState<ElementoMesa | null>(null);
  const [cantidadDados, setCantidadDados] = useState(1);
  const [tipoDado, setTipoDado] = useState<number>(20);
  const [bonificador, setBonificador] = useState(0);
  const [tirando, setTirando] = useState(false);
  const [tirada, setTirada] = useState<ResultadoTirada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sobreMapa, setSobreMapa] = useState(false);

  const plano = useRef<HTMLDivElement>(null);
  const asientoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const arrastre = useRef<Arrastre | null>(null);
  const temporizador = useRef<number | null>(null);
  const ocultarResultado = useRef<number | null>(null);
  const avisoTimer = useRef<number | null>(null);

  const jugadoresRef = useRef(jugadores);
  const yoAsientoIdRef = useRef(yoAsientoId);
  const onElementosMesaRef = useRef(onElementosMesa);
  const onEnviarElementoRef = useRef(onEnviarElemento);

  useEffect(() => {
    jugadoresRef.current = jugadores;
    yoAsientoIdRef.current = yoAsientoId;
    onElementosMesaRef.current = onElementosMesa;
    onEnviarElementoRef.current = onEnviarElemento;
  }, [jugadores, yoAsientoId, onElementosMesa, onEnviarElemento]);

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
        }
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

      if (actual.tipo === "pizarra") {
        onCalibracion(prev => ({
          ...prev,
          pizarra: moverRect(actual.base, dx, dy)
        }));
        return;
      }

      onCalibracion(prev => ({
        ...prev,
        pizarra: redimensionarRect(actual.base, dx, dy)
      }));
    }

    function soltar(evento: PointerEvent) {
      const actual = arrastre.current;
      arrastre.current = null;
      setArrastrandoItemId(null);
      setAsientoSobreId(null);
      setFantasma(null);

      if (!actual) return;

      if (actual.tipo === "mesa-elemento") {
        const destinoId = buscarAsientoDestino(evento.clientX, evento.clientY);
        if (actual.movido && destinoId) {
          // Restauramos la posición original en nuestra mesa y disparamos la transferencia.
          onElementosMesaRef.current?.(prev =>
            prev.map(item =>
              item.id === actual.id
                ? { ...item, x: actual.base.x, y: actual.base.y }
                : item
            )
          );
          const destino = jugadoresRef.current.find(j => j.id === destinoId);
          if (destino) {
            void onEnviarElementoRef.current?.(destino, actual.elemento);
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
        if (destinoId) {
          const destino = jugadoresRef.current.find(j => j.id === destinoId);
          if (destino) {
            void onEnviarElementoRef.current?.(destino, actual.elemento);
          }
        }
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

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      if (ocultarResultado.current !== null) {
        window.clearTimeout(ocultarResultado.current);
      }
      if (avisoTimer.current !== null) window.clearTimeout(avisoTimer.current);
    },
    []
  );

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

  function tirarDado(): void {
    if (tirando) return;

    if (ocultarResultado.current !== null) {
      window.clearTimeout(ocultarResultado.current);
      ocultarResultado.current = null;
    }

    const cantidad = Math.round(limitar(cantidadDados, 1, 20));
    const caras = tipoDado;
    const mod = Math.round(limitar(bonificador, -99, 99));

    setSelectorAbierto(false);
    setTirando(true);
    let pasos = 0;

    const tick = () => {
      setTirada(lanzarDados(cantidad, caras, mod));
      pasos += 1;

      if (pasos < 12) {
        temporizador.current = window.setTimeout(tick, 70);
      } else {
        setTirada(lanzarDados(cantidad, caras, mod));
        setTirando(false);
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

  const centro = centroide(calibracion.mapa);
  const jugadorSeleccionado =
    jugadores.find(j => j.activo && j.id === jugadorSeleccionadoId && j.id !== yoAsientoId) ??
    null;

  function iniciarMesaElemento(
    elemento: ElementoMesa,
    evento: ReactPointerEvent
  ): void {
    if (ajuste) return;
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "mesa-elemento",
      id: elemento.id,
      elemento,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: { x: elemento.x, y: elemento.y },
      medidas,
      movido: false
    };
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

  function quitarElementoMesa(id: string): void {
    onElementosMesa?.(prev => prev.filter(item => item.id !== id));
    if (itemAbierto?.id === id) setItemAbierto(null);
  }

  return (
    <div className="sala">
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
                      : () =>
                          setJugadorSeleccionadoId(prev =>
                            prev === jugador.id ? null : jugador.id
                          )
                  }
                  onKeyDown={
                    ajuste || esMio
                      ? undefined
                      : evento => {
                          if (evento.key === "Enter" || evento.key === " ") {
                            evento.preventDefault();
                            setJugadorSeleccionadoId(prev =>
                              prev === jugador.id ? null : jugador.id
                            );
                          }
                        }
                  }
                >
                  <span className="esfera" />
                  <span className="asiento-nombre">
                    {jugador.nombre}
                    {esMio ? " (tú)" : ""}
                  </span>
                </div>
              );
            })}

          {!ajuste &&
            elementosMesa.map(elemento => {
              const estiloElemento = {
                left: `${elemento.x}%`,
                top: `${elemento.y}%`,
                ...(elemento.tipo === "posit"
                  ? {
                      background: elemento.color,
                      color: textoLegible(elemento.color),
                      "--giro": `${elemento.giro}deg`
                    }
                  : {})
              } as CSSProperties;

              return (
                <div
                  key={elemento.id}
                  className={[
                    "mesa-elemento",
                    elemento.tipo === "posit" ? "mesa-posit" : "mesa-archivo",
                    arrastrandoItemId === elemento.id ? "arrastrando" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={estiloElemento}
                  onPointerDown={evento => iniciarMesaElemento(elemento, evento)}
                  title={
                    elemento.tipo === "posit"
                      ? "Arrastra a un jugador o pulsa para abrir"
                      : `${elemento.nombre} — arrastra a un jugador o pulsa para abrir`
                  }
                >
                  <div className="mesa-elemento-cabecera">
                    <span className="mesa-elemento-badge">
                      {elemento.tipo === "posit"
                        ? "Nota"
                        : tipoCortoArchivo(elemento.mime, elemento.nombre)}
                    </span>
                    <button
                      type="button"
                      className="mesa-elemento-quitar"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        quitarElementoMesa(elemento.id);
                      }}
                      aria-label="Quitar de la mesa"
                      title="Quitar de la mesa"
                    >
                      ×
                    </button>
                  </div>

                  {elemento.tipo === "posit" ? (
                    <p className="mesa-posit-texto">
                      {elemento.texto || "Nota vacía"}
                    </p>
                  ) : (
                    <span className="mesa-archivo-nombre">{elemento.nombre}</span>
                  )}

                  {elemento.remitente && (
                    <span className="mesa-elemento-remitente">
                      De {elemento.remitente}
                    </span>
                  )}

                  {jugadorSeleccionado && onEnviarElemento && (
                    <button
                      type="button"
                      className="mesa-elemento-enviar"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        void onEnviarElemento(jugadorSeleccionado, elemento);
                      }}
                    >
                      Pasar a {jugadorSeleccionado.nombre}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <div className="sala-vineta" aria-hidden="true" />

      <div className="sala-barra">
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button type="button" className="sala-btn" onClick={onVolver}>
            ← Sala de espera
          </button>
          <span className="sala-titulo-visible">
            SALA DE {hostName ? hostName.toUpperCase() : "MESA"}
          </span>
          <button
            type="button"
            className={`sala-btn${ajuste ? " activo" : ""}`}
            onClick={() => setAjuste(valor => !valor)}
          >
            {ajuste ? "Terminar ajuste" : "Ajustar"}
          </button>
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

          <button type="submit" className="dados-lanzar" disabled={tirando}>
            Tirar {formatearFormula(cantidadDados, tipoDado, bonificador)}
          </button>
        </form>
      )}

      {tirada !== null && !selectorAbierto && (
        <div
          className={`tirada-panel${calibracion.dock.y < 30 ? " debajo" : ""}`}
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

      <div
        className={`sala-dock${ajuste ? " ajustable" : ""}`}
        style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
        onPointerDown={ajuste ? iniciarDock : undefined}
      >
        <button
          type="button"
          className={`dock-btn${selectorAbierto ? " activo" : ""}`}
          onClick={() => {
            setSelectorAbierto(abierto => !abierto);
            setCompartirAbierto(false);
          }}
          aria-expanded={selectorAbierto}
          title="Seleccionar tirada de dados"
        >
          <IconoD20 />
        </button>
        <button
          type="button"
          className="dock-btn"
          onClick={onAbrirPizarra}
          title="Abrir la pizarra"
        >
          <IconoPosit />
        </button>
        <button
          type="button"
          className={`dock-btn${compartirAbierto ? " activo" : ""}`}
          onClick={() => {
            setCompartirAbierto(abierto => {
              const siguiente = !abierto;
              if (siguiente) onSolicitarArchivos?.();
              return siguiente;
            });
            setSelectorAbierto(false);
          }}
          aria-expanded={compartirAbierto}
          title="Notas y archivos para pasar"
        >
          <IconoCompartir />
        </button>
      </div>

      {compartirAbierto && !ajuste && (
        <div
          className={`compartir-panel${calibracion.dock.y < 30 ? " debajo" : ""}`}
          role="dialog"
          aria-label="Notas y archivos para pasar"
        >
          <div className="compartir-panel-cabecera">
            <h3 className="compartir-panel-titulo">Pasar a jugadores</h3>
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
                onClick={() => setCompartirAbierto(false)}
                aria-label="Cerrar panel de compartir"
              >
                ×
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
                onClick={() => setJugadorSeleccionadoId(null)}
              >
                Quitar
              </button>
            </div>
          ) : (
            <span className="compartir-subtitulo">
              Arrastra un elemento a un círculo o clica un jugador primero.
            </span>
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

          {posits.length > 0 && (
            <div className="compartir-seccion">
              <span className="compartir-subtitulo">Posits de pizarra</span>
              <ul className="compartir-lista">
                {posits.map(posit => {
                  const elem: ElementoMesa = {
                    id: `bandeja-posit-${posit.id}`,
                    tipo: "posit",
                    texto: posit.texto,
                    color: posit.color,
                    giro: posit.giro,
                    x: 78,
                    y: 78
                  };
                  return (
                    <li key={posit.id} className="compartir-item">
                      <div
                        className="compartir-item-arrastre"
                        onPointerDown={e => iniciarBandejaElemento(elem, e)}
                        title="Arrastra hacia el círculo de un jugador"
                      >
                        <span
                          className="compartir-color-dot"
                          style={{ background: posit.color }}
                        />
                        <span className="compartir-item-nombre">
                          {posit.texto || "Nota vacía"}
                        </span>
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
            </div>
          )}

          <div className="compartir-seccion">
            <span className="compartir-subtitulo">Archivos</span>
            {archivosDisponibles.length === 0 ? (
              <span className="compartir-subtitulo">
                No hay archivos subidos todavía.
              </span>
            ) : (
              <ul className="compartir-lista">
                {archivosDisponibles.map(archivo => {
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
    </div>
  );
}
