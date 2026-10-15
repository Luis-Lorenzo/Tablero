import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { authApi } from "./api/auth.api";
import type { PublicUser } from "./api/types";
import { AuthPage } from "./presentation/pages/AuthPage";
import { DashboardPage } from "./presentation/pages/DashboardPage";
import { AdminUsersPage } from "./presentation/pages/AdminUsersPage";
import { RecepcionPage } from "./presentation/pages/RecepcionPage";
import { LogoPocketRol } from "./presentation/components/LogoPocketRol";

type View = "recepcion" | "cuenta" | "moderar";

function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("recepcion");

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleAuthenticated = useCallback((nextUser: PublicUser) => {
    setUser(nextUser);
    setView("recepcion");
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignoramos el error: la sesión local se descarta igualmente.
    }
    setUser(null);
    setView("recepcion");
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
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  const esAdmin = user.role === "ADMIN";

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div className="topbar-zona" />

          <LogoPocketRol onClick={() => setView("recepcion")} />

          <div className="topbar-zona acciones">
            {esAdmin && (
              <button
                type="button"
                className={view === "moderar" ? "tab moderar activa" : "tab moderar"}
                onClick={() => setView("moderar")}
              >
                Moderar
              </button>
            )}

            <button
              type="button"
              className={view === "cuenta" ? "perfil activa" : "perfil"}
              onClick={() => setView("cuenta")}
              aria-label="Mi cuenta"
              title="Mi cuenta"
            />
          </div>
        </header>

        {view === "moderar" && esAdmin ? (
          <AdminUsersPage currentUser={user} onSelfDeleted={handleLogout} />
        ) : view === "cuenta" ? (
          <DashboardPage
            user={user}
            onAccountDeleted={handleLogout}
            onLogout={handleLogout}
          />
        ) : (
          <RecepcionPage user={user} onSessionExpired={handleLogout} />
        )}
      </div>
    </main>
  );
}

export default App;
