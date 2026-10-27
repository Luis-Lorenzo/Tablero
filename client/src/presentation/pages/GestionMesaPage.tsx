import { useCallback, useEffect, useState } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { useMesasLive } from "../hooks/useMesasLive";
import { PALETA_JUGADOR } from "../paleta";

interface GestionMesaPageProps {
  mesaId: string;
  user: PublicUser;
  onVolver: () => void;
  onAbrirSala?: (mesa: PublicMesa) => void;
  onSessionExpired?: () => void;
}

/** Color del hexágono según los jugadores: rojo 0, amarillo 1, verde 2 o más. */
function colorPorJugadores(total: number): string {
  if (total === 0) return "rojo";
  if (total === 1) return "amarillo";
  return "verde";
}

/**
 * Página de una mesa. El anfitrión (o un administrador) puede ceder el mando,
 * expulsar jugadores, empezar la partida y cerrar la mesa. Los jugadores pueden
 * ver la mesa, elegir el color de su esfera y entrar en la sala.
 */
export function GestionMesaPage({
  mesaId,
  user,
  onVolver,
  onAbrirSala,
  onSessionExpired
}: GestionMesaPageProps) {
  const [mesa, setMesa] = useState<PublicMesa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paletaDe, setPaletaDe] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      setMesa(await mesasApi.obtener(mesaId));
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
  // Un administrador manda en cualquier mesa salvo en la que ya juega: si se le
  // cedió el mando a otro, deja de poder gestionarla.
  const soyJugador = mesa?.players.some(jugador => jugador.id === user.id) ?? false;
  const gestiona = esAnfitrion || (user.role === "ADMIN" && !soyJugador);
  const puedeVer = gestiona || soyJugador;

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

  async function iniciarPartida() {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const actualizada = await mesasApi.iniciar(mesa.id);
      setMesa(actualizada);
      if (onAbrirSala) {
        onAbrirSala(actualizada);
      }
    } catch (iniciarError) {
      setError(describeError(iniciarError));
    } finally {
      setBusy(false);
    }
  }

  async function elegirColor(color: string) {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const actualizada = await mesasApi.ponerColor(mesa.id, color);
      setMesa(actualizada);
      setPaletaDe(null);
    } catch (colorError) {
      setError(describeError(colorError));
    } finally {
      setBusy(false);
    }
  }

  function entrarEnSala() {
    if (mesa && onAbrirSala) onAbrirSala(mesa);
  }

  if (loading) {
    return (
      <section className="card">
        <p className="muted">Cargando mesa…</p>
      </section>
    );
  }

  if (!mesa || !puedeVer) {
    return (
      <section className="card aviso-rol">
        <h2>Página no disponible para tu rol</h2>
        <p className="muted">Solo los miembros de la mesa pueden verla.</p>
        <button type="button" className="ghost" onClick={onVolver}>
          Volver a la recepción
        </button>
      </section>
    );
  }

  const total = mesa.players.length;
  const color = colorPorJugadores(total);
  const miColor = mesa.colores?.[user.id] ?? null;

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

      <h3>Tu color</h3>
      <div className="color-propio">
        <button
          type="button"
          className="color-cuadrado"
          style={{ background: miColor ?? "transparent" }}
          onClick={() => setPaletaDe(paletaDe === user.id ? null : user.id)}
          disabled={busy}
          aria-label="Elegir color"
          title="Elegir color"
        />
        <span className="muted">
          {miColor ? "Pulsa el cuadrado para cambiar tu color." : "Elige el color de tu esfera."}
        </span>
      </div>

      {paletaDe === user.id && (
        <div className="paleta-colores">
          {PALETA_JUGADOR.map(opcion => (
            <button
              key={opcion}
              type="button"
              className={`paleta-color${miColor === opcion ? " activa" : ""}`}
              style={{ background: opcion }}
              onClick={() => void elegirColor(opcion)}
              disabled={busy}
              aria-label={`Color ${opcion}`}
              title={opcion}
            />
          ))}
        </div>
      )}

      <h3>Jugadores</h3>
      {mesa.players.length === 0 ? (
        <p className="muted">Nadie se ha unido todavía.</p>
      ) : (
        <ul className="gestion-jugadores">
          {mesa.players.map(jugador => (
            <li key={jugador.id}>
              <span className="jugador-nombre">
                <span
                  className="jugador-color"
                  style={{ background: mesa.colores?.[jugador.id] ?? "transparent" }}
                  aria-hidden="true"
                />
                {jugador.name}
                {jugador.id === user.id && <span className="jugador-yo"> (tú)</span>}
              </span>
              <span className="jugador-acciones">
                {jugador.id === user.id && (
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      setPaletaDe(paletaDe === jugador.id ? null : jugador.id)
                    }
                    disabled={busy}
                  >
                    Color
                  </button>
                )}
                {gestiona && (
                  <>
                    <button
                      type="button"
                      className="ghost small"
                      disabled={busy || mesa.pendingHostId === jugador.id}
                      onClick={() => void ceder(jugador.id)}
                    >
                      {mesa.pendingHostId === jugador.id
                        ? "Esperando…"
                        : "Dar rol de anfitrión"}
                    </button>
                    <button
                      type="button"
                      className="danger small"
                      disabled={busy}
                      onClick={() => void expulsar(jugador.id, jugador.name)}
                    >
                      Expulsar
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="acciones-cuenta">
        {onAbrirSala && (
          <button type="button" className="primary verde" onClick={entrarEnSala}>
            {mesa.estado === "EN_CURSO" ? "Ir a la partida" : "Entrar en la sala"}
          </button>
        )}

        {gestiona && (
          <button
            type="button"
            className="primary amarillo"
            onClick={() => void iniciarPartida()}
            disabled={busy || mesa.estado === "EN_CURSO"}
          >
            {mesa.estado === "EN_CURSO" ? "Partida iniciada" : "Empezar partida"}
          </button>
        )}

        {esAnfitrion && (
          <button type="button" className="danger" onClick={cerrar} disabled={busy}>
            Cerrar mesa
          </button>
        )}
      </div>
    </section>
  );
}
