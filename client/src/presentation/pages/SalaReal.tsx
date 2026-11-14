import { useCallback, useEffect, useState, type ReactNode } from "react";
import { mesasApi } from "../../api/mesas.api";
import type { PublicMesa, PublicUser } from "../../api/types";
import { describeError } from "../errorMessages";
import { useMesasLive } from "../hooks/useMesasLive";
import { Sala } from "../../preview/Sala";
import { Pizarra } from "../../preview/Pizarra";
import { Mapa } from "../../preview/Mapa";
import { Archivador, ProyeccionMasterModal } from "../../preview/Archivador";
import {
  cargarCalibracion,
  cargarDocumentosMesa,
  cargarPosits,
  cargarPositsMesa,
  guardarCalibracion,
  guardarDocumentosMesa,
  guardarPosits,
  guardarPositsMesa
} from "../../preview/calibracion";
import type {
  Calibracion,
  DocumentoMesa,
  ImagenEscenaPreview,
  JugadorPreview,
  PositPreview
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
      nombre: mesa.hostName,
      color: mesa.colores?.[mesa.hostId] ?? "#e8c56a",
      esMaster: true,
      activo: true
    }
  ];

  mesa.players.forEach((jugador, indice) => {
    lista.push({
      id: `p${indice + 1}`,
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
  const [positsMesa, setPositsMesa] = useState<PositPreview[]>(() =>
    cargarPositsMesa(user.id)
  );
  const [documentosMesa, setDocumentosMesa] = useState<DocumentoMesa[]>(() =>
    cargarDocumentosMesa(user.id)
  );
  const [proyeccionOcultadaId, setProyeccionOcultadaId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const esMaster = mesa.hostId === user.id;
  const imagenEscena = mesa.imagenEscena ?? null;
  const imagenProyectada = mesa.imagenProyectada ?? null;
  const proyeccionOculta = Boolean(
    imagenProyectada && proyeccionOcultadaId === imagenProyectada.id
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
    guardarPositsMesa(positsMesa, user.id);
  }, [positsMesa, user.id]);

  useEffect(() => {
    guardarDocumentosMesa(documentosMesa, user.id);
  }, [documentosMesa, user.id]);

  const refrescar = useCallback(async () => {
    try {
      const actualizada = await mesasApi.obtener(mesa.id);
      onActualizarMesa(actualizada);
    } catch (refrescoError) {
      setError(describeError(refrescoError));
    }
  }, [mesa.id, onActualizarMesa]);

  useMesasLive(refrescar, onSessionExpired);

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

  const jugadores = construirJugadores(mesa);

          let contenido: ReactNode;
  if (fase === "pizarra") {
          contenido = (
            <Pizarra
              posits={posits}
              onPosits={setPosits}
              onVolver={() => setFase("sala")}
              esMaster={esMaster}
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
              posits={positsMesa}
              onPosits={setPositsMesa}
              documentosMesa={documentosMesa}
              onDocumentosMesa={setDocumentosMesa}
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
                  positsMesa={positsMesa}
                  onPositsMesa={setPositsMesa}
                  documentosMesa={documentosMesa}
                  onDocumentosMesa={setDocumentosMesa}
                  onAbrirPizarra={() => setFase("pizarra")}
                  onAbrirMapa={() => setFase("mapa")}
                  onAbrirArchivador={() => setFase("archivador")}
                  onVolver={volverAEspera}
                  hostName={mesa.hostName}
                  esMaster={esMaster}
                  imagenEscena={imagenEscena}
                  imagenProyectada={imagenProyectada}
                  onCambiarEscena={cambiarEscena}
                  onProyectarImagen={proyectarImagen}
                  proyeccionOculta={proyeccionOculta}
                  onReabrirProyeccion={() => setProyeccionOcultadaId(null)}
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

              {error && (
                <div
                  style={{
                    position: "fixed",
                    bottom: 20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 80,
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
  return <SalaRealContent key={props.user.id} {...props} />;
}
