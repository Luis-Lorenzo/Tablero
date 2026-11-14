import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { archivosApi } from "../api/archivos.api";
import type { PublicArchivo } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import { textoLegible } from "./calibracion";
import type { PositPreview } from "./tipos";

interface ArchivadorProps {
  posits: PositPreview[];
  onPosits: Dispatch<SetStateAction<PositPreview[]>>;
  onVolver: () => void;
}

/** Formatos aceptados por el servidor (coinciden con `TIPOS_PERMITIDOS`). */
const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function etiquetaVista(vista: string): string {
  switch (vista) {
    case "pdf":
      return "PDF";
    case "imagen":
      return "IMAGEN";
    case "docx":
      return "DOCX";
    case "texto":
      return "TEXTO";
    default:
      return "ARCHIVO";
  }
}

function TextoVisor({ id, nombre }: { id: string; nombre: string }) {
  const [texto, setTexto] = useState("Cargando…");

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const respuesta = await fetch(archivosApi.url(id), {
          credentials: "include"
        });
        if (!respuesta.ok) return;
        const contenido = await respuesta.text();
        if (activo) setTexto(contenido);
      } catch {
        if (activo) setTexto("No se pudo leer este archivo de texto.");
      }
    })();
    return () => {
      activo = false;
    };
  }, [id]);

  return (
    <pre className="archivador-texto-visor" aria-label={nombre}>
      {texto}
    </pre>
  );
}

export function Archivador({ posits, onPosits, onVolver }: ArchivadorProps) {
  const [archivos, setArchivos] = useState<PublicArchivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<PublicArchivo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selector = useRef<HTMLInputElement>(null);
  const docxRef = useRef<HTMLDivElement>(null);

  const cargarArchivos = useCallback(async () => {
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setCargando(true);
    try {
      setArchivos(await archivosApi.listar());
      setError(null);
    } catch (fallo) {
      if (!esPreview) {
        setError(describeError(fallo));
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    archivosApi
      .listar()
      .then(lista => {
        if (!activo) return;
        setArchivos(lista);
        setError(null);
      })
      .catch(fallo => {
        if (!activo || esPreview) return;
        setError(describeError(fallo));
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!visor || visor.vista !== "docx") return undefined;

    let cancelado = false;

    (async () => {
      try {
        const modulo = await import("docx-preview");
        const contenedor = docxRef.current;
        if (cancelado || !contenedor) return;
        contenedor.innerHTML = "";

        const respuesta = await fetch(archivosApi.url(visor.id), {
          credentials: "include"
        });
        if (!respuesta.ok || cancelado) return;
        const blob = await respuesta.blob();

        if (cancelado) return;
        await (modulo as { renderAsync: Function }).renderAsync(
          blob,
          contenedor,
          undefined,
          { className: "archivador-docx-canvas" }
        );
      } catch (e) {
        console.error("No se pudo previsualizar .docx", e);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [visor]);

  useEffect(() => {
    if (!visor) return undefined;

    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setVisor(null);
      }
    }

    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [visor]);

  async function alElegirArchivos(evento: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    if (elegidos.length === 0) return;

    setSubiendo(true);
    setError(null);
    try {
      for (const archivo of elegidos) {
        await archivosApi.subir(archivo);
      }
      await cargarArchivos();
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  function desarchivarPosit(id: string): void {
    onPosits(prev =>
      prev.map(posit =>
        posit.id === id ? { ...posit, archivado: false } : posit
      )
    );
  }

  function borrarPosit(id: string): void {
    onPosits(prev => prev.filter(posit => posit.id !== id));
  }

  async function borrarArchivo(archivo: PublicArchivo): Promise<void> {
    try {
      await archivosApi.borrar(archivo.id);
      if (visor?.id === archivo.id) setVisor(null);
      await cargarArchivos();
    } catch (fallo) {
      setError(describeError(fallo));
    }
  }

  const positsArchivados = posits.filter(posit => posit.archivado);

  return (
    <div className="archivador-page">
      <div className="archivador-fondo" aria-hidden="true" />

      <header className="archivador-barra">
        <button type="button" className="archivador-btn" onClick={onVolver}>
          ← Volver
        </button>

        <h1 className="archivador-titulo">ARCHIVADOR</h1>

        <button
          type="button"
          className="archivador-btn archivador-btn-subir"
          onClick={() => selector.current?.click()}
          disabled={subiendo}
        >
          {subiendo ? "Subiendo…" : "+ Añadir archivo"}
        </button>
      </header>

      <input
        ref={selector}
        type="file"
        multiple
        accept={ACEPTADOS}
        className="archivador-input"
        onChange={alElegirArchivos}
      />

      <div className="archivador-contenido">
        {error && <p className="archivador-error">{error}</p>}

        <section className="archivador-seccion">
          <div className="archivador-seccion-cabecera">
            <h2>Posits archivados</h2>
            <span className="archivador-contador">{positsArchivados.length}</span>
          </div>

          {positsArchivados.length === 0 ? (
            <p className="archivador-vacio">
              No tienes posits archivados. Puedes archivar tus notas desde la vista
              de la mesa.
            </p>
          ) : (
            <div className="archivador-grid">
              {positsArchivados.map(posit => (
                <article
                  key={posit.id}
                  className="archivador-card archivador-card-posit"
                >
                  <div
                    className="archivador-posit-preview"
                    style={{
                      background: posit.color,
                      color: textoLegible(posit.color)
                    }}
                  >
                    <p
                      className={`archivador-posit-texto${
                        posit.texto.trim() ? "" : " vacio"
                      }`}
                    >
                      {posit.texto.trim() ? posit.texto : "Posit sin texto"}
                    </p>
                  </div>

                  <div className="archivador-card-acciones">
                    <button
                      type="button"
                      className="archivador-accion-principal"
                      onClick={() => desarchivarPosit(posit.id)}
                    >
                      Desarchivar
                    </button>
                    <button
                      type="button"
                      className="archivador-accion-borrar"
                      title="Borrar posit"
                      aria-label="Borrar posit"
                      onClick={() => borrarPosit(posit.id)}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="archivador-seccion">
          <div className="archivador-seccion-cabecera">
            <h2>Mis archivos</h2>
            <span className="archivador-contador">{archivos.length}</span>
          </div>

          {cargando && archivos.length === 0 ? (
            <p className="archivador-vacio">Cargando archivos…</p>
          ) : archivos.length === 0 ? (
            <p className="archivador-vacio">
              Todavía no tienes archivos subidos. Pulsa «+ Añadir archivo» para
              subir PDF, imágenes, .docx o texto.
            </p>
          ) : (
            <div className="archivador-grid">
              {archivos.map(archivo => (
                <article
                  key={archivo.id}
                  className="archivador-card archivador-card-archivo"
                >
                  <button
                    type="button"
                    className="archivador-archivo-cuerpo"
                    onClick={() => setVisor(archivo)}
                    title={archivo.nombre}
                  >
                    <span className="archivador-tipo-badge">
                      {etiquetaVista(archivo.vista)}
                    </span>
                    <span className="archivador-archivo-nombre">
                      {archivo.nombre}
                    </span>
                    <span className="archivador-archivo-peso">
                      {formatearTamano(archivo.tamano)}
                    </span>
                  </button>

                  <div className="archivador-card-acciones">
                    <button
                      type="button"
                      className="archivador-accion-principal"
                      onClick={() => setVisor(archivo)}
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="archivador-accion-borrar"
                      title="Borrar archivo"
                      aria-label={`Borrar ${archivo.nombre}`}
                      onClick={() => void borrarArchivo(archivo)}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {visor && (
        <div className="archivador-visor" onClick={() => setVisor(null)}>
          <div
            className="archivador-visor-caja"
            onClick={evento => evento.stopPropagation()}
          >
            <header className="archivador-visor-cabecera">
              <span className="archivador-visor-nombre" title={visor.nombre}>
                {visor.nombre}
              </span>
              <div className="archivador-visor-acciones">
                <a
                  className="archivador-visor-descargar"
                  href={archivosApi.url(visor.id, true)}
                  download={visor.nombre}
                >
                  Descargar
                </a>
                <button
                  type="button"
                  className="archivador-visor-cerrar"
                  onClick={() => setVisor(null)}
                  aria-label="Cerrar"
                >
                  Cerrar
                </button>
              </div>
            </header>

            <div className="archivador-visor-marco">
              {visor.vista !== "ninguna" ? (
                visor.vista === "pdf" ? (
                  <iframe src={archivosApi.url(visor.id)} title={visor.nombre} />
                ) : visor.vista === "imagen" ? (
                  <img src={archivosApi.url(visor.id)} alt={visor.nombre} />
                ) : visor.vista === "docx" ? (
                  <div ref={docxRef} className="archivador-docx-contenedor" />
                ) : visor.vista === "texto" ? (
                  <TextoVisor id={visor.id} nombre={visor.nombre} />
                ) : (
                  <iframe src={archivosApi.url(visor.id)} title={visor.nombre} />
                )
              ) : (
                <p className="archivador-vacio">
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
