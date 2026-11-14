import { useCallback, useEffect, useRef, useState } from "react";
import { Lobby } from "./Lobby";
import { Mapa } from "./Mapa";
import { Pizarra } from "./Pizarra";
import { Sala } from "./Sala";
import {
  cargarCalibracion,
  cargarJugadores,
  cargarPosits,
  guardarCalibracion,
  guardarJugadores,
  guardarPosits
} from "./calibracion";
import {
  ARCHIVOS_PREVIEW_INICIALES,
  calcularPosicionRecepcion,
  crearElementoDesdeArchivo,
  nuevoIdElemento
} from "./compartir";
import { reproducirSonidoNotificacion } from "./sonido";
import type {
  Calibracion,
  ElementoMesa,
  FasePreview,
  JugadorPreview,
  PositPreview,
  SolicitudTransferencia
} from "./tipos";
import "./preview.css";

/**
 * Preview aislada de la sala (Fase 0): sin backend, sin login, sin sonido y con
 * datos falsos. Se abre en desarrollo con `?preview=1`.
 */
/** Permite abrir directamente una fase: `?preview=1&fase=sala`. */
function faseInicial(): FasePreview {
  const valor = new URLSearchParams(window.location.search).get("fase");
  return valor === "sala" || valor === "pizarra" || valor === "mapa"
    ? valor
    : "lobby";
}

export default function PreviewApp() {
  const [fase, setFase] = useState<FasePreview>(faseInicial);
  const [jugadores, setJugadores] = useState<JugadorPreview[]>(cargarJugadores);
  const [calibracion, setCalibracion] = useState<Calibracion>(cargarCalibracion);
  const [posits, setPosits] = useState<PositPreview[]>(cargarPosits);
  const [elementosMesa, setElementosMesa] = useState<ElementoMesa[]>(() => [
    {
      id: "preview-mesa-posit-1",
      tipo: "posit",
      texto: "Arrástrame hacia un jugador o ábreme.",
      color: "#f7ffae",
      giro: -1.8,
      x: 72,
      y: 78
    }
  ]);
  const [solicitudPendiente, setSolicitudPendiente] =
    useState<SolicitudTransferencia | null>(null);
  const [avisoPreview, setAvisoPreview] = useState<string | null>(null);
  const recepcionesRef = useRef(0);
  const simTurnoRef = useRef(0);
  const avisoTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (avisoTimerRef.current !== null) {
        window.clearTimeout(avisoTimerRef.current);
      }
    },
    []
  );

  const mostrarAvisoPreview = useCallback((texto: string) => {
    setAvisoPreview(texto);
    if (avisoTimerRef.current !== null) {
      window.clearTimeout(avisoTimerRef.current);
    }
    avisoTimerRef.current = window.setTimeout(() => setAvisoPreview(null), 3200);
  }, []);

  const simularRecepcion = useCallback(() => {
    const remitente =
      jugadores.find(j => j.activo && j.id !== "master")?.nombre ?? "Aria";
    const turno = simTurnoRef.current;
    simTurnoRef.current += 1;

    reproducirSonidoNotificacion();

    if (turno % 2 === 0) {
      const archivo =
        ARCHIVOS_PREVIEW_INICIALES[turno % ARCHIVOS_PREVIEW_INICIALES.length];
      setSolicitudPendiente({
        id: nuevoIdElemento(),
        emisorNombre: remitente,
        tipo: "archivo",
        nombreArchivo: archivo.nombre,
        mimeArchivo: archivo.tipo,
        vistaArchivo: archivo.vista
      });
      return;
    }

    setSolicitudPendiente({
      id: nuevoIdElemento(),
      emisorNombre: remitente,
      tipo: "posit",
      textoPosit: "Clave del cofre: luna menguante.",
      colorPosit: "#96fbc7",
      giroPosit: -1.5
    });
  }, [jugadores]);

  const aceptarSolicitudPreview = useCallback(
    (solicitud: SolicitudTransferencia) => {
      const pos = calcularPosicionRecepcion(recepcionesRef.current);
      recepcionesRef.current += 1;

      if (solicitud.tipo === "posit") {
        setElementosMesa(prev => [
          ...prev,
          {
            id: nuevoIdElemento(),
            tipo: "posit",
            texto: solicitud.textoPosit ?? "",
            color: solicitud.colorPosit ?? "#96fbc7",
            giro: solicitud.giroPosit ?? -1.5,
            x: pos.x,
            y: pos.y,
            remitente: solicitud.emisorNombre
          }
        ]);
      } else {
        const archivo =
          ARCHIVOS_PREVIEW_INICIALES.find(
            a => a.nombre === solicitud.nombreArchivo
          ) ?? ARCHIVOS_PREVIEW_INICIALES[0];
        setElementosMesa(prev => [
          ...prev,
          crearElementoDesdeArchivo(archivo, pos, solicitud.emisorNombre)
        ]);
      }

      setSolicitudPendiente(null);
    },
    []
  );

  useEffect(() => {
    guardarJugadores(jugadores);
  }, [jugadores]);

  useEffect(() => {
    guardarCalibracion(calibracion);
  }, [calibracion]);

  useEffect(() => {
    guardarPosits(posits);
  }, [posits]);

  const volverASala = useCallback(() => setFase("sala"), []);

  if (fase === "lobby") {
    return (
      <Lobby
        jugadores={jugadores}
        onJugadores={setJugadores}
        onEmpezar={() => setFase("sala")}
      />
    );
  }

  if (fase === "pizarra") {
    return <Pizarra posits={posits} onPosits={setPosits} onVolver={volverASala} />;
  }

  if (fase === "mapa") {
    return <Mapa onVolver={volverASala} />;
  }

  return (
    <>
      <Sala
        jugadores={jugadores}
        calibracion={calibracion}
        onCalibracion={setCalibracion}
        onAbrirPizarra={() => setFase("pizarra")}
        onAbrirMapa={() => setFase("mapa")}
        onVolver={() => setFase("lobby")}
        yoAsientoId="master"
        posits={posits}
        elementosMesa={elementosMesa}
        onElementosMesa={setElementosMesa}
        archivosDisponibles={ARCHIVOS_PREVIEW_INICIALES}
        onEnviarElemento={(destino, elemento) => {
          const etiqueta =
            elemento.tipo === "posit" ? "nota" : elemento.nombre;
          mostrarAvisoPreview(`Enviado (${etiqueta}) a ${destino.nombre} (modo preview).`);
        }}
        solicitudPendiente={solicitudPendiente}
        onAceptarSolicitud={aceptarSolicitudPreview}
        onRechazarSolicitud={() => setSolicitudPendiente(null)}
        onSimularRecepcion={simularRecepcion}
      />
      {avisoPreview && (
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
          {avisoPreview}
        </div>
      )}
    </>
  );
}
