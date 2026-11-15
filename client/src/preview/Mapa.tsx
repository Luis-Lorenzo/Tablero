import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Map as MapIcon, Radio } from "lucide-react";
import { nuevoId } from "./calibracion";
import { reproducirSonidoPing } from "./sonido";
import type { PingVisual } from "./tipos";

interface MapaProps {
  onVolver: () => void;
  pingsActivos?: PingVisual[];
  onEnviarPing?: (datos: { x: number; y: number; vista: "mapa" }) => void;
  colorJugador?: string;
  nombreJugador?: string;
}

/**
 * Página del mapa (fase 1). De momento es el papel en blanco: el máster podrá
 * colgar aquí su mapa sin que la sala 3D lo deforme.
 */
export function Mapa({
  onVolver,
  pingsActivos,
  onEnviarPing,
  colorJugador,
  nombreJugador
}: MapaProps) {
  const [modoPing, setModoPing] = useState(false);
  const [pingsLocales, setPingsLocales] = useState<PingVisual[]>([]);

  const pingsVisibles = (pingsActivos ?? pingsLocales).filter(
    p => p.vista === "mapa"
  );

  function alPulsarMapa(evento: ReactPointerEvent<HTMLDivElement>): void {
    if (!modoPing) return;
    const rect = evento.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(100, ((evento.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((evento.clientY - rect.top) / rect.height) * 100));

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

  return (
    <div className="mapa-page">
      <div className="mapa-papel" aria-hidden="true" />

      <div className="pizarra-barra">
        <button type="button" className="pizarra-btn" onClick={onVolver}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver</span>
        </button>

        <button
          type="button"
          className={`pizarra-tool-btn${modoPing ? " activo" : ""}`}
          onClick={() => setModoPing(prev => !prev)}
          title="Señalar un punto temporalmente con un ping"
        >
          <Radio size={14} strokeWidth={2.1} aria-hidden="true" />
          <span>Ping</span>
        </button>
      </div>

      <div
        className={`mapa-lienzo${modoPing ? " modo-ping" : ""}`}
        onPointerDown={alPulsarMapa}
      >
        <p className="mapa-vacio">
          <MapIcon size={18} aria-hidden="true" />
          <span>Aquí se cargará el mapa</span>
        </p>

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
  );
}
