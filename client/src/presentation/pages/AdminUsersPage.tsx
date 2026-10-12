import { useCallback, useEffect, useState } from "react";
import { usersApi } from "../../api/users.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";

interface AdminUsersPageProps {
  currentUser: PublicUser;
  onSelfDeleted: () => void;
}

export function AdminUsersPage({
  currentUser,
  onSelfDeleted
}: AdminUsersPageProps) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [activity, setActivity] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function checkActive(id: string) {
    try {
      const result = await usersApi.isActive(id);
      setActivity(current => ({ ...current, [id]: result.active }));
    } catch (checkError) {
      setError(describeError(checkError));
    }
  }

  async function remove(user: PublicUser) {
    const confirmed = window.confirm(
      user.id === currentUser.id
        ? "¿Eliminar tu propia cuenta de administrador?"
        : `¿Eliminar la cuenta ${user.email}?`
    );
    if (!confirmed) return;

    try {
      await usersApi.remove(user.id);

      if (user.id === currentUser.id) {
        onSelfDeleted();
        return;
      }

      setUsers(current => current.filter(item => item.id !== user.id));
    } catch (deleteError) {
      setError(describeError(deleteError));
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>Usuarios</h2>
        <button type="button" className="ghost" onClick={load} disabled={loading}>
          Actualizar
        </button>
      </div>

      {error && <p className="feedback ko">{error}</p>}
      {loading && <p className="muted">Cargando usuarios…</p>}

      {!loading && users.length === 0 && (
        <p className="muted">No hay usuarios registrados.</p>
      )}

      {!loading && users.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Activo</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.role === "ADMIN" ? "Administrador" : "Usuario"}</td>
                  <td>{user.active ? "Confirmado" : "Pendiente"}</td>
                  <td>
                    {activity[user.id] === undefined ? (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => checkActive(user.id)}
                      >
                        Comprobar
                      </button>
                    ) : (
                      <span className={activity[user.id] ? "pill on" : "pill off"}>
                        {activity[user.id] ? "Sí" : "No"}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger small"
                      onClick={() => remove(user)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
