import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FileText, FolderOpen, RefreshCw, Users, Radio } from "lucide-react";
import { mesasApi } from "../../api/mesas.api";
import { archivosApi } from "../../api/archivos.api";
import type { PublicArchivo, PublicMesa, PublicUser } from "../../api/types";
import { useMesasLive } from "../hooks/useMesasLive";
import { MiniDadosClicker } from "./MiniDadosClicker";

interface PanelIzquierdoProps {
  user: PublicUser;
  onGestionarMesa: (mesa: PublicMesa) => void;
  onIrRecepcion: () => void;
}

/**
 * Panel lateral izquierdo:
 *  - Arriba: Resumen de la taberna en vivo (mesas activas, jugadores, acceso a tu mesa)
 *            y lista rápida de tus archivos recientes.
 *  - Abajo: Mini-bandeja de dados estilo clicker.
 */
export function PanelIzquierdo({
  user,
  onGestionarMesa,
  onIrRecepcion
}: PanelIzquierdoProps) {
  const [mesas, setMesas] = useState<PublicMesa[]>([]);
  const [archivos, setArchivos] = useState<PublicArchivo[]>([]);
  const [cargandoArchivos, setCargandoArchivos] = useState(false);

  const refrescarTaberna = useCallback(async () => {
    try {
      const lista = await mesasApi.list("");
      setMesas(lista);
    } catch {
      // Silencioso: el panel lateral es informativo.
    }
  }, []);

  const refrescarArchivos = useCallback(async () => {
    setCargandoArchivos(true);
    try {
      const lista = await archivosApi.listar();
      setArchivos(lista.slice(0, 4));
    } catch {
      // Silencioso
    } finally {
      setCargandoArchivos(false);
    }
  }, []);

  useEffect(() => {
    void refrescarTaberna();
    void refrescarArchivos();
  }, [refrescarTaberna, refrescarArchivos]);

  useMesasLive(refrescarTaberna);

  const totalJugadores = mesas.reduce((acc, m) => acc + m.players.length, 0);
  const miMesa = mesas.find(
    m => m.hostId === user.id || m.players.some(p => p.id === user.id)
  );

  return (
    <aside className="panel-lateral panel-izquierdo" aria-label="Resumen de taberna y utilidades">
      <section className="panel-caja taberna-caja">
        <div className="panel-cabecera">
          <span className="panel-titulo-pixel">TABERNA EN VIVO</span>
          <span className="taberna-live-dot" title="Actualización en vivo">
            <Radio size={12} aria-hidden="true" />
          </span>
        </div>

        <div className="taberna-stats">
          <div className="taberna-stat">
            <span className="taberna-stat-num">{mesas.length}</span>
            <span className="taberna-stat-label">Mesas activas</span>
          </div>
          <div className="taberna-stat">
            <span className="taberna-stat-num">{totalJugadores}</span>
            <span className="taberna-stat-label">
              <Users size={11} aria-hidden="true" /> Jugadores
            </span>
          </div>
        </div>

        {miMesa ? (
          <button
            type="button"
            className="primary verde small taberna-mi-mesa"
            onClick={() => onGestionarMesa(miMesa)}
          >
            <span>Ir a Mesa {miMesa.hostName}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="ghost small taberna-mi-mesa"
            onClick={onIrRecepcion}
          >
            <span>Explorar mesas</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </section>

      <section className="panel-caja archivos-rapidos">
        <div className="panel-cabecera">
          <span className="panel-titulo-pixel">ARCHIVOS</span>
          <button
            type="button"
            className="panel-icono-btn"
            onClick={() => void refrescarArchivos()}
            disabled={cargandoArchivos}
            title="Actualizar lista de archivos"
            aria-label="Actualizar lista de archivos"
          >
            <RefreshCw
              size={13}
              className={cargandoArchivos ? "icono-girando" : ""}
              aria-hidden="true"
            />
          </button>
        </div>

        {archivos.length === 0 ? (
          <p className="muted panel-vacio">
            <FolderOpen size={14} aria-hidden="true" />
            <span>Sin archivos aún. Súbelos arriba.</span>
          </p>
        ) : (
          <ul className="archivos-rapidos-lista">
            {archivos.map(archivo => (
              <li key={archivo.id}>
                <a
                  href={archivosApi.url(archivo.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="archivo-rapido-link"
                  title={archivo.nombre}
                >
                  <FileText size={13} aria-hidden="true" />
                  <span>{archivo.nombre}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MiniDadosClicker />
    </aside>
  );
}
