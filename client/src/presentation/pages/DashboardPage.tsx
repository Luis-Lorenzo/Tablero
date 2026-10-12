import { useState } from "react";
import { usersApi } from "../../api/users.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";

interface DashboardPageProps {
  user: PublicUser;
  onAccountDeleted: () => void;
}

export function DashboardPage({ user, onAccountDeleted }: DashboardPageProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar tu cuenta? No podrás volver a iniciar sesión."
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);

    try {
      await usersApi.remove(user.id);
      onAccountDeleted();
    } catch (deleteError) {
      setError(describeError(deleteError));
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Mi cuenta</h2>

      {error && <p className="feedback ko">{error}</p>}

      <dl className="details">
        <div>
          <dt>Correo</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Rol</dt>
          <dd>{user.role === "ADMIN" ? "Administrador" : "Usuario"}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{user.active ? "Activo" : "Pendiente de confirmar"}</dd>
        </div>
        <div>
          <dt>Alta</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </div>
      </dl>

      <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
        {busy ? "Eliminando…" : "Eliminar mi cuenta"}
      </button>
    </section>
  );
}
