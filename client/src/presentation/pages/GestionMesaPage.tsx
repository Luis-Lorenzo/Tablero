import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Check, Crown, DoorOpen, Lock, LogOut, Palette, Pencil, Play, Trash2, Upload, User, UserX, Volume2, VolumeX, Wrench } from "lucide-react";
import { archivosApi } from "../../api/archivos.api";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { RecorteRetratoModal } from "../../preview/RecorteRetratoModal";
import { describeError } from "../errorMessages";
import { useMesasLive } from "../hooks/useMesasLive";
import { PALETA_JUGADOR } from "../paleta";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface GestionMesaPageProps {
  mesaId: string;
  user: PublicUser;
  onVolver: () => void;
  onAbrirSala?: (mesa: PublicMesa) => void;
  onSessionExpired?: () => void;
  hogueraSilenciada?: boolean;
  onAlternarHoguera?: () => void;
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
  onSessionExpired,
  hogueraSilenciada = false,
  onAlternarHoguera
}: GestionMesaPageProps) {
  const [mesa, setMesa] = useState<PublicMesa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [apodoInput, setApodoInput] = useState("");
  const [contrasenaEditada, setContrasenaEditada] = useState<string | null>(null);
  const [expulsarObjetivo, setExpulsarObjetivo] = useState<{ id: string; nombre: string } | null>(null);
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [archivoParaRecortar, setArchivoParaRecortar] = useState<File | null>(null);
  const selectorRetratoRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setApodoInput(mesa?.playerApodos?.[user.id] ?? "");
  }, [mesa?.id, mesa?.playerApodos, user.id]);

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

  async function confirmarExpulsar() {
    if (!mesa || !expulsarObjetivo) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await mesasApi.expulsar(mesa.id, expulsarObjetivo.id);
      setExpulsarObjetivo(null);
      await refrescar();
    } catch (expulsarError) {
      setError(describeError(expulsarError));
    } finally {
      setBusy(false);
    }
  }

  async function abandonarMesa() {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    try {
      await mesasApi.abandonar(mesa.id);
      onVolver();
    } catch (abandonarError) {
      setError(describeError(abandonarError));
      setBusy(false);
    }
  }

  async function confirmarCerrarMesa() {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    try {
      await mesasApi.cerrar(mesa.id);
      setConfirmCerrar(false);
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
      setPaletaAbierta(false);
    } catch (colorError) {
      setError(describeError(colorError));
    } finally {
      setBusy(false);
    }
  }

  async function guardarApodo(evento: FormEvent) {
    evento.preventDefault();
    if (!mesa) return;
    const limpio = apodoInput.trim().slice(0, 24);
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const actualizada = await mesasApi.cambiarApodo(mesa.id, limpio);
      setMesa(actualizada);
      setAviso(limpio ? "Nickname guardado para la partida." : "Nickname eliminado.");
    } catch (apodoError) {
      setError(describeError(apodoError));
    } finally {
      setBusy(false);
    }
  }

  async function quitarApodo() {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const actualizada = await mesasApi.cambiarApodo(mesa.id, "");
      setMesa(actualizada);
      setApodoInput("");
      setAviso("Nickname eliminado.");
    } catch (apodoError) {
      setError(describeError(apodoError));
    } finally {
      setBusy(false);
    }
  }

  function alElegirRetrato(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    setArchivoParaRecortar(archivo);
  }

  async function alConfirmarRecorteRetrato(archivoRecortado: File) {
    if (!mesa) return;
    setArchivoParaRecortar(null);
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const subido = await archivosApi.subir(archivoRecortado, mesa.id);
      await mesasApi.actualizarPersonaje(mesa.id, { retratoArchivoId: subido.id });
      setMesa(prev =>
        prev
          ? {
              ...prev,
              retratosPorJugador: {
                ...(prev.retratosPorJugador ?? {}),
                [user.id]: subido.id
              }
            }
          : prev
      );
      setAviso("Retrato de personaje actualizado.");
    } catch (retratoError) {
      setError(describeError(retratoError));
    } finally {
      setBusy(false);
    }
  }

  async function quitarRetrato() {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await mesasApi.actualizarPersonaje(mesa.id, { retratoArchivoId: null });
      setMesa(prev =>
        prev
          ? {
              ...prev,
              retratosPorJugador: {
                ...(prev.retratosPorJugador ?? {}),
                [user.id]: null
              }
            }
          : prev
      );
      setAviso("Retrato de personaje eliminado.");
    } catch (retratoError) {
      setError(describeError(retratoError));
    } finally {
      setBusy(false);
    }
  }

  function entrarEnSala() {
    if (mesa && onAbrirSala) onAbrirSala(mesa);
  }

  async function guardarContrasena(evento: FormEvent) {
    evento.preventDefault();
    if (!mesa) return;
    const limpia = (contrasenaEditada ?? mesa.contrasena ?? "").trim().slice(0, 64);
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const actualizada = await mesasApi.cambiarContrasena(mesa.id, limpia || null);
      setMesa(actualizada);
      setContrasenaEditada(null);
      setAviso(limpia ? "Contraseña de la sala guardada." : "Contraseña eliminada (sala abierta).");
    } catch (passError) {
      setError(describeError(passError));
    } finally {
      setBusy(false);
    }
  }

  async function quitarContrasena() {
    if (!mesa) return;
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const actualizada = await mesasApi.cambiarContrasena(mesa.id, null);
      setMesa(actualizada);
      setContrasenaEditada(null);
      setAviso("Contraseña eliminada (sala abierta).");
    } catch (passError) {
      setError(describeError(passError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="card loading-card">
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
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Volver a la recepción</span>
        </button>
      </section>
    );
  }

  const total = mesa.players.length;
  const color = colorPorJugadores(total);
  const miColor = mesa.colores?.[user.id] ?? null;
  const soyJugadorEnMesa = mesa.players.some(jugador => jugador.id === user.id);
  const miApodo = mesa.playerApodos?.[user.id]?.trim() ?? "";
  const miRetratoId = mesa.retratosPorJugador?.[user.id] ?? null;

  return (
    <section className="card gestion">
      <div className="gestion-cabecera">
        <button type="button" className="ghost small" onClick={onVolver}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver</span>
        </button>
        <h2>Mesa {mesa.hostName}</h2>
        <span className={mesa.estado === "EN_CURSO" ? "pill on" : "pill pending"}>
          {mesa.estado === "EN_CURSO" ? "En curso" : "En espera"}
        </span>
        {onAlternarHoguera && (
          <button
            type="button"
            className={`topbar-tema-btn${hogueraSilenciada ? " silenciada" : ""}`}
            onClick={onAlternarHoguera}
            title={
              hogueraSilenciada
                ? "Sonido de hoguera apagado (pulsa para activar)"
                : "Sonido de hoguera activo (pulsa para apagar)"
            }
            aria-label={
              hogueraSilenciada
                ? "Activar sonido de hoguera"
                : "Apagar sonido de hoguera"
            }
            aria-pressed={!hogueraSilenciada}
          >
            {hogueraSilenciada ? (
              <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
          </button>
        )}
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

      {(esAnfitrion || soyJugador) && (
        <div className="gestion-bloque">
          <h3 className="gestion-subtitulo">
            <Palette size={15} aria-hidden="true" />
            <span>Tu color de esfera</span>
          </h3>
        <div className="color-propio">
          <button
            type="button"
            className="color-cuadrado"
            style={{ background: miColor ?? "transparent" }}
            onClick={() => setPaletaAbierta(prev => !prev)}
            disabled={busy}
            aria-label="Elegir color"
            aria-expanded={paletaAbierta}
            title="Elegir color"
          />
          <span className="muted">
            {miColor ? "Pulsa el cuadrado para cambiar tu color." : "Elige el color de tu esfera."}
          </span>
        </div>

        {paletaAbierta && (
          <div className="paleta-colores">
            {PALETA_JUGADOR.map(opcion => {
              const activa = miColor === opcion;
              return (
                <button
                  key={opcion}
                  type="button"
                  className={`paleta-color${activa ? " activa" : ""}`}
                  style={{ background: opcion }}
                  onClick={() => void elegirColor(opcion)}
                  disabled={busy}
                  aria-label={`Color ${opcion}`}
                  title={opcion}
                >
                  {activa && <Check size={12} className="paleta-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
        </div>
      )}

      {soyJugadorEnMesa && (
        <div className="gestion-bloque">
          <h3 className="gestion-subtitulo">
            <Pencil size={15} aria-hidden="true" />
            <span>Tu nickname en esta partida</span>
          </h3>
          <form className="apodo-propio-form" onSubmit={evento => void guardarApodo(evento)}>
            <input
              type="text"
              className="apodo-propio-input"
              maxLength={24}
              value={apodoInput}
              onChange={e => setApodoInput(e.target.value)}
              placeholder="Nombre de personaje (opcional)…"
              aria-label="Nickname para esta partida"
              disabled={busy}
            />
            <button
              type="submit"
              className="ghost small"
              disabled={busy || apodoInput.trim().slice(0, 24) === miApodo}
            >
              Guardar
            </button>
            {miApodo && (
              <button
                type="button"
                className="ghost small"
                onClick={() => void quitarApodo()}
                disabled={busy}
              >
                Quitar
              </button>
            )}
          </form>
        </div>
      )}

      {soyJugadorEnMesa && (
        <div className="gestion-bloque">
          <h3 className="gestion-subtitulo">
            <User size={15} aria-hidden="true" />
            <span>Tu retrato de personaje (PJ)</span>
          </h3>
          <input
            ref={selectorRetratoRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            style={{ display: "none" }}
            onChange={alElegirRetrato}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                background: miColor ?? "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                flexShrink: 0
              }}
            >
              {miRetratoId ? (
                <img
                  src={archivosApi.url(miRetratoId)}
                  alt="Tu retrato de personaje"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <User size={22} aria-hidden="true" />
              )}
            </div>
            <button
              type="button"
              className="ghost small"
              onClick={() => selectorRetratoRef.current?.click()}
              disabled={busy}
            >
              <Upload size={13} aria-hidden="true" />
              <span>Subir / recortar retrato</span>
            </button>
            {miRetratoId && (
              <button
                type="button"
                className="ghost small"
                onClick={() => void quitarRetrato()}
                disabled={busy}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      )}

      {gestiona && (
        <div className="gestion-bloque">
          <h3 className="gestion-subtitulo">
            <Lock size={15} aria-hidden="true" />
            <span>Contraseña de la sala (opcional)</span>
          </h3>
          <form className="apodo-propio-form" onSubmit={evento => void guardarContrasena(evento)}>
            <input
              type="text"
              className="apodo-propio-input"
              maxLength={64}
              value={contrasenaEditada ?? mesa.contrasena ?? ""}
              onChange={e => setContrasenaEditada(e.target.value)}
              placeholder="Sin contraseña (sala abierta)…"
              aria-label="Contraseña de la sala"
              autoComplete="off"
              disabled={busy}
            />
            <button
              type="submit"
              className="ghost small"
              disabled={
                busy ||
                (contrasenaEditada ?? mesa.contrasena ?? "").trim().slice(0, 64) ===
                  (mesa.contrasena ?? "")
              }
            >
              Guardar
            </button>
            {mesa.tieneContrasena && (
              <button
                type="button"
                className="ghost small"
                onClick={() => void quitarContrasena()}
                disabled={busy}
              >
                Quitar
              </button>
            )}
          </form>
          <p className="muted gestion-contrasena-nota">
            {mesa.tieneContrasena
              ? "Sala protegida: los jugadores deberán escribir esta contraseña al unirse."
              : "Sala abierta: cualquiera puede unirse sin contraseña."}
          </p>
        </div>
      )}

      <div className="gestion-bloque">
        <h3 className="gestion-subtitulo">Jugadores ({total})</h3>
        {mesa.players.length === 0 ? (
          <p className="muted">Nadie se ha unido todavía.</p>
        ) : (
          <ul className="gestion-jugadores">
            {mesa.players.map(jugador => {
              const apodoJugador = mesa.playerApodos?.[jugador.id]?.trim();
              return (
                <li key={jugador.id}>
                  <span className="jugador-nombre">
                    <span
                      className="jugador-color"
                      style={{ background: mesa.colores?.[jugador.id] ?? "transparent" }}
                      aria-hidden="true"
                    />
                    {apodoJugador ? `${apodoJugador} (${jugador.name})` : jugador.name}
                    {jugador.id === user.id && <span className="jugador-yo"> (tú)</span>}
                  </span>
                {gestiona && (
                  <span className="jugador-acciones">
                    <button
                      type="button"
                      className="ghost small"
                      disabled={busy || mesa.pendingHostId === jugador.id}
                      onClick={() => void ceder(jugador.id)}
                    >
                      <Crown size={13} aria-hidden="true" />
                      <span>
                        {mesa.pendingHostId === jugador.id
                          ? "Esperando…"
                          : "Dar rol de anfitrión"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="danger small"
                      disabled={busy}
                      onClick={() =>
                        setExpulsarObjetivo({ id: jugador.id, nombre: jugador.name })
                      }
                    >
                      <UserX size={13} aria-hidden="true" />
                      <span>Expulsar</span>
                    </button>
                  </span>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="gestion-pie">
        <div className="gestion-pie-columna">
          <div className="gestion-pie-principales">
            {mesa.estado === "ESPERA" ? (
              gestiona ? (
                <>
                  {onAbrirSala && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={entrarEnSala}
                      disabled={busy}
                      title="Entra solo tú en la sala para preparar mapas, notas o música; los jugadores siguen esperando"
                    >
                      <Wrench size={15} aria-hidden="true" />
                      <span>Preparar sala</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary amarillo"
                    onClick={() => void iniciarPartida()}
                    disabled={busy}
                    title="Inicia la partida y mete a todos los jugadores en la sala"
                  >
                    <Play size={15} aria-hidden="true" />
                    <span>Empezar partida</span>
                  </button>
                </>
              ) : (
                <span className="pill pending">
                  Esperando a que el Máster inicie la partida…
                </span>
              )
            ) : (
              <>
                <span className="pill on gestion-estado-vivo">● Partida en curso</span>
                {onAbrirSala && (
                  <button type="button" className="primary verde" onClick={entrarEnSala}>
                    <DoorOpen size={15} aria-hidden="true" />
                    <span>Ir a la partida</span>
                  </button>
                )}
              </>
            )}
          </div>
          {gestiona && mesa.estado === "ESPERA" && (
            <p className="muted gestion-ayuda-inicio">
              <strong>Preparar sala</strong> te permite entrar solo para montar la sesión.{" "}
              <strong>Empezar partida</strong> la inicia para todos los jugadores.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {soyJugador && !esAnfitrion && (
            <button
              type="button"
              className="danger"
              onClick={() => void abandonarMesa()}
              disabled={busy}
            >
              <LogOut size={15} aria-hidden="true" />
              <span>Abandonar mesa</span>
            </button>
          )}
          {(esAnfitrion || gestiona) && (
            <button
              type="button"
              className="danger"
              onClick={() => setConfirmCerrar(true)}
              disabled={busy}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Cerrar mesa</span>
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={expulsarObjetivo !== null}
        title={expulsarObjetivo ? `¿Expulsar a ${expulsarObjetivo.nombre}?` : ""}
        description="No podrá volver a entrar en esta mesa."
        confirmLabel="Expulsar"
        busy={busy}
        onConfirm={() => void confirmarExpulsar()}
        onCancel={() => setExpulsarObjetivo(null)}
      />

      <ConfirmDialog
        open={confirmCerrar}
        title={`¿Cerrar "Mesa ${mesa.hostName}"?`}
        description="Los jugadores conectados se quedarán sin mesa."
        confirmLabel="Cerrar mesa"
        busy={busy}
        onConfirm={() => void confirmarCerrarMesa()}
        onCancel={() => setConfirmCerrar(false)}
      />

      {archivoParaRecortar && (
        <RecorteRetratoModal
          archivo={archivoParaRecortar}
          onCancelar={() => setArchivoParaRecortar(null)}
          onConfirmar={archivoRecortado => void alConfirmarRecorteRetrato(archivoRecortado)}
        />
      )}
    </section>
  );
}
