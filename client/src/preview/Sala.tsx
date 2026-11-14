import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { nuevoId } from "./calibracion";
import { CALIBRACION_INICIAL, COLORES_POSIT, FONDO_SALA } from "./datos";
import { Posit } from "./Pizarra";
import type {
  Asiento,
  Calibracion,
  JugadorPreview,
  PositPreview,
  Punto,
  QuadMapa,
  RectPizarra
} from "./tipos";

interface SalaProps {
  jugadores: JugadorPreview[];
  calibracion: Calibracion;
  onCalibracion: Dispatch<SetStateAction<Calibracion>>;
  positsMesa?: PositPreview[];
  onPositsMesa?: Dispatch<SetStateAction<PositPreview[]>>;
  onAbrirPizarra: () => void;
  onAbrirMapa: () => void;
  onAbrirArchivador?: () => void;
  onVolver: () => void;
  hostName?: string;
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
      tipo: "posit-mesa";
      id: string;
      inicioX: number;
      inicioY: number;
      base: Punto;
      medidas: Medidas;
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

export function Sala({
  jugadores,
  calibracion,
  onCalibracion,
  positsMesa,
  onPositsMesa,
  onAbrirPizarra,
  onAbrirMapa,
  onAbrirArchivador,
  onVolver,
  hostName
}: SalaProps) {
  const [ajuste, setAjuste] = useState(
    () => new URLSearchParams(window.location.search).get("ajuste") === "1"
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [cantidadDados, setCantidadDados] = useState(1);
  const [tipoDado, setTipoDado] = useState<number>(20);
  const [bonificador, setBonificador] = useState(0);
  const [tirando, setTirando] = useState(false);
  const [tirada, setTirada] = useState<ResultadoTirada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sobreMapa, setSobreMapa] = useState(false);
  const [positActivo, setPositActivo] = useState<string | null>(null);

  const plano = useRef<HTMLDivElement>(null);
  const capaPosits = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const temporizador = useRef<number | null>(null);
  const ocultarResultado = useRef<number | null>(null);
  const avisoTimer = useRef<number | null>(null);

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

    function soltar() {
      arrastre.current = null;
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [onCalibracion, onPositsMesa]);

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
      archivado: false
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

  const centro = centroide(calibracion.mapa);
  const positsVisibles = (positsMesa ?? []).filter(posit => !posit.archivado);
  const positsArchivadosCount = (positsMesa ?? []).filter(
    posit => posit.archivado
  ).length;

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
                  <span className="esfera" />
                  <span className="asiento-nombre">{jugador.nombre}</span>
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
            className={`dock-btn${selectorAbierto ? " activo" : ""}`}
            onClick={() => setSelectorAbierto(abierto => !abierto)}
            aria-expanded={selectorAbierto}
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
      </div>

      {aviso && <div className="sala-aviso">{aviso}</div>}
    </div>
  );
}
