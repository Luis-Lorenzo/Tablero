import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  Dispatch,
  SetStateAction
} from "react";
import { archivosApi } from "../api/archivos.api";
import type { PublicArchivo } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import { infoFormatoArchivo, textoLegible } from "./calibracion";
import type { DocumentoMesa, PositPreview } from "./tipos";

interface ArchivadorProps {
  posits: PositPreview[];
  onPosits: Dispatch<SetStateAction<PositPreview[]>>;
  documentosMesa: DocumentoMesa[];
  onDocumentosMesa: Dispatch<SetStateAction<DocumentoMesa[]>>;
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

export function DocumentoVisorModal({
  archivo,
  onCerrar
}: {
  archivo: PublicArchivo | DocumentoMesa;
  onCerrar: () => void;
}) {
  const docxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (archivo.vista !== "docx") return undefined;

    let cancelado = false;

    (async () => {
      try {
        const modulo = await import("docx-preview");
        const contenedor = docxRef.current;
        if (cancelado || !contenedor) return;
        contenedor.innerHTML = "";

        const respuesta = await fetch(archivosApi.url(archivo.id), {
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
  }, [archivo.id, archivo.vista]);

  useEffect(() => {
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        onCerrar();
      }
    }

    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [onCerrar]);

  return (
    <div className="archivador-visor" onClick={onCerrar}>
      <div
        className="archivador-visor-caja"
        onClick={evento => evento.stopPropagation()}
      >
        <header className="archivador-visor-cabecera">
          <span className="archivador-visor-nombre" title={archivo.nombre}>
            {archivo.nombre}
          </span>
          <div className="archivador-visor-acciones">
            <a
              className="archivador-visor-descargar"
              href={archivosApi.url(archivo.id, true)}
              download={archivo.nombre}
            >
              Descargar
            </a>
            <button
              type="button"
              className="archivador-visor-cerrar"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              Cerrar
            </button>
          </div>
        </header>

        <div className="archivador-visor-marco">
          {archivo.vista !== "ninguna" ? (
            archivo.vista === "pdf" ? (
              <iframe src={archivosApi.url(archivo.id)} title={archivo.nombre} />
            ) : archivo.vista === "imagen" ? (
              <img src={archivosApi.url(archivo.id)} alt={archivo.nombre} />
            ) : archivo.vista === "docx" ? (
              <div ref={docxRef} className="archivador-docx-contenedor" />
            ) : archivo.vista === "texto" ? (
              <TextoVisor id={archivo.id} nombre={archivo.nombre} />
            ) : (
              <iframe src={archivosApi.url(archivo.id)} title={archivo.nombre} />
            )
          ) : (
            <p className="archivador-vacio">
              Este tipo de archivo no se puede mostrar aquí. Usa «Descargar».
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Archivador({
  posits,
  onPosits,
  documentosMesa,
  onDocumentosMesa,
  onVolver
}: ArchivadorProps) {
  const [archivos, setArchivos] = useState<PublicArchivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<PublicArchivo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selector = useRef<HTMLInputElement>(null);

  const sincronizarLista = useCallback(
    (lista: PublicArchivo[]) => {
      setArchivos(lista);
      setError(null);
      const ids = new Set(lista.map(archivo => archivo.id));
      onDocumentosMesa(prev => {
        const filtrados = prev.filter(doc => ids.has(doc.id));
        return filtrados.length === prev.length ? prev : filtrados;
      });
    },
    [onDocumentosMesa]
  );

  const cargarArchivos = useCallback(async () => {
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setCargando(true);
    try {
      const lista = await archivosApi.listar();
      sincronizarLista(lista);
    } catch (fallo) {
      if (!esPreview) {
        setError(describeError(fallo));
      }
    } finally {
      setCargando(false);
    }
  }, [sincronizarLista]);

  useEffect(() => {
    let activo = true;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    archivosApi
      .listar()
      .then(lista => {
        if (!activo) return;
        sincronizarLista(lista);
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
  }, [sincronizarLista]);

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

  function desarchivarDocumento(archivo: PublicArchivo): void {
    const desplazamiento = (documentosMesa.length % 5) * 3;
    const docMesa: DocumentoMesa = {
      id: archivo.id,
      nombre: archivo.nombre,
      tipo: archivo.tipo,
      vista: archivo.vista,
      tamano: archivo.tamano,
      x: Math.min(90, Math.max(10, 74 - desplazamiento)),
      y: Math.min(86, Math.max(14, 34 + desplazamiento))
    };

    onDocumentosMesa(prev =>
      prev.some(doc => doc.id === archivo.id) ? prev : [...prev, docMesa]
    );
  }

  async function borrarArchivo(archivo: PublicArchivo): Promise<void> {
    try {
      await archivosApi.borrar(archivo.id);
      if (visor?.id === archivo.id) setVisor(null);
      onDocumentosMesa(prev => prev.filter(doc => doc.id !== archivo.id));
      await cargarArchivos();
    } catch (fallo) {
      setError(describeError(fallo));
    }
  }

  const positsArchivados = posits.filter(posit => posit.archivado);
  const archivosArchivados = archivos.filter(
    archivo => !documentosMesa.some(doc => doc.id === archivo.id)
  );

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
            <span className="archivador-contador">
              {archivosArchivados.length}
            </span>
          </div>

          {cargando && archivos.length === 0 ? (
            <p className="archivador-vacio">Cargando archivos…</p>
          ) : archivos.length === 0 ? (
            <p className="archivador-vacio">
              Todavía no tienes archivos subidos. Pulsa «+ Añadir archivo» para
              subir PDF, imágenes, .docx o texto.
            </p>
          ) : archivosArchivados.length === 0 ? (
            <p className="archivador-vacio">
              Todos tus archivos están abiertos sobre la mesa. Archívalos desde
              la mesa para guardarlos aquí.
            </p>
          ) : (
            <div className="archivador-grid">
              {archivosArchivados.map(archivo => {
                const formato = infoFormatoArchivo(archivo.vista);
                return (
                  <article
                    key={archivo.id}
                    className="archivador-card archivador-card-archivo"
                  >
                    <button
                      type="button"
                      className="archivador-archivo-cuerpo"
                      onClick={() => setVisor(archivo)}
                      title={`Previsualizar ${archivo.nombre}`}
                    >
                      <div className="archivador-archivo-cabecera">
                        <span
                          className={`ficha-doc-hoja mini ${formato.clase}`}
                          style={{ "--doc-color": formato.color } as CSSProperties}
                        >
                          {formato.codigo}
                        </span>
                        <span className={`archivador-tipo-badge ${formato.clase}`}>
                          {formato.codigo}
                        </span>
                      </div>
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
                        onClick={() => desarchivarDocumento(archivo)}
                      >
                        Desarchivar
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
                );
              })}
            </div>
          )}
        </section>
      </div>

      {visor && (
        <DocumentoVisorModal
          archivo={visor}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  );
}
