import { useCallback, useEffect, useState } from "react";
import { Archivador } from "./Archivador";
import { Lobby } from "./Lobby";
import { Mapa } from "./Mapa";
import { Pizarra } from "./Pizarra";
import { Sala } from "./Sala";
import {
  cargarCalibracion,
  cargarDocumentosMesa,
  cargarJugadores,
  cargarPosits,
  cargarPositsMesa,
  guardarCalibracion,
  guardarDocumentosMesa,
  guardarJugadores,
  guardarPosits,
  guardarPositsMesa
} from "./calibracion";
import type {
  Calibracion,
  DocumentoMesa,
  FasePreview,
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

  if (fase === "archivador") {
    return (
      <Archivador
        posits={positsMesa}
        onPosits={setPositsMesa}
        documentosMesa={documentosMesa}
        onDocumentosMesa={setDocumentosMesa}
        onVolver={volverASala}
      />
    );
  }

  return (
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
    />
  );
}
