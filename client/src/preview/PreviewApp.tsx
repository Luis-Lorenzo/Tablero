import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Archivador, ProyeccionMasterModal } from "./Archivador";
import { Lobby } from "./Lobby";
import { Mapa } from "./Mapa";
import { Pizarra } from "./Pizarra";
import { Sala } from "./Sala";
import {
  cargarCalibracion,
  cargarDocumentosMesa,
  cargarEscenaPreview,
  cargarJugadores,
  cargarPosits,
  cargarPositsMesa,
  cargarProyeccionPreview,
  guardarCalibracion,
  guardarDocumentosMesa,
  guardarEscenaPreview,
  guardarJugadores,
  guardarPosits,
  guardarPositsMesa,
  guardarProyeccionPreview
} from "./calibracion";
import type {
  Calibracion,
  DocumentoMesa,
  FasePreview,
  ImagenEscenaPreview,
  JugadorPreview,
  PositPreview
} from "./tipos";
import "./preview.css";

/**
 * Preview aislada de la sala (Fase 0): sin backend, sin login, sin sonido y con
 * datos falsos. Se abre en desarrollo con `?preview=1`.
 */
/** Permite abrir directamente una fase: `?preview=1&fase=sala`. */
function faseInicial(): FasePreview {
  const valor = new URLSearchParams(window.location.search).get("fase");
  return valor === "sala" ||
    valor === "pizarra" ||
    valor === "mapa" ||
    valor === "archivador"
    ? valor
    : "lobby";
}

export default function PreviewApp() {
  const [fase, setFase] = useState<FasePreview>(faseInicial);
  const [jugadores, setJugadores] = useState<JugadorPreview[]>(cargarJugadores);
  const [calibracion, setCalibracion] = useState<Calibracion>(cargarCalibracion);
  const [posits, setPosits] = useState<PositPreview[]>(cargarPosits);
  const [positsMesa, setPositsMesa] = useState<PositPreview[]>(() =>
    cargarPositsMesa("preview")
  );
  const [documentosMesa, setDocumentosMesa] = useState<DocumentoMesa[]>(() =>
    cargarDocumentosMesa("preview")
  );
  const [imagenEscena, setImagenEscena] = useState<ImagenEscenaPreview | null>(
    cargarEscenaPreview
  );
  const [imagenProyectada, setImagenProyectada] =
    useState<ImagenEscenaPreview | null>(cargarProyeccionPreview);
  const [proyeccionOcultadaId, setProyeccionOcultadaId] = useState<
    string | null
  >(null);

  useEffect(() => {
    guardarJugadores(jugadores);
  }, [jugadores]);

  useEffect(() => {
    guardarCalibracion(calibracion);
  }, [calibracion]);

  useEffect(() => {
    guardarPosits(posits);
  }, [posits]);

  useEffect(() => {
    guardarPositsMesa(positsMesa, "preview");
  }, [positsMesa]);

  useEffect(() => {
    guardarDocumentosMesa(documentosMesa, "preview");
  }, [documentosMesa]);

  useEffect(() => {
    guardarEscenaPreview(imagenEscena);
  }, [imagenEscena]);

  useEffect(() => {
    guardarProyeccionPreview(imagenProyectada);
  }, [imagenProyectada]);

  const volverASala = useCallback(() => setFase("sala"), []);
  const proyectar = useCallback((imagen: ImagenEscenaPreview | null) => {
    setProyeccionOcultadaId(null);
    setImagenProyectada(imagen);
  }, []);

  const proyeccionOculta = Boolean(
    imagenProyectada && proyeccionOcultadaId === imagenProyectada.id
  );

  let contenido: ReactNode;
  if (fase === "lobby") {
      contenido = (
        <Lobby
          jugadores={jugadores}
          onJugadores={setJugadores}
          onEmpezar={() => setFase("sala")}
        />
      );
  } else if (fase === "pizarra") {
    contenido = (
      <Pizarra
        posits={posits}
        onPosits={setPosits}
        onVolver={volverASala}
        esMaster
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={setImagenEscena}
        onProyectarImagen={proyectar}
      />
    );
  } else if (fase === "mapa") {
    contenido = <Mapa onVolver={volverASala} />;
  } else if (fase === "archivador") {
    contenido = (
      <Archivador
        posits={positsMesa}
        onPosits={setPositsMesa}
        documentosMesa={documentosMesa}
        onDocumentosMesa={setDocumentosMesa}
        onVolver={volverASala}
        esMaster
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={setImagenEscena}
        onProyectarImagen={proyectar}
      />
    );
  } else {
    contenido = (
      <Sala
        jugadores={jugadores}
        calibracion={calibracion}
        onCalibracion={setCalibracion}
        positsMesa={positsMesa}
        onPositsMesa={setPositsMesa}
        documentosMesa={documentosMesa}
        onDocumentosMesa={setDocumentosMesa}
        onAbrirPizarra={() => setFase("pizarra")}
        onAbrirMapa={() => setFase("mapa")}
        onAbrirArchivador={() => setFase("archivador")}
        onVolver={() => setFase("lobby")}
        esMaster
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={setImagenEscena}
        onProyectarImagen={proyectar}
        proyeccionOculta={proyeccionOculta}
        onReabrirProyeccion={() => setProyeccionOcultadaId(null)}
      />
    );
  }

  return (
    <>
      {contenido}
      {imagenProyectada && !proyeccionOculta && (
        <ProyeccionMasterModal
          imagen={imagenProyectada}
          esMaster
          onCerrarLocal={() => setProyeccionOcultadaId(imagenProyectada.id)}
          onRetirarTodos={() => proyectar(null)}
        />
      )}
    </>
  );
}
