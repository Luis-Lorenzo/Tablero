import { useState } from "react";
import { usersApi } from "../../api/users.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";

interface DashboardPageProps {
  user: PublicUser;
  /** El usuario ha cambiado (por ejemplo, el nombre visible). */
  onUserUpdated: (user: PublicUser) => void;
  onAccountDeleted: () => void;
  onLogout: () => void;
}

export function DashboardPage({
  user,
  onUserUpdated,
  onAccountDeleted,
  onLogout
}: DashboardPageProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickOk, setNickOk] = useState<string | null>(null);
  const [nickError, setNickError] = useState<string | null>(null);

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

  async function handleSaveNickname() {
    setNickBusy(true);
    setNickOk(null);
    setNickError(null);

    try {
      const limpio = nickname.trim();
      const actualizado = await usersApi.setNickname(limpio === "" ? null : limpio);
      onUserUpdated(actualizado);
      setNickname(actualizado.nickname ?? "");
      setNickOk(
        actualizado.nickname
          ? "Nombre guardado."
          : "Nombre borrado: se usará la parte inicial de tu correo."
      );
    } catch (nicknameError) {
      setNickError(describeError(nicknameError));
    } finally {
      setNickBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Mi cuenta</h2>

      {error && <p className="feedback ko">{error}</p>}

      <dl className="details">
        <div>
          <dt>Nombre visible</dt>
          <dd>{user.nickname ?? "Sin nombre (se usa tu correo)"}</dd>
        </div>
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
          <dd>{user.active ? "Activo" : "Inactivo"}</dd>
        </div>
        <div>
          <dt>Creado</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </div>
      </dl>

      <form
        className="form"
        onSubmit={event => {
          event.preventDefault();
          void handleSaveNickname();
        }}
      >
        <label>
          Nombre visible (opcional)
          <input
            type="text"
            value={nickname}
            maxLength={20}
            placeholder="Ej.: Javi_92"
            onChange={event => {
              setNickname(event.target.value);
              setNickOk(null);
              setNickError(null);
            }}
          />
        </label>
        <p className="muted ayuda-nickname">
          De 3 a 20 caracteres. Empieza por letra, termina en letra o número y solo
          admite letras, números y guion bajo. Déjalo vacío para usar tu correo.
        </p>

        {nickError && <p className="feedback ko">{nickError}</p>}
        {nickOk && <p className="feedback ok">{nickOk}</p>}

        <button type="submit" className="primary" disabled={nickBusy}>
          {nickBusy ? "Guardando…" : "Guardar nombre"}
        </button>
      </form>

      <div className="acciones-cuenta">
        <button type="button" className="ghost" onClick={onLogout}>
          Cerrar sesión
        </button>
        <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
          {busy ? "Eliminando…" : "Eliminar mi cuenta"}
        </button>
      </div>
    </section>
  );
}