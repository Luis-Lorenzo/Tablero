import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { authApi } from "./api/auth.api";
import type { PublicUser } from "./api/types";
import { Notice } from "./presentation/components/Notice";
import { AuthPage } from "./presentation/pages/AuthPage";
import { DashboardPage } from "./presentation/pages/DashboardPage";
import { AdminUsersPage } from "./presentation/pages/AdminUsersPage";

type View = "dashboard" | "admin";

function readInitialNotice(): string | null {
  const params = new URLSearchParams(window.location.search);
  const confirmed = params.get("confirmado");
  if (confirmed) {
    return `Cuenta ${confirmed} confirmada. Ya puedes iniciar sesión.`;
  }

  const error = params.get("error");
  if (error === "INVALID_TOKEN") {
    return "El enlace de confirmación no es válido o ya se utilizó.";
  }

  return null;
}

function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [notice, setNotice] = useState<string | null>(readInitialNotice);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleAuthenticated = useCallback((nextUser: PublicUser) => {
    setUser(nextUser);
    setView("dashboard");
    setNotice(null);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignoramos el error: la sesión local se descarta igualmente.
    }
    setUser(null);
    setView("dashboard");
  }, []);

  if (loading) {
    return (
      <main className="page">
        <div className="card">
          <p className="muted">Cargando…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthPage notice={notice} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div className="identity">
            <p className="eyebrow">TABLERO DE ROL</p>
            <strong>{user.email}</strong>
            <span className="badge">
              {user.role === "ADMIN" ? "Administrador" : "Usuario"}
            </span>
          </div>

          <nav className="tabs">
            <button
              type="button"
              className={view === "dashboard" ? "tab active" : "tab"}
              onClick={() => setView("dashboard")}
            >
              Mi cuenta
            </button>
            {user.role === "ADMIN" && (
              <button
                type="button"
                className={view === "admin" ? "tab active" : "tab"}
                onClick={() => setView("admin")}
              >
                Usuarios
              </button>
            )}
            <button type="button" className="tab danger" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </nav>
        </header>

        {notice && (
          <Notice message={notice} onClose={() => setNotice(null)} />
        )}

        {view === "admin" && user.role === "ADMIN" ? (
          <AdminUsersPage currentUser={user} onSelfDeleted={handleLogout} />
        ) : (
          <DashboardPage user={user} onAccountDeleted={handleLogout} />
        )}
      </div>
    </main>
  );
}

export default App;
