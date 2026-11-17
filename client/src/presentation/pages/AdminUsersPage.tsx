import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, Shield, Trash2, Users, X } from "lucide-react";
import { mesasApi } from "../../api/mesas.api";
import { usersApi } from "../../api/users.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface AdminUsersPageProps {
  currentUser: PublicUser;
  onSelfDeleted: () => void;
  onVolver?: () => void;
}

type FiltroEstado = "TODOS" | "ACTIVE" | "PENDING" | "BLOCKED" | "REJECTED";
type SeccionModerar = "usuarios" | "salas";

/**
 * Etiqueta que se muestra en la columna "Estado". Refleja el bloqueo por
 * intentos fallidos por encima del estado de aprobación.
 */
function estadoDe(user: PublicUser): { texto: string; clase: string } {
  if (user.blocked) {
    return { texto: "Bloqueado", clase: "pill blocked" };
  }

  switch (user.status) {
    case "ACTIVE":
      return { texto: "Activo", clase: "pill on" };
    case "PENDING":
      return { texto: "Pendiente", clase: "pill pending" };
    case "REJECTED":
      return { texto: "Rechazado", clase: "pill off" };
    default:
      return { texto: user.status, clase: "pill" };
  }
}

export function AdminUsersPage({
  currentUser,
  onSelfDeleted,
  onVolver
}: AdminUsersPageProps) {
  const esAdmin = currentUser.role === "ADMIN";
  const [seccion, setSeccion] = useState<SeccionModerar>("usuarios");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [mesas, setMesas] = useState<PublicMesa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaSalas, setBusquedaSalas] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("TODOS");
  const [objetivoEliminar, setObjetivoEliminar] = useState<PublicUser | null>(null);
  const [mesaAEliminar, setMesaAEliminar] = useState<PublicMesa | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [listaUsuarios, listaMesas] = await Promise.all([
        usersApi.list(),
        esAdmin ? mesasApi.list() : Promise.resolve([])
      ]);
      setUsers(listaUsuarios);
      setMesas(listaMesas);
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [esAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmarEliminar() {
    if (!objetivoEliminar) return;
    setBusyDelete(true);
    try {
      await usersApi.remove(objetivoEliminar.id);

      if (objetivoEliminar.id === currentUser.id) {
        setObjetivoEliminar(null);
        onSelfDeleted();
        return;
      }

      setUsers(current => current.filter(item => item.id !== objetivoEliminar.id));
      setObjetivoEliminar(null);
    } catch (deleteError) {
      setError(describeError(deleteError));
    } finally {
      setBusyDelete(false);
    }
  }

  async function confirmarEliminarMesa() {
    if (!mesaAEliminar || !esAdmin) return;
    setBusyDelete(true);
    setError(null);
    try {
      await mesasApi.cerrar(mesaAEliminar.id);
      setMesas(current => current.filter(item => item.id !== mesaAEliminar.id));
      setMesaAEliminar(null);
    } catch (deleteError) {
      setError(describeError(deleteError));
    } finally {
      setBusyDelete(false);
    }
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return users.filter(u => {
      if (q && !u.email.toLowerCase().includes(q) && !(u.nickname ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filtro === "BLOCKED") return u.blocked;
      if (filtro === "ACTIVE") return !u.blocked && u.status === "ACTIVE";
      if (filtro === "PENDING") return !u.blocked && u.status === "PENDING";
      if (filtro === "REJECTED") return !u.blocked && u.status === "REJECTED";
      return true;
    });
  }, [users, busqueda, filtro]);

  const mesasFiltradas = useMemo(() => {
    const q = busquedaSalas.trim().toLowerCase();
    if (!q) return mesas;
    return mesas.filter(
      m =>
        m.hostName.toLowerCase().includes(q) ||
        m.players.some(p => p.name.toLowerCase().includes(q))
    );
  }, [mesas, busquedaSalas]);

  return (
    <section className="card">
      <div className="card-header">
        <div className="card-titulo-con-volver">
          {onVolver && (
            <button type="button" className="ghost small" onClick={onVolver}>
              <ArrowLeft size={14} aria-hidden="true" />
              <span>Volver</span>
            </button>
          )}
          <h2>{seccion === "salas" ? "Salas activas" : "Usuarios"}</h2>
          {!loading && (
            <span className="badge">
              {seccion === "salas" ? mesas.length : users.length}
            </span>
          )}
        </div>
        <button type="button" className="ghost small" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "icono-girando" : ""} aria-hidden="true" />
          <span>Actualizar</span>
        </button>
      </div>

      {esAdmin && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={seccion === "usuarios" ? "tab active" : "tab"}
            onClick={() => setSeccion("usuarios")}
          >
            <Users size={14} aria-hidden="true" />
            <span>Usuarios ({users.length})</span>
          </button>
          <button
            type="button"
            className={seccion === "salas" ? "tab active" : "tab"}
            onClick={() => setSeccion("salas")}
          >
            <Shield size={14} aria-hidden="true" />
            <span>Salas ({mesas.length})</span>
          </button>
        </div>
      )}

      {error && <p className="feedback ko">{error}</p>}

      {seccion === "usuarios" ? (
        <>

      {!loading && users.length > 0 && (
        <div className="admin-controles">
          <div className="input-con-icono admin-buscador">
            <Search size={15} className="input-icono" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={event => setBusqueda(event.target.value)}
              placeholder="Filtrar por correo o nombre…"
              aria-label="Filtrar usuarios"
            />
            {busqueda && (
              <button
                type="button"
                className="input-limpiar"
                onClick={() => setBusqueda("")}
                aria-label="Limpiar filtro"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="tabs">
            {(
              [
                ["TODOS", "Todos"],
                ["ACTIVE", "Activos"],
                ["PENDING", "Pendientes"],
                ["BLOCKED", "Bloqueados"],
                ["REJECTED", "Rechazados"]
              ] as Array<[FiltroEstado, string]>
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={filtro === valor ? "tab active" : "tab"}
                onClick={() => setFiltro(valor)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="muted estado-vacio">Cargando usuarios…</p>}

      {!loading && users.length === 0 && (
        <p className="muted estado-vacio">No hay usuarios registrados.</p>
      )}

      {!loading && users.length > 0 && filtrados.length === 0 && (
        <p className="muted estado-vacio">Ningún usuario coincide con el filtro actual.</p>
      )}

      {!loading && filtrados.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(user => {
                const estado = estadoDe(user);

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-usuario-celda">
                        <span>{user.email}</span>
                        {user.nickname && <span className="muted admin-nick">@{user.nickname}</span>}
                      </div>
                    </td>
                    <td>{user.role === "ADMIN" ? "Administrador" : "Usuario"}</td>
                    <td>
                      <span className={estado.clase}>{estado.texto}</span>
                    </td>
                    <td className="admin-celda-accion">
                      <button
                        type="button"
                        className="danger small"
                        onClick={() => setObjetivoEliminar(user)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        <span>Eliminar</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={objetivoEliminar !== null}
        title={
          objetivoEliminar?.id === currentUser.id
            ? "¿Eliminar tu propia cuenta de administrador?"
            : `¿Eliminar la cuenta ${objetivoEliminar?.email ?? ""}?`
        }
        description="Esta acción eliminará el usuario de forma permanente."
        confirmLabel="Eliminar"
        busy={busyDelete}
        onConfirm={() => void confirmarEliminar()}
        onCancel={() => setObjetivoEliminar(null)}
      />
        </>
      ) : (
        <>
          {!loading && mesas.length > 0 && (
            <div className="admin-controles">
              <div className="input-con-icono admin-buscador">
                <Search size={15} className="input-icono" aria-hidden="true" />
                <input
                  type="search"
                  value={busquedaSalas}
                  onChange={event => setBusquedaSalas(event.target.value)}
                  placeholder="Filtrar por anfitrión o jugador…"
                  aria-label="Filtrar salas"
                />
                {busquedaSalas && (
                  <button
                    type="button"
                    className="input-limpiar"
                    onClick={() => setBusquedaSalas("")}
                    aria-label="Limpiar filtro"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {loading && <p className="muted estado-vacio">Cargando salas…</p>}

          {!loading && mesas.length === 0 && (
            <p className="muted estado-vacio">No hay salas creadas actualmente.</p>
          )}

          {!loading && mesas.length > 0 && mesasFiltradas.length === 0 && (
            <p className="muted estado-vacio">Ninguna sala coincide con el filtro actual.</p>
          )}

          {!loading && mesasFiltradas.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sala</th>
                    <th>Jugadores</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {mesasFiltradas.map(mesa => (
                    <tr key={mesa.id}>
                      <td>
                        <div className="admin-usuario-celda">
                          <span>Mesa {mesa.hostName}</span>
                          <span className="muted admin-nick">Anfitrión: {mesa.hostName}</span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-usuario-celda">
                          <span>{mesa.players.length} / 6</span>
                          {mesa.players.length > 0 && (
                            <span className="muted admin-nick">
                              {mesa.players.map(p => p.name).join(", ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={mesa.estado === "EN_CURSO" ? "pill on" : "pill pending"}>
                          {mesa.estado === "EN_CURSO" ? "● Partida en curso" : "En espera"}
                        </span>
                      </td>
                      <td className="admin-celda-accion">
                        <button
                          type="button"
                          className="danger small"
                          onClick={() => setMesaAEliminar(mesa)}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          <span>Eliminar sala</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ConfirmDialog
            open={mesaAEliminar !== null}
            title={`¿Eliminar la sala "Mesa ${mesaAEliminar?.hostName ?? ""}"?`}
            description="Se cerrará la mesa para todos los jugadores y se borrarán sus archivos asociados."
            confirmLabel="Eliminar sala"
            busy={busyDelete}
            onConfirm={() => void confirmarEliminarMesa()}
            onCancel={() => setMesaAEliminar(null)}
          />
        </>
      )}
    </section>
  );
}
