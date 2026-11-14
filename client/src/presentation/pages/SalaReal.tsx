import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { EventoTirada, MensajeChat, PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { useMesasLive } from "../hooks/useMesasLive";
import { Sala } from "../../preview/Sala";
import { Pizarra } from "../../preview/Pizarra";
import { Mapa } from "../../preview/Mapa";
import { reproducirSonidoTirada } from "../../preview/sonidoDados";
import {
  cargarCalibracion,
  cargarPosits,
  guardarCalibracion,
  guardarPosits
} from "../../preview/calibracion";
import type {
  Calibracion,
  JugadorPreview,
  MensajeSala,
  PositPreview,
  TipoEspecialTirada,
  TiradaAsiento
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
  const [error, setError] = useState<string | null>(null);
  const [mensajesChat, setMensajesChat] = useState<MensajeSala[]>([]);
  const [tiradasAsiento, setTiradasAsiento] = useState<Record<string, TiradaAsiento>>({});

  const timersAsiento = useRef<Record<string, number>>({});
  const esMaster = mesa.hostId === user.id;
  const jugadores = useMemo(() => construirJugadores(mesa), [mesa]);

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

  const refrescar = useCallback(async () => {
    try {
      const actualizada = await mesasApi.obtener(mesa.id);
      onActualizarMesa(actualizada);
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    }
  }, [mesa.id, onActualizarMesa]);

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

        setTiradasAsiento(prev => ({
          ...prev,
          [asientoId]: {
            id: roll.id,
            total: roll.total,
            especial: roll.especial ?? null
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

  useMesasLive(refrescar, onSessionExpired, {
    onChatMessage: alRecibirMensajeChat,
    onDiceRoll: alRecibirTirada
  });

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
        esMaster={esMaster}
        miUsuarioId={user.id}
        mensajesChat={mensajesChat}
        onEnviarChat={enviarChat}
        tiradasAsiento={tiradasAsiento}
        onTiradaPublica={enviarTiradaPublica}
      />
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
