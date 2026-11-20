import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  ExportPlugin,
  PDFViewerConfig,
  PDFViewerRef,
  PluginRegistry
} from "@embedpdf/react-pdf-viewer";
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
import { archivosApi } from "../../api/archivos.api";
import type { PublicArchivo } from "../../api/types";
import { describeError } from "../errorMessages";
import "../../styles/visor-archivo.css";

const EmbedPdfViewer = lazy(() =>
  import("@embedpdf/react-pdf-viewer").then(m => ({ default: m.PDFViewer }))
);

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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [esModoClaro] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("modo-claro")
  );

  const viewerRef = useRef<PDFViewerRef>(null);
  const registryRef = useRef<PluginRegistry | null>(null);

  useEffect(() => {
    let cancelado = false;
    let urlCreada: string | null = null;
    registryRef.current = null;

    (async () => {
      if (!url) {
        const msg = "No se pudo cargar este documento PDF.";
        if (!cancelado) {
          setErrorPdf(msg);
          onError(msg);
          setCargando(false);
        }
        return;
      }

      try {
        const respuesta = await fetch(url, {
          credentials: "include",
          cache: "no-cache"
        });
        if (!respuesta.ok) {
          throw new Error(`HTTP_${respuesta.status}`);
        }
        const buffer = await respuesta.arrayBuffer();
        if (cancelado) return;
        const blob = new Blob([buffer], { type: "application/pdf" });
        urlCreada = URL.createObjectURL(blob);
        setBlobUrl(urlCreada);
        setErrorPdf(null);
        setListo(false);
        setCargando(false);
      } catch (err) {
        console.error("[VisorPdf]", err);
        if (!cancelado) {
          const msg = "No se pudo cargar este documento PDF.";
          setErrorPdf(msg);
          onError(msg);
          setCargando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      if (urlCreada) {
        URL.revokeObjectURL(urlCreada);
      }
    };
  }, [url, onError]);

  const config = useMemo<PDFViewerConfig | null>(
    () =>
      blobUrl
        ? {
            src: blobUrl,
            tabBar: "never",
            theme: { preference: esModoClaro ? "light" : "dark" },
            i18n: { defaultLocale: "es" },
            export: { defaultFileName: nombre }
          }
        : null,
    [blobUrl, esModoClaro, nombre]
  );

  const guardarPdf = useCallback(async () => {
    const registry = registryRef.current ?? (await viewerRef.current?.registry);
    const exportCap = registry?.getPlugin<ExportPlugin>("export")?.provides();
    if (!exportCap) {
      throw new Error("El visor PDF aún no está listo para guardar.");
    }
    const raw: unknown = exportCap.saveAsCopy();
    let buffer: ArrayBuffer;
    if (
      raw !== null &&
      typeof raw === "object" &&
      "toPromise" in raw &&
      typeof (raw as { toPromise: unknown }).toPromise === "function"
    ) {
      buffer = await (raw as { toPromise: () => Promise<ArrayBuffer> }).toPromise();
    } else {
      buffer = await (raw as Promise<ArrayBuffer> | ArrayBuffer);
    }
    const actualizado = await archivosApi.actualizar(
      archivoId,
      new Uint8Array(buffer),
      "application/pdf"
    );
    onGuardadoOk(actualizado, false);
  }, [archivoId, onGuardadoOk]);

  useEffect(() => {
    const activo = edicionHabilitada && listo;
    onRegistrarGuardado(activo ? guardarPdf : null, activo);
  }, [edicionHabilitada, listo, guardarPdf, onRegistrarGuardado]);

  useEffect(() => {
    return () => onRegistrarGuardado(null, false);
  }, [onRegistrarGuardado]);

  if (errorPdf) {
    return (
      <div className="visor-centro-estado">
        <p className="visor-feedback-bar ko">{errorPdf}</p>
      </div>
    );
  }

  if (cargando || !config) {
    return (
      <div className="visor-centro-estado">
        <Loader2 size={22} className="icono-girando" aria-hidden="true" />
        <span>Cargando PDF…</span>
      </div>
    );
  }

  return (
    <div
      className="visor-pdf-embed-wrap"
      onKeyDown={evento => {
        if (
          edicionHabilitada &&
          listo &&
          (evento.ctrlKey || evento.metaKey) &&
          evento.key.toLowerCase() === "s"
        ) {
          evento.preventDefault();
          onGuardarAtajo?.();
        }
      }}
    >
      <Suspense
        fallback={
          <div className="visor-centro-estado">
            <Loader2 size={22} className="icono-girando" aria-hidden="true" />
            <span>Inicializando visor PDF…</span>
          </div>
        }
      >
        <EmbedPdfViewer
          ref={viewerRef}
          config={config}
          style={{ width: "100%", height: "100%", flex: 1, minHeight: 0 }}
          onReady={reg => {
            registryRef.current = reg;
            setListo(true);
          }}
        />
      </Suspense>
    </div>
  );
}
