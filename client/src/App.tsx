import { useCallback, useEffect, useRef, useState } from "react";
import { ListChecks, Moon, ShieldAlert, Sun } from "lucide-react";
import "./App.css";
import { authApi } from "./api/auth.api";
import { ApiError } from "./api/client";
import { mesasApi } from "./api/mesas.api";
import type { PublicMesa, PublicUser } from "./api/types";
import { AuthPage } from "./presentation/pages/AuthPage";
import { VerifyEmailPage } from "./presentation/pages/VerifyEmailPage";
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
import { alternarModoClaro, aplicarModoClaroDOM, obtenerModoClaro } from "./preview/datos";

type View = "recepcion" | "cuenta" | "moderar" | "gestion" | "sala";

/** Nombre con el que se muestra al usuario: su nickname o la parte del correo. */
function nombreDeUsuario(user: PublicUser): string {
  const nickname = user.nickname?.trim();
  if (nickname) return nickname;
  const corte = user.email.indexOf("@");
  return corte === -1 ? user.email : user.email.slice(0, corte);
}

/** Determina el motivo por el que el usuario ha salido de una sala activa. */
async function resolverMotivoSalidaMesa(
  mesaId: string,
  userId: string
): Promise<string> {
  try {
    const actualizada = await mesasApi.obtener(mesaId);
    const expulsado =
      actualizada.expulsados?.includes(userId) ||
      (actualizada.hostId !== userId &&
        !actualizada.players.some(p => p.id === userId));
    if (expulsado) {
      return "Has sido expulsado de la mesa.";
    }
    if (actualizada.estado !== "EN_CURSO") {
      return "La partida ha terminado y la mesa ha vuelto a espera.";
    }
    return "Has salido de la sala.";
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return "La mesa se ha cerrado.";
      if (error.status === 403) return "Ya no tienes acceso a esta mesa.";
    }
    return "La mesa ya no está disponible.";
  }
}

function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rutaActual, setRutaActual] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search
  }));
  const [view, setView] = useState<View>("recepcion");
  const [gestionMesaId, setGestionMesaId] = useState<string | null>(null);
  /** Mesa que aloja el usuario ahora mismo (para el botón "Listar mesa"). */
  const [miMesa, setMiMesa] = useState<PublicMesa | null>(null);
  /** Mesa abierta en la sala real (la partida empezada). */
  const [salaMesa, setSalaMesa] = useState<PublicMesa | null>(null);
  /** Aviso mostrado en recepción tras un cierre de mesa o expulsión en caliente. */
  const [avisoSala, setAvisoSala] = useState<string | null>(null);
  const [modoClaro, setModoClaro] = useState<boolean>(obtenerModoClaro);
  /** Mesa de la que el usuario salió manualmente para no forzarle a volver. */
  const salidaManualMesaIdRef = useRef<string | null>(null);
  const viewRef = useRef<View>(view);
  const salaMesaRef = useRef<PublicMesa | null>(salaMesa);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    salaMesaRef.current = salaMesa;
  }, [salaMesa]);

  useEffect(() => {
    const claro = obtenerModoClaro();
    aplicarModoClaroDOM(claro);
    setModoClaro(claro);
    const alCambiarTema = () => {
      const actual = obtenerModoClaro();
      aplicarModoClaroDOM(actual);
      setModoClaro(actual);
    };
    window.addEventListener("pocketrol:tema", alCambiarTema);
    return () => window.removeEventListener("pocketrol:tema", alCambiarTema);
  }, []);

  useEffect(() => {
    const alPopState = () => {
      setRutaActual({
        pathname: window.location.pathname,
        search: window.location.search
      });
    };
    window.addEventListener("popstate", alPopState);
    return () => window.removeEventListener("popstate", alPopState);
  }, []);

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
      const pendiente = await mesasApi.pendiente();
      const candidatos = [mesa, pendiente].filter(Boolean) as PublicMesa[];
      const enCurso = candidatos.find(
        candidata =>
          candidata.estado === "EN_CURSO" &&
          !candidata.expulsados?.includes(user.id)
      );

      if (mesa && mesa.estado !== "EN_CURSO") {
        setMiMesa(mesa);
      } else if (!mesa) {
        setMiMesa(null);
      }

      if (enCurso) {
        if (mesa && mesa.id === enCurso.id) {
          setMiMesa(mesa);
        }
        if (enCurso.id !== salidaManualMesaIdRef.current) {
          setAvisoSala(null);
          setSalaMesa(enCurso);
          setView("sala");
        }
        return;
      }

      const salaActual = salaMesaRef.current;
      if (viewRef.current === "sala" && salaActual) {
        salidaManualMesaIdRef.current = null;
        setSalaMesa(null);
        setView("recepcion");
        const motivo = await resolverMotivoSalidaMesa(salaActual.id, user.id);
        setAvisoSala(motivo);
        return;
      }

      salidaManualMesaIdRef.current = null;
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
    salidaManualMesaIdRef.current = null;
    setUser(null);
    setView("recepcion");
    setSalaMesa(null);
    setMiMesa(null);
    setAvisoSala(null);
  }, []);

  const abrirGestion = useCallback((mesa: PublicMesa) => {
    setGestionMesaId(mesa.id);
    setView("gestion");
  }, []);

  const abrirSala = useCallback((mesa: PublicMesa) => {
    salidaManualMesaIdRef.current = null;
    setAvisoSala(null);
    setSalaMesa(mesa);
    setView("sala");
  }, []);

  const volverRecpcion = useCallback(
    (motivo?: string) => {
      if (typeof motivo === "string" && motivo.trim()) {
        salidaManualMesaIdRef.current = null;
        setAvisoSala(motivo);
      } else {
        salidaManualMesaIdRef.current = salaMesa?.id ?? null;
        setAvisoSala(null);
      }
      setSalaMesa(null);
      setView("recepcion");
      void refrescarMiSala();
    },
    [refrescarMiSala, salaMesa]
  );

  const handleMiMesa = useCallback((mesa: PublicMesa | null) => {
    setMiMesa(mesa);
    if (
      mesa?.estado === "EN_CURSO" &&
      mesa.id !== salidaManualMesaIdRef.current
    ) {
      setSalaMesa(mesa);
      setView("sala");
    }
  }, []);

  if (rutaActual.pathname.replace(/\/+$/, "") === "/verificar-correo") {
    const params = new URLSearchParams(rutaActual.search);
    const token = params.get("token") ?? "";
    return (
      <VerifyEmailPage
        token={token}
        onGoToLogin={() => {
          window.history.pushState({}, "", "/");
          setRutaActual({ pathname: "/", search: "" });
        }}
      />
    );
  }

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
            <button
              type="button"
              className={`topbar-tema-btn${modoClaro ? " claro" : ""}`}
              onClick={() => setModoClaro(alternarModoClaro())}
              title={
                modoClaro
                  ? "Modo claro activo (pulsa para modo oscuro)"
                  : "Modo oscuro activo (pulsa para modo claro)"
              }
              aria-label={modoClaro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
              aria-pressed={modoClaro}
            >
              {modoClaro ? (
                <Sun size={16} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Moon size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
            </button>
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
              <>
                {avisoSala && (
                  <div
                    className="feedback aviso"
                    role="alert"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      marginBottom: "14px"
                    }}
                  >
                    <span>{avisoSala}</span>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setAvisoSala(null)}
                    >
                      Entendido
                    </button>
                  </div>
                )}
                <RecepcionPage
                  user={user}
                  onGestionar={abrirGestion}
                  onMiMesa={handleMiMesa}
                  onSessionExpired={handleLogout}
                />
              </>
            )}
          </div>

          <PanelDerecho onLogoClick={() => setView("recepcion")} />
        </div>
      </div>
    </main>
  );
}

export default App;
