import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Crown, Lock, Plus, Search, X } from "lucide-react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { MesaCard } from "../components/MesaCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  const [mesaACerrar, setMesaACerrar] = useState<PublicMesa | null>(null);
  const [mesaConContrasena, setMesaConContrasena] = useState<PublicMesa | null>(null);
  const [contrasenaIngreso, setContrasenaIngreso] = useState("");
  const [errorContrasena, setErrorContrasena] = useState<string | null>(null);

  const esAdmin = user.role === "ADMIN";
  const yaTengoMesa = huecos.some(mesa => mesa?.hostId === user.id);

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

  useEffect(() => {
    if (!mesaConContrasena) return undefined;
    function alPulsarTecla(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setMesaConContrasena(null);
        setContrasenaIngreso("");
        setErrorContrasena(null);
      }
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [mesaConContrasena, busy]);

  async function crearSala() {
    setBusy(true);
    setError(null);
    try {
      await mesasApi.crear();
      setBuscando(false);
      await refrescar();
    } catch (crearError) {
      setError(describeError(crearError));
    } finally {
      setBusy(false);
    }
  }

  async function unirse(mesa: PublicMesa) {
    if (mesa.tieneContrasena) {
      setError(null);
      setMesaConContrasena(mesa);
      setContrasenaIngreso("");
      setErrorContrasena(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mesasApi.unirse(mesa.id);
      await refrescar();
      if (buscando) setResultados(await mesasApi.list(texto.trim()));
    } catch (unirseError) {
      const code =
        unirseError && typeof unirseError === "object" && "code" in unirseError
          ? String((unirseError as { code: unknown }).code)
          : "";
      if (code === "MESA_PASSWORD_REQUIRED" || code === "MESA_PASSWORD_INVALID") {
        setMesaConContrasena(mesa);
        setContrasenaIngreso("");
        setErrorContrasena(null);
      } else {
        setError(describeError(unirseError));
      }
    } finally {
      setBusy(false);
    }
  }

  async function enviarContrasenaIngreso(evento: FormEvent) {
    evento.preventDefault();
    if (!mesaConContrasena || busy) return;
    const limpia = contrasenaIngreso.trim();
    if (!limpia) {
      setErrorContrasena("Introduce la contraseña de la sala.");
      return;
    }
    setBusy(true);
    setErrorContrasena(null);
    setError(null);
    try {
      await mesasApi.unirse(mesaConContrasena.id, limpia);
      setMesaConContrasena(null);
      setContrasenaIngreso("");
      await refrescar();
      if (buscando) setResultados(await mesasApi.list(texto.trim()));
    } catch (passError) {
      setErrorContrasena(describeError(passError));
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

  async function confirmarCerrar() {
    if (!mesaACerrar) return;
    setBusy(true);
    setError(null);
    try {
      await mesasApi.cerrar(mesaACerrar.id);
      setMesaACerrar(null);
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
        <button
          type="button"
          className={buscando ? "ghost" : "primary morado"}
          onClick={alternarBuscador}
        >
          {buscando ? (
            <>
              <X size={16} aria-hidden="true" />
              <span>Cerrar búsqueda</span>
            </>
          ) : (
            <>
              <Search size={16} aria-hidden="true" />
              <span>Buscar mesas</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="primary morado"
          onClick={crearSala}
          disabled={busy || yaTengoMesa}
          title={yaTengoMesa ? "Ya eres anfitrión de una mesa activa" : "Crear una nueva sala"}
        >
          <Plus size={16} aria-hidden="true" />
          <span>{busy ? "Creando…" : yaTengoMesa ? "Ya tienes mesa" : "Crear sala"}</span>
        </button>
      </div>

      {error && <p className="feedback ko">{error}</p>}

      {buscando && (
        <div className="buscador">
          <label htmlFor="buscar-anfitrion">Buscar por nombre del anfitrión</label>
          <div className="input-con-icono">
            <Search size={16} className="input-icono" aria-hidden="true" />
            <input
              id="buscar-anfitrion"
              type="search"
              value={texto}
              placeholder="Ej.: javi"
              onChange={event => setTexto(event.target.value)}
              autoFocus
            />
            {texto && (
              <button
                type="button"
                className="input-limpiar"
                onClick={() => setTexto("")}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted estado-vacio">Cargando recepción…</p>
      ) : (
        <>
          {buscando && resultados.length === 0 && (
            <p className="muted estado-vacio">
              {texto.trim() ? "Ninguna mesa coincide con esa búsqueda." : "Todavía no hay mesas."}
            </p>
          )}

          <div className={buscando ? "recepcion-lista" : "recepcion-cuadricula"}>
            {cartas.map((mesa, indice) => (
              <MesaCard
                key={mesa ? mesa.id : `vacio-${indice}`}
                mesa={mesa}
                currentUserId={user.id}
                esAdmin={esAdmin}
                onJoin={unirse}
                onClose={setMesaACerrar}
                onAbandon={abandonar}
                onGestionar={onGestionar}
                busy={busy}
              />
            ))}
          </div>
        </>
      )}

      {pendiente && pendiente.pendingHostId === user.id && (
        <div className="cesion-popup" role="alertdialog" aria-live="assertive">
          <div className="cesion-popup-cabecera">
            <Crown size={18} className="cesion-icono" aria-hidden="true" />
            <strong>Oferta de anfitrión</strong>
          </div>
          <p>
            Te ofrecen el mando de <strong>“Mesa {pendiente.hostName}”</strong>. ¿Aceptas
            ser el nuevo anfitrión?
          </p>
          <div className="cesion-popup-acciones">
            <button
              type="button"
              className="primary amarillo small"
              disabled={cesionBusy}
              onClick={() => void aceptarCesion(pendiente)}
            >
              <Check size={14} aria-hidden="true" />
              <span>Aceptar</span>
            </button>
            <button
              type="button"
              className="ghost small"
              disabled={cesionBusy}
              onClick={() => void rechazarCesion(pendiente)}
            >
              <X size={14} aria-hidden="true" />
              <span>Rechazar</span>
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={mesaACerrar !== null}
        title={mesaACerrar ? `¿Cerrar "Mesa ${mesaACerrar.hostName}"?` : ""}
        description="Los jugadores conectados se quedarán sin mesa y la sala desaparecerá."
        confirmLabel="Cerrar mesa"
        busy={busy}
        onConfirm={() => void confirmarCerrar()}
        onCancel={() => setMesaACerrar(null)}
      />

      {mesaConContrasena && (
        <div
          className="modal-fondo"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-dialog-title"
          onClick={() => {
            if (!busy) {
              setMesaConContrasena(null);
              setContrasenaIngreso("");
              setErrorContrasena(null);
            }
          }}
        >
          <div className="modal-caja" onClick={event => event.stopPropagation()}>
            <div className="modal-cabecera">
              <div className="modal-titulo-wrap">
                <span className="modal-icono aviso" aria-hidden="true">
                  <Lock size={18} />
                </span>
                <h3 id="password-dialog-title">Contraseña</h3>
              </div>
              <button
                type="button"
                className="modal-cerrar"
                onClick={() => {
                  if (busy) return;
                  setMesaConContrasena(null);
                  setContrasenaIngreso("");
                  setErrorContrasena(null);
                }}
                disabled={busy}
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <p className="modal-descripcion">
              Introduce la contraseña para unirte a <strong>“Mesa {mesaConContrasena.hostName}”</strong>.
            </p>

            <form
              className="modal-password-form"
              onSubmit={evento => void enviarContrasenaIngreso(evento)}
            >
              <input
                type="text"
                className="modal-password-input"
                value={contrasenaIngreso}
                onChange={event => {
                  setContrasenaIngreso(event.target.value);
                  if (errorContrasena) setErrorContrasena(null);
                }}
                placeholder="Contraseña…"
                aria-label="Contraseña de la sala"
                autoComplete="off"
                maxLength={64}
                disabled={busy}
                autoFocus
              />

              {errorContrasena && (
                <p className="feedback ko modal-password-error">{errorContrasena}</p>
              )}

              <div className="modal-acciones">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setMesaConContrasena(null);
                    setContrasenaIngreso("");
                    setErrorContrasena(null);
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary morado"
                  disabled={busy || !contrasenaIngreso.trim()}
                >
                  {busy ? "Entrando…" : "Enviar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
