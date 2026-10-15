import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { authApi } from "./api/auth.api";
import type { PublicMesa, PublicUser } from "./api/types";
import { AuthPage } from "./presentation/pages/AuthPage";
import { DashboardPage } from "./presentation/pages/DashboardPage";
import { AdminUsersPage } from "./presentation/pages/AdminUsersPage";
import { RecepcionPage } from "./presentation/pages/RecepcionPage";
import { GestionMesaPage } from "./presentation/pages/GestionMesaPage";
import { LogoPocketRol } from "./presentation/components/LogoPocketRol";
import { Dado } from "./presentation/components/Dado";
import { AccountMenu } from "./presentation/components/AccountMenu";
import { ArchivosMenu } from "./presentation/components/ArchivosMenu";

type View = "recepcion" | "cuenta" | "moderar" | "gestion";

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
  const [gestionMesaId, setGestionMesaId] = useState<string | null>(null);
  /** Mesa que aloja el usuario ahora mismo (para el botón "Listar mesa"). */
  const [miMesa, setMiMesa] = useState<PublicMesa | null>(null);

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

  const abrirGestion = useCallback((mesa: PublicMesa) => {
    setGestionMesaId(mesa.id);
    setView("gestion");
  }, []);

  const handleMiMesa = useCallback((mesa: PublicMesa | null) => {
    setMiMesa(mesa);
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
          <div className="titulo-con-dados">
            <Dado cara={5} clase="dado-izquierda" />
            <LogoPocketRol onClick={() => setView("recepcion")} />
            <Dado cara={2} clase="dado-derecha" />
          </div>

          {(esAdmin || miMesa) && (
            <div className="topbar-acciones">
              {esAdmin && miMesa && (
                <button
                  type="button"
                  className="primary verde small listar-mesa"
                  onClick={() => abrirGestion(miMesa)}
                >
                  Listar mesa
                </button>
              )}

              {esAdmin && (
                <button
                  type="button"
                  className={view === "moderar" ? "tab moderar activa" : "tab moderar"}
                  onClick={() => setView("moderar")}
                >
                  Moderar
                </button>
              )}
            </div>
          )}
        </header>

        <AccountMenu
          label={nombreDeUsuario(user)}
          onOpenAccount={() => setView("cuenta")}
          onLogout={handleLogout}
        />

        <ArchivosMenu />

        {view === "gestion" && gestionMesaId ? (
          <GestionMesaPage
            mesaId={gestionMesaId}
            user={user}
            onVolver={() => setView("recepcion")}
            onSessionExpired={handleLogout}
          />
        ) : view === "moderar" && esAdmin ? (
          <AdminUsersPage currentUser={user} onSelfDeleted={handleLogout} />
        ) : view === "cuenta" ? (
          <DashboardPage
            user={user}
            onUserUpdated={setUser}
            onAccountDeleted={handleLogout}
            onLogout={handleLogout}
          />
        ) : (
          <RecepcionPage
            user={user}
            onGestionar={abrirGestion}
            onMiMesa={handleMiMesa}
            onSessionExpired={handleLogout}
          />
        )}
      </div>
    </main>
  );
}

export default App;
