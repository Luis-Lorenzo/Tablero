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
  const conSol = !vacio && jugadores > 0;

  return (
    <svg
      className={vacio ? "hexagono vacio" : "hexagono"}
      viewBox="0 0 100 110"
      aria-hidden="true"
      focusable="false"
    >
      <polygon className="perimetro" points="50,3 95,29 95,81 50,107 5,81 5,29" />

      {!vacio && !conSol && (
        <path className="luna" d="M 54 24 C 26 32 26 78 54 86 C 44 72 44 38 54 24 Z" />
      )}

      {conSol && (
        <g className="sol">
          <circle cx="50" cy="55" r="13" />
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
        <span className="mesa-etiqueta">Mesa Vacía</span>
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
  const puedeUnirse = !esHost && !soyJugador;
  // Un administrador pierde el mando de una mesa en cuanto es jugador de ella
  // (por ejemplo, tras cedérsela a otro): deja de poder gestionarla.
  const puedeGestionar = esHost || (esAdmin && !soyJugador);
  const puedeAbandonar = soyJugador && !esAdmin;
  const llena = total >= MESA_MAX_JUGADORES;

  const pista = esHost
    ? "Eres el anfitrión"
    : soyJugador
      ? "Ya estás en esta mesa"
      : "Pulsa para unirte";

  const cuerpo = (
    <>
      <span className="mesa-etiqueta">Mesa {mesa.hostName}</span>
      {llena && <span className="mesa-lleno">LLENO</span>}
      <span className="mesa-hexagono">
        <Hexagono jugadores={total} />
      </span>
      <span className="mesa-info">
        <span>
          <strong>Anfitrión:</strong> {mesa.hostName}
        </span>
        <span>
          <strong>Jugadores:</strong>{" "}
          {jugadores.length > 0 ? jugadores.join(", ") : "Ninguno"} ({jugadores.length}/
          {MESA_MAX_JUGADORES})
        </span>
      </span>
      <span className={`mesa-pista ${puedeUnirse ? "unete" : "dentro"}`}>{pista}</span>
    </>
  );

  return (
    <article className={esHost ? "mesa-card mia" : "mesa-card"}>
      {puedeUnirse ? (
        <button
          type="button"
          className="mesa-cuerpo"
          onClick={() => onJoin(mesa)}
          disabled={busy}
        >
          {cuerpo}
        </button>
      ) : (
        <div className="mesa-cuerpo">{cuerpo}</div>
      )}

      {esHost && (
        <div className="mesa-botones">
          <button
            type="button"
            className="ghost small"
            onClick={() => onGestionar(mesa)}
          >
            {mesa.estado === "EN_CURSO" ? "Volver a la mesa" : "Gestionar"}
          </button>
          <button
            type="button"
            className="danger small mesa-cerrar"
            onClick={() => onClose(mesa)}
            disabled={busy}
          >
            Cerrar mesa
          </button>
        </div>
      )}

      {puedeGestionar && !esHost && (
        <button
          type="button"
          className="ghost small"
          onClick={() => onGestionar(mesa)}
        >
          {mesa.estado === "EN_CURSO" ? "Ir a la mesa" : "Gestionar"}
        </button>
      )}

      {puedeAbandonar && (
        <button
          type="button"
          className="danger small"
          onClick={() => onAbandon(mesa)}
          disabled={busy}
        >
          Abandonar mesa
        </button>
      )}
    </article>
  );
}
