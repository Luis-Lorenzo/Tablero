import { useCallback, useEffect, useState } from "react";
import { Lobby } from "./Lobby";
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
import type {
  Calibracion,
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
  return valor === "sala" || valor === "pizarra" ? valor : "lobby";
}

export default function PreviewApp() {
  const [fase, setFase] = useState<FasePreview>(faseInicial);
  const [jugadores, setJugadores] = useState<JugadorPreview[]>(cargarJugadores);
  const [calibracion, setCalibracion] = useState<Calibracion>(cargarCalibracion);
  const [posits, setPosits] = useState<PositPreview[]>(cargarPosits);

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

  return (
    <Sala
      jugadores={jugadores}
      calibracion={calibracion}
      onCalibracion={setCalibracion}
      onAbrirPizarra={() => setFase("pizarra")}
      onVolver={() => setFase("lobby")}
    />
  );
}
