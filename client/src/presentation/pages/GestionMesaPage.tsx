import { useCallback, useEffect, useState } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { useMesasLive } from "../hooks/useMesasLive";

interface GestionMesaPageProps {
  mesaId: string;
  user: PublicUser;
  onVolver: () => void;
  onSessionExpired?: () => void;
}

/** Color del hexágono según los jugadores: rojo 0, amarillo 1, verde 2 o más. */
function colorPorJugadores(total: number): string {
  if (total === 0) return "rojo";
  if (total === 1) return "amarillo";
  return "verde";
}

/**
 * Página intermedia de una mesa, solo para su anfitrión (o un administrador).
 * Muestra el número de jugadores en un hexágono grande y permite ceder el mando
 * o expulsar jugadores.
 */
export function GestionMesaPage({
  mesaId,
  user,
  onVolver,
  onSessionExpired
}: GestionMesaPageProps) {
  const [mesa, setMesa] = useState<PublicMesa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noDisponible, setNoDisponible] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      setMesa(await mesasApi.obtener(mesaId));
      setNoDisponible(false);
      setError(null);
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    } finally {
      setLoading(false);
    }
  }, [mesaId]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  useMesasLive(refrescar, onSessionExpired);

  const esAnfitrion = mesa?.hostId === user.id;
  const puedeGestionar = esAnfitrion || user.role === "ADMIN";

  async function ceder(playerId: string) {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await mesasApi.ceder(mesa.id, playerId);
      setAviso("Oferta enviada. Esperando a que el jugador acepte el mando.");
      await refrescar();
    } catch (cederError) {
      setError(describeError(cederError));
    } finally {
      setBusy(false);
    }
  }

  async function expulsar(playerId: string, nombre: string) {
    if (!mesa) return;
    const confirmado = window.confirm(
      `¿Expulsar a ${nombre}? No podrá volver a entrar en esta mesa.`
    );
    if (!confirmado) return;

    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await mesasApi.expulsar(mesa.id, playerId);
      await refrescar();
    } catch (expulsarError) {
      setError(describeError(expulsarError));
    } finally {
      setBusy(false);
    }
  }

  async function cerrar() {
    if (!mesa) return;
    const confirmado = window.confirm(
      `¿Cerrar "Mesa ${mesa.hostName}"? Los jugadores se quedarán sin mesa.`
    );
    if (!confirmado) return;

    setBusy(true);
    setError(null);
    try {
      await mesasApi.cerrar(mesa.id);
      onVolver();
    } catch (cerrarError) {
      setError(describeError(cerrarError));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="muted">Cargando mesa…</p>
      </section>
    );
  }

  if (!mesa || noDisponible || !puedeGestionar) {
    return (
      <section className="card aviso-rol">
        <h2>Página no disponible para tu rol</h2>
        <p className="muted">Solo el anfitrión de la mesa (o un administrador) puede verla.</p>
        <button type="button" className="ghost" onClick={onVolver}>
          Volver a la recepción
        </button>
      </section>
    );
  }

  const total = mesa.players.length;
  const color = colorPorJugadores(total);

  return (
    <section className="card gestion">
      <div className="gestion-cabecera">
        <button type="button" className="ghost small" onClick={onVolver}>
          ← Volver
        </button>
        <h2>Mesa {mesa.hostName}</h2>
      </div>

      {error && <p className="feedback ko">{error}</p>}
      {aviso && <p className="feedback ok">{aviso}</p>}

      <div className="gestion-hexagono">
        <svg className={`hexagono-grande ${color}`} viewBox="0 0 100 110" aria-hidden="true">
          <polygon points="50,3 95,29 95,81 50,107 5,81 5,29" />
          <text x="50" y="66" textAnchor="middle">
            {total}
          </text>
        </svg>
        <p className="muted">
          {total === 0
            ? "Sin jugadores todavía."
            : `${total} jugador${total === 1 ? "" : "es"} en la mesa (el anfitrión no ocupa plaza).`}
        </p>
      </div>

      {mesa.pendingHostId && (
        <p className="feedback aviso">
          Cesión de mando pendiente de aceptación por{" "}
          <strong>
            {mesa.players.find(jugador => jugador.id === mesa.pendingHostId)?.name ??
              "un jugador"}
          </strong>
          .
        </p>
      )}

      <h3>Jugadores</h3>
      {mesa.players.length === 0 ? (
        <p className="muted">Nadie se ha unido todavía.</p>
      ) : (
        <ul className="gestion-jugadores">
          {mesa.players.map(jugador => (
            <li key={jugador.id}>
              <span className="jugador-nombre">{jugador.name}</span>
              <span className="jugador-acciones">
                <button
                  type="button"
                  className="ghost small"
                  disabled={busy || mesa.pendingHostId === jugador.id}
                  onClick={() => void ceder(jugador.id)}
                >
                  {mesa.pendingHostId === jugador.id ? "Esperando…" : "Dar rol de anfitrión"}
                </button>
                <button
                  type="button"
                  className="danger small"
                  disabled={busy}
                  onClick={() => void expulsar(jugador.id, jugador.name)}
                >
                  Expulsar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {esAnfitrion && (
        <div className="acciones-cuenta">
          <button type="button" className="danger" onClick={cerrar} disabled={busy}>
            Cerrar mesa
          </button>
        </div>
      )}
    </section>
  );
}
