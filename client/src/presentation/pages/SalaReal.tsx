import { useCallback, useEffect, useState } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
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
import type { Calibracion, JugadorPreview, PositPreview } from "../../preview/tipos";
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

function construirJugadores(mesa: PublicMesa, currentUserId: string): JugadorPreview[] {
  const lista: JugadorPreview[] = [
    {
      id: "master",
      nombre: "Máster",
      color: "#e8c56a",
      esMaster: true,
      activo: true
    }
  ];

  mesa.players.forEach((jugador, indice) => {
    lista.push({
      id: jugador.id,
      nombre: jugador.name,
      color: PALETA_COLORES[indice % PALETA_COLORES.length],
      esMaster: false,
      activo: true
    });
  });

  // Marcar si soy yo (no cambia el aspecto, útil para depurar)
  void currentUserId;
  return lista;
}

export function SalaReal({
  mesa,
  user,
  onActualizarMesa,
  onVolver,
  onSessionExpired
}: SalaRealProps) {
  const [fase, setFase] = useState<Fase>("sala");
  const [calibracion, setCalibracion] = useState<Calibracion>(cargarCalibracion);
  const [posits, setPosits] = useState<PositPreview[]>(cargarPosits);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const esMaster = mesa.hostId === user.id;

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
      if (actualizada.estado === "ESPERA") {
        onVolver();
      }
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    }
  }, [mesa.id, onActualizarMesa, onVolver]);

  useMesasLive(refrescar, onSessionExpired);

  async function volverAEspera() {
    if (!esMaster) {
      onVolver();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const actualizada = await mesasApi.terminar(mesa.id);
      onActualizarMesa(actualizada);
      onVolver();
    } catch (volverError) {
      setError(describeError(volverError));
      setBusy(false);
    }
  }

  const jugadores = construirJugadores(mesa, user.id);

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
      />
      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "8px 14px",
          borderRadius: 999,
          background: "rgb(16 13 21 / 82%)",
          color: "#e7ddf2",
          fontFamily: '"Cinzel Decorative", "Times New Roman", serif',
          letterSpacing: "0.06em"
        }}
      >
        <span>{mesa.hostName}</span>
        {esMaster && (
          <button
            type="button"
            className="sala-btn"
            onClick={() => void volverAEspera()}
            disabled={busy}
          >
            {busy ? "Volviendo…" : "Volver a espera"}
          </button>
        )}
      </div>
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
