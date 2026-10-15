import { MESA_MAX_JUGADORES } from "../../api/mesas.api";
import type { PublicMesa } from "../../api/types";

/**
 * Perímetro hexagonal de una mesa con la luna morada en el centro. Solo se
 * dibuja el contorno; la luna desaparece cuando el hueco está vacío.
 */
function Hexagono({ vacio = false }: { vacio?: boolean }) {
  return (
    <svg
      className={vacio ? "hexagono vacio" : "hexagono"}
      viewBox="0 0 100 110"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="50,3 95,29 95,81 50,107 5,81 5,29" />
      {!vacio && (
        <path d="M 54 24 C 26 32 26 78 54 86 C 44 72 44 38 54 24 Z" />
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
  const puedeUnirse = !esHost && !soyJugador;
  const puedeGestionar = esHost || esAdmin;
  const puedeAbandonar = soyJugador && !esAdmin;

  const pista = esHost
    ? "Eres el anfitrión"
    : soyJugador
      ? "Ya estás en esta mesa"
      : "Pulsa para unirte";

  const cuerpo = (
    <>
      <span className="mesa-etiqueta">Mesa {mesa.hostName}</span>
      <span className="mesa-hexagono">
        <Hexagono />
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
            Gestionar
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
          Gestionar
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
