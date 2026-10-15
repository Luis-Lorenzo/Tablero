import { useCallback, useEffect, useState } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { MesaCard } from "../components/MesaCard";

interface RecepcionPageProps {
  user: PublicUser;
}

/**
 * La sala a la que se llega tras iniciar sesión. Muestra una cuadrícula fija de
 * 4 huecos: los que nadie ha creado aparecen como "Mesa Vacía" y las mesas se
 * colocan pegadas al final para que la más reciente quede abajo a la derecha.
 */
export function RecepcionPage({ user }: RecepcionPageProps) {
  const [huecos, setHuecos] = useState<Array<PublicMesa | null>>([]);
  const [resultados, setResultados] = useState<PublicMesa[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      setHuecos(await mesasApi.inicio());
      setError(null);
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

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

          <div className={buscando ? "recepcion-lista" : "recepcion-cuadricula"}>
            {cartas.map((mesa, indice) => (
              <MesaCard
                key={mesa ? mesa.id : `vacio-${indice}`}
                mesa={mesa}
                currentUserId={user.id}
                onJoin={unirse}
                onClose={cerrar}
                busy={busy}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
