import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction
} from "react";
import { CALIBRACION_INICIAL, FONDO_SALA } from "./datos";
import type {
  Asiento,
  Calibracion,
  JugadorPreview,
  RectPizarra
} from "./tipos";

interface SalaProps {
  jugadores: JugadorPreview[];
  calibracion: Calibracion;
  onCalibracion: Dispatch<SetStateAction<Calibracion>>;
  onAbrirPizarra: () => void;
  onAbrirMapa: () => void;
  onVolver: () => void;
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
      tipo: "pizarra" | "mapa" | "pizarra-tam" | "mapa-tam";
      inicioX: number;
      inicioY: number;
      base: RectPizarra;
      medidas: Medidas;
    };

/** Segundos que el resultado del dado sigue en pantalla antes de irse. */
const DURACION_RESULTADO = 3500;

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

export function Sala({
  jugadores,
  calibracion,
  onCalibracion,
  onAbrirPizarra,
  onAbrirMapa,
  onVolver
}: SalaProps) {
  const [ajuste, setAjuste] = useState(
    () => new URLSearchParams(window.location.search).get("ajuste") === "1"
  );
  const [tirando, setTirando] = useState(false);
  const [tirada, setTirada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const plano = useRef<HTMLDivElement>(null);
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

      if (actual.tipo === "pizarra") {
        onCalibracion(prev => ({
          ...prev,
          pizarra: moverRect(actual.base, dx, dy)
        }));
        return;
      }

      if (actual.tipo === "mapa") {
        onCalibracion(prev => ({
          ...prev,
          mapa: moverRect(actual.base, dx, dy)
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

      onCalibracion(prev => ({
        ...prev,
        mapa: redimensionarRect(actual.base, dx, dy)
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

  function iniciarRect(
    tipo: "pizarra" | "mapa",
    evento: ReactPointerEvent
  ): void {
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion[tipo],
      medidas
    };
  }

  function iniciarTam(
    tipo: "pizarra-tam" | "mapa-tam",
    evento: ReactPointerEvent
  ): void {
    const medidas = medidasPlano();
    if (!medidas) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion[tipo === "pizarra-tam" ? "pizarra" : "mapa"],
      medidas
    };
  }

  function tirarDado(): void {
    if (tirando) return;

    if (ocultarResultado.current !== null) {
      window.clearTimeout(ocultarResultado.current);
      ocultarResultado.current = null;
    }

    setTirando(true);
    let pasos = 0;

    const tick = () => {
      setTirada(1 + Math.floor(Math.random() * 20));
      pasos += 1;

      if (pasos < 12) {
        temporizador.current = window.setTimeout(tick, 70);
      } else {
        setTirada(1 + Math.floor(Math.random() * 20));
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

  function rectCalibrado(clave: "pizarra" | "mapa"): ReactNode {
    const tamTipo = clave === "pizarra" ? "pizarra-tam" : "mapa-tam";

    return (
      <div
        className={`rect-calibrado rect-${clave}`}
        style={estiloRect(calibracion[clave])}
        onPointerDown={evento => iniciarRect(clave, evento)}
      >
        <span className="rect-calibrado-etiqueta">{clave}</span>
        <span
          className="rect-tirador"
          onPointerDown={evento => iniciarTam(tamTipo, evento)}
        />
      </div>
    );
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
            rectCalibrado("pizarra")
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

          {ajuste ? (
            rectCalibrado("mapa")
          ) : (
            <button
              type="button"
              className="sala-hotspot hotspot-mapa"
              style={estiloRect(calibracion.mapa)}
              onClick={onAbrirMapa}
              title="Abrir el mapa"
            >
              <span>Abrir mapa</span>
            </button>
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
        <button type="button" className="sala-btn" onClick={onVolver}>
          ← Sala de espera
        </button>

        <span className="sala-titulo">Mesa de prueba</span>

        <button
          type="button"
          className={`sala-btn${ajuste ? " activo" : ""}`}
          onClick={() => setAjuste(valor => !valor)}
        >
          {ajuste ? "Terminar ajuste" : "Ajustar"}
        </button>
      </div>

      {ajuste && (
        <div className="ajuste-panel">
          <p>
            Arrastra las esferas a su silla, ajusta los recuadros de la pizarra y
            el mapa, y mueve la bandeja de dados. Se guarda solo en este
            navegador.
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

      {tirada !== null && (
        <div
          className={`tirada-panel${calibracion.dock.y < 30 ? " debajo" : ""}`}
          style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
        >
          <span className="tirada-icono">
            <IconoD20 />
          </span>
          <span className={`tirada-num${tirando ? " girando" : ""}`}>{tirada}</span>
          <span className="tirada-etiqueta">{tirando ? "tirando…" : "d20"}</span>
        </div>
      )}

      <div
        className={`sala-dock${ajuste ? " ajustable" : ""}`}
        style={{ left: `${calibracion.dock.x}%`, top: `${calibracion.dock.y}%` }}
        onPointerDown={ajuste ? iniciarDock : undefined}
      >
        <button
          type="button"
          className="dock-btn"
          onClick={tirarDado}
          title="Tirar un d20"
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
      </div>

      {aviso && <div className="sala-aviso">{aviso}</div>}
    </div>
  );
}
