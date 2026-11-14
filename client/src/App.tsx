import { useCallback, useEffect, useState } from "react";
import { ListChecks, ShieldAlert } from "lucide-react";
import "./App.css";
import { authApi } from "./api/auth.api";
import { mesasApi } from "./api/mesas.api";
import type { PublicMesa, PublicUser } from "./api/types";
import { AuthPage } from "./presentation/pages/AuthPage";
import { DashboardPage } from "./presentation/pages/DashboardPage";
import { AdminUsersPage } from "./presentation/pages/AdminUsersPage";
import { RecepcionPage } from "./presentation/pages/RecepcionPage";
import { GestionMesaPage } from "./presentation/pages/GestionMesaPage";
import { SalaReal } from "./presentation/pages/SalaReal";
import { LogoPocketRol } from "./presentation/components/LogoPocketRol";
import { AccountMenu } from "./presentation/components/AccountMenu";
import { ArchivosMenu } from "./presentation/components/ArchivosMenu";
import { PanelIzquierdo } from "./presentation/components/PanelIzquierdo";
import { PanelDerecho } from "./presentation/components/PanelDerecho";
import { useMesasLive } from "./presentation/hooks/useMesasLive";

type View = "recepcion" | "cuenta" | "moderar" | "gestion" | "sala";

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
  /** Mesa abierta en la sala real (la partida empezada). */
  const [salaMesa, setSalaMesa] = useState<PublicMesa | null>(null);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const refrescarMiSala = useCallback(async () => {
    if (!user) return;
    try {
      const mesa = await mesasApi.mia();
      if (mesa && mesa.estado === "EN_CURSO") {
        setSalaMesa(mesa);
        setView("sala");
        setMiMesa(mesa);
        return;
      }

      const pendiente = await mesasApi.pendiente();
      const candidatos = [mesa, pendiente].filter(Boolean) as PublicMesa[];
      for (const candidata of candidatos) {
        if (candidata.estado === "EN_CURSO") {
          setSalaMesa(candidata);
          setView("sala");
          break;
        }
      }
    } catch {
      // Ignorar: la vista de recepción seguirá funcionando.
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refrescarMiSala();
  }, [user, refrescarMiSala]);

  useMesasLive(refrescarMiSala);

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
    setSalaMesa(null);
    setMiMesa(null);
  }, []);

  const abrirGestion = useCallback((mesa: PublicMesa) => {
    setGestionMesaId(mesa.id);
    setView("gestion");
  }, []);

  const abrirSala = useCallback((mesa: PublicMesa) => {
    setSalaMesa(mesa);
    setView("sala");
  }, []);

  const volverRecpcion = useCallback(() => {
    setView("recepcion");
    void refrescarMiSala();
  }, [refrescarMiSala]);

  const handleMiMesa = useCallback((mesa: PublicMesa | null) => {
    setMiMesa(mesa);
    if (mesa?.estado === "EN_CURSO") {
      setSalaMesa(mesa);
      setView("sala");
    }
  }, []);

  if (loading) {
    return (
      <main className="page">
        <div className="card loading-card">
          <p className="muted">Cargando PocketRol…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  const esAdmin = user.role === "ADMIN";
  const ocultarMenusSuperiores = view === "sala" || view === "gestion";

  if (ocultarMenusSuperiores) {
    return (
      <main className="page">
        <div className="shell">
          {view === "sala" && salaMesa ? (
            <SalaReal
              mesa={salaMesa}
              user={user}
              onActualizarMesa={setSalaMesa}
              onVolver={volverRecpcion}
              onSessionExpired={handleLogout}
            />
          ) : view === "gestion" && gestionMesaId ? (
            <GestionMesaPage
              mesaId={gestionMesaId}
              user={user}
              onVolver={() => setView("recepcion")}
              onAbrirSala={abrirSala}
              onSessionExpired={handleLogout}
            />
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="workspace-contenedor">
        <header className="topbar-nav">
          <div className="topbar-izq">
            <ArchivosMenu />
          </div>

          <div className="topbar-logo-movil">
            <LogoPocketRol variante="banner" onClick={() => setView("recepcion")} />
          </div>

          <div className="topbar-der">
            {esAdmin && miMesa && (
              <button
                type="button"
                className="primary verde small listar-mesa"
                onClick={() => abrirGestion(miMesa)}
              >
                <ListChecks size={14} aria-hidden="true" />
                <span>Listar mesa</span>
              </button>
            )}

            {esAdmin && (
              <button
                type="button"
                className={view === "moderar" ? "tab moderar activa" : "tab moderar"}
                onClick={() => setView(view === "moderar" ? "recepcion" : "moderar")}
              >
                <ShieldAlert size={14} aria-hidden="true" />
                <span>Moderar</span>
              </button>
            )}

            <AccountMenu
              label={nombreDeUsuario(user)}
              showHome={view !== "recepcion"}
              onGoHome={() => setView("recepcion")}
              onOpenAccount={() => setView("cuenta")}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <div className="workspace-3col">
          <PanelIzquierdo
            user={user}
            onGestionarMesa={abrirGestion}
            onIrRecepcion={() => setView("recepcion")}
          />

          <div className="workspace-centro">
            {view === "moderar" && esAdmin ? (
              <AdminUsersPage
                currentUser={user}
                onSelfDeleted={handleLogout}
                onVolver={() => setView("recepcion")}
              />
            ) : view === "cuenta" ? (
              <DashboardPage
                user={user}
                onUserUpdated={setUser}
                onAccountDeleted={handleLogout}
                onLogout={handleLogout}
                onVolver={() => setView("recepcion")}
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

          <PanelDerecho onLogoClick={() => setView("recepcion")} />
        </div>
      </div>
    </main>
  );
}

export default App;
