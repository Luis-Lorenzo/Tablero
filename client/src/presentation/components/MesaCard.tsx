import { useId } from "react";
import { Crown, Eye, LogOut, Play, Settings2, Trash2, Users } from "lucide-react";
import { MESA_MAX_JUGADORES } from "../../api/mesas.api";
import type { PublicMesa } from "../../api/types";

/** Vértices del hexágono donde se coloca cada rayo (arriba y cada 60º). */
const RAYOS_GRADOS = [0, 60, 120, 180, 240, 300];

/**
 * Perímetro hexagonal de una mesa. Con el hueco vacío se dibuja un contorno
 * discontinuo; con la mesa creada, una luna morada que, en cuanto entra el
 * primer jugador, deja paso a un sol (círculo amarillo) con una punta por
 * jugador apuntando a su vértice correspondiente.
 */
function Hexagono({
  jugadores = 0,
  vacio = false
}: {
  jugadores?: number;
  vacio?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const solGrad = `sol-${uid}`;

  const conSol = !vacio && jugadores > 0;

  return (
    <svg
      className={vacio ? "hexagono vacio" : "hexagono"}
      viewBox="0 0 100 110"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={solGrad} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffe580" />
          <stop offset="100%" stopColor="#e5aa1d" />
        </radialGradient>
      </defs>

      <polygon className="perimetro" points="50,3 95,29 95,81 50,107 5,81 5,29" />

      {!vacio && !conSol && (
        <path className="luna" d="M 54 24 C 26 32 26 78 54 86 C 44 72 44 38 54 24 Z" />
      )}

      {conSol && (
        <g className="sol">
          <circle cx="50" cy="55" r="13" fill={`url(#${solGrad})`} />
          {RAYOS_GRADOS.slice(0, Math.min(jugadores, MESA_MAX_JUGADORES)).map(
            grados => (
              <polygon
                key={grados}
                className="rayo"
                points="45.4,38 54.6,38 50,29"
                transform={`rotate(${grados} 50 55)`}
              />
            )
          )}
        </g>
      )}
    </svg>
  );
}

interface MesaCardProps {
  mesa: PublicMesa | null;
  currentUserId: string;
  esAdmin?: boolean;
  onJoin: (mesa: PublicMesa) => void;
  onClose: (mesa: PublicMesa) => void;
  onAbandon: (mesa: PublicMesa) => void;
  onGestionar: (mesa: PublicMesa) => void;
  busy?: boolean;
}

export function MesaCard({
  mesa,
  currentUserId,
  esAdmin = false,
  onJoin,
  onClose,
  onAbandon,
  onGestionar,
  busy = false
}: MesaCardProps) {
  if (!mesa) {
    return (
      <article className="mesa-card vacia">
        <div className="mesa-cabecera-card">
          <span className="mesa-etiqueta">Mesa Vacía</span>
        </div>
        <span className="mesa-hexagono pasiva">
          <Hexagono vacio />
        </span>
        <p className="mesa-info muted">Nadie la ha creado todavía.</p>
      </article>
    );
  }

  const esHost = mesa.hostId === currentUserId;
  const soyJugador = mesa.players.some(jugador => jugador.id === currentUserId);
  const jugadores = mesa.players.map(jugador => jugador.name);
  const total = mesa.players.length;
  const llena = total >= MESA_MAX_JUGADORES;
  const puedeUnirse = !esHost && !soyJugador && !llena && !esAdmin;
  // Un administrador pierde el mando de una mesa en cuanto es jugador de ella
  // (por ejemplo, tras cedérsela a otro): deja de poder gestionarla.
  const puedeGestionar = esHost || (esAdmin && !soyJugador);
  const puedeAbandonar = soyJugador && !esHost;

  const pista = esHost
    ? "Eres el anfitrión"
    : soyJugador
      ? "Ya estás en esta mesa"
      : esAdmin
        ? "Pulsa para administrar"
        : llena
          ? "Mesa completa"
          : "Pulsa para unirte";

  const cuerpo = (
    <>
      <div className="mesa-cabecera-card">
        <span className="mesa-etiqueta">Mesa {mesa.hostName}</span>
        {llena && <span className="mesa-lleno">LLENO</span>}
      </div>

      <div className="mesa-hexagono-fila">
        <span className="mesa-hexagono">
          <Hexagono jugadores={total} />
        </span>
        {mesa.estado === "EN_CURSO" ? (
          <span className="pill on mesa-badge-estado en-curso">● Partida en curso</span>
        ) : (
          <span className="pill pending mesa-badge-estado en-espera">En espera</span>
        )}
      </div>

      <div className="mesa-info">
        <span className="mesa-dato">
          <Crown size={13} aria-hidden="true" />
          <strong>Anfitrión:</strong> {mesa.hostName}
        </span>
        <span className="mesa-dato">
          <Users size={13} aria-hidden="true" />
          <strong>Jugadores ({jugadores.length}/{MESA_MAX_JUGADORES}):</strong>{" "}
          {jugadores.length > 0 ? jugadores.join(", ") : "Ninguno"}
        </span>
      </div>

      <span className={`mesa-pista ${puedeUnirse ? "unete" : "dentro"}`}>{pista}</span>
    </>
  );

  const cuerpoAccion = puedeUnirse
    ? () => onJoin(mesa)
    : esAdmin && !esHost && !soyJugador
      ? () => onGestionar(mesa)
      : null;

  return (
    <article className={esHost ? "mesa-card mia" : "mesa-card"}>
      {cuerpoAccion ? (
        <button
          type="button"
          className="mesa-cuerpo"
          onClick={cuerpoAccion}
          disabled={busy}
        >
          {cuerpo}
        </button>
      ) : (
        <div className="mesa-cuerpo">{cuerpo}</div>
      )}

      {(esHost || soyJugador || puedeGestionar || puedeAbandonar) && (
        <div className="mesa-botones">
          {esHost && (
            <>
              <button
                type="button"
                className="ghost small"
                onClick={() => onGestionar(mesa)}
              >
                {mesa.estado === "EN_CURSO" ? (
                  <>
                    <Play size={13} aria-hidden="true" />
                    <span>Volver a la mesa</span>
                  </>
                ) : (
                  <>
                    <Settings2 size={13} aria-hidden="true" />
                    <span>Gestionar</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="danger small mesa-cerrar"
                onClick={() => onClose(mesa)}
                disabled={busy}
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Cerrar mesa</span>
              </button>
            </>
          )}

          {soyJugador && !esHost && (
            <button
              type="button"
              className="ghost small"
              onClick={() => onGestionar(mesa)}
            >
              <Eye size={13} aria-hidden="true" />
              <span>{mesa.estado === "EN_CURSO" ? "Ver mesa" : "Ver sala"}</span>
            </button>
          )}

          {puedeGestionar && !esHost && !soyJugador && (
            <button
              type="button"
              className="ghost small"
              onClick={() => onGestionar(mesa)}
            >
              {mesa.estado === "EN_CURSO" ? (
                <>
                  <Play size={13} aria-hidden="true" />
                  <span>Ir a la mesa</span>
                </>
              ) : (
                <>
                  <Settings2 size={13} aria-hidden="true" />
                  <span>Gestionar</span>
                </>
              )}
            </button>
          )}

          {puedeAbandonar && (
            <button
              type="button"
              className="danger small"
              onClick={() => onAbandon(mesa)}
              disabled={busy}
            >
              <LogOut size={13} aria-hidden="true" />
              <span>Abandonar mesa</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}
