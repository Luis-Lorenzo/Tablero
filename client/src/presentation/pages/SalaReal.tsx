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
import { Pizarra } from "../../preview/Pizarra";
import { Mapa } from "../../preview/Mapa";
import { reproducirSonidoTirada } from "../../preview/sonidoDados";
import { Archivador, ProyeccionMasterModal } from "../../preview/Archivador";
import {
  CLAVE_DOCS_PIZARRA,
  CLAVE_PIZARRA_CONGELADA,
  CLAVE_POSITS,
  CLAVE_TRAZOS_PIZARRA,
  cargarCalibracion,
  cargarDocumentosPizarra,
  cargarPizarraCongelada,
  cargarPosits,
  cargarTrazosPizarra,
  guardarCalibracion,
  guardarDocumentosPizarra,
  guardarPizarraCongelada,
  guardarPosits,
  guardarTrazosPizarra
} from "../../preview/calibracion";
import {
  calcularPosicionRecepcion,
  crearElementoDesdeArchivo,
  nuevoIdElemento
} from "../../preview/compartir";
import { reproducirSonidoNotificacion } from "../../preview/sonido";
import type {
  Calibracion,
  DocumentoMesa,
  ElementoMesa,
  ImagenEscenaPreview,
  JugadorPreview,
  MensajeSala,
  PositPreview,
  SolicitudTransferencia,
  TipoEspecialTirada,
  TiradaAsiento,
  TrazoPizarra
} from "../../preview/tipos";
import "../../preview/preview.css";

interface SalaRealProps {
  mesa: PublicMesa;
  user: PublicUser;
  onActualizarMesa: (mesa: PublicMesa) => void;
  onVolver: () => void;
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
  const [posits, setPosits] = useState<PositPreview[]>(cargarPosits);
  const [elementosMesa, setElementosMesa] = useState<ElementoMesa[]>([]);
  const [archivosDisponibles, setArchivosDisponibles] = useState<PublicArchivo[]>([]);
  const [colaSolicitudes, setColaSolicitudes] = useState<SolicitudTransferencia[]>([]);
  const [estadoAviso, setEstadoAviso] = useState<string | null>(null);
  const [trazosPizarra, setTrazosPizarra] =
    useState<TrazoPizarra[]>(cargarTrazosPizarra);
  const [documentosPizarra, setDocumentosPizarra] = useState<DocumentoMesa[]>(
    cargarDocumentosPizarra
  );
  const [pizarraCongelada, setPizarraCongelada] = useState<boolean>(
    cargarPizarraCongelada
  );
  const [proyeccionOcultadaId, setProyeccionOcultadaId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [mensajesChat, setMensajesChat] = useState<MensajeSala[]>([]);
  const [tiradasAsiento, setTiradasAsiento] = useState<Record<string, TiradaAsiento>>({});

  const recepcionesRef = useRef(0);
  const avisoTimerRef = useRef<number | null>(null);
  const timersAsiento = useRef<Record<string, number>>({});
  const estadoCargadoRef = useRef(false);
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

  useEffect(() => {
    guardarPosits(posits);
  }, [posits]);

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
    guardarTrazosPizarra(trazosPizarra);
  }, [trazosPizarra]);

  useEffect(() => {
    guardarDocumentosPizarra(documentosPizarra);
  }, [documentosPizarra]);

  useEffect(() => {
    guardarPizarraCongelada(pizarraCongelada);
  }, [pizarraCongelada]);

  useEffect(() => {
    function alCambiarStorage(evento: StorageEvent) {
      if (evento.key === CLAVE_POSITS) setPosits(cargarPosits());
      if (evento.key === CLAVE_TRAZOS_PIZARRA) {
        setTrazosPizarra(cargarTrazosPizarra());
      }
      if (evento.key === CLAVE_DOCS_PIZARRA) {
        setDocumentosPizarra(cargarDocumentosPizarra());
      }
      if (evento.key === CLAVE_PIZARRA_CONGELADA) {
        setPizarraCongelada(cargarPizarraCongelada());
      }
    }
    window.addEventListener("storage", alCambiarStorage);
    return () => window.removeEventListener("storage", alCambiarStorage);
  }, []);

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
          : el
      );
      void mesasApi.guardarEstado(mesa.id, limpios).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [mesa.id, elementosMesa]);
  const refrescar = useCallback(async () => {
    try {
      const actualizada = await mesasApi.obtener(mesa.id);
      const sigueEnMesa =
        actualizada.hostId === user.id ||
        actualizada.players.some(p => p.id === user.id);
      if (!sigueEnMesa) {
        onVolver();
        return;
      }
      onActualizarMesa(actualizada);
    } catch (refrescoError) {
      if (
        refrescoError instanceof ApiError &&
        (refrescoError.status === 403 || refrescoError.status === 404)
      ) {
        onVolver();
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
    void mesasApi
      .pendientesCompartir(mesa.id)
      .then(lista => {
        if (!activo || lista.length === 0) return;
        setColaSolicitudes(prev => {
          const existentes = new Set(prev.map(s => s.id));
          const nuevas = lista
            .filter(t => !existentes.has(t.id))
            .map(aSolicitudCliente);
          return nuevas.length > 0 ? [...prev, ...nuevas] : prev;
        });
      })
      .catch(() => undefined);

    void archivosApi
      .listar()
      .then(lista => {
        if (activo) setArchivosDisponibles(lista);
      })
      .catch(() => undefined);

    return () => {
      activo = false;
    };
  }, [mesa.id]);

  const alMensajeEnVivo = useCallback(
    (evento: Record<string, unknown>) => {
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

      if (evento.type === "transferencia:resuelta") {
        const nombre = String(evento.receptorNombre ?? "El jugador");
        if (evento.estado === "ACEPTADA") {
          mostrarAvisoBreve(`${nombre} aceptó lo que le pasaste.`);
        } else if (evento.estado === "RECHAZADA") {
          mostrarAvisoBreve(`${nombre} rechazó la transferencia.`);
        }
      }
    },
    [mesa.id, mostrarAvisoBreve]
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
            destinatarioId: null,
            destinatarioNombre: null,
            createdAt: roll.createdAt,
            esSistema: true
          }
        ];
      });
    },
    [jugadores, mesa.id]
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
  }): Promise<void> {
    try {
      await mesasApi.enviarTirada(mesa.id, { ...tirada, secreta: false });
    } catch (tiradaError) {
      setError(describeError(tiradaError));
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
      />
    );
  } else if (fase === "mapa") {
    contenido = <Mapa onVolver={() => setFase("sala")} />;
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
