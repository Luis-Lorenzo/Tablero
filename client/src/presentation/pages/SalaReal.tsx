import { useCallback, useEffect, useRef, useState } from "react";
import { archivosApi } from "../../api/archivos.api";
import { mesasApi } from "../../api/mesas.api";
import type {
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
import {
  cargarCalibracion,
  cargarPosits,
  guardarCalibracion,
  guardarPosits
} from "../../preview/calibracion";
import {
  calcularPosicionRecepcion,
  crearElementoDesdeArchivo,
  nuevoIdElemento
} from "../../preview/compartir";
import { reproducirSonidoNotificacion } from "../../preview/sonido";
import type {
  Calibracion,
  ElementoMesa,
  JugadorPreview,
  PositPreview,
  SolicitudTransferencia
} from "../../preview/tipos";
import "../../preview/preview.css";

interface SalaRealProps {
  mesa: PublicMesa;
  user: PublicUser;
  onActualizarMesa: (mesa: PublicMesa) => void;
  onVolver: () => void;
  onSessionExpired?: () => void;
}

type Fase = "sala" | "pizarra" | "mapa";

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
  const [error, setError] = useState<string | null>(null);

  const recepcionesRef = useRef(0);
  const avisoTimerRef = useRef<number | null>(null);
  const esMaster = mesa.hostId === user.id;

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
    if (fase === "pizarra" || fase === "mapa") {
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

  const refrescar = useCallback(async () => {
    try {
      const actualizada = await mesasApi.obtener(mesa.id);
      onActualizarMesa(actualizada);
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    }
  }, [mesa.id, onActualizarMesa]);

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

  useMesasLive(refrescar, onSessionExpired, alMensajeEnVivo);

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

  const jugadores = construirJugadores(mesa);
  const yoAsientoId =
    jugadores.find(j => j.usuarioId === user.id)?.id ?? "master";

  if (fase === "pizarra") {
    return <Pizarra posits={posits} onPosits={setPosits} onVolver={() => setFase("sala")} />;
  }

  if (fase === "mapa") {
    return <Mapa onVolver={() => setFase("sala")} />;
  }

  return (
    <div>
      <Sala
        jugadores={jugadores}
        calibracion={calibracion}
        onCalibracion={setCalibracion}
        onAbrirPizarra={() => setFase("pizarra")}
        onAbrirMapa={() => setFase("mapa")}
        onVolver={volverAEspera}
        hostName={mesa.hostName}
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
      {estadoAviso && !error && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            padding: "10px 18px",
            borderRadius: "999px",
            border: "1px solid #96fbc7",
            background: "rgba(22, 18, 30, 0.94)",
            color: "#96fbc7",
            fontSize: "0.86rem"
          }}
        >
          {estadoAviso}
        </div>
      )}
      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            padding: "10px 18px",
            borderRadius: 999,
            background: "rgba(180, 60, 60, 0.9)",
            color: "#fff"
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function SalaReal(props: SalaRealProps) {
  return <SalaRealContent {...props} />;
}
