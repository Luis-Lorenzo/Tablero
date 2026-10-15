import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { authApi } from "./api/auth.api";
import type { PublicUser } from "./api/types";
import { AuthPage } from "./presentation/pages/AuthPage";
import { DashboardPage } from "./presentation/pages/DashboardPage";
import { AdminUsersPage } from "./presentation/pages/AdminUsersPage";
import { RecepcionPage } from "./presentation/pages/RecepcionPage";
import { LogoPocketRol } from "./presentation/components/LogoPocketRol";
import { AccountMenu } from "./presentation/components/AccountMenu";

type View = "recepcion" | "cuenta" | "moderar";

/** Nombre con el que se muestra al usuario: su nickname o la parte del correo. */
function nombreDeUsuario(user: PublicUser): string {
  const nickname = user.nickname?.trim();
  if (nickname) return nickname;
  const corte = user.email.indexOf("@");
  return corte === -1 ? user.email : user.email.slice(0, corte);
}

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

            <AccountMenu
              label={nombreDeUsuario(user)}
              onOpenAccount={() => setView("cuenta")}
              onLogout={handleLogout}
            />
          </div>
        </header>

        {view === "moderar" && esAdmin ? (
          <AdminUsersPage currentUser={user} onSelfDeleted={handleLogout} />
        ) : view === "cuenta" ? (
          <DashboardPage
            user={user}
            onUserUpdated={setUser}
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
