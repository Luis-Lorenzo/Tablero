import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { CALIBRACION_INICIAL, FONDO_SALA } from "./datos";
import type { Calibracion, JugadorPreview, RectPizarra } from "./tipos";

interface SalaProps {
  jugadores: JugadorPreview[];
  calibracion: Calibracion;
  onCalibracion: Dispatch<SetStateAction<Calibracion>>;
  onAbrirPizarra: () => void;
  onVolver: () => void;
}

type Arrastre =
  | {
      tipo: "asiento";
      id: string;
      inicioX: number;
      inicioY: number;
      base: { x: number; y: number };
      rect: DOMRect;
    }
  | {
      tipo: "pizarra" | "pizarra-tam";
      inicioX: number;
      inicioY: number;
      base: RectPizarra;
      rect: DOMRect;
    };

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
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
  onVolver
}: SalaProps) {
  const [ajuste, setAjuste] = useState(false);
  const [tirando, setTirando] = useState(false);
  const [tirada, setTirada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const plano = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const temporizador = useRef<number | null>(null);
  const avisoTimer = useRef<number | null>(null);

  useEffect(() => {
    function mover(evento: PointerEvent) {
      const actual = arrastre.current;
      if (!actual) return;

      const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
      const dy = ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;

      if (actual.tipo === "asiento") {
        const x = limitar(actual.base.x + dx, 2, 98);
        const y = limitar(actual.base.y + dy, 2, 98);
        onCalibracion(prev => ({
          ...prev,
          asientos: { ...prev.asientos, [actual.id]: { x, y } }
        }));
        return;
      }

      onCalibracion(prev => {
        if (actual.tipo === "pizarra") {
          const x = limitar(actual.base.x + dx, 0, 100 - actual.base.w);
          const y = limitar(actual.base.y + dy, 0, 100 - actual.base.h);
          return { ...prev, pizarra: { ...actual.base, x, y } };
        }

        const w = limitar(actual.base.w + dx, 6, 100 - actual.base.x);
        const h = limitar(actual.base.h + dy, 6, 100 - actual.base.y);
        return { ...prev, pizarra: { ...actual.base, w, h } };
      });
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
      if (avisoTimer.current !== null) window.clearTimeout(avisoTimer.current);
    },
    []
  );

  function mostrarAviso(texto: string): void {
    setAviso(texto);
    if (avisoTimer.current !== null) window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 3200);
  }

  function iniciarAsiento(id: string, evento: ReactPointerEvent): void {
    const rect = plano.current?.getBoundingClientRect();
    if (!rect) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "asiento",
      id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.asientos[id] ?? { x: 50, y: 50 },
      rect
    };
  }

  function iniciarPizarra(evento: ReactPointerEvent): void {
    const rect = plano.current?.getBoundingClientRect();
    if (!rect) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "pizarra",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.pizarra,
      rect
    };
  }

  function iniciarTam(evento: ReactPointerEvent): void {
    const rect = plano.current?.getBoundingClientRect();
    if (!rect) return;

    evento.stopPropagation();
    arrastre.current = {
      tipo: "pizarra-tam",
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: calibracion.pizarra,
      rect
    };
  }

  function tirarDado(): void {
    if (tirando) return;

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

  const pizarra = calibracion.pizarra;

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
              className="pizarra-rect"
              style={{
                left: `${pizarra.x}%`,
                top: `${pizarra.y}%`,
                width: `${pizarra.w}%`,
                height: `${pizarra.h}%`
              }}
              onPointerDown={iniciarPizarra}
            >
              <span className="pizarra-rect-etiqueta">pizarra</span>
              <span className="pizarra-tirador" onPointerDown={iniciarTam} />
            </div>
          ) : (
            <button
              type="button"
              className="pizarra-hotspot"
              style={{
                left: `${pizarra.x}%`,
                top: `${pizarra.y}%`,
                width: `${pizarra.w}%`,
                height: `${pizarra.h}%`
              }}
              onClick={onAbrirPizarra}
              title="Abrir la pizarra"
            >
              <span>Abrir pizarra</span>
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
            Arrastra cada esfera a su silla y ajusta el recuadro de la pizarra.
            Se guarda solo en este navegador.
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
        <div className="tirada-panel">
          <span className="tirada-icono">
            <IconoD20 />
          </span>
          <span className={`tirada-num${tirando ? " girando" : ""}`}>{tirada}</span>
          <span className="tirada-etiqueta">{tirando ? "tirando…" : "d20"}</span>
        </div>
      )}

      <div className="sala-dock">
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
