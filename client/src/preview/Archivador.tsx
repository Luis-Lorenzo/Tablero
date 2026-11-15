import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  Dispatch,
  SetStateAction
} from "react";
import {
  ArrowLeft,
  Crown,
  Download,
  Eye,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { archivosApi } from "../api/archivos.api";
import type { PublicArchivo } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import {
  infoFormatoArchivo,
  nuevoId,
  textoLegible,
  urlImagenEscena
} from "./calibracion";
import type {
  DocumentoMesa,
  ElementoMesa,
  ImagenEscenaPreview
} from "./tipos";

interface ArchivadorProps {
  elementosMesa: ElementoMesa[];
  onElementosMesa: Dispatch<SetStateAction<ElementoMesa[]>>;
  onVolver: () => void;
  esMaster?: boolean;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  proyeccionOculta?: boolean;
  onReabrirProyeccion?: () => void;
  onArchivosCambio?: (archivos: PublicArchivo[]) => void;
}

/** Formatos aceptados por el servidor (coinciden con `TIPOS_PERMITIDOS`). */
const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const ACEPTADOS_IMAGEN = "image/png,image/jpeg,image/gif,image/webp";

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
  onCerrar,
  esMaster,
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen
}: {
  archivo:
  | PublicArchivo
  | DocumentoMesa
  | { id: string; nombre: string; vista: string; url?: string };
  onCerrar: () => void;
  esMaster?: boolean;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  proyeccionOculta?: boolean;
  onReabrirProyeccion?: () => void;
  onArchivosCambio?: (archivos: PublicArchivo[]) => void;
}) {
  const docxRef = useRef<HTMLDivElement>(null);
  const urlPersonalizada = "url" in archivo ? archivo.url : undefined;
  const recursoUrl = urlPersonalizada ?? archivosApi.url(archivo.id);
  const descargaUrl = urlPersonalizada ?? archivosApi.url(archivo.id, true);
  const esImagen = archivo.vista === "imagen";
  const enEscena = Boolean(imagenEscena && imagenEscena.id === archivo.id);
  const enProyeccion = Boolean(
    imagenProyectada && imagenProyectada.id === archivo.id
  );

  useEffect(() => {
    if (archivo.vista !== "docx") return undefined;

    let cancelado = false;

    (async () => {
      try {
        const modulo = await import("docx-preview");
        const contenedor = docxRef.current;
        if (cancelado || !contenedor) return;
        contenedor.innerHTML = "";

          const respuesta = await fetch(recursoUrl, {
            credentials: "include"
          });
          if(!respuesta.ok || cancelado) return;
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
}, [archivo.id, archivo.vista, recursoUrl]);

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
          {esMaster && esImagen && onProyectarImagen && (
            <button
              type="button"
              className={`master-accion-btn${enProyeccion ? " activo" : ""}`}
              onClick={() =>
                onProyectarImagen(
                  enProyeccion
                    ? null
                    : {
                      id: archivo.id,
                      titulo: archivo.nombre,
                      url: urlPersonalizada
                    }
                )
              }
            >
              {enProyeccion ? (
                <>
                  <Sparkles size={13} aria-hidden="true" />
                  <span>Quitar proyección</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} aria-hidden="true" />
                  <span>Mostrar a todos</span>
                </>
              )}
            </button>
          )}
          {esMaster && esImagen && onCambiarEscena && (
            <button
              type="button"
              className={`master-accion-btn${enEscena ? " activo" : ""}`}
              onClick={() =>
                onCambiarEscena(
                  enEscena
                    ? null
                    : {
                      id: archivo.id,
                      titulo: archivo.nombre,
                      url: urlPersonalizada
                    }
                )
              }
            >
              {enEscena ? (
                <>
                  <ImageIcon size={13} aria-hidden="true" />
                  <span>Quitar de pizarra</span>
                </>
              ) : (
                <>
                  <ImageIcon size={13} aria-hidden="true" />
                  <span>Fijar en pizarra</span>
                </>
              )}
            </button>
          )}
          <a
            className="archivador-visor-descargar"
            href={descargaUrl}
            download={archivo.nombre}
          >
            <Download size={13} aria-hidden="true" />
            <span>Descargar</span>
          </a>
          <button
            type="button"
            className="archivador-visor-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            <X size={13} aria-hidden="true" />
            <span>Cerrar</span>
          </button>
        </div>
      </header>

      <div className="archivador-visor-marco">
        {archivo.vista !== "ninguna" ? (
          archivo.vista === "pdf" ? (
              <iframe src={recursoUrl} title={archivo.nombre} />
          ) : archivo.vista === "imagen" ? (
              <img src={recursoUrl} alt={archivo.nombre} />
          ) : archivo.vista === "docx" ? (
            <div ref={docxRef} className="archivador-docx-contenedor" />
          ) : archivo.vista === "texto" ? (
            <TextoVisor id={archivo.id} nombre={archivo.nombre} />
          ) : (
              <iframe src={recursoUrl} title={archivo.nombre} />
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

/**
 * Opción A: revelación dramática proyectada por el Máster a pantalla completa
 * para toda la mesa.
 */
export function ProyeccionMasterModal({
  imagen,
  esMaster,
  onCerrarLocal,
  onRetirarTodos
}: {
  imagen: ImagenEscenaPreview;
  esMaster?: boolean;
  onCerrarLocal: () => void;
  onRetirarTodos?: () => void;
}) {
  useEffect(() => {
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        onCerrarLocal();
      }
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [onCerrarLocal]);

  return (
    <div
      className="proyeccion-master-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={imagen.titulo ?? "Imagen proyectada por el Máster"}
      onClick={esMaster ? undefined : onCerrarLocal}
    >
      <div
        className="proyeccion-master-marco"
        onClick={evento => evento.stopPropagation()}
      >
        <div className="proyeccion-master-cabecera">
          <span className="proyeccion-master-sello">
            <Sparkles size={13} aria-hidden="true" />
            <span>REVELACIÓN DEL MÁSTER</span>
            <Sparkles size={13} aria-hidden="true" />
          </span>
          <button
            type="button"
            className="proyeccion-master-cerrar-x"
            onClick={onCerrarLocal}
            title="Ocultar en mi vista"
            aria-label="Ocultar en mi vista"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="proyeccion-master-lienzo">
          <img
            src={urlImagenEscena(imagen)}
            alt={imagen.titulo ?? "Escena compartida"}
          />
        </div>

        {imagen.titulo && (
          <p className="proyeccion-master-titulo">{imagen.titulo}</p>
        )}

        <div className="proyeccion-master-pie">
          {esMaster && onRetirarTodos ? (
            <>
              <button
                type="button"
                className="master-btn-dorado"
                onClick={onRetirarTodos}
              >
                Terminar proyección para todos
              </button>
              <button
                type="button"
                className="proyeccion-btn-secundario"
                onClick={onCerrarLocal}
              >
                Ocultar solo en mi vista
              </button>
            </>
          ) : (
            <button
              type="button"
              className="proyeccion-btn-secundario"
              onClick={onCerrarLocal}
            >
              Cerrar vista
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Panel de Dirección del Máster: permite gestionar las imágenes proyectadas a
 * todos (Opción A) o fijadas en la pizarra de la sala (Opción B) desde la sala
 * o desde la propia pizarra.
 */
export function PanelImagenesMasterModal({
  tituloPanel = "DIRECCIÓN DE ESCENA DEL MÁSTER",
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen,
  onCerrar
}: {
  tituloPanel?: string;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  onCerrar: () => void;
}) {
  const [imagenes, setImagenes] = useState<
    Array<{ id: string; nombre: string; url?: string }>
  >([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [tituloEscena, setTituloEscena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let activo = true;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    archivosApi
      .listar()
      .then(lista => {
        if (!activo) return;
        setImagenes(
          lista
            .filter(archivo => archivo.vista === "imagen")
            .map(archivo => ({ id: archivo.id, nombre: archivo.nombre }))
        );
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
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [onCerrar]);

  async function alSubirImagen(evento: ChangeEvent<HTMLInputElement>) {
    const elegidas = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    if (elegidas.length === 0) return;

    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setSubiendo(true);
    setError(null);
    try {
      for (const archivo of elegidas) {
        if (esPreview) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const lector = new FileReader();
            lector.onload = () => resolve(String(lector.result ?? ""));
            lector.onerror = () => reject(new Error("read_error"));
            lector.readAsDataURL(archivo);
          });
          setImagenes(prev => [
            { id: nuevoId(), nombre: archivo.name, url: dataUrl },
            ...prev
          ]);
        } else {
          const creado = await archivosApi.subir(archivo);
          if (creado.vista === "imagen") {
            setImagenes(prev => [
              { id: creado.id, nombre: creado.nombre },
              ...prev
            ]);
          }
        }
      }
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  function construirPayload(item: {
    id: string;
    nombre: string;
    url?: string;
  }): ImagenEscenaPreview {
    const pie = tituloEscena.trim();
    return {
      id: item.id,
      titulo: pie || item.nombre,
      url: item.url
    };
  }

  return (
    <div className="master-modal-fondo" onClick={onCerrar}>
      <div
        className="master-panel-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tituloPanel}
        onClick={evento => evento.stopPropagation()}
      >
        <header className="master-panel-cabecera">
          <div className="master-panel-titulo-wrap">
            <span className="master-corona" aria-hidden="true">
              <Crown size={20} />
            </span>
            <div>
              <h2>{tituloPanel}</h2>
              <p>
                Controles exclusivos del Máster para mostrar imágenes durante la
                campaña.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="proyeccion-master-cerrar-x"
            onClick={onCerrar}
            aria-label="Cerrar panel de Máster"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="master-estado-grid">
          <div className="master-estado-caja">
            <span className="master-estado-etiqueta">
              <Sparkles size={12} aria-hidden="true" />
              <span>Opción A · Pantalla de todos</span>
            </span>
            {imagenProyectada ? (
              <div className="master-estado-activo">
                <img
                  src={urlImagenEscena(imagenProyectada)}
                  alt={imagenProyectada.titulo ?? "Proyección activa"}
                />
                <div className="master-estado-info">
                  <strong>{imagenProyectada.titulo ?? "Sin título"}</strong>
                  <button
                    type="button"
                    className="master-quitar-btn"
                    onClick={() => onProyectarImagen?.(null)}
                  >
                    Retirar proyección
                  </button>
                </div>
              </div>
            ) : (
              <span className="master-estado-vacio">
                No hay ninguna imagen proyectada ahora mismo.
              </span>
            )}
          </div>

          <div className="master-estado-caja">
            <span className="master-estado-etiqueta">
              <ImageIcon size={12} aria-hidden="true" />
              <span>Opción B · Pizarra de la sala</span>
            </span>
            {imagenEscena ? (
              <div className="master-estado-activo">
                <img
                  src={urlImagenEscena(imagenEscena)}
                  alt={imagenEscena.titulo ?? "Escena de pizarra"}
                />
                <div className="master-estado-info">
                  <strong>{imagenEscena.titulo ?? "Sin título"}</strong>
                  <button
                    type="button"
                    className="master-quitar-btn"
                    onClick={() => onCambiarEscena?.(null)}
                  >
                    Quitar de la pizarra
                  </button>
                </div>
              </div>
            ) : (
              <span className="master-estado-vacio">
                La pizarra de la pared no muestra ninguna imagen.
              </span>
            )}
          </div>
        </div>

        <div className="master-panel-herramientas">
          <input
            type="text"
            className="master-titulo-input"
            value={tituloEscena}
            onChange={evento => setTituloEscena(evento.target.value)}
            placeholder="Título o pie opcional (ej. La taberna del cuervo)…"
            maxLength={120}
          />
          <button
            type="button"
            className="master-btn-dorado"
            onClick={() => selector.current?.click()}
            disabled={subiendo}
          >
            <Plus size={14} aria-hidden="true" />
            <span>{subiendo ? "Subiendo…" : "Subir imagen"}</span>
          </button>
          <input
            ref={selector}
            type="file"
            multiple
            accept={ACEPTADOS_IMAGEN}
            className="archivador-input"
            onChange={alSubirImagen}
          />
        </div>

        {error && <p className="archivador-error">{error}</p>}

        <div className="master-panel-lista">
          {cargando && imagenes.length === 0 ? (
            <p className="master-lista-vacia">Cargando tus imágenes…</p>
          ) : imagenes.length === 0 ? (
            <p className="master-lista-vacia">
              Aún no hay imágenes disponibles. Pulsa «+ Subir imagen» para añadir
              escenas, mapas o retratos de PNJ y mostrarlos a tus jugadores.
            </p>
          ) : (
            <div className="master-imagenes-grid">
              {imagenes.map(item => {
                const esProyectada = imagenProyectada?.id === item.id;
                const esEscena = imagenEscena?.id === item.id;
                const src = item.url ?? archivosApi.url(item.id);
                return (
                  <article key={item.id} className="master-imagen-card">
                    <div className="master-imagen-thumb">
                      <img src={src} alt={item.nombre} />
                    </div>
                    <span className="master-imagen-nombre" title={item.nombre}>
                      {item.nombre}
                    </span>
                    <div className="master-imagen-botones">
                      {onProyectarImagen && (
                        <button
                          type="button"
                          className={`master-accion-btn${esProyectada ? " activo" : ""}`}
                          onClick={() =>
                            onProyectarImagen(
                              esProyectada ? null : construirPayload(item)
                            )
                          }
                        >
                          <Sparkles size={12} aria-hidden="true" />
                          <span>{esProyectada ? "Quitar" : "Mostrar a todos"}</span>
                        </button>
                      )}
                      {onCambiarEscena && (
                        <button
                          type="button"
                          className={`master-accion-btn${esEscena ? " activo" : ""}`}
                          onClick={() =>
                            onCambiarEscena(
                              esEscena ? null : construirPayload(item)
                            )
                          }
                        >
                          <ImageIcon size={12} aria-hidden="true" />
                          <span>{esEscena ? "Quitar" : "Pizarra"}</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Archivador({
  elementosMesa,
  onElementosMesa,
  onVolver,
  esMaster,
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen,
  proyeccionOculta,
  onReabrirProyeccion,
  onArchivosCambio
}: ArchivadorProps) {
  const [archivos, setArchivos] = useState<PublicArchivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<PublicArchivo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selector = useRef<HTMLInputElement>(null);
  const onArchivosCambioRef = useRef(onArchivosCambio);
  onArchivosCambioRef.current = onArchivosCambio;

  const sincronizarLista = useCallback(
    (lista: PublicArchivo[]) => {
      setArchivos(lista);
      setError(null);
      onArchivosCambioRef.current?.(lista);
      const ids = new Set(lista.map(archivo => archivo.id));
      onElementosMesa(prev => {
        const filtrados = prev.filter(
          el => el.tipo !== "archivo" || ids.has(el.archivoId)
        );
        return filtrados.length === prev.length ? prev : filtrados;
      });
    },
    [onElementosMesa]
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
    onElementosMesa(prev =>
      prev.map(el =>
        el.id === id ? { ...el, archivado: false } : el
      )
    );
  }

  function borrarPosit(id: string): void {
    onElementosMesa(prev => prev.filter(el => el.id !== id));
  }

  const archivosEnMesa = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "archivo" }> =>
      el.tipo === "archivo" && !el.archivado
  );

  function desarchivarDocumento(archivo: PublicArchivo): void {
    const desplazamiento = (archivosEnMesa.length % 5) * 3;
    const x = Math.min(90, Math.max(10, 74 - desplazamiento));
    const y = Math.min(86, Math.max(14, 34 + desplazamiento));

    onElementosMesa(prev => {
      const existente = prev.find(
        el => el.tipo === "archivo" && el.archivoId === archivo.id
      );
      if (existente) {
        if (!existente.archivado) return prev;
        return prev.map(el =>
          el.id === existente.id ? { ...el, archivado: false, x, y } : el
        );
      }
      return [
        ...prev,
        {
          id: archivo.id,
          tipo: "archivo",
          archivoId: archivo.id,
          nombre: archivo.nombre,
          mime: archivo.tipo,
          vista: archivo.vista,
          tamano: archivo.tamano,
          x,
          y
        }
      ];
    });
  }

  async function borrarArchivo(archivo: PublicArchivo): Promise<void> {
    try {
      await archivosApi.borrar(archivo.id);
      if (visor?.id === archivo.id) setVisor(null);
      onElementosMesa(prev =>
        prev.filter(
          el => !(el.tipo === "archivo" && el.archivoId === archivo.id)
        )
      );
      await cargarArchivos();
    } catch (fallo) {
      setError(describeError(fallo));
    }
  }

  const positsArchivados = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "posit" }> =>
      el.tipo === "posit" && Boolean(el.archivado)
  );
  const archivosArchivados = archivos.filter(
    archivo => !archivosEnMesa.some(doc => doc.archivoId === archivo.id)
  );

  return (
    <div className="archivador-page">
      <div className="archivador-fondo" aria-hidden="true" />

        <header
          className={`archivador-barra${esMaster ? " archivador-barra-master" : ""}`}
        >
          <button type="button" className="archivador-btn" onClick={onVolver}>
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Volver</span>
          </button>

          <h1 className="archivador-titulo">
            {esMaster ? (
              <>
                <Crown size={15} aria-hidden="true" />
                <span>ARCHIVADOR DEL MÁSTER</span>
              </>
            ) : (
              "ARCHIVADOR"
            )}
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {proyeccionOculta && onReabrirProyeccion && (
              <button
                type="button"
                className="archivador-btn"
                onClick={onReabrirProyeccion}
                title="Volver a mostrar la imagen proyectada por el Máster"
              >
                <Eye size={14} aria-hidden="true" />
                <span>Ver proyección</span>
              </button>
            )}

            <button
              type="button"
              className="archivador-btn archivador-btn-subir"
              onClick={() => selector.current?.click()}
              disabled={subiendo}
            >
              <Plus size={14} aria-hidden="true" />
              <span>{subiendo ? "Subiendo…" : "Añadir archivo"}</span>
            </button>
          </div>
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
                        className={`archivador-posit-texto${posit.texto.trim() ? "" : " vacio"
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
                        <Trash2 size={14} aria-hidden="true" />
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

                {esMaster &&
                  archivo.vista === "imagen" &&
                  (onProyectarImagen || onCambiarEscena) && (
                    <div className="archivador-master-acciones">
                      {onProyectarImagen && (
                        <button
                          type="button"
                          className={`master-accion-btn${imagenProyectada?.id === archivo.id
                              ? " activo"
                              : ""
                            }`}
                          onClick={() =>
                            onProyectarImagen(
                              imagenProyectada?.id === archivo.id
                                ? null
                                : { id: archivo.id, titulo: archivo.nombre }
                            )
                          }
                        >
                          {imagenProyectada?.id === archivo.id ? (
                            <>
                              <Sparkles size={12} aria-hidden="true" />
                              <span>Quitar proyección</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} aria-hidden="true" />
                              <span>Mostrar a todos</span>
                            </>
                          )}
                        </button>
                      )}
                      {onCambiarEscena && (
                        <button
                          type="button"
                          className={`master-accion-btn${imagenEscena?.id === archivo.id
                              ? " activo"
                              : ""
                            }`}
                          onClick={() =>
                            onCambiarEscena(
                              imagenEscena?.id === archivo.id
                                ? null
                                : { id: archivo.id, titulo: archivo.nombre }
                            )
                          }
                        >
                          {imagenEscena?.id === archivo.id ? (
                            <>
                              <ImageIcon size={12} aria-hidden="true" />
                              <span>En pizarra (Quitar)</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon size={12} aria-hidden="true" />
                              <span>Fijar en pizarra</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

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
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
                })}
        </div>
          )}
      </section>
    </div>

      {
    visor && (
      <DocumentoVisorModal
        archivo={visor}
        esMaster={esMaster}
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={onCambiarEscena}
        onProyectarImagen={onProyectarImagen}
        onCerrar={() => setVisor(null)}
      />
    )
  }
    </div >
  );
}
