import type { Dispatch, SetStateAction } from "react";
import type { JugadorPreview } from "./tipos";

interface LobbyProps {
  jugadores: JugadorPreview[];
  onJugadores: Dispatch<SetStateAction<JugadorPreview[]>>;
  onEmpezar: () => void;
}

/**
 * Sala de espera de mentira: cada jugador elige el color de su esfera y el
 * máster decide qué asientos están activos antes de empezar.
 */
export function Lobby({ jugadores, onJugadores, onEmpezar }: LobbyProps) {
  function cambiarColor(id: string, color: string): void {
    onJugadores(prev =>
      prev.map(jugador => (jugador.id === id ? { ...jugador, color } : jugador))
    );
  }

  function alternarAsiento(id: string): void {
    onJugadores(prev =>
      prev.map(jugador =>
        jugador.id === id ? { ...jugador, activo: !jugador.activo } : jugador
      )
    );
  }

  return (
    <main className="preview-lobby">
      <div className="preview-card">
        <p className="preview-eyebrow">PREVISUALIZACIÓN · DATOS FALSOS</p>
        <h1>Sala de espera</h1>
        <p className="preview-muted">
          Cada jugador elige el color de su esfera. El máster reparte los
          asientos y decide quién entra.
        </p>

        <ul className="jugadores-lista">
          {jugadores.map(jugador => (
            <li
              key={jugador.id}
              className={[
                "jugador",
                jugador.activo ? "" : "inactivo",
                jugador.esMaster ? "master" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className="jugador-esfera"
                style={{ background: jugador.color }}
                aria-hidden="true"
              />

              <span className="jugador-nombre">
                {jugador.nombre}
                {jugador.esMaster && (
                  <span className="jugador-rol"> · máster</span>
                )}
              </span>

              <input
                type="color"
                className="jugador-color"
                value={jugador.color}
                onChange={evento => cambiarColor(jugador.id, evento.target.value)}
                aria-label={`Color de ${jugador.nombre}`}
              />

              {jugador.esMaster ? (
                <span className="jugador-estado">siempre dentro</span>
              ) : (
                <button
                  type="button"
                  className="jugador-toggle"
                  onClick={() => alternarAsiento(jugador.id)}
                >
                  {jugador.activo ? "Desactivar" : "Activar"}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="preview-acciones">
          <button type="button" className="preview-primary" onClick={onEmpezar}>
            Empezar partida
          </button>
        </div>

        <p className="preview-nota">
          El botón solo lo ve el máster (aquí lo simulamos). El asiento trasero
          derecho viene desactivado: actívalo cuando quieras.
        </p>
      </div>
    </main>
  );
}
