import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Check, X, ZoomIn } from "lucide-react";

const PREVIEW_SIZE = 260;
const EXPORT_SIZE = 256;

export interface RecorteRetratoModalProps {
  archivo: File;
  onCancelar: () => void;
  onConfirmar: (archivoRecortado: File) => void;
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function calcularLimites(
  anchoImg: number,
  altoImg: number,
  tamanoLienzo: number,
  zoom: number
) {
  const escalaBase = Math.max(tamanoLienzo / anchoImg, tamanoLienzo / altoImg);
  const escala = escalaBase * zoom;
  const anchoDibujo = anchoImg * escala;
  const altoDibujo = altoImg * escala;
  const maxOffsetX = Math.max(0, (anchoDibujo - tamanoLienzo) / 2);
  const maxOffsetY = Math.max(0, (altoDibujo - tamanoLienzo) / 2);
  return { anchoDibujo, altoDibujo, maxOffsetX, maxOffsetY };
}

function nombreBaseArchivo(nombre: string): string {
  const sinExt = nombre.replace(/\.[^.]+$/, "");
  const limpio = sinExt
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpio || "personaje";
}

function exportarCanvas(
  canvas: HTMLCanvasElement,
  tipo: "image/webp" | "image/png"
): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(
      blob => resolve(blob),
      tipo,
      tipo === "image/webp" ? 0.9 : undefined
    );
  });
}

export function RecorteRetratoModal({
  archivo,
  onCancelar,
  onConfirmar
}: RecorteRetratoModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const arrastreRef = useRef<{
    pointerId: number;
    inicioX: number;
    inicioY: number;
    offsetXInicial: number;
    offsetYInicial: number;
  } | null>(null);

  const [cargada, setCargada] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape" && !procesando) {
        onCancelar();
      }
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [onCancelar, procesando]);

  useEffect(() => {
    setCargada(false);
    setErrorCarga(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const url = URL.createObjectURL(archivo);
    const img = new Image();
    let activo = true;

    img.onload = () => {
      if (!activo) return;
      imagenRef.current = img;
      setCargada(true);
    };
    img.onerror = () => {
      if (!activo) return;
      imagenRef.current = null;
      setErrorCarga("No se pudo cargar la imagen seleccionada.");
    };
    img.src = url;

    return () => {
      activo = false;
      imagenRef.current = null;
      URL.revokeObjectURL(url);
    };
  }, [archivo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imagenRef.current;
    if (!canvas || !img || !cargada) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { anchoDibujo, altoDibujo, maxOffsetX, maxOffsetY } = calcularLimites(
      img.naturalWidth,
      img.naturalHeight,
      PREVIEW_SIZE,
      zoom
    );

    const ox = clamp(offset.x, -maxOffsetX, maxOffsetX);
    const oy = clamp(offset.y, -maxOffsetY, maxOffsetY);

    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      (PREVIEW_SIZE - anchoDibujo) / 2 + ox,
      (PREVIEW_SIZE - altoDibujo) / 2 + oy,
      anchoDibujo,
      altoDibujo
    );
  }, [cargada, zoom, offset]);

  function alCambiarZoom(nuevoZoom: number) {
    setZoom(nuevoZoom);
    const img = imagenRef.current;
    if (!img) return;
    const { maxOffsetX, maxOffsetY } = calcularLimites(
      img.naturalWidth,
      img.naturalHeight,
      PREVIEW_SIZE,
      nuevoZoom
    );
    setOffset(prev => ({
      x: clamp(prev.x, -maxOffsetX, maxOffsetX),
      y: clamp(prev.y, -maxOffsetY, maxOffsetY)
    }));
  }

  function alIniciarArrastre(evento: ReactPointerEvent<HTMLCanvasElement>) {
    if (!cargada || procesando) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    arrastreRef.current = {
      pointerId: evento.pointerId,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      offsetXInicial: offset.x,
      offsetYInicial: offset.y
    };
    setArrastrando(true);
  }

  function alMoverArrastre(evento: ReactPointerEvent<HTMLCanvasElement>) {
    const arrastre = arrastreRef.current;
    const img = imagenRef.current;
    if (!arrastre || arrastre.pointerId !== evento.pointerId || !img) return;

    const dx = evento.clientX - arrastre.inicioX;
    const dy = evento.clientY - arrastre.inicioY;
    const { maxOffsetX, maxOffsetY } = calcularLimites(
      img.naturalWidth,
      img.naturalHeight,
      PREVIEW_SIZE,
      zoom
    );

    setOffset({
      x: clamp(arrastre.offsetXInicial + dx, -maxOffsetX, maxOffsetX),
      y: clamp(arrastre.offsetYInicial + dy, -maxOffsetY, maxOffsetY)
    });
  }

  function alTerminarArrastre(evento: ReactPointerEvent<HTMLCanvasElement>) {
    const arrastre = arrastreRef.current;
    if (!arrastre || arrastre.pointerId !== evento.pointerId) return;
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }
    arrastreRef.current = null;
    setArrastrando(false);
  }

  async function alConfirmar() {
    const img = imagenRef.current;
    if (!img || !cargada || procesando) return;

    setProcesando(true);
    try {
      const salida = document.createElement("canvas");
      salida.width = EXPORT_SIZE;
      salida.height = EXPORT_SIZE;
      const ctx = salida.getContext("2d");
      if (!ctx) {
        setErrorCarga("No se pudo inicializar el lienzo de recorte.");
        return;
      }

      const { anchoDibujo, altoDibujo, maxOffsetX, maxOffsetY } =
        calcularLimites(img.naturalWidth, img.naturalHeight, EXPORT_SIZE, zoom);
      const factor = EXPORT_SIZE / PREVIEW_SIZE;
      const ox = clamp(offset.x * factor, -maxOffsetX, maxOffsetX);
      const oy = clamp(offset.y * factor, -maxOffsetY, maxOffsetY);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        (EXPORT_SIZE - anchoDibujo) / 2 + ox,
        (EXPORT_SIZE - altoDibujo) / 2 + oy,
        anchoDibujo,
        altoDibujo
      );

      const base = nombreBaseArchivo(archivo.name);
      let blob = await exportarCanvas(salida, "image/webp");
      let extension = "webp";
      let mime = "image/webp";

      if (!blob || blob.type !== "image/webp") {
        const fallback = await exportarCanvas(salida, "image/png");
        if (fallback) {
          blob = fallback;
          extension = "png";
          mime = "image/png";
        }
      }

      if (!blob) {
        setErrorCarga("No se pudo generar el retrato recortado.");
        return;
      }

      const archivoRecortado = new File([blob], `retrato-${base}.${extension}`, {
        type: mime
      });
      onConfirmar(archivoRecortado);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div
      className="recorte-retrato-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Recortar retrato del personaje"
      onClick={() => {
        if (!procesando) onCancelar();
      }}
    >
      <div
        className="recorte-retrato-modal"
        onClick={evento => evento.stopPropagation()}
      >
        <div className="recorte-retrato-cabecera">
          <h2>Ajustar retrato</h2>
          <button
            type="button"
            className="recorte-retrato-cerrar"
            onClick={onCancelar}
            disabled={procesando}
            aria-label="Cancelar recorte"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="recorte-retrato-ayuda">
          Arrastra la imagen para encuadrarla y usa el zoom para ajustar el detalle.
        </p>

        <div className="recorte-retrato-marco">
          {errorCarga ? (
            <p className="recorte-retrato-error">{errorCarga}</p>
          ) : (
            <canvas
              ref={canvasRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              className={`recorte-retrato-canvas${arrastrando ? " arrastrando" : ""}`}
              onPointerDown={alIniciarArrastre}
              onPointerMove={alMoverArrastre}
              onPointerUp={alTerminarArrastre}
              onPointerCancel={alTerminarArrastre}
            />
          )}
        </div>

        <label className="recorte-retrato-zoom">
          <ZoomIn size={15} aria-hidden="true" />
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            disabled={!cargada || procesando}
            onChange={evento => alCambiarZoom(Number(evento.target.value))}
          />
          <span className="recorte-retrato-zoom-valor">{zoom.toFixed(1)}x</span>
        </label>

        <div className="recorte-retrato-acciones">
          <button
            type="button"
            className="recorte-retrato-btn-cancelar"
            onClick={onCancelar}
            disabled={procesando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="recorte-retrato-btn-confirmar"
            onClick={() => void alConfirmar()}
            disabled={!cargada || Boolean(errorCarga) || procesando}
          >
            <Check size={14} aria-hidden="true" />
            <span>{procesando ? "Recortando…" : "Confirmar"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
