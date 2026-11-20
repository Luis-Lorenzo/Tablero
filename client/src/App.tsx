import { useCallback, useEffect, useRef, useState } from "react";
import { ListChecks, Moon, ShieldAlert, Sun, Volume2, VolumeX } from "lucide-react";
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
import {
  construirRuta,
  esRutaPermitidaParaUsuario,
  parsearRuta,
  type FaseSala,
  type RutaApp,
  type RutaNavegable,
  type VistaPizarra
} from "./presentation/routing/rutas";
import { alternarModoClaro, aplicarModoClaroDOM, obtenerModoClaro } from "./preview/datos";
import {
  alternarHogueraSilenciada,
  detenerSonidoHoguera,
  estaHogueraSilenciada,
  iniciarSonidoHoguera
} from "./preview/sonidoHoguera";

type View = "recepcion" | "cuenta" | "moderar" | "gestion" | "sala";

type ResultadoAccesoSala =
  | { ok: true; mesa: PublicMesa }
  | { ok: false; motivo: string };

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
  userId: string,
  esAdmin = false
): Promise<string> {
  try {
    const actualizada = await mesasApi.obtener(mesaId);
    const expulsado =
      actualizada.expulsados?.includes(userId) ||
      (!esAdmin &&
        actualizada.hostId !== userId &&
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

/** Carga una mesa por id y valida si el usuario puede entrar en su sala. */
async function cargarMesaParaSala(
  mesaId: string,
  usuario: PublicUser
): Promise<ResultadoAccesoSala> {
  try {
    const mesa = await mesasApi.obtener(mesaId);
    const esAdmin = usuario.role === "ADMIN";
    const esHost = mesa.hostId === usuario.id;
    const esJugador = mesa.players.some(p => p.id === usuario.id);
    const expulsado = mesa.expulsados?.includes(usuario.id) ?? false;

    if (expulsado && !esAdmin) {
      return { ok: false, motivo: "Has sido expulsado de la mesa." };
    }
    if (!esHost && !esJugador && !esAdmin) {
      return { ok: false, motivo: "No tienes acceso a esta mesa." };
    }
    if (!esHost && !esAdmin && mesa.estado !== "EN_CURSO") {
      return {
        ok: false,
        motivo: "La partida aún no ha empezado o ya ha terminado."
      };
    }
    return { ok: true, mesa };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        return { ok: false, motivo: "La mesa ya no existe o se ha cerrado." };
      }
      if (error.status === 403) {
        return { ok: false, motivo: "No tienes acceso a esta mesa." };
      }
    }
    return { ok: false, motivo: "No se pudo abrir la sala de la mesa." };
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
  /** Subvista activa dentro de la sala real sincronizada con la URL. */
  const [salaFase, setSalaFase] = useState<FaseSala>("sala");
  const [salaVistaPizarra, setSalaVistaPizarra] = useState<VistaPizarra>("pizarra");
  /** Aviso mostrado en recepción tras un cierre de mesa o expulsión en caliente. */
  const [avisoSala, setAvisoSala] = useState<string | null>(null);
  const [modoClaro, setModoClaro] = useState<boolean>(obtenerModoClaro);
  const [hogueraSilenciada, setHogueraSilenciada] = useState<boolean>(estaHogueraSilenciada);
  /** Mesa de la que el usuario salió manualmente para no forzarle a volver. */
  const salidaManualMesaIdRef = useRef<string | null>(null);
  const userRef = useRef<PublicUser | null>(user);
  const loadingRef = useRef<boolean>(loading);
  const viewRef = useRef<View>(view);
  const salaMesaRef = useRef<PublicMesa | null>(salaMesa);
  const salaFaseRef = useRef<FaseSala>(salaFase);
  const salaVistaPizarraRef = useRef<VistaPizarra>(salaVistaPizarra);
  const navegacionSeqRef = useRef<number>(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    salaMesaRef.current = salaMesa;
  }, [salaMesa]);

  useEffect(() => {
    salaFaseRef.current = salaFase;
  }, [salaFase]);

  useEffect(() => {
    salaVistaPizarraRef.current = salaVistaPizarra;
  }, [salaVistaPizarra]);

  const actualizarRutaActualDesdeWindow = useCallback(() => {
    const pathname = window.location.pathname;
    const search = window.location.search;
    setRutaActual(prev =>
      prev.pathname === pathname && prev.search === search
        ? prev
        : { pathname, search }
    );
  }, []);

  const sincronizarUrl = useCallback(
    (ruta: RutaNavegable, modo: "push" | "replace" = "push") => {
      const destino = construirRuta(ruta, window.location.search);
      const actual = `${window.location.pathname}${window.location.search}`;
      if (modo === "push") {
        const [destinoPathname] = destino.split("?");
        if (window.location.pathname === destinoPathname) {
          if (actual !== destino) {
            window.history.replaceState({}, "", destino);
          }
          actualizarRutaActualDesdeWindow();
          return;
        }
        window.history.pushState({}, "", destino);
      } else if (actual !== destino) {
        window.history.replaceState({}, "", destino);
      }
      actualizarRutaActualDesdeWindow();
    },
    [actualizarRutaActualDesdeWindow]
  );

  const aplicarRutaAutenticada = useCallback(
    async (destino: RutaApp, usuario: PublicUser): Promise<void> => {
      const seq = ++navegacionSeqRef.current;

      if (destino.view === "verificar-correo") {
        actualizarRutaActualDesdeWindow();
        return;
      }

      if (
        destino.view === "desconocida" ||
        !esRutaPermitidaParaUsuario(destino, usuario.role)
      ) {
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "recepcion";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setGestionMesaId(null);
        setView("recepcion");
        sincronizarUrl({ view: "recepcion" }, "replace");
        return;
      }

      if (destino.view === "recepcion") {
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "recepcion";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setGestionMesaId(null);
        setView("recepcion");
        sincronizarUrl({ view: "recepcion" }, "replace");
        return;
      }

      if (destino.view === "cuenta") {
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "cuenta";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setGestionMesaId(null);
        setView("cuenta");
        sincronizarUrl({ view: "cuenta" }, "replace");
        return;
      }

      if (destino.view === "moderar") {
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "moderar";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setGestionMesaId(null);
        setView("moderar");
        sincronizarUrl({ view: "moderar" }, "replace");
        return;
      }

      if (destino.view === "gestion") {
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "gestion";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setGestionMesaId(destino.mesaId);
        setView("gestion");
        sincronizarUrl({ view: "gestion", mesaId: destino.mesaId }, "replace");
        return;
      }

      // Carga directa / navegación a /mesa/:id/sala*
      const resultado = await cargarMesaParaSala(destino.mesaId, usuario);
      if (seq !== navegacionSeqRef.current) return;

      if (!resultado.ok) {
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "recepcion";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setGestionMesaId(null);
        setView("recepcion");
        setAvisoSala(resultado.motivo);
        sincronizarUrl({ view: "recepcion" }, "replace");
        return;
      }

      const vistaDestino: VistaPizarra =
        destino.fase === "pizarra"
          ? (destino.vistaPizarra ?? "pizarra")
          : "pizarra";
      salidaManualMesaIdRef.current = null;
      setAvisoSala(null);
      salaMesaRef.current = resultado.mesa;
      salaFaseRef.current = destino.fase;
      salaVistaPizarraRef.current = vistaDestino;
      viewRef.current = "sala";
      setGestionMesaId(null);
      setSalaMesa(resultado.mesa);
      setSalaFase(destino.fase);
      setSalaVistaPizarra(vistaDestino);
      setView("sala");
      sincronizarUrl(
        {
          view: "sala",
          mesaId: resultado.mesa.id,
          fase: destino.fase,
          vistaPizarra: destino.fase === "pizarra" ? vistaDestino : undefined
        },
        "replace"
      );
    },
    [actualizarRutaActualDesdeWindow, sincronizarUrl]
  );

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

  const enVerificacionCorreo =
    rutaActual.pathname.replace(/\/+$/, "") === "/verificar-correo";

  // La hoguera del lobby suena en la recepción, en la preview de la mesa (donde
  // se eligen nickname y color) y en moderación. No suena en la sala de juego
  // (que tiene la música del máster), ni en Mi cuenta, ni en login/registro.
  const enZonaConHoguera =
    !loading &&
    Boolean(user) &&
    !enVerificacionCorreo &&
    view !== "sala" &&
    view !== "cuenta";

  useEffect(() => {
    if (!enZonaConHoguera || hogueraSilenciada) {
      detenerSonidoHoguera();
      return;
    }
    iniciarSonidoHoguera();
    return () => {
      detenerSonidoHoguera();
    };
  }, [enZonaConHoguera, hogueraSilenciada]);

  // Carga inicial de sesión y restauración de ruta directa (F5).
  useEffect(() => {
    let cancelado = false;

    async function inicializarSesionYRuta() {
      const rutaInicial = parsearRuta(window.location.pathname);

      let usuario: PublicUser | null = null;
      try {
        usuario = await authApi.me();
      } catch {
        usuario = null;
      }
      if (cancelado) return;

      if (!usuario) {
        if (rutaInicial.view === "moderar") {
          sincronizarUrl({ view: "recepcion" }, "replace");
        }
        userRef.current = null;
        loadingRef.current = false;
        setUser(null);
        setLoading(false);
        return;
      }

      userRef.current = usuario;
      if (rutaInicial.view !== "verificar-correo") {
        await aplicarRutaAutenticada(rutaInicial, usuario);
        if (cancelado) return;
      }

      loadingRef.current = false;
      setUser(usuario);
      setLoading(false);
    }

    void inicializarSesionYRuta();
    return () => {
      cancelado = true;
    };
  }, [aplicarRutaAutenticada, sincronizarUrl]);

  // Blindaje adicional de /admin sin sesión o sin rol ADMIN.
  useEffect(() => {
    if (loading) return;
    const ruta = parsearRuta(window.location.pathname);
    if (!user) {
      if (ruta.view === "moderar") {
        sincronizarUrl({ view: "recepcion" }, "replace");
      }
      return;
    }
    if (user.role !== "ADMIN" && (ruta.view === "moderar" || view === "moderar")) {
      viewRef.current = "recepcion";
      setView("recepcion");
      sincronizarUrl({ view: "recepcion" }, "replace");
    }
  }, [loading, user, view, rutaActual.pathname, sincronizarUrl]);

  // Navegación del navegador (Atrás / Adelante).
  useEffect(() => {
    const alPopState = () => {
      const destino = parsearRuta(window.location.pathname);

      if (loadingRef.current) {
        actualizarRutaActualDesdeWindow();
        return;
      }

      const usuario = userRef.current;
      if (!usuario) {
        if (destino.view === "moderar") {
          sincronizarUrl({ view: "recepcion" }, "replace");
          return;
        }
        actualizarRutaActualDesdeWindow();
        return;
      }

      const salaActual = salaMesaRef.current;
      if (viewRef.current === "sala" && salaActual) {
        if (destino.view === "sala" && destino.mesaId === salaActual.id) {
          const vistaDestino: VistaPizarra =
            destino.fase === "pizarra"
              ? (destino.vistaPizarra ?? "pizarra")
              : salaVistaPizarraRef.current;
          salaFaseRef.current = destino.fase;
          setSalaFase(destino.fase);
          if (destino.fase === "pizarra") {
            salaVistaPizarraRef.current = vistaDestino;
            setSalaVistaPizarra(vistaDestino);
          }
          sincronizarUrl(
            {
              view: "sala",
              mesaId: salaActual.id,
              fase: destino.fase,
              vistaPizarra: destino.fase === "pizarra" ? vistaDestino : undefined
            },
            "replace"
          );
          return;
        }

        const confirmarSalida = window.confirm(
          "¿Seguro que quieres salir de la partida activa?"
        );
        if (!confirmarSalida) {
          const urlActualSala = construirRuta(
            {
              view: "sala",
              mesaId: salaActual.id,
              fase: salaFaseRef.current,
              vistaPizarra:
                salaFaseRef.current === "pizarra"
                  ? salaVistaPizarraRef.current
                  : undefined
            },
            window.location.search
          );
          window.history.pushState({}, "", urlActualSala);
          actualizarRutaActualDesdeWindow();
          return;
        }

        // Salida solo local: no termina la partida en el servidor.
        salidaManualMesaIdRef.current = salaActual.id;
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        if (destino.view === "verificar-correo") {
          viewRef.current = "recepcion";
          setView("recepcion");
          actualizarRutaActualDesdeWindow();
          return;
        }
        void aplicarRutaAutenticada(destino, usuario);
        return;
      }

      void aplicarRutaAutenticada(destino, usuario);
    };

    window.addEventListener("popstate", alPopState);
    return () => window.removeEventListener("popstate", alPopState);
  }, [actualizarRutaActualDesdeWindow, aplicarRutaAutenticada, sincronizarUrl]);

  const abrirSala = useCallback(
    (
      mesa: PublicMesa,
      opciones?: {
        fase?: FaseSala;
        vistaPizarra?: VistaPizarra;
        modoUrl?: "push" | "replace";
      }
    ) => {
      const uid = userRef.current?.id ?? "";
      const vetado =
        mesa.hostId !== uid && (mesa.expulsados?.includes(uid) ?? false);
      if (vetado) {
        navegacionSeqRef.current += 1;
        salidaManualMesaIdRef.current = null;
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "recepcion";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setView("recepcion");
        setAvisoSala(
          "Has sido expulsado de esta mesa: no puedes volver a entrar."
        );
        sincronizarUrl({ view: "recepcion" }, "replace");
        return;
      }
      const faseDestino: FaseSala = opciones?.fase ?? "sala";
      const vistaDestino: VistaPizarra = opciones?.vistaPizarra ?? "pizarra";
      navegacionSeqRef.current += 1;
      salidaManualMesaIdRef.current = null;
      setAvisoSala(null);
      salaMesaRef.current = mesa;
      salaFaseRef.current = faseDestino;
      salaVistaPizarraRef.current = vistaDestino;
      viewRef.current = "sala";
      setGestionMesaId(null);
      setSalaMesa(mesa);
      setSalaFase(faseDestino);
      setSalaVistaPizarra(vistaDestino);
      setView("sala");
      sincronizarUrl(
        {
          view: "sala",
          mesaId: mesa.id,
          fase: faseDestino,
          vistaPizarra: faseDestino === "pizarra" ? vistaDestino : undefined
        },
        opciones?.modoUrl ?? "push"
      );
    },
    [sincronizarUrl]
  );

  const refrescarMiSala = useCallback(async () => {
    if (loadingRef.current || !user) return;
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
        if (viewRef.current === "sala" && salaMesaRef.current?.id === enCurso.id) {
          salaMesaRef.current = enCurso;
          setSalaMesa(enCurso);
          return;
        }
        if (
          viewRef.current === "recepcion" &&
          enCurso.id !== salidaManualMesaIdRef.current
        ) {
          abrirSala(enCurso);
        }
        return;
      }

      const salaActual = salaMesaRef.current;
      const esAdmin = user.role === "ADMIN";
      const preparandoPropia =
        salaActual !== null &&
        salaActual.hostId === user.id &&
        salaActual.estado === "ESPERA";
      if (viewRef.current === "sala" && salaActual && !esAdmin && !preparandoPropia) {
        salidaManualMesaIdRef.current = null;
        salaMesaRef.current = null;
        salaFaseRef.current = "sala";
        salaVistaPizarraRef.current = "pizarra";
        viewRef.current = "recepcion";
        setSalaMesa(null);
        setSalaFase("sala");
        setSalaVistaPizarra("pizarra");
        setView("recepcion");
        sincronizarUrl({ view: "recepcion" }, "replace");
        const motivo = await resolverMotivoSalidaMesa(salaActual.id, user.id, esAdmin);
        setAvisoSala(motivo);
        return;
      }

      salidaManualMesaIdRef.current = null;
    } catch {
      // Ignorar: la vista de recepción seguirá funcionando.
    }
  }, [abrirSala, sincronizarUrl, user]);

  useEffect(() => {
    if (loading || !user) return;
    void refrescarMiSala();
  }, [loading, user, refrescarMiSala]);

  useMesasLive(refrescarMiSala);

  const handleAuthenticated = useCallback(
    (nextUser: PublicUser) => {
      userRef.current = nextUser;
      const ruta = parsearRuta(window.location.pathname);
      if (ruta.view === "sala") {
        loadingRef.current = true;
        setLoading(true);
        void aplicarRutaAutenticada(ruta, nextUser).finally(() => {
          loadingRef.current = false;
          setUser(nextUser);
          setLoading(false);
        });
        return;
      }
      void aplicarRutaAutenticada(ruta, nextUser);
      setUser(nextUser);
    },
    [aplicarRutaAutenticada]
  );

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignoramos el error: la sesión local se descarta igualmente.
    }
    navegacionSeqRef.current += 1;
    salidaManualMesaIdRef.current = null;
    salaMesaRef.current = null;
    salaFaseRef.current = "sala";
    salaVistaPizarraRef.current = "pizarra";
    viewRef.current = "recepcion";
    userRef.current = null;
    setUser(null);
    setView("recepcion");
    setGestionMesaId(null);
    setSalaMesa(null);
    setSalaFase("sala");
    setSalaVistaPizarra("pizarra");
    setMiMesa(null);
    setAvisoSala(null);
    sincronizarUrl({ view: "recepcion" }, "replace");
  }, [sincronizarUrl]);

  const irARecepcion = useCallback(() => {
    navegacionSeqRef.current += 1;
    viewRef.current = "recepcion";
    setGestionMesaId(null);
    setView("recepcion");
    sincronizarUrl({ view: "recepcion" }, "push");
  }, [sincronizarUrl]);

  const irACuenta = useCallback(() => {
    navegacionSeqRef.current += 1;
    viewRef.current = "cuenta";
    setGestionMesaId(null);
    setView("cuenta");
    sincronizarUrl({ view: "cuenta" }, "push");
  }, [sincronizarUrl]);

  const irAModerar = useCallback(() => {
    navegacionSeqRef.current += 1;
    if (!esRutaPermitidaParaUsuario({ view: "moderar" }, userRef.current?.role)) {
      viewRef.current = "recepcion";
      setGestionMesaId(null);
      setView("recepcion");
      sincronizarUrl({ view: "recepcion" }, "replace");
      return;
    }
    viewRef.current = "moderar";
    setGestionMesaId(null);
    setView("moderar");
    sincronizarUrl({ view: "moderar" }, "push");
  }, [sincronizarUrl]);

  const abrirGestion = useCallback(
    (mesa: PublicMesa) => {
      navegacionSeqRef.current += 1;
      viewRef.current = "gestion";
      setGestionMesaId(mesa.id);
      setView("gestion");
      sincronizarUrl({ view: "gestion", mesaId: mesa.id }, "push");
    },
    [sincronizarUrl]
  );

  const actualizarSalaMesa = useCallback((actualizada: PublicMesa) => {
    salaMesaRef.current = actualizada;
    setSalaMesa(actualizada);
  }, []);

  const handleCambiarRutaSala = useCallback(
    (fase: FaseSala, vistaPizarra?: VistaPizarra) => {
      const mesaActual = salaMesaRef.current;
      salaFaseRef.current = fase;
      setSalaFase(fase);
      if (vistaPizarra !== undefined) {
        salaVistaPizarraRef.current = vistaPizarra;
        setSalaVistaPizarra(vistaPizarra);
      }
      if (!mesaActual) return;
      const vistaFinal = vistaPizarra ?? salaVistaPizarraRef.current;
      sincronizarUrl(
        {
          view: "sala",
          mesaId: mesaActual.id,
          fase,
          vistaPizarra: fase === "pizarra" ? vistaFinal : undefined
        },
        "push"
      );
    },
    [sincronizarUrl]
  );

  const volverRecpcion = useCallback(
    (motivo?: string) => {
      navegacionSeqRef.current += 1;
      const esSalidaAutomatica = typeof motivo === "string" && motivo.trim().length > 0;
      if (esSalidaAutomatica) {
        salidaManualMesaIdRef.current = null;
        setAvisoSala(motivo);
      } else {
        salidaManualMesaIdRef.current = salaMesaRef.current?.id ?? null;
        setAvisoSala(null);
      }
      salaMesaRef.current = null;
      salaFaseRef.current = "sala";
      salaVistaPizarraRef.current = "pizarra";
      viewRef.current = "recepcion";
      setSalaMesa(null);
      setSalaFase("sala");
      setSalaVistaPizarra("pizarra");
      setGestionMesaId(null);
      setView("recepcion");
      sincronizarUrl(
        { view: "recepcion" },
        esSalidaAutomatica ? "replace" : "push"
      );
      void refrescarMiSala();
    },
    [refrescarMiSala, sincronizarUrl]
  );

  const handleMiMesa = useCallback(
    (mesa: PublicMesa | null) => {
      setMiMesa(mesa);
      if (
        viewRef.current === "recepcion" &&
        mesa?.estado === "EN_CURSO" &&
        mesa.id !== salidaManualMesaIdRef.current
      ) {
        abrirSala(mesa);
      }
    },
    [abrirSala]
  );

  if (enVerificacionCorreo) {
    const params = new URLSearchParams(rutaActual.search);
    const token = params.get("token") ?? "";
    return (
      <VerifyEmailPage
        token={token}
        onGoToLogin={() => {
          viewRef.current = "recepcion";
          setView("recepcion");
          sincronizarUrl({ view: "recepcion" }, "replace");
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
              onActualizarMesa={actualizarSalaMesa}
              onVolver={volverRecpcion}
              onSessionExpired={handleLogout}
              faseExterna={salaFase}
              vistaPizarraExterna={salaVistaPizarra}
              onCambiarRutaSala={handleCambiarRutaSala}
            />
          ) : view === "gestion" && gestionMesaId ? (
            <GestionMesaPage
              mesaId={gestionMesaId}
              user={user}
              onVolver={irARecepcion}
              onAbrirSala={mesa => abrirSala(mesa)}
              onSessionExpired={handleLogout}
              hogueraSilenciada={hogueraSilenciada}
              onAlternarHoguera={() =>
                setHogueraSilenciada(alternarHogueraSilenciada())
              }
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
            <button
              type="button"
              className={`topbar-tema-btn${hogueraSilenciada ? " silenciada" : ""}`}
              onClick={() => setHogueraSilenciada(alternarHogueraSilenciada())}
              title={
                hogueraSilenciada
                  ? "Sonido de hoguera apagado (pulsa para activar)"
                  : "Sonido de hoguera activo (pulsa para apagar)"
              }
              aria-label={
                hogueraSilenciada
                  ? "Activar sonido de hoguera"
                  : "Apagar sonido de hoguera"
              }
              aria-pressed={!hogueraSilenciada}
            >
              {hogueraSilenciada ? (
                <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
            </button>
            <ArchivosMenu />
          </div>

          <div className="topbar-logo-movil">
            <LogoPocketRol variante="banner" onClick={irARecepcion} />
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
                onClick={() => (view === "moderar" ? irARecepcion() : irAModerar())}
              >
                <ShieldAlert size={14} aria-hidden="true" />
                <span>Moderar</span>
              </button>
            )}

            <AccountMenu
              label={nombreDeUsuario(user)}
              showHome={view !== "recepcion"}
              onGoHome={irARecepcion}
              onOpenAccount={irACuenta}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <div className="workspace-3col">
          <PanelIzquierdo
            user={user}
            onGestionarMesa={abrirGestion}
            onIrRecepcion={irARecepcion}
          />

          <div className="workspace-centro">
            {view === "moderar" && esAdmin ? (
              <AdminUsersPage
                currentUser={user}
                onSelfDeleted={handleLogout}
                onVolver={irARecepcion}
              />
            ) : view === "cuenta" ? (
              <DashboardPage
                user={user}
                onUserUpdated={setUser}
                onAccountDeleted={handleLogout}
                onLogout={handleLogout}
                onVolver={irARecepcion}
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

          <PanelDerecho onLogoClick={irARecepcion} />
        </div>
      </div>
    </main>
  );
}

export default App;
