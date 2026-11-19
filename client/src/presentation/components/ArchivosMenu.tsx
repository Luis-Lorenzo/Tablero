import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookPlus,
  File,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Trash2
} from "lucide-react";
import { archivosApi } from "../../api/archivos.api";
import type { PublicArchivo } from "../../api/types";
import { describeError } from "../errorMessages";
import { VisorArchivo } from "./VisorArchivo";

/** Formatos que acepta el servidor (deben coincidir con `TIPOS_PERMITIDOS`). */
const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,.md,.json,.csv,text/markdown,application/json,text/csv";

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoDeArchivo(vista: PublicArchivo["vista"]) {
  if (vista === "imagen") return <ImageIcon size={15} aria-hidden="true" />;
  if (vista === "pdf" || vista === "docx" || vista === "texto") {
    return <FileText size={15} aria-hidden="true" />;
  }
  return <File size={15} aria-hidden="true" />;
}

/**
 * Herramientas de archivos personales en la barra superior:
 *  - Añadir archivos (abre selector del sistema y sube a la nube).
 *  - Mis archivos (lista lo subido y permite previsualizarlo o borrarlo).
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
    if (!panelAbierto && !visor) return undefined;

    function alPulsarFuera(event: MouseEvent) {
      if (panelAbierto && contenedor.current && !contenedor.current.contains(event.target as Node)) {
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
  }, [panelAbierto, visor]);

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
        <button
          type="button"
          className="archivo-pill libro"
          onClick={() => selector.current?.click()}
          disabled={subiendo}
          title="Subir archivos (PDF, imágenes, Word o texto)"
          aria-label="Añadir archivos"
        >
          {subiendo ? (
            <Loader2 size={16} className="icono-girando" aria-hidden="true" />
          ) : (
            <BookPlus size={16} aria-hidden="true" />
          )}
          <span className="archivo-pill-texto">{subiendo ? "Subiendo…" : "Subir"}</span>
        </button>

        <button
          type="button"
          className={panelAbierto ? "archivo-pill gafas abierto" : "archivo-pill gafas"}
          onClick={() => setPanelAbierto(actual => !actual)}
          aria-haspopup="dialog"
          aria-expanded={panelAbierto}
          title="Consultar mis archivos"
          aria-label="Consultar archivos"
        >
          <FolderOpen size={16} aria-hidden="true" />
          <span className="archivo-pill-texto">Archivos</span>
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
          <div className="archivos-panel-cabecera">
            <p className="archivos-panel-titulo">Mis archivos</p>
            {archivos.length > 0 && (
              <span className="archivos-contador">{archivos.length}</span>
            )}
          </div>

          {cargando && archivos.length === 0 ? (
            <p className="muted archivos-vacio">Cargando…</p>
          ) : archivos.length === 0 ? (
            <p className="muted archivos-vacio">
              Todavía no has subido nada. Pulsa «Subir» para guardar un PDF, imagen,
              documento Word o texto.
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
                    <span className="archivos-item-icono">{iconoDeArchivo(archivo.vista)}</span>
                    <span className="archivos-item-datos">
                      <span className="archivos-item-nombre">{archivo.nombre}</span>
                      <span className="archivos-item-peso">
                        {formatearTamano(archivo.tamano)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="archivos-item-borrar"
                    onClick={() => void borrar(archivo)}
                    title="Borrar archivo"
                    aria-label={`Borrar ${archivo.nombre}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {visor && (
        <VisorArchivo
          archivo={visor}
          onCerrar={() => setVisor(null)}
          onGuardado={actualizado => {
            setVisor(actualizado);
            setArchivos(prev =>
              prev.map(item => (item.id === actualizado.id ? actualizado : item))
            );
          }}
        />
      )}
    </div>
  );
}
