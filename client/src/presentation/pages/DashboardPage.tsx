import { useState } from "react";
import { ArrowLeft, LogOut, Save, Trash2 } from "lucide-react";
import { usersApi } from "../../api/users.api";
import type { PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface DashboardPageProps {
  user: PublicUser;
  /** El usuario ha cambiado (por ejemplo, el nombre visible). */
  onUserUpdated: (user: PublicUser) => void;
  onAccountDeleted: () => void;
  onLogout: () => void;
  onVolver?: () => void;
}

export function DashboardPage({
  user,
  onUserUpdated,
  onAccountDeleted,
  onLogout,
  onVolver
}: DashboardPageProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickOk, setNickOk] = useState<string | null>(null);
  const [nickError, setNickError] = useState<string | null>(null);

  async function confirmarEliminarCuenta() {
    setBusy(true);
    setError(null);

    try {
      await usersApi.remove(user.id);
      setConfirmDelete(false);
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
      <div className="card-header">
        <div className="card-titulo-con-volver">
          {onVolver && (
            <button type="button" className="ghost small" onClick={onVolver}>
              <ArrowLeft size={14} aria-hidden="true" />
              <span>Volver</span>
            </button>
          )}
          <h2>Mi cuenta</h2>
        </div>
        <span className={user.active ? "pill on" : "pill off"}>
          {user.active ? "Activo" : "Inactivo"}
        </span>
      </div>

      {error && <p className="feedback ko">{error}</p>}

      <dl className="details">
        <div className="detail-item">
          <dt>Nombre visible</dt>
          <dd>{user.nickname ?? "Sin nombre (se usa tu correo)"}</dd>
        </div>
        <div className="detail-item">
          <dt>Correo</dt>
          <dd>{user.email}</dd>
        </div>
        <div className="detail-item">
          <dt>Rol</dt>
          <dd>{user.role === "ADMIN" ? "Administrador" : "Usuario"}</dd>
        </div>
        <div className="detail-item">
          <dt>Creado</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </div>
      </dl>

      <form
        className="form cuenta-form"
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

        <div>
          <button type="submit" className="primary" disabled={nickBusy}>
            <Save size={15} aria-hidden="true" />
            <span>{nickBusy ? "Guardando…" : "Guardar nombre"}</span>
          </button>
        </div>
      </form>

      <div className="acciones-cuenta cuenta-pie">
        <button type="button" className="ghost" onClick={onLogout}>
          <LogOut size={15} aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>{busy ? "Eliminando…" : "Eliminar mi cuenta"}</span>
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar tu cuenta?"
        description="Esta acción es permanente y no podrás volver a iniciar sesión."
        confirmLabel="Eliminar cuenta"
        busy={busy}
        onConfirm={() => void confirmarEliminarCuenta()}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
