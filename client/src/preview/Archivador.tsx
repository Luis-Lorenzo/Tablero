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
  Eye,
  FileText,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  User,
  X
} from "lucide-react";
import { archivosApi } from "../api/archivos.api";
import type { PersonajeJugadorMesa, PublicArchivo } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import { VisorArchivo } from "../presentation/components/VisorArchivo";
import { RecorteRetratoModal } from "./RecorteRetratoModal";
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

export type ActualizacionPersonaje = {
  retratoArchivoId?: string | null;
  fichaArchivoId?: string | null;
  fichaNombre?: string | null;
  pdfs?: { archivoId: string; nombre: string }[];
  notas?: string;
};

interface ArchivadorProps {
  elementosMesa: ElementoMesa[];
  onElementosMesa: Dispatch<SetStateAction<ElementoMesa[]>>;
  onVolver: () => void;
  mesaId?: string;
  esMaster?: boolean;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  proyeccionOculta?: boolean;
  onReabrirProyeccion?: () => void;
  onArchivosCambio?: (archivos: PublicArchivo[]) => void;
  personaje?: PersonajeJugadorMesa | null;
  onActualizarPersonaje?: (
    datos: ActualizacionPersonaje
  ) => Promise<void> | void;
}

/** Formatos aceptados por el servidor (coinciden con `TIPOS_PERMITIDOS`). */
const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,.md,.json,.csv,text/markdown,application/json,text/csv";
const ACEPTADOS_IMAGEN = "image/png,image/jpeg,image/gif,image/webp";

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  | { id: string; nombre: string; tipo?: string; vista: string; url?: string; updatedAt?: string };
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
  const urlPersonalizada = "url" in archivo ? archivo.url : undefined;
  const esImagen = archivo.vista === "imagen";
  const enEscena = Boolean(imagenEscena && imagenEscena.id === archivo.id);
  const enProyeccion = Boolean(
    imagenProyectada && imagenProyectada.id === archivo.id
  );

  const accionesExtra = (
    <>
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
          <Sparkles size={13} aria-hidden="true" />
          <span>{enProyeccion ? "Quitar proyección" : "Mostrar a todos"}</span>
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
          <ImageIcon size={13} aria-hidden="true" />
          <span>{enEscena ? "Quitar de pizarra" : "Fijar en pizarra"}</span>
        </button>
      )}
    </>
  );

  return (
    <VisorArchivo
      archivo={{
        id: archivo.id,
        nombre: archivo.nombre,
        tipo: "tipo" in archivo ? archivo.tipo : undefined,
        vista: archivo.vista,
        url: urlPersonalizada,
        updatedAt: "updatedAt" in archivo ? archivo.updatedAt : undefined
      }}
      accionesExtra={accionesExtra}
      onCerrar={onCerrar}
    />
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
  mesaId,
  tituloPanel = "DIRECCIÓN DE ESCENA DEL MÁSTER",
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen,
  onCerrar
}: {
  mesaId?: string;
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
      .listar(mesaId)
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
          const creado = await archivosApi.subir(archivo, mesaId);
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

function inferirVistaPorNombre(nombre: string): string {
  const lower = nombre.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return "imagen";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "doc";
  return "texto";
}

const PERSONAJE_VACIO: PersonajeJugadorMesa = {
  retratoArchivoId: null,
  fichaArchivoId: null,
  fichaNombre: null,
  pdfs: [],
  notas: ""
};

export function Archivador({
  elementosMesa,
  onElementosMesa,
  onVolver,
  mesaId,
  esMaster,
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen,
  proyeccionOculta,
  onReabrirProyeccion,
  onArchivosCambio,
  personaje,
  onActualizarPersonaje
}: ArchivadorProps) {
  const [archivos, setArchivos] = useState<PublicArchivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<
    | PublicArchivo
    | { id: string; nombre: string; tipo?: string; vista: string; url?: string }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [pjLocal, setPjLocal] = useState<PersonajeJugadorMesa>(
    personaje ?? PERSONAJE_VACIO
  );
  const [notasLocal, setNotasLocal] = useState(personaje?.notas ?? "");
  const [guardandoPj, setGuardandoPj] = useState(false);
  const [archivoParaRecortar, setArchivoParaRecortar] = useState<File | null>(
    null
  );
  const [retratoLocalUrl, setRetratoLocalUrl] = useState<string | null>(null);

  const selector = useRef<HTMLInputElement>(null);
  const selectorRetrato = useRef<HTMLInputElement>(null);
  const selectorFicha = useRef<HTMLInputElement>(null);
  const selectorPdfExtra = useRef<HTMLInputElement>(null);
  const onArchivosCambioRef = useRef(onArchivosCambio);
  onArchivosCambioRef.current = onArchivosCambio;

  useEffect(() => {
    if (personaje !== undefined) {
      const siguiente = personaje ?? PERSONAJE_VACIO;
      setPjLocal(siguiente);
      setNotasLocal(siguiente.notas ?? "");
    }
  }, [personaje]);

  useEffect(() => {
    return () => {
      if (retratoLocalUrl) {
        URL.revokeObjectURL(retratoLocalUrl);
      }
    };
  }, [retratoLocalUrl]);

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
      const lista = await archivosApi.listar(mesaId);
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
      .listar(mesaId)
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
        await archivosApi.subir(archivo, mesaId);
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

  async function guardarPersonaje(datos: ActualizacionPersonaje): Promise<void> {
    setPjLocal(prev => ({
      ...prev,
      ...datos,
      pdfs: datos.pdfs ?? prev.pdfs,
      notas: datos.notas ?? prev.notas
    }));
    if (!onActualizarPersonaje) return;
    setGuardandoPj(true);
    setError(null);
    try {
      await onActualizarPersonaje(datos);
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setGuardandoPj(false);
    }
  }

  function abrirArchivoPj(archivoId: string, nombreFallback?: string | null): void {
    const encontrado = archivos.find(a => a.id === archivoId);
    if (encontrado) {
      setVisor(encontrado);
      return;
    }
    const nombre = nombreFallback ?? "Documento";
    setVisor({
      id: archivoId,
      nombre,
      vista: inferirVistaPorNombre(nombre)
    });
  }

  function alElegirRetrato(evento: ChangeEvent<HTMLInputElement>): void {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    setArchivoParaRecortar(archivo);
  }

  async function alConfirmarRecorteRetrato(
    archivoRecortado: File
  ): Promise<void> {
    setArchivoParaRecortar(null);
    setSubiendo(true);
    setError(null);
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    try {
      const subido = await archivosApi.subir(archivoRecortado, mesaId);
      setRetratoLocalUrl(null);
      await cargarArchivos();
      await guardarPersonaje({ retratoArchivoId: subido.id });
    } catch (fallo) {
      if (esPreview) {
        const localUrl = URL.createObjectURL(archivoRecortado);
        setRetratoLocalUrl(localUrl);
        await guardarPersonaje({ retratoArchivoId: null });
      } else {
        setError(describeError(fallo));
      }
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarRetrato(): Promise<void> {
    setRetratoLocalUrl(null);
    await guardarPersonaje({ retratoArchivoId: null });
  }

  async function alSubirFichaPrincipal(
    evento: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    try {
      const subido = await archivosApi.subir(archivo, mesaId);
      await cargarArchivos();
      await guardarPersonaje({
        fichaArchivoId: subido.id,
        fichaNombre: subido.nombre
      });
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  async function alSeleccionarFicha(archivoId: string): Promise<void> {
    if (!archivoId) {
      await guardarPersonaje({ fichaArchivoId: null, fichaNombre: null });
      return;
    }
    const elegido = archivos.find(a => a.id === archivoId);
    await guardarPersonaje({
      fichaArchivoId: archivoId,
      fichaNombre: elegido?.nombre ?? "Ficha de personaje"
    });
  }

  async function alAgregarPdfExtra(archivoId: string): Promise<void> {
    if (!archivoId) return;
    if (pjLocal.pdfs.some(p => p.archivoId === archivoId)) return;
    const elegido = archivos.find(a => a.id === archivoId);
    const siguientes = [
      ...pjLocal.pdfs,
      { archivoId, nombre: elegido?.nombre ?? "Documento.pdf" }
    ];
    await guardarPersonaje({ pdfs: siguientes });
  }

  async function alSubirPdfExtra(
    evento: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    try {
      const subido = await archivosApi.subir(archivo, mesaId);
      await cargarArchivos();
      const siguientes = [
        ...pjLocal.pdfs,
        { archivoId: subido.id, nombre: subido.nombre }
      ];
      await guardarPersonaje({ pdfs: siguientes });
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarPdfExtra(archivoId: string): Promise<void> {
    const siguientes = pjLocal.pdfs.filter(p => p.archivoId !== archivoId);
    await guardarPersonaje({ pdfs: siguientes });
  }

  async function guardarNotasSiCambiaron(): Promise<void> {
    if (notasLocal === pjLocal.notas) return;
    await guardarPersonaje({ notas: notasLocal });
  }

  const positsArchivados = elementosMesa.filter(
    (el): el is Extract<ElementoMesa, { tipo: "posit" }> =>
      el.tipo === "posit" && Boolean(el.archivado)
  );
  const archivosArchivados = archivos.filter(
    archivo => !archivosEnMesa.some(doc => doc.archivoId === archivo.id)
  );
  const archivoFicha = pjLocal.fichaArchivoId
    ? archivos.find(a => a.id === pjLocal.fichaArchivoId)
    : undefined;
  const vistaFicha =
    archivoFicha?.vista ??
    inferirVistaPorNombre(pjLocal.fichaNombre ?? "");
  const formatoFicha = infoFormatoArchivo(vistaFicha);
  const pdfsDisponibles = archivos.filter(
    a =>
      a.vista !== "imagen" &&
      !pjLocal.pdfs.some(p => p.archivoId === a.id)
  );
  const retratoSrc =
    retratoLocalUrl ??
    (pjLocal.retratoArchivoId
      ? archivosApi.url(pjLocal.retratoArchivoId)
      : null);

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

          <div className="archivador-pj-layout">
            <section
              className="archivador-seccion archivador-pj-seccion"
              aria-label="Personaje (PJ)"
            >
              <div className="archivador-seccion-cabecera">
                <h2>Personaje (PJ)</h2>
                {guardandoPj && (
                  <span className="archivador-pj-estado">Guardando…</span>
                )}
              </div>

              <input
                ref={selectorRetrato}
                type="file"
                accept={ACEPTADOS_IMAGEN}
                className="archivador-input"
                onChange={alElegirRetrato}
              />
              <input
                ref={selectorFicha}
                type="file"
                accept={ACEPTADOS}
                className="archivador-input"
                onChange={alSubirFichaPrincipal}
              />
              <input
                ref={selectorPdfExtra}
                type="file"
                accept=".pdf,application/pdf"
                className="archivador-input"
                onChange={alSubirPdfExtra}
              />

              <div className="archivador-pj-cuerpo">
                <div className="archivador-pj-retrato-bloque">
                  <div className="archivador-pj-retrato-marco">
                    {retratoSrc ? (
                      <img
                        src={retratoSrc}
                        alt="Retrato del personaje"
                        className="archivador-pj-retrato-img"
                      />
                    ) : (
                      <div className="archivador-pj-retrato-vacio">
                        <User size={28} aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="archivador-pj-retrato-acciones">
                    <button
                      type="button"
                      className="archivador-pj-retrato-btn"
                      onClick={() => selectorRetrato.current?.click()}
                      disabled={subiendo}
                    >
                      <Upload size={12} aria-hidden="true" />
                      <span>{retratoSrc ? "Cambiar retrato" : "Subir retrato"}</span>
                    </button>
                    {retratoSrc && (
                      <button
                        type="button"
                        className="archivador-pj-retrato-quitar"
                        onClick={() => void quitarRetrato()}
                        title="Quitar retrato"
                        aria-label="Quitar retrato"
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="archivador-pj-ficha-bloque">
                  <span className="archivador-pj-etiqueta">
                    Ficha principal (privada)
                  </span>

                  {pjLocal.fichaArchivoId ? (
                    <div className="archivador-pj-ficha-fila">
                      <button
                        type="button"
                        className="archivador-pj-ficha-card"
                        onClick={() =>
                          abrirArchivoPj(
                            pjLocal.fichaArchivoId!,
                            pjLocal.fichaNombre
                          )
                        }
                        title="Abrir ficha de personaje"
                      >
                        <span
                          className={`ficha-doc-hoja mini ${formatoFicha.clase}`}
                          style={{ "--doc-color": formatoFicha.color } as CSSProperties}
                        >
                          {formatoFicha.codigo}
                        </span>
                        <span className="archivador-pj-ficha-info">
                          <span className="archivador-pj-ficha-nombre">
                            {pjLocal.fichaNombre ??
                              archivoFicha?.nombre ??
                              "Ficha de personaje"}
                          </span>
                          <span className="archivador-pj-ficha-sub">
                            Clic para abrir en el visor
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="archivador-pj-ficha-quitar"
                        onClick={() => void alSeleccionarFicha("")}
                        title="Quitar ficha principal"
                        aria-label="Quitar ficha principal"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="archivador-pj-ficha-selector">
                      <select
                        className="archivador-pj-select"
                        value=""
                        aria-label="Seleccionar ficha principal de mis archivos"
                        onChange={evento =>
                          void alSeleccionarFicha(evento.target.value)
                        }
                      >
                        <option value="">Elegir de mis archivos…</option>
                        {archivos.map(archivo => (
                          <option key={archivo.id} value={archivo.id}>
                            {archivo.nombre}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="archivador-pj-subir-btn"
                        onClick={() => selectorFicha.current?.click()}
                        disabled={subiendo}
                      >
                        <Plus size={12} aria-hidden="true" />
                        <span>Subir ficha</span>
                      </button>
                    </div>
                  )}

                  <div className="archivador-pj-pdfs-bloque">
                    <span className="archivador-pj-etiqueta">
                      PDFs adicionales
                    </span>
                    <div className="archivador-pj-pdfs-fila">
                      {pjLocal.pdfs.map(pdf => (
                        <div key={pdf.archivoId} className="archivador-pj-pdf-item">
                          <button
                            type="button"
                            className="archivador-pj-pdf-chip"
                            onClick={() =>
                              abrirArchivoPj(pdf.archivoId, pdf.nombre)
                            }
                            title={`Abrir ${pdf.nombre}`}
                          >
                            <FileText size={13} aria-hidden="true" />
                            <span>{pdf.nombre}</span>
                          </button>
                          <button
                            type="button"
                            className="archivador-pj-pdf-quitar"
                            onClick={() => void quitarPdfExtra(pdf.archivoId)}
                            title={`Desvincular ${pdf.nombre}`}
                            aria-label={`Desvincular ${pdf.nombre}`}
                          >
                            <X size={11} aria-hidden="true" />
                          </button>
                        </div>
                      ))}

                      <select
                        className="archivador-pj-pdf-agregar"
                        value=""
                        aria-label="Adjuntar PDF adicional"
                        onChange={evento =>
                          void alAgregarPdfExtra(evento.target.value)
                        }
                      >
                        <option value="">+ PDF de archivos…</option>
                        {pdfsDisponibles.map(archivo => (
                          <option key={archivo.id} value={archivo.id}>
                            {archivo.nombre}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="archivador-pj-pdf-subir"
                        onClick={() => selectorPdfExtra.current?.click()}
                        disabled={subiendo}
                        title="Subir nuevo PDF"
                        aria-label="Subir nuevo PDF"
                      >
                        <Plus size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="archivador-pj-notas-bloque">
                <label className="archivador-pj-etiqueta">
                  Notas del personaje
                  <textarea
                    className="archivador-pj-notas"
                    rows={3}
                    value={notasLocal}
                    placeholder="Rasgos, objetivos, recordatorios privados…"
                    onChange={evento => setNotasLocal(evento.target.value)}
                    onBlur={() => void guardarNotasSiCambiaron()}
                  />
                </label>
                {notasLocal !== pjLocal.notas && (
                  <button
                    type="button"
                    className="archivador-pj-notas-btn"
                    onClick={() => void guardarNotasSiCambiaron()}
                    disabled={guardandoPj}
                  >
                    Guardar notas
                  </button>
                )}
              </div>
            </section>

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
          </div>

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
      {archivoParaRecortar && (
        <RecorteRetratoModal
          archivo={archivoParaRecortar}
          onCancelar={() => setArchivoParaRecortar(null)}
          onConfirmar={archivoRecortado =>
            void alConfirmarRecorteRetrato(archivoRecortado)
          }
        />
      )}
    </div >
  );
}
