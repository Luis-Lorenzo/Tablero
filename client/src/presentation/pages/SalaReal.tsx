import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { ApiError } from "../../api/client";
import { archivosApi } from "../../api/archivos.api";
import { mesasApi } from "../../api/mesas.api";
import { usersApi } from "../../api/users.api";
import type {
  EventoTirada,
  MensajeChat,
  PublicArchivo,
  PublicMesa,
  PublicTransferencia,
  PublicUser
} from "../../api/types";
import { describeError } from "../errorMessages";
import { useMesasLive } from "../hooks/useMesasLive";
import { Sala } from "../../preview/Sala";
import { HudSalaCompartido } from "../../preview/HudSalaCompartido";
import { Pizarra } from "../../preview/Pizarra";
import { Mapa } from "../../preview/Mapa";
import { reproducirSonidoTirada } from "../../preview/sonidoDados";
import { Archivador, ProyeccionMasterModal } from "../../preview/Archivador";
import {
  cargarCalibracion,
  guardarCalibracion
} from "../../preview/calibracion";
import {
  calcularPosicionRecepcion,
  crearElementoDesdeArchivo,
  nuevoIdElemento
} from "../../preview/compartir";
import {
  reproducirSonidoMonedas,
  reproducirSonidoNotificacion,
  reproducirSonidoPing
} from "../../preview/sonido";
import type {
  Calibracion,
  DivisaAsientoDelta,
  DocumentoMesa,
  ElementoMesa,
  EstadoMapaCompartido,
  ImagenEscenaPreview,
  JugadorPreview,
  MapaFondoConfig,
  MapaIniciativaEstado,
  MapaRejillaConfig,
  MensajeSala,
  ObjetoMochila,
  PingVisual,
  PlantillaTokenMapa,
  PositPreview,
  SolicitudTransferencia,
  TipoEspecialTirada,
  TiradaAsiento,
  TokenMapa,
  TrazoPizarra
} from "../../preview/tipos";
import "../../preview/preview.css";

interface SalaRealProps {
  mesa: PublicMesa;
  user: PublicUser;
  onActualizarMesa: (mesa: PublicMesa) => void;
  onVolver: (motivo?: string) => void;
  onSessionExpired?: () => void;
}

type Fase = "sala" | "pizarra" | "mapa" | "archivador";

const PALETA_COLORES = [
  "#74569b",
  "#f7ffae",
  "#d8bfd8",
  "#96fbc7",
  "#ffb3cb",
  "#8fb8ff"
];

function construirJugadores(mesa: PublicMesa): JugadorPreview[] {
  const lista: JugadorPreview[] = [
    {
      id: "master",
      usuarioId: mesa.hostId,
      userId: mesa.hostId,
      nombre: mesa.hostName,
      color: mesa.colores?.[mesa.hostId] ?? "#e8c56a",
      esMaster: true,
      activo: true
    }
  ];

  mesa.players.forEach((jugador, indice) => {
    lista.push({
      id: `p${indice + 1}`,
      usuarioId: jugador.id,
      userId: jugador.id,
      nombre: jugador.name,
      apodo: mesa.playerApodos?.[jugador.id],
      color:
        mesa.colores?.[jugador.id] ??
        jugador.color ??
        PALETA_COLORES[indice % PALETA_COLORES.length],
      esMaster: false,
      activo: true
    });
  });

  return lista;
}

const DURACION_D20_ASIENTO = 3500;

const ESTADO_MAPA_DEFECTO: EstadoMapaCompartido = {
  fondo: null,
  rejilla: {
    visible: true,
    columnas: 20,
    filas: 12,
    filasAuto: true,
    offsetX: 0,
    offsetY: 0,
    color: "#ffffff",
    opacidad: 0.35,
    imanActivo: true
  },
  tokens: [],
  plantillas: []
};

function aSolicitudCliente(t: PublicTransferencia): SolicitudTransferencia {
  if (t.tipo === "posit") {
    return {
      id: t.id,
      emisorNombre: t.emisorNombre,
      tipo: "posit",
      textoPosit: t.posit.texto,
      colorPosit: t.posit.color,
      giroPosit: t.posit.giro
    };
  }

  if (t.tipo === "objeto") {
    return {
      id: t.id,
      emisorNombre: t.emisorNombre,
      tipo: "objeto",
      objeto: t.objeto
    };
  }

  return {
    id: t.id,
    emisorNombre: t.emisorNombre,
    tipo: "archivo",
    nombreArchivo: t.archivo.nombre,
    mimeArchivo: t.archivo.tipo,
    vistaArchivo: t.archivo.vista
  };
}

function SalaRealContent({
  mesa,
  user,
  onActualizarMesa,
  onVolver,
  onSessionExpired
}: SalaRealProps) {
  const [fase, setFase] = useState<Fase>("sala");
  const [calibracion, setCalibracion] = useState<Calibracion>(cargarCalibracion);
  const [posits, setPosits] = useState<PositPreview[]>([]);
  const [elementosMesa, setElementosMesa] = useState<ElementoMesa[]>([]);
  const [archivosDisponibles, setArchivosDisponibles] = useState<PublicArchivo[]>([]);
  const [colaSolicitudes, setColaSolicitudes] = useState<SolicitudTransferencia[]>([]);
  const [estadoAviso, setEstadoAviso] = useState<string | null>(null);
  const [trazosPizarra, setTrazosPizarra] = useState<TrazoPizarra[]>([]);
  const [documentosPizarra, setDocumentosPizarra] = useState<DocumentoMesa[]>([]);
  const [trazosEscena, setTrazosEscena] = useState<TrazoPizarra[]>([]);
  const [positsEscena, setPositsEscena] = useState<PositPreview[]>([]);
  const [docsEscena, setDocsEscena] = useState<DocumentoMesa[]>([]);
  const [tamanoImagenesEscena, setTamanoImagenesEscena] = useState<
    Record<string, { w: number; h: number }>
  >({});
  const [pizarraCongelada, setPizarraCongelada] = useState<boolean>(false);
  const [proyeccionOcultadaId, setProyeccionOcultadaId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [mensajesChat, setMensajesChat] = useState<MensajeSala[]>([]);
  const [tiradasAsiento, setTiradasAsiento] = useState<Record<string, TiradaAsiento>>({});
  const [divisaAsiento, setDivisaAsiento] = useState<Record<string, DivisaAsientoDelta>>({});
  const [divisa, setDivisa] = useState<number>(0);
  const [mochila, setMochila] = useState<ObjetoMochila[]>([]);
  const [pingsActivos, setPingsActivos] = useState<PingVisual[]>([]);
  const [macros, setMacros] = useState<import("../../preview/tipos").MacroTirada[]>([]);
  const [estadoMapa, setEstadoMapa] = useState<EstadoMapaCompartido>(ESTADO_MAPA_DEFECTO);

  const recepcionesRef = useRef(0);
  const avisoTimerRef = useRef<number | null>(null);
  const timersAsiento = useRef<Record<string, number>>({});
  const timersDivisa = useRef<Record<string, number>>({});
  const estadoCargadoRef = useRef(false);
  const pizarraCargadaRef = useRef(false);
  const ignorarGuardadoPizarraRef = useRef(false);
  const esMaster = mesa.hostId === user.id;
  const jugadores = useMemo(() => construirJugadores(mesa), [mesa]);
  const indiceJugador = mesa.players.findIndex(p => p.id === user.id);
  const jugadorActual =
    indiceJugador >= 0 ? mesa.players[indiceJugador] : undefined;
  const nombreJugadorActual = esMaster
    ? mesa.hostName
    : (jugadorActual?.name ?? user.nickname ?? user.email.split("@")[0]);
  const colorJugadorActual = esMaster
    ? "#e8c56a"
    : (mesa.colores?.[user.id] ??
      jugadorActual?.color ??
      PALETA_COLORES[
      (indiceJugador >= 0 ? indiceJugador : 0) % PALETA_COLORES.length
      ]);
  const imagenEscena = mesa.imagenEscena ?? null;
  const imagenProyectada = mesa.imagenProyectada ?? null;
  const proyeccionOculta = Boolean(
    imagenProyectada && proyeccionOcultadaId === imagenProyectada.id
  );

  const mostrarAvisoBreve = useCallback((texto: string) => {
    setEstadoAviso(texto);
    if (avisoTimerRef.current !== null) {
      window.clearTimeout(avisoTimerRef.current);
    }
    avisoTimerRef.current = window.setTimeout(() => setEstadoAviso(null), 3200);
  }, []);

  const agregarPingVisual = useCallback((ping: PingVisual) => {
    reproducirSonidoPing();
    setPingsActivos(prev => [...prev, ping]);
    window.setTimeout(() => {
      setPingsActivos(prev => prev.filter(item => item.id !== ping.id));
    }, 2400);
  }, []);

  useEffect(
    () => () => {
      if (avisoTimerRef.current !== null) {
        window.clearTimeout(avisoTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const root = document.getElementById("root");
    if (fase === "pizarra" || fase === "mapa" || fase === "archivador") {
      root?.classList.add("ocultar-menus");
    } else {
      root?.classList.remove("ocultar-menus");
    }
    return () => root?.classList.remove("ocultar-menus");
  }, [fase]);

  useEffect(() => {
    guardarCalibracion(calibracion);
  }, [calibracion]);

  const aplicarEstadoPizarraRemoto = useCallback(
    (datos: {
      posits?: unknown[];
      trazos?: unknown[];
      documentos?: unknown[];
      trazosEscena?: unknown[];
      positsEscena?: unknown[];
      docsEscena?: unknown[];
      tamanoImagenesEscena?: Record<string, { w: number; h: number }>;
      congelada?: boolean;
    }) => {
      ignorarGuardadoPizarraRef.current = true;
      setPosits(Array.isArray(datos.posits) ? (datos.posits as PositPreview[]) : []);
      setTrazosPizarra(
        Array.isArray(datos.trazos) ? (datos.trazos as TrazoPizarra[]) : []
      );
      setDocumentosPizarra(
        Array.isArray(datos.documentos)
          ? (datos.documentos as DocumentoMesa[])
          : []
      );
      setTrazosEscena(
        Array.isArray(datos.trazosEscena)
          ? (datos.trazosEscena as TrazoPizarra[])
          : []
      );
      setPositsEscena(
        Array.isArray(datos.positsEscena)
          ? (datos.positsEscena as PositPreview[])
          : []
      );
      setDocsEscena(
        Array.isArray(datos.docsEscena)
          ? (datos.docsEscena as DocumentoMesa[])
          : []
      );
      setTamanoImagenesEscena(datos.tamanoImagenesEscena ?? {});
      setPizarraCongelada(Boolean(datos.congelada));
    },
    []
  );

  useEffect(() => {
    let cancelado = false;
    mesasApi
      .listarChat(mesa.id)
      .then(lista => {
        if (!cancelado) {
          setMensajesChat(lista);
        }
      })
      .catch(chatError => {
        if (!cancelado) {
          setError(describeError(chatError));
        }
      });

    return () => {
      cancelado = true;
    };
  }, [mesa.id]);

  useEffect(() => {
    const timersMap = timersAsiento.current;
    return () => {
      for (const timerId of Object.values(timersMap)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    let activo = true;
    void usersApi
      .obtenerMacros()
      .then(({ macros: remotas }) => {
        if (activo && Array.isArray(remotas)) setMacros(remotas);
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, [user.id]);

  const actualizarMacros = useCallback((nuevas: import("../../preview/tipos").MacroTirada[]) => {
    setMacros(nuevas);
    void usersApi.guardarMacros(nuevas).catch(() => {
      setError("No se pudieron guardar las macros en tu perfil.");
    });
  }, []);

  useEffect(() => {
    let activo = true;
    pizarraCargadaRef.current = false;
    void mesasApi
      .obtenerPizarra(mesa.id)
      .then(datos => {
        if (!activo) return;
        aplicarEstadoPizarraRemoto(datos);
      })
      .catch(() => undefined)
      .finally(() => {
        if (activo) pizarraCargadaRef.current = true;
      });
    return () => {
      activo = false;
    };
  }, [mesa.id, aplicarEstadoPizarraRemoto]);

  useEffect(() => {
    if (!pizarraCargadaRef.current) return;
    if (ignorarGuardadoPizarraRef.current) {
      ignorarGuardadoPizarraRef.current = false;
      return;
    }
    if (pizarraCongelada && !esMaster) return;

    const timer = window.setTimeout(() => {
      const limpiarDocs = (lista: DocumentoMesa[]) =>
        lista.map(({ url: _url, ...resto }) => resto);
      void mesasApi
        .guardarPizarra(mesa.id, {
          posits,
          trazos: trazosPizarra,
          documentos: limpiarDocs(documentosPizarra),
          trazosEscena,
          positsEscena,
          docsEscena: limpiarDocs(docsEscena),
          tamanoImagenesEscena,
          congelada: pizarraCongelada
        })
        .catch(() => undefined);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    mesa.id,
    esMaster,
    posits,
    trazosPizarra,
    documentosPizarra,
    trazosEscena,
    positsEscena,
    docsEscena,
    tamanoImagenesEscena,
    pizarraCongelada
  ]);

  useEffect(() => {
    let activo = true;
    estadoCargadoRef.current = false;
    void mesasApi
      .obtenerEstado(mesa.id)
      .then(res => {
        if (!activo) return;
        const cargados = Array.isArray(res.elementos)
          ? (res.elementos as ElementoMesa[])
          : [];
        setElementosMesa(cargados);
        setDivisa(typeof res.divisa === "number" ? res.divisa : 0);
        setMochila(
          Array.isArray(res.mochila) ? (res.mochila as ObjetoMochila[]) : []
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (activo) estadoCargadoRef.current = true;
      });
    return () => {
      activo = false;
    };
  }, [mesa.id]);

  useEffect(() => {
    let activo = true;
    void mesasApi
      .obtenerMapa(mesa.id)
      .then(mapa => {
        if (activo && mapa) setEstadoMapa(mapa);
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, [mesa.id, fase === "mapa"]);

  useEffect(() => {
    if (!estadoCargadoRef.current) return;
    const timer = window.setTimeout(() => {
      const limpios = elementosMesa.map(el =>
        el.tipo === "archivo"
          ? {
            id: el.id,
            tipo: el.tipo,
            archivoId: el.archivoId,
            nombre: el.nombre,
            mime: el.mime,
            vista: el.vista,
            tamano: el.tamano,
            x: el.x,
            y: el.y,
            archivado: el.archivado,
            remitente: el.remitente
          }
          : el.tipo === "objeto"
            ? {
              id: el.id,
              tipo: el.tipo,
              nombre: el.nombre,
              descripcion: el.descripcion,
              cantidad: el.cantidad,
              emoji: el.emoji,
              archivoId: el.archivoId,
              archivoNombre: el.archivoNombre,
              x: el.x,
              y: el.y,
              archivado: el.archivado,
              remitente: el.remitente
            }
            : el
      );
      const mochilaLimpia = mochila.map(({ imagenLocal: _img, ...resto }) => resto);
      void mesasApi.guardarEstado(mesa.id, limpios, mochilaLimpia).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [mesa.id, elementosMesa, mochila]);
  const refrescar = useCallback(async () => {
    try {
      const actualizada = await mesasApi.obtener(mesa.id);
      const sigueEnMesa =
        actualizada.hostId === user.id ||
        actualizada.players.some(p => p.id === user.id);
      if (!sigueEnMesa) {
        onVolver("Has sido expulsado de la mesa.");
        return;
      }
      if (actualizada.estado !== "EN_CURSO") {
        onActualizarMesa(actualizada);
        onVolver("La partida ha terminado y la mesa ha vuelto a espera.");
        return;
      }
      onActualizarMesa(actualizada);
    } catch (refrescoError) {
      if (
        refrescoError instanceof ApiError &&
        (refrescoError.status === 403 || refrescoError.status === 404)
      ) {
        onVolver("La mesa se ha cerrado.");
        return;
      }
      setError(describeError(refrescoError));
    }
  }, [mesa.id, user.id, onActualizarMesa, onVolver]);

  const cargarArchivos = useCallback(() => {
    void archivosApi
      .listar()
      .then(setArchivosDisponibles)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let activo = true;
    const sincronizarPendientes = () => {
      void mesasApi
        .pendientesCompartir(mesa.id)
        .then(lista => {
          if (!activo) return;
          setColaSolicitudes(prev => {
            const idsActivos = new Set(lista.map(t => t.id));
            const filtrada = prev.filter(s => idsActivos.has(s.id));
            const existentes = new Set(filtrada.map(s => s.id));
            const nuevas = lista
              .filter(t => !existentes.has(t.id))
              .map(aSolicitudCliente);
            if (nuevas.length === 0 && filtrada.length === prev.length) return prev;
            return [...filtrada, ...nuevas];
          });
        })
        .catch(() => undefined);
    };

    sincronizarPendientes();
    const intervalo = window.setInterval(sincronizarPendientes, 4000);
    const alEnfocar = () => {
      if (document.visibilityState !== "hidden") {
        sincronizarPendientes();
      }
    };
    window.addEventListener("focus", alEnfocar);
    document.addEventListener("visibilitychange", alEnfocar);

    void archivosApi
      .listar()
      .then(lista => {
        if (activo) setArchivosDisponibles(lista);
      })
      .catch(() => undefined);

    return () => {
      activo = false;
      window.clearInterval(intervalo);
      window.removeEventListener("focus", alEnfocar);
      document.removeEventListener("visibilitychange", alEnfocar);
    };
  }, [mesa.id]);

  const alMensajeEnVivo = useCallback(
    (evento: Record<string, unknown>) => {
      if (evento.type === "mesa:ping" && evento.mesaId === mesa.id && evento.ping) {
        const bruto = evento.ping as PingVisual & { autorId?: string };
        if (bruto.autorId !== user.id) {
          agregarPingVisual(bruto);
        }
        return;
      }

      if (evento.type === "pizarra:actualizada" && evento.mesaId === mesa.id) {
        if (evento.autorId !== user.id && evento.estado && typeof evento.estado === "object") {
          aplicarEstadoPizarraRemoto(
            evento.estado as Parameters<typeof aplicarEstadoPizarraRemoto>[0]
          );
        }
        return;
      }

      if (evento.type === "mesa:mapa-actualizado" && evento.mesaId === mesa.id && evento.mapa) {
        setEstadoMapa(evento.mapa as EstadoMapaCompartido);
        return;
      }

      if (evento.type === "transferencia:recibida" && evento.transferencia) {
        const transferencia = evento.transferencia as PublicTransferencia;
        if (transferencia.mesaId !== mesa.id) return;

        reproducirSonidoNotificacion();
        const solicitud = aSolicitudCliente(transferencia);
        setColaSolicitudes(prev =>
          prev.some(item => item.id === solicitud.id) ? prev : [...prev, solicitud]
        );
        return;
      }

      if (evento.type === "mesa:divisa" && evento.mesaId === mesa.id) {
        const jugadorId = String(evento.jugadorId ?? "");
        const jugadorNombre = String(evento.jugadorNombre ?? "Alguien");
        const delta = Number(evento.delta ?? 0);
        const total = Number(evento.divisa ?? 0);
        const nombreDivisa = String(evento.divisaNombre ?? "Divisa");
        const creado = String(evento.createdAt ?? new Date().toISOString());

        if (delta !== 0) {
          reproducirSonidoMonedas();
          const jugador = jugadores.find(j => (j.userId ?? j.id) === jugadorId);
          if (jugador) {
            const asientoId = jugador.id;
            const prevTimer = timersDivisa.current[asientoId];
            if (prevTimer !== undefined) window.clearTimeout(prevTimer);
            const idDelta = `${Date.now()}-${Math.random()}`;
            setDivisaAsiento(prev => ({
              ...prev,
              [asientoId]: { id: idDelta, delta }
            }));
            timersDivisa.current[asientoId] = window.setTimeout(() => {
              setDivisaAsiento(prev => {
                if (prev[asientoId]?.id !== idDelta) return prev;
                const copia = { ...prev };
                delete copia[asientoId];
                return copia;
              });
              delete timersDivisa.current[asientoId];
            }, 3200);
          }

          const signo = delta > 0 ? `+${delta}` : String(delta);
          setMensajesChat(prev => [
            ...prev,
            {
              id: `divisa-${Date.now()}-${Math.random()}`,
              autorId: jugadorId,
              autorNombre: jugadorNombre,
              texto: `${signo} ${nombreDivisa} (Total: ${total})`,
              destinatarioId: null,
              destinatarioNombre: null,
              createdAt: creado,
              esSistema: true,
              esDivisa: true
            }
          ]);
        }
        return;
      }

      if (evento.type === "transferencia:resuelta") {
        const nombre = String(evento.receptorNombre ?? "El jugador");
        if (evento.estado === "ACEPTADA") {
          mostrarAvisoBreve(`${nombre} aceptó lo que le pasaste.`);
          if (evento.tipo === "objeto" && evento.objeto && typeof evento.objeto === "object") {
            const obj = evento.objeto as { idOrigen?: string; cantidad?: number };
            if (obj.idOrigen) {
              const cant = Math.max(1, obj.cantidad ?? 1);
              setMochila(prev =>
                prev.flatMap(item => {
                  if (item.id !== obj.idOrigen) return [item];
                  const restante = item.cantidad - cant;
                  return restante > 0 ? [{ ...item, cantidad: restante }] : [];
                })
              );
              setElementosMesa(prev =>
                prev.flatMap(el => {
                  if (el.id !== obj.idOrigen || el.tipo !== "objeto") return [el];
                  const restante = el.cantidad - cant;
                  return restante > 0 ? [{ ...el, cantidad: restante }] : [];
                })
              );
            }
          }
        } else if (evento.estado === "RECHAZADA") {
          mostrarAvisoBreve(`${nombre} rechazó la transferencia.`);
        }
      }
    },
    [
      mesa.id,
      user.id,
      jugadores,
      aplicarEstadoPizarraRemoto,
      agregarPingVisual,
      mostrarAvisoBreve
    ]
  );

  async function enviarElemento(destino: JugadorPreview, elemento: ElementoMesa) {
    if (!destino.usuarioId) return;
    setError(null);
    try {
      if (elemento.tipo === "posit") {
        await mesasApi.compartir(mesa.id, {
          receptorId: destino.usuarioId,
          tipo: "posit",
          posit: {
            texto: elemento.texto,
            color: elemento.color,
            giro: elemento.giro
          }
        });
      } else if (elemento.tipo === "objeto") {
        await mesasApi.compartir(mesa.id, {
          receptorId: destino.usuarioId,
          tipo: "objeto",
          objeto: {
            idOrigen: elemento.id,
            nombre: elemento.nombre,
            descripcion: elemento.descripcion,
            cantidad: elemento.cantidad,
            emoji: elemento.emoji,
            archivoId: elemento.archivoId,
            archivoNombre: elemento.archivoNombre
          }
        });
      } else {
        await mesasApi.compartir(mesa.id, {
          receptorId: destino.usuarioId,
          tipo: "archivo",
          archivoId: elemento.archivoId
        });
      }
      mostrarAvisoBreve(`Solicitud enviada a ${destino.nombre}.`);
    } catch (envioError) {
      setError(describeError(envioError));
    }
  }

  async function enviarObjetoMochila(
    destino: JugadorPreview,
    objeto: ObjetoMochila,
    cantidadEnviar: number = 1
  ) {
    if (!destino.usuarioId) return;
    setError(null);
    try {
      await mesasApi.compartir(mesa.id, {
        receptorId: destino.usuarioId,
        tipo: "objeto",
        objeto: {
          idOrigen: objeto.id,
          nombre: objeto.nombre,
          descripcion: objeto.descripcion,
          cantidad: Math.max(1, Math.min(objeto.cantidad, cantidadEnviar)),
          emoji: objeto.emoji,
          archivoId: objeto.archivoId,
          archivoNombre: objeto.archivoNombre
        }
      });
      mostrarAvisoBreve(`Objeto enviado a ${destino.nombre}.`);
    } catch (envioError) {
      setError(describeError(envioError));
    }
  }

  async function aceptarSolicitud(solicitud: SolicitudTransferencia) {
    setError(null);
    try {
      const res = await mesasApi.aceptarCompartir(mesa.id, solicitud.id);
      const pos = calcularPosicionRecepcion(recepcionesRef.current);
      recepcionesRef.current += 1;

      if (res.tipo === "posit") {
        setElementosMesa(prev => [
          ...prev,
          {
            id: nuevoIdElemento(),
            tipo: "posit",
            texto: res.posit.texto,
            color: res.posit.color,
            giro: res.posit.giro,
            x: pos.x,
            y: pos.y,
            remitente: solicitud.emisorNombre
          }
        ]);
      } else if (res.tipo === "objeto") {
        const pasoObj = (recepcionesRef.current - 1) % 6;
        const posObj = {
          x: Number((50 + ((pasoObj % 3) - 1) * 5).toFixed(2)),
          y: Number((70.5 + Math.floor(pasoObj / 3) * 3.5).toFixed(2))
        };
        setElementosMesa(prev => [
          ...prev,
          {
            id: nuevoIdElemento(),
            tipo: "objeto",
            nombre: res.objeto.nombre,
            descripcion: res.objeto.descripcion,
            cantidad: Math.max(1, res.objeto.cantidad),
            ...(res.objeto.emoji ? { emoji: res.objeto.emoji } : {}),
            ...(res.objeto.archivoId ? { archivoId: res.objeto.archivoId } : {}),
            ...(res.objeto.archivoNombre ? { archivoNombre: res.objeto.archivoNombre } : {}),
            x: posObj.x,
            y: posObj.y,
            remitente: solicitud.emisorNombre
          }
        ]);
        if (res.objeto.archivoId) cargarArchivos();
      } else {
        setElementosMesa(prev => [
          ...prev,
          crearElementoDesdeArchivo(res.archivo, pos, solicitud.emisorNombre)
        ]);
        cargarArchivos();
      }
      setColaSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
    } catch (aceptarError) {
      setError(describeError(aceptarError));
      setColaSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
    }
  }

  async function rechazarSolicitud(solicitud: SolicitudTransferencia) {
    setColaSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
    try {
      await mesasApi.rechazarCompartir(mesa.id, solicitud.id);
    } catch {
      // Si ya no estaba pendiente, no interrumpimos al usuario.
    }
  }

  const alRecibirMensajeChat = useCallback(
    (mensaje: MensajeChat) => {
      if (mensaje.mesaId !== mesa.id) return;
      setMensajesChat(prev =>
        prev.some(item => item.id === mensaje.id) ? prev : [...prev, mensaje]
      );
    },
    [mesa.id]
  );

  const alRecibirTirada = useCallback(
    (roll: EventoTirada) => {
      if (roll.mesaId !== mesa.id) return;

      const jugador = jugadores.find(j => (j.userId ?? j.id) === roll.jugadorId);
      if (jugador) {
        const asientoId = jugador.id;
        const prevTimer = timersAsiento.current[asientoId];
        if (prevTimer !== undefined) {
          window.clearTimeout(prevTimer);
        }

        const dados = Array.isArray(roll.dados) ? roll.dados : [];
        const mod = roll.bonificador ?? 0;
        const tieneDesglose = dados.length > 1 || mod !== 0;
        const modTxt = mod > 0 ? ` + ${mod}` : mod < 0 ? ` - ${Math.abs(mod)}` : "";
        const desglose = tieneDesglose
          ? `${dados.join(" + ")}${modTxt} = ${roll.total}`
          : undefined;

        setTiradasAsiento(prev => ({
          ...prev,
          [asientoId]: {
            id: roll.id,
            total: roll.total,
            especial: roll.especial ?? null,
            caras: roll.caras ?? 20,
            desglose
          }
        }));

        timersAsiento.current[asientoId] = window.setTimeout(() => {
          setTiradasAsiento(prev => {
            if (prev[asientoId]?.id !== roll.id) return prev;
            const copia = { ...prev };
            delete copia[asientoId];
            return copia;
          });
          delete timersAsiento.current[asientoId];
        }, DURACION_D20_ASIENTO);
      }

      reproducirSonidoTirada(roll.especial ?? null);

      setMensajesChat(prev => {
        const idSistema = `roll-${roll.id}`;
        if (prev.some(item => item.id === idSistema)) return prev;
        return [
          ...prev,
          {
            id: idSistema,
            autorId: roll.jugadorId,
            autorNombre: roll.jugadorNombre,
            texto: `Tiró ${roll.formula} → ${roll.total}`,
            destinatarioId: roll.soloMaster ? mesa.hostId : null,
            destinatarioNombre: roll.soloMaster ? mesa.hostName : null,
            createdAt: roll.createdAt,
            esSistema: true
          }
        ];
      });
    },
    [jugadores, mesa.hostId, mesa.hostName, mesa.id]
  );

  useMesasLive(
    refrescar,
    onSessionExpired,
    {
      onChatMessage: alRecibirMensajeChat,
      onDiceRoll: alRecibirTirada
    },
    alMensajeEnVivo
  );

  async function enviarChat(texto: string, destinatarioId: string | null): Promise<void> {
    setError(null);
    try {
      const creado = await mesasApi.enviarChat(mesa.id, texto, destinatarioId);
      setMensajesChat(prev =>
        prev.some(item => item.id === creado.id) ? prev : [...prev, creado]
      );
    } catch (chatError) {
      setError(describeError(chatError));
    }
  }

  async function enviarTiradaPublica(tirada: {
    total: number;
    formula: string;
    dados: number[];
    bonificador: number;
    caras: number;
    especial: TipoEspecialTirada;
    soloMaster?: boolean;
  }): Promise<void> {
    try {
      await mesasApi.enviarTirada(mesa.id, {
        ...tirada,
        secreta: false,
        soloMaster: Boolean(tirada.soloMaster)
      });
    } catch (tiradaError) {
      setError(describeError(tiradaError));
    }
  }

  async function cambiarDivisa(nueva: number, delta: number): Promise<void> {
    const limpia = Math.max(0, Math.trunc(nueva));
    setDivisa(limpia);
    try {
      await mesasApi.guardarDivisa(mesa.id, limpia, delta);
    } catch (divisaError) {
      setError(describeError(divisaError));
    }
  }

  async function cambiarDivisaNombre(nombre: string): Promise<void> {
    try {
      const actualizada = await mesasApi.cambiarDivisaNombre(mesa.id, nombre);
      onActualizarMesa(actualizada);
    } catch (divisaError) {
      setError(describeError(divisaError));
    }
  }

  async function cambiarApodo(apodo: string): Promise<void> {
    setError(null);
    try {
      const actualizada = await mesasApi.cambiarApodo(mesa.id, apodo);
      onActualizarMesa(actualizada);
    } catch (apodoError) {
      setError(describeError(apodoError));
    }
  }

  async function volverAEspera() {
    if (!esMaster) {
      onVolver();
      return;
    }

    setError(null);
    try {
      const actualizada = await mesasApi.terminar(mesa.id);
      onActualizarMesa(actualizada);
      onVolver();
    } catch (volverError) {
      setError(describeError(volverError));
    }
  }

  const yoAsientoId =
    jugadores.find(j => j.usuarioId === user.id)?.id ?? "master";

  async function cambiarEscena(imagen: ImagenEscenaPreview | null) {
    if (!esMaster) return;
    setError(null);
    try {
      const actualizada = await mesasApi.ponerEscena(
        mesa.id,
        imagen ? imagen.id : null,
        imagen ? imagen.titulo : null
      );
      onActualizarMesa(actualizada);
    } catch (escenaError) {
      setError(describeError(escenaError));
    }
  }

  async function proyectarImagen(imagen: ImagenEscenaPreview | null) {
    if (!esMaster) return;
    setError(null);
    setProyeccionOcultadaId(null);
    try {
      const actualizada = await mesasApi.proyectar(
        mesa.id,
        imagen ? imagen.id : null,
        imagen ? imagen.titulo : null
      );
      onActualizarMesa(actualizada);
    } catch (proyeccionError) {
      setError(describeError(proyeccionError));
    }
  }

  function enviarPing(datos: {
    x: number;
    y: number;
    vista: "pizarra" | "escena" | "mapa";
  }): void {
    const ping: PingVisual = {
      id: crypto.randomUUID(),
      x: datos.x,
      y: datos.y,
      color: colorJugadorActual,
      vista: datos.vista,
      autorNombre: nombreJugadorActual
    };
    agregarPingVisual(ping);
    void mesasApi
      .enviarPing(mesa.id, {
        x: datos.x,
        y: datos.y,
        vista: datos.vista,
        color: colorJugadorActual
      })
      .catch(() => undefined);
  }

  async function cambiarFondoYRejilla(
    fondo: MapaFondoConfig | null,
    rejilla: MapaRejillaConfig
  ): Promise<void> {
    setEstadoMapa(prev => ({ ...prev, fondo, rejilla }));
    try {
      const actualizado = await mesasApi.guardarMapaFondo(mesa.id, { fondo, rejilla });
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function crearTokenMapa(
    token: Omit<TokenMapa, "id" | "autorId" | "autorNombre" | "autorColor">,
    guardarPlantilla = false,
    categoria?: string
  ): Promise<void> {
    try {
      const actualizado = await mesasApi.crearTokenMapa(mesa.id, {
        ...token,
        guardarPlantilla,
        ...(categoria !== undefined ? { categoria } : {})
      });
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function actualizarTokenMapa(
    tokenId: string,
    patch: Partial<Pick<TokenMapa, "x" | "y" | "celdasAncho" | "celdasAlto" | "escala" | "nombre">>
  ): Promise<void> {
    setEstadoMapa(prev => ({
      ...prev,
      tokens: prev.tokens.map(t => (t.id === tokenId ? { ...t, ...patch } : t))
    }));
    try {
      const actualizado = await mesasApi.actualizarTokenMapa(mesa.id, tokenId, patch);
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function eliminarTokenMapa(tokenId: string): Promise<void> {
    setEstadoMapa(prev => ({
      ...prev,
      tokens: prev.tokens.filter(t => t.id !== tokenId)
    }));
    try {
      const actualizado = await mesasApi.eliminarTokenMapa(mesa.id, tokenId);
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function actualizarPlantillaMapa(
    plantillaId: string,
    patch: { categoria?: string; nombre?: string }
  ): Promise<void> {
    setEstadoMapa(prev => ({
      ...prev,
      plantillas: prev.plantillas.map(p => {
        if (p.id !== plantillaId) return p;
        const siguiente = { ...p } as PlantillaTokenMapa & { categoria?: string };
        if (patch.nombre !== undefined && patch.nombre.trim()) {
          siguiente.nombre = patch.nombre.trim().slice(0, 120);
        }
        if (patch.categoria !== undefined) {
          const cat = patch.categoria.trim().slice(0, 40);
          if (cat) {
            siguiente.categoria = cat;
          } else {
            delete siguiente.categoria;
          }
        }
        return siguiente;
      })
    }));
    try {
      const actualizado = await mesasApi.actualizarPlantillaMapa(
        mesa.id,
        plantillaId,
        patch
      );
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function eliminarPlantillaMapa(plantillaId: string): Promise<void> {
    setEstadoMapa(prev => ({
      ...prev,
      plantillas: prev.plantillas.filter(p => p.id !== plantillaId)
    }));
    try {
      const actualizado = await mesasApi.eliminarPlantillaMapa(mesa.id, plantillaId);
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function cambiarIniciativaMapa(iniciativa: MapaIniciativaEstado): Promise<void> {
    setEstadoMapa(prev => ({ ...prev, iniciativa }));
    try {
      const actualizado = await mesasApi.guardarMapaIniciativa(mesa.id, iniciativa);
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function terminarTurnoIniciativaMapa(): Promise<void> {
    try {
      const actualizado = await mesasApi.avanzarTurnoMapa(mesa.id);
      if (actualizado) setEstadoMapa(actualizado);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function subirImagenMapa(
    archivo: File,
    _categoria: "escena" | "token"
  ): Promise<{ archivoId?: string; url: string; titulo: string }> {
    const subido = await archivosApi.subir(archivo);
    cargarArchivos();
    return {
      archivoId: subido.id,
      url: archivosApi.url(subido.id),
      titulo: subido.nombre
    };
  }

  let contenido: ReactNode;
  if (fase === "pizarra") {
    contenido = (
      <Pizarra
        posits={posits}
        onPosits={setPosits}
        trazos={trazosPizarra}
        onTrazos={setTrazosPizarra}
        documentosPizarra={documentosPizarra}
        onDocumentosPizarra={setDocumentosPizarra}
        trazosEscena={trazosEscena}
        onTrazosEscena={setTrazosEscena}
        positsEscena={positsEscena}
        onPositsEscena={setPositsEscena}
        docsEscena={docsEscena}
        onDocsEscena={setDocsEscena}
        tamanoImagenesEscena={tamanoImagenesEscena}
        onTamanoImagenesEscena={setTamanoImagenesEscena}
        congelada={pizarraCongelada}
        onCongelada={setPizarraCongelada}
        onVolver={() => setFase("sala")}
        esMaster={esMaster}
        colorJugador={colorJugadorActual}
        nombreJugador={nombreJugadorActual}
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={cambiarEscena}
        onProyectarImagen={proyectarImagen}
        onArchivosCambiados={cargarArchivos}
        pingsActivos={pingsActivos}
        onEnviarPing={enviarPing}
      />
    );
  } else if (fase === "mapa") {
    contenido = (
      <>
        <Mapa
          onVolver={() => setFase("sala")}
          pingsActivos={pingsActivos}
          onEnviarPing={enviarPing}
          colorJugador={colorJugadorActual}
          nombreJugador={nombreJugadorActual}
          esMaster={esMaster}
          miUsuarioId={user.id}
          jugadores={jugadores}
          tiradasAsiento={tiradasAsiento}
          estadoMapa={estadoMapa}
          onCambiarFondoYRejilla={cambiarFondoYRejilla}
          onCrearToken={crearTokenMapa}
          onActualizarToken={actualizarTokenMapa}
          onEliminarToken={eliminarTokenMapa}
          onActualizarPlantilla={actualizarPlantillaMapa}
          onEliminarPlantilla={eliminarPlantillaMapa}
          onCambiarIniciativa={cambiarIniciativaMapa}
          onTerminarTurnoIniciativa={terminarTurnoIniciativaMapa}
          archivosDisponibles={archivosDisponibles}
          onSubirImagenMapa={subirImagenMapa}
        />
        <HudSalaCompartido
          jugadores={jugadores}
          esMaster={esMaster}
          miUsuarioId={user.id}
          hostName={mesa.hostName}
          yoAsientoId={yoAsientoId}
          mensajesChat={mensajesChat}
          onEnviarChat={enviarChat}
          onTiradaPublica={enviarTiradaPublica}
          macros={macros}
          onMacros={actualizarMacros}
          divisa={divisa}
          divisaNombre={mesa.divisaNombre ?? "Divisa"}
          onCambiarDivisa={cambiarDivisa}
          onCambiarDivisaNombre={esMaster ? cambiarDivisaNombre : undefined}
          mochila={mochila}
          onMochila={setMochila}
          onEnviarObjetoMochila={enviarObjetoMochila}
          onConsultarResumenMaster={
            esMaster
              ? async () => {
                const res = await mesasApi.resumenInventarioMaster(mesa.id);
                return res.jugadores;
              }
              : undefined
          }
          onSolicitarArchivos={cargarArchivos}
        />
      </>
    );
  } else if (fase === "archivador") {
    contenido = (
      <Archivador
        elementosMesa={elementosMesa}
        onElementosMesa={setElementosMesa}
        onVolver={() => setFase("sala")}
        esMaster={esMaster}
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={cambiarEscena}
        onProyectarImagen={proyectarImagen}
        onArchivosCambio={setArchivosDisponibles}
        proyeccionOculta={proyeccionOculta}
        onReabrirProyeccion={() => setProyeccionOcultadaId(null)}
      />
    );
  } else {
    contenido = (
      <Sala
        jugadores={jugadores}
        calibracion={calibracion}
        onCalibracion={setCalibracion}
        onAbrirPizarra={() => setFase("pizarra")}
        onAbrirMapa={() => setFase("mapa")}
        onAbrirArchivador={() => setFase("archivador")}
        onVolver={volverAEspera}
        hostName={mesa.hostName}
        esMaster={esMaster}
        miUsuarioId={user.id}
        mensajesChat={mensajesChat}
        onEnviarChat={enviarChat}
        tiradasAsiento={tiradasAsiento}
        onTiradaPublica={enviarTiradaPublica}
        colorJugador={colorJugadorActual}
        nombreJugador={nombreJugadorActual}
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={cambiarEscena}
        onProyectarImagen={proyectarImagen}
        proyeccionOculta={proyeccionOculta}
        onReabrirProyeccion={() => setProyeccionOcultadaId(null)}
        yoAsientoId={yoAsientoId}
        posits={posits}
        elementosMesa={elementosMesa}
        onElementosMesa={setElementosMesa}
        archivosDisponibles={archivosDisponibles}
        onSolicitarArchivos={cargarArchivos}
        onEnviarElemento={enviarElemento}
        solicitudPendiente={colaSolicitudes[0] ?? null}
        onAceptarSolicitud={s => void aceptarSolicitud(s)}
        onRechazarSolicitud={s => void rechazarSolicitud(s)}
        macros={macros}
        onMacros={actualizarMacros}
        divisa={divisa}
        divisaNombre={mesa.divisaNombre ?? "Divisa"}
        onCambiarDivisa={cambiarDivisa}
        onCambiarDivisaNombre={esMaster ? cambiarDivisaNombre : undefined}
        divisaAsiento={divisaAsiento}
        mochila={mochila}
        onMochila={setMochila}
        onEnviarObjetoMochila={enviarObjetoMochila}
        onConsultarResumenMaster={
          esMaster
            ? async () => {
              const res = await mesasApi.resumenInventarioMaster(mesa.id);
              return res.jugadores;
            }
            : undefined
        }
        onCambiarApodo={!esMaster ? cambiarApodo : undefined}
      />
    );
  }

  return (
    <div>
      {contenido}

      {imagenProyectada && !proyeccionOculta && (
        <ProyeccionMasterModal
          imagen={imagenProyectada}
          esMaster={esMaster}
          onCerrarLocal={() => setProyeccionOcultadaId(imagenProyectada.id)}
          onRetirarTodos={esMaster ? () => void proyectarImagen(null) : undefined}
        />
      )}

      {fase !== "sala" && imagenProyectada && proyeccionOculta && (
        <button
          type="button"
          className="proyeccion-reabrir-flotante"
          onClick={() => setProyeccionOcultadaId(null)}
        >
          Ver imagen del Máster
        </button>
      )}

      {estadoAviso && !error && (
        <div className="sala-aviso sala-aviso-ok">{estadoAviso}</div>
      )}
      {error && (
        <div className="sala-aviso sala-aviso-error">{error}</div>
      )}
    </div>
  );
}

export function SalaReal(props: SalaRealProps) {
  return <SalaRealContent key={props.user.id} {...props} />;
}
