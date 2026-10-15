import { useCallback, useEffect, useRef, useState } from "react";
import { archivosApi } from "../../api/archivos.api";
import type { PublicArchivo } from "../../api/types";
import { describeError } from "../errorMessages";

/** Formatos que acepta el servidor (deben coincidir con `TIPOS_PERMITIDOS`). */
const ACEPTADOS = ".pdf,image/png,image/jpeg,image/gif,image/webp,text/plain";

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Herramientas de archivos ancladas a la esquina superior izquierda:
 *  - Un libro ("Añadir archivos") que abre el selector del sistema y sube los
 *    archivos elegidos a la nube.
 *  - Unas gafas ("Consultar archivos") que listan lo subido y lo abren dentro
 *    de la página.
 */
export function ArchivosMenu() {
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [visor, setVisor] = useState<PublicArchivo | null>(null);
  const [archivos, setArchivos] = useState<PublicArchivo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contenedor = useRef<HTMLDivElement>(null);
  const selector = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setArchivos(await archivosApi.listar());
      setError(null);
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (panelAbierto) {
      void cargar();
    }
  }, [panelAbierto, cargar]);

  useEffect(() => {
    if (!panelAbierto) return undefined;

    function alPulsarFuera(event: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(event.target as Node)) {
        setPanelAbierto(false);
      }
    }

    function alPulsarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanelAbierto(false);
        setVisor(null);
      }
    }

    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alPulsarTecla);
    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alPulsarTecla);
    };
  }, [panelAbierto]);

  useEffect(() => {
    if (!aviso) return undefined;
    const temporizador = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  async function alElegirArchivos(event: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (elegidos.length === 0) return;

    setSubiendo(true);
    setError(null);

    try {
      for (const archivo of elegidos) {
        await archivosApi.subir(archivo);
      }
      setAviso(
        elegidos.length === 1
          ? "Archivo subido."
          : `${elegidos.length} archivos subidos.`
      );
      await cargar();
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(archivo: PublicArchivo) {
    try {
      await archivosApi.borrar(archivo.id);
      if (visor?.id === archivo.id) setVisor(null);
      await cargar();
    } catch (fallo) {
      setError(describeError(fallo));
    }
  }

  return (
    <div className="archivos" ref={contenedor}>
      <div className="archivos-fila">
        <div className="archivos-libro">
          <span className="archivos-etiqueta">Añadir archivos</span>
          <button
            type="button"
            className="archivo-circulo libro"
            onClick={() => selector.current?.click()}
            disabled={subiendo}
            title="Añadir archivos"
            aria-label="Añadir archivos"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 6.5C10.2 5 7.8 4.2 5.2 4.2H3.4v14.2h1.8c2.6 0 5 .8 6.8 2.3" />
              <path d="M12 6.5c1.8-1.5 4.2-2.3 6.8-2.3h1.8v14.2h-1.8c-2.6 0-5 .8-6.8 2.3" />
              <path d="M12 6.5v16.3" />
            </svg>
            {subiendo && <span className="archivo-girando" aria-hidden="true" />}
          </button>
        </div>

        <button
          type="button"
          className={panelAbierto ? "archivo-circulo gafas abierto" : "archivo-circulo gafas"}
          onClick={() => setPanelAbierto(actual => !actual)}
          aria-haspopup="dialog"
          aria-expanded={panelAbierto}
          title="Consultar archivos"
          aria-label="Consultar archivos"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="6.8" cy="14.4" r="3.5" />
            <circle cx="17.2" cy="14.4" r="3.5" />
            <path d="M10.3 13.6c.9-1 2.5-1 3.4 0" />
            <path d="M3.3 14.4 5 8.2" />
            <path d="M20.7 14.4 19 8.2" />
          </svg>
        </button>
      </div>

      <input
        ref={selector}
        type="file"
        multiple
        accept={ACEPTADOS}
        className="archivos-input"
        onChange={alElegirArchivos}
      />

      {error && <p className="archivos-mensaje error">{error}</p>}
      {aviso && !error && <p className="archivos-mensaje ok">{aviso}</p>}

      {panelAbierto && (
        <div className="archivos-panel" role="dialog" aria-label="Mis archivos">
          <p className="archivos-panel-titulo">Mis archivos</p>

          {cargando && archivos.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : archivos.length === 0 ? (
            <p className="muted">
              Todavía no has subido nada. Pulsa el libro para añadir un PDF o una
              imagen.
            </p>
          ) : (
            <ul className="archivos-lista">
              {archivos.map(archivo => (
                <li key={archivo.id} className="archivos-item">
                  <button
                    type="button"
                    className="archivos-item-abrir"
                    onClick={() => setVisor(archivo)}
                    title={archivo.nombre}
                  >
                    <span className="archivos-item-nombre">{archivo.nombre}</span>
                    <span className="archivos-item-peso">
                      {formatearTamano(archivo.tamano)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="archivos-item-borrar"
                    onClick={() => void borrar(archivo)}
                    title="Borrar archivo"
                    aria-label={`Borrar ${archivo.nombre}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {visor && (
        <div className="archivo-visor" onClick={() => setVisor(null)}>
          <div className="archivo-visor-caja" onClick={event => event.stopPropagation()}>
            <header className="archivo-visor-cabecera">
              <span className="archivo-visor-nombre" title={visor.nombre}>
                {visor.nombre}
              </span>
              <div className="archivo-visor-acciones">
                <a
                  className="archivo-visor-descargar"
                  href={archivosApi.url(visor.id, true)}
                  download={visor.nombre}
                >
                  Descargar
                </a>
                <button
                  type="button"
                  className="archivo-visor-cerrar"
                  onClick={() => setVisor(null)}
                  aria-label="Cerrar"
                >
                  Cerrar
                </button>
              </div>
            </header>

            <div className="archivo-visor-marco">
              {visor.visible ? (
                visor.tipo === "application/pdf" ? (
                  <iframe src={archivosApi.url(visor.id)} title={visor.nombre} />
                ) : (
                  <img src={archivosApi.url(visor.id)} alt={visor.nombre} />
                )
              ) : (
                <p className="muted">
                  Este tipo de archivo no se puede mostrar aquí. Usa «Descargar».
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
