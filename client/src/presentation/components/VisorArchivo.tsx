import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { archivosApi } from "../../api/archivos.api";
import type { PublicArchivo } from "../../api/types";
import { describeError } from "../errorMessages";
import "../../styles/visor-archivo.css";

export interface ArchivoParaVisor {
  id: string;
  nombre: string;
  tipo?: string;
  vista: string;
  url?: string;
  contenidoLocal?: string;
  updatedAt?: string;
}

interface VisorArchivoProps {
  archivo: ArchivoParaVisor;
  puedeGuardar?: boolean;
  embebido?: boolean;
  accionesExtra?: ReactNode;
  onCerrar: () => void;
  onGuardado?: (actualizado: PublicArchivo) => void;
}

interface WidgetAcroForm {
  id: string;
  nombre: string;
  tipo: "texto" | "textarea" | "checkbox" | "radio" | "select";
  valorRadio?: string;
  opciones?: Array<{ value: string; label: string }>;
  soloLectura?: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PaginaPdfRender {
  numero: number;
  ancho: number;
  alto: number;
  widgets: WidgetAcroForm[];
}

interface PdfPageProxy {
  getViewport: (opts: { scale: number }) => {
    width: number;
    height: number;
    convertToViewportRectangle: (rect: number[]) => number[];
  };
  getAnnotations: (opts?: { intent?: string }) => Promise<Array<Record<string, unknown>>>;
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    transform?: number[];
    canvas: HTMLCanvasElement;
  }) => { promise: Promise<void>; cancel?: () => void };
}

interface PdfDocProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void>;
}

export function VisorArchivo(props: VisorArchivoProps) {
  return <VisorArchivoContenido key={props.archivo.id} {...props} />;
}

function VisorArchivoContenido({
  archivo,
  puedeGuardar = true,
  embebido = false,
  accionesExtra,
  onCerrar,
  onGuardado
}: VisorArchivoProps) {
  const [versionCarga, setVersionCarga] = useState<string>(archivo.updatedAt ?? "");
  const [versionActual, setVersionActual] = useState<string>(archivo.updatedAt ?? "");
  const [recargaTick, setRecargaTick] = useState(0);
  const [hayActualizacionRemota, setHayActualizacionRemota] = useState(false);
  const versionPendienteRef = useRef<string>("");
  const ultimaVersionConocidaRef = useRef<string>(archivo.updatedAt ?? "");
  const onGuardadoRef = useRef(onGuardado);

  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "ko"; texto: string } | null>(
    null
  );
  const [tieneAccionGuardar, setTieneAccionGuardar] = useState(false);
  const [hayCambiosSinGuardar, setHayCambiosSinGuardar] = useState(false);
  const hayCambiosSinGuardarRef = useRef(false);
  const accionGuardarRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    onGuardadoRef.current = onGuardado;
  }, [onGuardado]);

  useEffect(() => {
    hayCambiosSinGuardarRef.current = hayCambiosSinGuardar;
  }, [hayCambiosSinGuardar]);

  useEffect(() => {
    const entrante = archivo.updatedAt ?? "";
    if (!entrante) return;
    if (!ultimaVersionConocidaRef.current) {
      ultimaVersionConocidaRef.current = entrante;
      setVersionActual(entrante);
      return;
    }
    if (entrante === ultimaVersionConocidaRef.current) return;
    if (hayCambiosSinGuardarRef.current) {
      versionPendienteRef.current = entrante;
      setHayActualizacionRemota(true);
      return;
    }
    ultimaVersionConocidaRef.current = entrante;
    setVersionCarga(entrante);
    setVersionActual(entrante);
    setHayActualizacionRemota(false);
  }, [archivo.updatedAt]);

  useEffect(() => {
    if (embebido) return;
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        onCerrar();
      }
    };
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [embebido, onCerrar]);

  useEffect(() => {
    const alActualizar = (evento: Event) => {
      const detalle = (
        evento as CustomEvent<{ archivoId?: string; updatedAt?: string }>
      ).detail;
      if (!detalle || detalle.archivoId !== archivo.id) return;
      versionPendienteRef.current = detalle.updatedAt ?? String(Date.now());
      setHayActualizacionRemota(true);
    };

    window.addEventListener("pocketrol:archivo-actualizado", alActualizar);
    return () => {
      window.removeEventListener("pocketrol:archivo-actualizado", alActualizar);
    };
  }, [archivo.id]);

  const esUrlInternaArchivo =
    typeof archivo.url === "string" &&
    (archivo.url.startsWith("/api/archivos/") || archivo.url.includes("/api/archivos/"));
  const esExterno = Boolean(
    archivo.contenidoLocal || (archivo.url && !esUrlInternaArchivo)
  );
  const edicionHabilitada = puedeGuardar && !esExterno;
  const urlExterna = esUrlInternaArchivo ? undefined : archivo.url;
  const versionCargaParam =
    versionCarga || (recargaTick > 0 ? String(recargaTick) : undefined);
  const versionDescargaParam = versionActual || versionCargaParam;
  const recursoUrl =
    archivo.contenidoLocal ??
    urlExterna ??
    archivosApi.url(archivo.id, false, versionCargaParam);
  const descargaUrl =
    urlExterna ?? archivosApi.url(archivo.id, true, versionDescargaParam);

  const recargarRemoto = () => {
    const siguienteVersion = versionPendienteRef.current || String(Date.now());
    setHayActualizacionRemota(false);
    setFeedback(null);
    ultimaVersionConocidaRef.current = siguienteVersion;
    setVersionCarga(siguienteVersion);
    setVersionActual(siguienteVersion);
    setRecargaTick(t => t + 1);
  };

  const registrarGuardado = useCallback(
    (fn: (() => Promise<void>) | null, dirty: boolean) => {
      accionGuardarRef.current = fn;
      setTieneAccionGuardar(Boolean(fn));
      setHayCambiosSinGuardar(dirty);
    },
    []
  );

  const mostrarErrorVisor = useCallback((texto: string) => {
    setFeedback({ tipo: "ko", texto });
  }, []);

  const ejecutarGuardado = useCallback(async () => {
    if (!accionGuardarRef.current || guardando) return;
    setGuardando(true);
    setFeedback(null);
    try {
      await accionGuardarRef.current();
    } catch (err) {
      setFeedback({ tipo: "ko", texto: describeError(err) });
    } finally {
      setGuardando(false);
    }
  }, [guardando]);

  const confirmarGuardado = useCallback(
    (actualizado: PublicArchivo, hayPendientes = false) => {
      const nuevaVersion = actualizado.updatedAt ?? String(Date.now());
      ultimaVersionConocidaRef.current = nuevaVersion;
      setVersionActual(nuevaVersion);
      setHayCambiosSinGuardar(hayPendientes);
      setHayActualizacionRemota(false);
      setFeedback({ tipo: "ok", texto: "Cambios guardados en la nube." });
      onGuardadoRef.current?.(actualizado);
    },
    []
  );

  const esPdf = archivo.vista === "pdf" || /\.pdf$/i.test(archivo.nombre);
  const esDocx =
    archivo.vista === "docx" ||
    archivo.vista === "doc" ||
    /\.docx$/i.test(archivo.nombre);

  const soportaGuardado =
    edicionHabilitada && (esPdf || archivo.vista === "texto");

  const contenidoCaja = (
    <div
      className="visor-unificado-caja"
      onClick={embebido ? undefined : evento => evento.stopPropagation()}
    >
      <header className="visor-unificado-cabecera">
        <span className="visor-unificado-nombre" title={archivo.nombre}>
          {archivo.nombre}
        </span>

        <div className="visor-unificado-acciones">
          {accionesExtra}

          {soportaGuardado && tieneAccionGuardar && (
            <button
              type="button"
              className="visor-unificado-btn guardar"
              disabled={guardando || !hayCambiosSinGuardar}
              onClick={() => void ejecutarGuardado()}
              title={
                hayCambiosSinGuardar
                  ? "Guardar cambios en la nube"
                  : "Edita un campo para activar el guardado"
              }
            >
              {guardando ? (
                <Loader2 size={14} className="icono-girando" aria-hidden="true" />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              <span>{guardando ? "Guardando…" : "Guardar cambios"}</span>
            </button>
          )}

          {!archivo.contenidoLocal && (
            <a
              className="visor-unificado-descargar"
              href={descargaUrl}
              download={archivo.nombre}
            >
              <Download size={14} aria-hidden="true" />
              <span>Descargar</span>
            </a>
          )}

          {!embebido && (
            <button
              type="button"
              className="visor-unificado-cerrar"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              <X size={15} aria-hidden="true" />
              <span>Cerrar</span>
            </button>
          )}
        </div>
      </header>

      {hayActualizacionRemota && (
        <div className="visor-aviso-actualizado" role="status">
          <span>Este archivo se ha actualizado en la nube.</span>
          <button
            type="button"
            className="visor-tool-btn"
            onClick={recargarRemoto}
          >
            <RefreshCw size={13} aria-hidden="true" />
            <span>Recargar</span>
          </button>
        </div>
      )}

      {feedback && (
        <div className={`visor-feedback-bar ${feedback.tipo}`} role="status">
          {feedback.texto}
        </div>
      )}

      <div className="visor-unificado-marco">
        {archivo.vista === "imagen" ? (
          <VisorImagen key={recursoUrl} url={recursoUrl} nombre={archivo.nombre} />
        ) : esPdf ? (
          <VisorPdf
            key={recursoUrl}
            archivoId={archivo.id}
            nombre={archivo.nombre}
            url={recursoUrl}
            edicionHabilitada={edicionHabilitada}
            onRegistrarGuardado={registrarGuardado}
            onGuardadoOk={confirmarGuardado}
            onGuardarAtajo={() => void ejecutarGuardado()}
            onError={mostrarErrorVisor}
          />
        ) : esDocx ? (
          <VisorDocx key={recursoUrl} url={recursoUrl} />
        ) : archivo.vista === "texto" ? (
          <VisorTexto
            key={recursoUrl}
            archivoId={archivo.id}
            nombre={archivo.nombre}
            tipoMime={archivo.tipo}
            url={recursoUrl}
            contenidoLocal={archivo.contenidoLocal}
            edicionHabilitada={edicionHabilitada}
            onRegistrarGuardado={registrarGuardado}
            onGuardadoOk={confirmarGuardado}
            onGuardarAtajo={() => void ejecutarGuardado()}
          />
        ) : archivo.vista === "audio" ? (
          <div className="visor-centro-estado">
            <audio className="visor-audio-player" controls src={recursoUrl} />
          </div>
        ) : (
          <div className="visor-centro-estado">
            <p>Este formato no admite previsualización directa.</p>
            {!archivo.contenidoLocal && (
              <a
                className="visor-unificado-descargar"
                href={descargaUrl}
                download={archivo.nombre}
              >
                <Download size={14} aria-hidden="true" />
                <span>Descargar archivo</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (embebido) {
    return (
      <div className="visor-archivo-embebido" aria-label={archivo.nombre}>
        {contenidoCaja}
      </div>
    );
  }

  return (
    <div
      className="visor-unificado-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={archivo.nombre}
      onClick={onCerrar}
    >
      {contenidoCaja}
    </div>
  );
}

function VisorImagen({ url, nombre }: { url: string; nombre: string }) {
  const [rotacion, setRotacion] = useState(0);

  return (
    <TransformWrapper initialScale={1} minScale={0.25} maxScale={8} centerOnInit>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          <div className="visor-barra-herramientas">
            <div className="visor-herramientas-grupo">
              <button
                type="button"
                className="visor-tool-btn"
                onClick={() => zoomOut()}
                aria-label="Alejar"
              >
                <ZoomOut size={14} aria-hidden="true" />
                <span>−</span>
              </button>
              <button
                type="button"
                className="visor-tool-btn"
                onClick={() => zoomIn()}
                aria-label="Acercar"
              >
                <ZoomIn size={14} aria-hidden="true" />
                <span>+</span>
              </button>
              <button
                type="button"
                className="visor-tool-btn"
                onClick={() => setRotacion(r => (r - 90 + 360) % 360)}
                aria-label="Rotar 90 grados a la izquierda"
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>-90°</span>
              </button>
              <button
                type="button"
                className="visor-tool-btn"
                onClick={() => setRotacion(r => (r + 90) % 360)}
                aria-label="Rotar 90 grados a la derecha"
              >
                <RotateCw size={14} aria-hidden="true" />
                <span>+90°</span>
              </button>
              <button
                type="button"
                className="visor-tool-btn"
                onClick={() => {
                  setRotacion(0);
                  resetTransform();
                }}
              >
                Reset
              </button>
            </div>
            <span className="muted">Arrastra para mover · Rueda o pellizco para zoom</span>
          </div>

          <div className="visor-imagen-zona">
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <div
                className="visor-imagen-rot-wrap"
                style={{ transform: `rotate(${rotacion}deg)` }}
              >
                <img className="visor-imagen-el" src={url} alt={nombre} />
              </div>
            </TransformComponent>
          </div>
        </>
      )}
    </TransformWrapper>
  );
}

function VisorDocx({ url }: { url: string }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [cargando, setCargando] = useState(true);
  const [errorDocx, setErrorDocx] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const [modulo, respuesta] = await Promise.all([
          import("docx-preview"),
          fetch(url, { credentials: "include", cache: "no-cache" })
        ]);
        if (!respuesta.ok) {
          throw new Error(`HTTP_${respuesta.status}`);
        }
        const buffer = await respuesta.arrayBuffer();
        const contenedor = contenedorRef.current;
        if (cancelado || !contenedor) return;
        contenedor.innerHTML = "";

        await (
          modulo as {
            renderAsync: (
              data: ArrayBuffer,
              bodyContainer: HTMLElement,
              styleContainer?: HTMLElement,
              options?: Record<string, unknown>
            ) => Promise<void>;
          }
        ).renderAsync(buffer, contenedor, undefined, {
          className: "archivador-docx-canvas"
        });
        if (!cancelado) setCargando(false);
      } catch {
        if (!cancelado) {
          setErrorDocx("No se pudo previsualizar este documento Word.");
          setCargando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [url]);

  return (
    <div className="visor-docx-scroll">
      {cargando && <p className="muted">Cargando documento…</p>}
      {errorDocx && <p className="visor-feedback-bar ko">{errorDocx}</p>}
      <div ref={contenedorRef} />
    </div>
  );
}

function VisorTexto({
  archivoId,
  nombre,
  tipoMime,
  url,
  contenidoLocal,
  edicionHabilitada,
  onRegistrarGuardado,
  onGuardadoOk,
  onGuardarAtajo
}: {
  archivoId: string;
  nombre: string;
  tipoMime?: string;
  url: string;
  contenidoLocal?: string;
  edicionHabilitada: boolean;
  onRegistrarGuardado: (fn: (() => Promise<void>) | null, dirty: boolean) => void;
  onGuardadoOk: (actualizado: PublicArchivo) => void;
  onGuardarAtajo: () => void;
}) {
  const [texto, setTexto] = useState(contenidoLocal ?? "");
  const [textoOriginal, setTextoOriginal] = useState(contenidoLocal ?? "");
  const [cargando, setCargando] = useState(contenidoLocal === undefined);

  useEffect(() => {
    if (contenidoLocal !== undefined) {
      return undefined;
    }

    let activo = true;
    (async () => {
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        const contenido = await res.text();
        if (activo) {
          setTexto(contenido);
          setTextoOriginal(contenido);
        }
      } catch {
        if (activo) {
          const fallback = "No se pudo leer este archivo de texto.";
          setTexto(fallback);
          setTextoOriginal(fallback);
        }
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, [url, contenidoLocal]);

  const dirty = edicionHabilitada && !cargando && texto !== textoOriginal;

  const guardar = useCallback(async () => {
    const bytes = new TextEncoder().encode(texto);
    const actualizado = await archivosApi.actualizar(
      archivoId,
      bytes,
      tipoMime || "text/plain"
    );
    setTextoOriginal(texto);
    onGuardadoOk(actualizado);
  }, [archivoId, texto, tipoMime, onGuardadoOk]);

  useEffect(() => {
    onRegistrarGuardado(edicionHabilitada ? guardar : null, dirty);
  }, [edicionHabilitada, guardar, dirty, onRegistrarGuardado]);

  useEffect(() => {
    return () => onRegistrarGuardado(null, false);
  }, [onRegistrarGuardado]);

  return (
    <div className="visor-texto-wrap">
      {cargando ? (
        <div className="visor-centro-estado">
          <Loader2 size={20} className="icono-girando" aria-hidden="true" />
          <span>Cargando texto…</span>
        </div>
      ) : (
        <textarea
          className="visor-texto-editor"
          aria-label={nombre}
          value={texto}
          readOnly={!edicionHabilitada}
          onChange={evento => setTexto(evento.target.value)}
          onKeyDown={evento => {
            if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s") {
              evento.preventDefault();
              if (dirty) onGuardarAtajo();
            }
          }}
        />
      )}
    </div>
  );
}

function VisorPdf({
  archivoId,
  nombre,
  url,
  edicionHabilitada,
  onRegistrarGuardado,
  onGuardadoOk,
  onGuardarAtajo,
  onError
}: {
  archivoId: string;
  nombre: string;
  url: string;
  edicionHabilitada: boolean;
  onRegistrarGuardado: (fn: (() => Promise<void>) | null, dirty: boolean) => void;
  onGuardadoOk: (actualizado: PublicArchivo, hayPendientes?: boolean) => void;
  onGuardarAtajo?: () => void;
  onError: (msg: string) => void;
}) {
  const radioGrupoPrefijo = useId();
  const [escala, setEscala] = useState(1.15);
  const [cargando, setCargando] = useState(true);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [usarFallbackIframe, setUsarFallbackIframe] = useState(false);
  const [paginas, setPaginas] = useState<PaginaPdfRender[]>([]);
  const [tieneFormulario, setTieneFormulario] = useState(false);
  const [valoresForm, setValoresForm] = useState<Record<string, string | boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  const montadoRef = useRef(true);
  const bytesRef = useRef<Uint8Array | null>(null);
  const pdfDocRef = useRef<PdfDocProxy | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const valoresRef = useRef<Record<string, string | boolean>>({});
  const camposModificadosRef = useRef<Set<string>>(new Set());
  const edicionSeqRef = useRef(0);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  useEffect(() => {
    valoresRef.current = valoresForm;
  }, [valoresForm]);

  // 1. Carga el PDF y extrae los campos AcroForm iniciales con pdf-lib
  useEffect(() => {
    if (!url) {
      const msg = "No se pudo cargar este documento PDF.";
      setErrorPdf(msg);
      onError(msg);
      setCargando(false);
      return;
    }

    let cancelado = false;

    (async () => {
      try {
        const [pdfjs, pdfLib, respuesta] = await Promise.all([
          import("pdfjs-dist"),
          import("pdf-lib"),
          fetch(url, { credentials: "include", cache: "no-cache" })
        ]);
        if (!respuesta.ok) throw new Error(`HTTP_${respuesta.status}`);

        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        const buffer = await respuesta.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (cancelado) return;
        bytesRef.current = bytes;

        const iniciales: Record<string, string | boolean> = {};
        let hayCampos = false;
        try {
          const docLib = await pdfLib.PDFDocument.load(bytes, {
            ignoreEncryption: true
          });
          const form = docLib.getForm();
          const fields = form.getFields();
          for (const field of fields) {
            try {
              const nombreCampo = field.getName();
              if (field instanceof pdfLib.PDFTextField) {
                hayCampos = true;
                try {
                  iniciales[nombreCampo] = field.getText() ?? "";
                } catch {
                  // Campos de texto enriquecido (XFA/RichText) no permiten getText().
                  iniciales[nombreCampo] = "";
                }
              } else if (field instanceof pdfLib.PDFCheckBox) {
                hayCampos = true;
                iniciales[nombreCampo] = field.isChecked();
              } else if (field instanceof pdfLib.PDFDropdown) {
                hayCampos = true;
                iniciales[nombreCampo] = field.getSelected()[0] ?? "";
              } else if (field instanceof pdfLib.PDFOptionList) {
                hayCampos = true;
                iniciales[nombreCampo] = field.getSelected()[0] ?? "";
              } else if (field instanceof pdfLib.PDFRadioGroup) {
                hayCampos = true;
                iniciales[nombreCampo] = field.getSelected() ?? "";
              }
            } catch {
              // Ignora un campo corrupto puntual sin abortar la lectura del resto del formulario.
            }
          }
        } catch {
          // PDF sin AcroForm o cifrado solo lectura: sigue renderizando como visor.
        }

        const loadingTask = pdfjs.getDocument({
          data: bytes.slice(),
          useSystemFonts: true
        });
        const proxy = await loadingTask.promise;
        if (cancelado) {
          void loadingTask.destroy().catch(() => {});
          return;
        }

        pdfDocRef.current = proxy as unknown as PdfDocProxy;
        camposModificadosRef.current.clear();
        valoresRef.current = iniciales;
        setTieneFormulario(hayCampos);
        setValoresForm(iniciales);
        setDirty(false);
        setErrorPdf(null);
        setUsarFallbackIframe(false);
        setCargando(false);
      } catch (err) {
        console.error("[VisorPdf]", err);
        if (!cancelado) {
          setErrorPdf(null);
          setUsarFallbackIframe(true);
          setCargando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      const proxyAnterior = pdfDocRef.current;
      pdfDocRef.current = null;
      if (proxyAnterior?.destroy) {
        void proxyAnterior.destroy().catch(() => {});
      }
    };
  }, [url, onError]);

  // 2. Calcula las páginas y los widgets AcroForm al cambiar el zoom o recargar el documento
  useEffect(() => {
    const proxy = pdfDocRef.current;
    if (!proxy || cargando || usarFallbackIframe) return undefined;

    let cancelado = false;

    (async () => {
      try {
        const listas: PaginaPdfRender[] = [];
        let hayWidgets = false;

        for (let num = 1; num <= proxy.numPages; num++) {
          const page = await proxy.getPage(num);
          if (cancelado) return;
          const viewport = page.getViewport({ scale: escala });

          let anotaciones: Array<Record<string, unknown>> = [];
          try {
            anotaciones = await page.getAnnotations({ intent: "display" });
          } catch (errAnnot) {
            console.error("[VisorPdf] Error leyendo anotaciones:", errAnnot);
            anotaciones = [];
          }
          if (cancelado) return;

          const widgets: WidgetAcroForm[] = [];
          for (let i = 0; i < anotaciones.length; i++) {
            try {
              const annot = anotaciones[i];
              if (!annot || annot.subtype !== "Widget") continue;
              const nombreCampo =
                typeof annot.fieldName === "string" ? annot.fieldName : "";
              const rect = Array.isArray(annot.rect) ? (annot.rect as number[]) : null;
              if (!nombreCampo || !rect || rect.length < 4) continue;

              const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
              if (
                !Number.isFinite(x1) ||
                !Number.isFinite(y1) ||
                !Number.isFinite(x2) ||
                !Number.isFinite(y2)
              ) {
                continue;
              }
              const left = Math.min(x1, x2);
              const top = Math.min(y1, y2);
              const width = Math.max(8, Math.abs(x2 - x1));
              const height = Math.max(8, Math.abs(y2 - y1));

              const fieldType = String(annot.fieldType ?? "");
              const soloLectura = Boolean(annot.readOnly);
              let tipo: WidgetAcroForm["tipo"] | null = null;
              if (fieldType === "Tx") {
                tipo = annot.multiLine ? "textarea" : "texto";
              } else if (fieldType === "Btn") {
                if (annot.checkBox) tipo = "checkbox";
                else if (annot.radioButton) tipo = "radio";
              } else if (fieldType === "Ch") {
                tipo = "select";
              }
              if (!tipo) continue;

              const opcionesBrutas = Array.isArray(annot.options)
                ? (annot.options as Array<{ exportValue?: string; displayValue?: string }>)
                : undefined;
              const opciones = opcionesBrutas?.map(op => ({
                value: String(op?.exportValue ?? op?.displayValue ?? ""),
                label: String(op?.displayValue ?? op?.exportValue ?? "")
              }));

              widgets.push({
                id: `${num}-${nombreCampo}-${i}`,
                nombre: nombreCampo,
                tipo,
                valorRadio:
                  typeof annot.buttonValue === "string" ? annot.buttonValue : undefined,
                opciones,
                soloLectura,
                left,
                top,
                width,
                height
              });
            } catch (errWidget) {
              console.error("[VisorPdf] Error procesando widget AcroForm:", errWidget);
            }
          }

          if (widgets.length > 0) {
            hayWidgets = true;
          }

          listas.push({
            numero: num,
            ancho: viewport.width,
            alto: viewport.height,
            widgets
          });
        }

        if (cancelado) return;
        if (hayWidgets) {
          setTieneFormulario(true);
        }
        setPaginas(listas);
      } catch (err) {
        console.error("[VisorPdf]", err);
        if (!cancelado) {
          setPaginas([]);
          setUsarFallbackIframe(true);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [escala, cargando, url, renderTick, usarFallbackIframe]);

  // 3. Pinta los <canvas> una vez React ha montado las páginas y poblado canvasRefs
  useEffect(() => {
    const proxy = pdfDocRef.current;
    if (!proxy || paginas.length === 0) return undefined;

    let cancelado = false;
    const tareasActivas: Array<{ cancel?: () => void }> = [];

    (async () => {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (const info of paginas) {
          if (cancelado) return;
          const canvas = canvasRefs.current.get(info.numero);
          if (!canvas) continue;
          const page = await proxy.getPage(info.numero);
          if (cancelado) return;
          const viewport = page.getViewport({ scale: escala });
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          const task = page.render({
            canvasContext: ctx,
            viewport,
            canvas,
            ...(dpr !== 1 ? { transform: [dpr, 0, 0, dpr, 0, 0] } : {})
          });
          tareasActivas.push(task);
          try {
            await task.promise;
          } catch (errRender) {
            if (!cancelado) {
              console.error("[VisorPdf] Error renderizando página:", errRender);
            }
          }
        }
      } catch (err) {
        if (!cancelado) {
          console.error("[VisorPdf]", err);
        }
      }
    })();

    return () => {
      cancelado = true;
      for (const tarea of tareasActivas) {
        tarea.cancel?.();
      }
    };
  }, [paginas, escala, renderTick]);

  const guardarPdf = useCallback(async () => {
    const originales = bytesRef.current;
    if (!originales) return;

    const actuales = { ...valoresRef.current };
    const modificados = new Set(camposModificadosRef.current);
    const seqAlGuardar = edicionSeqRef.current;

    const pdfLib = await import("pdf-lib");
    const docLib = await pdfLib.PDFDocument.load(originales, {
      ignoreEncryption: true
    });
    const form = docLib.getForm();
    const fields = form.getFields();

    if (fields.length > 0 && form.hasXFA()) {
      form.deleteXFA();
    }

    for (const field of fields) {
      const nombreCampo = field.getName();
      if (!(nombreCampo in actuales)) continue;
      const val = actuales[nombreCampo];
      const fueEditado = modificados.has(nombreCampo);

      try {
        if (field instanceof pdfLib.PDFTextField) {
          const texto = typeof val === "string" ? val : String(val ?? "");
          let actualPdf: string | null = null;
          try {
            actualPdf = field.getText() ?? "";
          } catch {
            actualPdf = null;
          }
          if (fueEditado || (actualPdf !== null && actualPdf !== texto)) {
            const maxLength = field.getMaxLength();
            if (maxLength !== undefined && texto.length > maxLength) {
              field.removeMaxLength();
            }
            field.setText(texto);
          }
        } else if (field instanceof pdfLib.PDFCheckBox) {
          const marcado = Boolean(val);
          let actualPdf: boolean | null = null;
          try {
            actualPdf = field.isChecked();
          } catch {
            actualPdf = null;
          }
          if (fueEditado || actualPdf !== marcado) {
            if (marcado) field.check();
            else field.uncheck();
          }
        } else if (field instanceof pdfLib.PDFDropdown) {
          const seleccion = typeof val === "string" ? val : "";
          const actualPdf = field.getSelected()[0] ?? "";
          if (fueEditado || actualPdf !== seleccion) {
            if (seleccion) field.select(seleccion);
            else field.clear();
          }
        } else if (field instanceof pdfLib.PDFOptionList) {
          const seleccion = typeof val === "string" ? val : "";
          const actualPdf = field.getSelected()[0] ?? "";
          if (fueEditado || actualPdf !== seleccion) {
            if (!seleccion) {
              field.clear();
            } else {
              const opciones = field.getOptions();
              if (opciones.includes(seleccion)) {
                field.select(seleccion);
              } else {
                const coincidencia = field.acroField
                  .getOptions()
                  .find(op => op.value.decodeText() === seleccion);
                if (coincidencia) {
                  field.select((coincidencia.display ?? coincidencia.value).decodeText());
                }
              }
            }
          }
        } else if (field instanceof pdfLib.PDFRadioGroup) {
          const seleccion = typeof val === "string" ? val : "";
          const actualPdf = field.getSelected() ?? "";
          if (fueEditado || actualPdf !== seleccion) {
            if (!seleccion || seleccion === "Off") {
              field.clear();
            } else {
              const opciones = field.getOptions();
              if (opciones.includes(seleccion)) {
                field.select(seleccion);
              } else {
                const onValues = field.acroField.getOnValues();
                const exportValues = field.acroField.getExportValues();
                const idx = onValues.findIndex(v => v.decodeText() === seleccion);
                if (idx !== -1) {
                  const objetivo = exportValues?.[idx]?.decodeText() ?? opciones[idx];
                  if (objetivo) field.select(objetivo);
                }
              }
            }
          }
        }
      } catch {
        // Evita que un campo AcroForm atípico aborte el guardado del resto del PDF.
      }
    }

    let huboFalloApariencia = false;
    try {
      const fuentePorDefecto = form.getDefaultFont();
      for (const field of fields) {
        try {
          if (field.needsAppearancesUpdate()) {
            field.defaultUpdateAppearances(fuentePorDefecto);
          }
        } catch {
          huboFalloApariencia = true;
        }
      }
    } catch {
      huboFalloApariencia = true;
    }

    if (huboFalloApariencia) {
      form.acroForm.dict.set(pdfLib.PDFName.of("NeedAppearances"), pdfLib.PDFBool.True);
    }

    // Evita que docLib.save() vuelva a invocar updateFieldAppearances() y falle con caracteres fuera de WinAnsi.
    const bytesEditados = await docLib.save({ updateFieldAppearances: false });
    const actualizado = await archivosApi.actualizar(
      archivoId,
      bytesEditados,
      "application/pdf"
    );
    bytesRef.current = new Uint8Array(bytesEditados);

    const hayPendientes = edicionSeqRef.current !== seqAlGuardar;
    if (!hayPendientes) {
      camposModificadosRef.current.clear();
      setDirty(false);
    } else {
      for (const clave of modificados) {
        if (valoresRef.current[clave] === actuales[clave]) {
          camposModificadosRef.current.delete(clave);
        }
      }
    }

    onGuardadoOk(actualizado, hayPendientes);

    // Refresca el lienzo local desde los bytes ya guardados sin volver a descargar de red.
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const loadingTask = pdfjs.getDocument({
        data: bytesEditados.slice(),
        useSystemFonts: true
      });
      const nuevoProxy = await loadingTask.promise;
      if (!montadoRef.current) {
        void loadingTask.destroy().catch(() => {});
      } else {
        const proxyAnterior = pdfDocRef.current;
        pdfDocRef.current = nuevoProxy as unknown as PdfDocProxy;
        setRenderTick(t => t + 1);
        if (proxyAnterior?.destroy) {
          void proxyAnterior.destroy().catch(() => {});
        }
      }
    } catch {
      // El guardado ya está persistido; mantenemos el lienzo actual si falla el repintado local.
    }
  }, [archivoId, onGuardadoOk]);

  useEffect(() => {
    const activo = edicionHabilitada && tieneFormulario;
    onRegistrarGuardado(activo ? guardarPdf : null, activo && dirty);
  }, [edicionHabilitada, tieneFormulario, guardarPdf, dirty, onRegistrarGuardado]);

  useEffect(() => {
    return () => onRegistrarGuardado(null, false);
  }, [onRegistrarGuardado]);

  const actualizarValor = (nombre: string, valor: string | boolean) => {
    edicionSeqRef.current += 1;
    camposModificadosRef.current.add(nombre);
    setValoresForm(prev => {
      const siguiente = { ...prev, [nombre]: valor };
      valoresRef.current = siguiente;
      return siguiente;
    });
    setDirty(true);
  };

  return (
    <>
      <div className="visor-barra-herramientas">
        <div className="visor-herramientas-grupo">
          <button
            type="button"
            className="visor-tool-btn"
            disabled={usarFallbackIframe}
            onClick={() => setEscala(s => Math.max(0.6, Number((s - 0.15).toFixed(2))))}
            aria-label="Alejar PDF"
          >
            <ZoomOut size={14} aria-hidden="true" />
            <span>−</span>
          </button>
          <span className="visor-zoom-valor">{Math.round(escala * 100)}%</span>
          <button
            type="button"
            className="visor-tool-btn"
            disabled={usarFallbackIframe}
            onClick={() => setEscala(s => Math.min(2.5, Number((s + 0.15).toFixed(2))))}
            aria-label="Acercar PDF"
          >
            <ZoomIn size={14} aria-hidden="true" />
            <span>+</span>
          </button>
          <button
            type="button"
            className="visor-tool-btn"
            disabled={usarFallbackIframe}
            onClick={() => setEscala(1.15)}
          >
            Ajustar
          </button>
        </div>

        <span className="muted">
          {usarFallbackIframe
            ? "Visor nativo del navegador"
            : tieneFormulario
              ? edicionHabilitada
                ? "Formulario editable · Pulsa «Guardar cambios» al terminar"
                : "Formulario PDF (solo lectura)"
              : paginas.length > 0
                ? `${paginas.length} ${paginas.length === 1 ? "página" : "páginas"}`
                : "Cargando PDF…"}
        </span>
      </div>

      <div
        className="visor-pdf-scroll"
        onKeyDown={evento => {
          if (
            edicionHabilitada &&
            tieneFormulario &&
            (evento.ctrlKey || evento.metaKey) &&
            evento.key.toLowerCase() === "s"
          ) {
            evento.preventDefault();
            if (dirty) onGuardarAtajo?.();
          }
        }}
      >
        {cargando && (
          <div className="visor-centro-estado">
            <Loader2 size={22} className="icono-girando" aria-hidden="true" />
            <span>Renderizando PDF…</span>
          </div>
        )}
        {errorPdf && <p className="visor-feedback-bar ko">{errorPdf}</p>}

        {!cargando && usarFallbackIframe && (
          <iframe
            src={url}
            title={nombre}
            className="visor-pdf-iframe-fallback"
          />
        )}

        {!cargando &&
          !usarFallbackIframe &&
          paginas.map(pag => (
            <div
              key={pag.numero}
              className="visor-pdf-pagina"
              style={{ width: pag.ancho, height: pag.alto }}
            >
              <canvas
                ref={el => {
                  if (el) canvasRefs.current.set(pag.numero, el);
                  else canvasRefs.current.delete(pag.numero);
                }}
                className="visor-pdf-canvas"
              />

              {pag.widgets.length > 0 && (
                <div className="visor-pdf-acroform-capa">
                  {pag.widgets.map(w => {
                    const deshabilitado = !edicionHabilitada || Boolean(w.soloLectura);
                    const estilo = {
                      left: `${w.left}px`,
                      top: `${w.top}px`,
                      width: `${w.width}px`,
                      height: `${w.height}px`
                    };

                    if (w.tipo === "checkbox") {
                      return (
                        <input
                          key={w.id}
                          type="checkbox"
                          className="visor-acro-check"
                          style={estilo}
                          aria-label={w.nombre}
                          disabled={deshabilitado}
                          checked={Boolean(valoresForm[w.nombre])}
                          onChange={e => actualizarValor(w.nombre, e.target.checked)}
                        />
                      );
                    }

                    if (w.tipo === "radio") {
                      return (
                        <input
                          key={w.id}
                          type="radio"
                          className="visor-acro-check"
                          style={estilo}
                          name={`${radioGrupoPrefijo}-${w.nombre}`}
                          aria-label={w.nombre}
                          disabled={deshabilitado}
                          checked={valoresForm[w.nombre] === (w.valorRadio ?? "")}
                          onChange={() =>
                            actualizarValor(w.nombre, w.valorRadio ?? "")
                          }
                        />
                      );
                    }

                    if (w.tipo === "select") {
                      return (
                        <select
                          key={w.id}
                          className="visor-acro-campo"
                          style={estilo}
                          aria-label={w.nombre}
                          disabled={deshabilitado}
                          value={
                            typeof valoresForm[w.nombre] === "string"
                              ? (valoresForm[w.nombre] as string)
                              : ""
                          }
                          onChange={e => actualizarValor(w.nombre, e.target.value)}
                        >
                          <option value="" />
                          {(w.opciones ?? []).map((op, idx) => (
                            <option key={`${op.value}-${idx}`} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      );
                    }

                    if (w.tipo === "textarea") {
                      return (
                        <textarea
                          key={w.id}
                          className="visor-acro-campo"
                          style={{ ...estilo, resize: "none" }}
                          aria-label={w.nombre}
                          readOnly={deshabilitado}
                          value={
                            typeof valoresForm[w.nombre] === "string"
                              ? (valoresForm[w.nombre] as string)
                              : ""
                          }
                          onChange={e => actualizarValor(w.nombre, e.target.value)}
                        />
                      );
                    }

                    return (
                      <input
                        key={w.id}
                        type="text"
                        className="visor-acro-campo"
                        style={estilo}
                        aria-label={w.nombre}
                        readOnly={deshabilitado}
                        value={
                          typeof valoresForm[w.nombre] === "string"
                            ? (valoresForm[w.nombre] as string)
                            : ""
                        }
                        onChange={e => actualizarValor(w.nombre, e.target.value)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
      </div>
    </>
  );
}
