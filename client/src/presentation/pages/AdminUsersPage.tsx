import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, Trash2, X } from "lucide-react";
import { usersApi } from "../../api/users.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface AdminUsersPageProps {
  currentUser: PublicUser;
  onSelfDeleted: () => void;
  onVolver?: () => void;
}

type FiltroEstado = "TODOS" | "ACTIVE" | "PENDING" | "BLOCKED" | "REJECTED";

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
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("TODOS");
  const [objetivoEliminar, setObjetivoEliminar] = useState<PublicUser | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setUsers(await usersApi.list());
    } catch (loadError) {
      setError(describeError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

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
          <h2>Usuarios</h2>
          {!loading && <span className="badge">{users.length}</span>}
        </div>
        <button type="button" className="ghost small" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "icono-girando" : ""} aria-hidden="true" />
          <span>Actualizar</span>
        </button>
      </div>

      {error && <p className="feedback ko">{error}</p>}

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
    </section>
  );
}
