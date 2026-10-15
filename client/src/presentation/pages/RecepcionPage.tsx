import { useCallback, useEffect, useState } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { MesaCard } from "../components/MesaCard";
import { Dados } from "../components/Dados";
import { useMesasLive } from "../hooks/useMesasLive";

interface RecepcionPageProps {
  user: PublicUser;
  /** Abre la página de gestión de una mesa (anfitrión o administrador). */
  onGestionar: (mesa: PublicMesa) => void;
  /** Informa de la mesa que aloja el usuario ahora mismo (o null). */
  onMiMesa?: (mesa: PublicMesa | null) => void;
  /** La sesión ha caducado en el canal en vivo: hay que volver al login. */
  onSessionExpired?: () => void;
}

/**
 * La sala a la que se llega tras iniciar sesión. Muestra una cuadrícula fija de
 * 4 huecos: los que nadie ha creado aparecen como "Mesa Vacía" y las mesas se
 * colocan pegadas al final para que la más reciente quede abajo a la derecha.
 */
export function RecepcionPage({
  user,
  onGestionar,
  onMiMesa,
  onSessionExpired
}: RecepcionPageProps) {
  const [huecos, setHuecos] = useState<Array<PublicMesa | null>>([]);
  const [resultados, setResultados] = useState<PublicMesa[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<PublicMesa | null>(null);
  const [cesionBusy, setCesionBusy] = useState(false);

  const esAdmin = user.role === "ADMIN";

  const refrescar = useCallback(async () => {
    try {
      const [siguientes, oferta] = await Promise.all([
        mesasApi.inicio(),
        mesasApi.pendiente()
      ]);
      setHuecos(siguientes);
      setPendiente(oferta);
      onMiMesa?.(siguientes.find(mesa => mesa?.hostId === user.id) ?? null);
      setError(null);
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    } finally {
      setLoading(false);
    }
  }, [onMiMesa, user.id]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  // La recepción se actualiza sola: cada aviso del servidor dispara un refresco.
  useMesasLive(refrescar, onSessionExpired);

  // Búsqueda con retardo para no mandar una petición por tecla.
  useEffect(() => {
    if (!buscando) return undefined;

    const timer = window.setTimeout(() => {
      mesasApi
        .list(texto.trim())
        .then(setResultados)
        .catch(searchError => setError(describeError(searchError)));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [buscando, texto]);

  async function crearSala() {
    setBusy(true);
    setError(null);
    try {
      await mesasApi.crear();
      setBuscando(false);
      await refrescar();
    } catch (crearError) {
      setError(describeError(crearError));
      setBusy(false);
    }
  }

  async function unirse(mesa: PublicMesa) {
    setBusy(true);
    setError(null);
    try {
      await mesasApi.unirse(mesa.id);
      await refrescar();
      if (buscando) setResultados(await mesasApi.list(texto.trim()));
    } catch (unirseError) {
      setError(describeError(unirseError));
    } finally {
      setBusy(false);
    }
  }

  async function abandonar(mesa: PublicMesa) {
    setBusy(true);
    setError(null);
    try {
      await mesasApi.abandonar(mesa.id);
      await refrescar();
      if (buscando) setResultados(await mesasApi.list(texto.trim()));
    } catch (abandonarError) {
      setError(describeError(abandonarError));
    } finally {
      setBusy(false);
    }
  }

  async function cerrar(mesa: PublicMesa) {
    const confirmado = window.confirm(
      `¿Cerrar "Mesa ${mesa.hostName}"? Los jugadores se quedarán sin mesa.`
    );
    if (!confirmado) return;

    setBusy(true);
    setError(null);
    try {
      await mesasApi.cerrar(mesa.id);
      await refrescar();
      if (buscando) setResultados(await mesasApi.list(texto.trim()));
    } catch (cerrarError) {
      setError(describeError(cerrarError));
    } finally {
      setBusy(false);
    }
  }

  async function aceptarCesion(mesa: PublicMesa) {
    setCesionBusy(true);
    setError(null);
    try {
      await mesasApi.aceptarCesion(mesa.id);
      await refrescar();
    } catch (cesionError) {
      setError(describeError(cesionError));
    } finally {
      setCesionBusy(false);
    }
  }

  async function rechazarCesion(mesa: PublicMesa) {
    setCesionBusy(true);
    setError(null);
    try {
      await mesasApi.rechazarCesion(mesa.id);
      await refrescar();
    } catch (cesionError) {
      setError(describeError(cesionError));
    } finally {
      setCesionBusy(false);
    }
  }

  function alternarBuscador() {
    setBuscando(actual => {
      const siguiente = !actual;
      if (!siguiente) setTexto("");
      return siguiente;
    });
  }

  const cartas = buscando ? resultados : huecos;

  return (
    <section className="card recepcion">
      <div className="recepcion-acciones">
        <button type="button" className="primary morado" onClick={alternarBuscador}>
          {buscando ? "Cerrar búsqueda" : "Buscar"}
        </button>
        <button type="button" className="primary morado" onClick={crearSala} disabled={busy}>
          {busy ? "Creando…" : "Crear sala"}
        </button>
      </div>

      {error && <p className="feedback ko">{error}</p>}

      {buscando && (
        <div className="buscador">
          <label htmlFor="buscar-anfitrion">Buscar por nombre del anfitrión</label>
          <input
            id="buscar-anfitrion"
            type="search"
            value={texto}
            placeholder="Ej.: javi"
            onChange={event => setTexto(event.target.value)}
            autoFocus
          />
        </div>
      )}

      {loading ? (
        <p className="muted">Cargando recepción…</p>
      ) : (
        <>
          {buscando && resultados.length === 0 && (
            <p className="muted">
              {texto.trim() ? "Ninguna mesa coincide con esa búsqueda." : "Todavía no hay mesas."}
            </p>
          )}

          {buscando ? (
            <div className="recepcion-lista">
              {cartas.map((mesa, indice) => (
                <MesaCard
                  key={mesa ? mesa.id : `vacio-${indice}`}
                  mesa={mesa}
                  currentUserId={user.id}
                  esAdmin={esAdmin}
                  onJoin={unirse}
                  onClose={cerrar}
                  onAbandon={abandonar}
                  onGestionar={onGestionar}
                  busy={busy}
                />
              ))}
            </div>
          ) : (
            <div className="recepcion-escena">
              <Dados />
              <div className="recepcion-cuadricula">
                {cartas.map((mesa, indice) => (
                  <MesaCard
                    key={mesa ? mesa.id : `vacio-${indice}`}
                    mesa={mesa}
                    currentUserId={user.id}
                    esAdmin={esAdmin}
                    onJoin={unirse}
                    onClose={cerrar}
                    onAbandon={abandonar}
                    onGestionar={onGestionar}
                    busy={busy}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {pendiente && pendiente.pendingHostId === user.id && (
        <div className="cesion-popup" role="alertdialog" aria-live="assertive">
          <p>
            <strong>Te ofrecen el mando de “Mesa {pendiente.hostName}”.</strong> ¿Aceptas
            ser el nuevo anfitrión?
          </p>
          <div className="cesion-popup-acciones">
            <button
              type="button"
              className="primary amarillo"
              disabled={cesionBusy}
              onClick={() => void aceptarCesion(pendiente)}
            >
              Aceptar
            </button>
            <button
              type="button"
              className="ghost"
              disabled={cesionBusy}
              onClick={() => void rechazarCesion(pendiente)}
            >
              Rechazar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
