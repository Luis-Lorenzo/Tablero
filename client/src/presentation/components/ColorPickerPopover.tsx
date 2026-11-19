import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import iro from "@jaames/iro";
import { X } from "lucide-react";
import "../../styles/color-picker-popover.css";

export interface ColorPickerPopoverProps {
  /** Valor hexadecimal actual (#rrggbb). */
  value: string;
  /** Callback en vivo al arrastrar la rueda o barra. */
  onChange?: (hex: string) => void;
  /** Callback al soltar el puntero o confirmar con Enter / botón Listo (útil para llamadas HTTP). */
  onCommit?: (hex: string) => void;
  /** Texto accesible para el botón disparador y el diálogo. */
  ariaLabel?: string;
  /** Tooltip del botón disparador. */
  title?: string;
  /** Clase CSS extra en el botón disparador. */
  className?: string;
  /** Estilos inline extra en el botón disparador. */
  style?: CSSProperties;
  /** Contenido opcional dentro del botón disparador (por ejemplo icono `+` si el slot está vacío). */
  children?: ReactNode;
  /** Deshabilitado. */
  disabled?: boolean;
  /** Ancho de la rueda SVG en px (por defecto 168). */
  width?: number;
}

const HEX_REGEX = /^#[0-9a-f]{6}$/i;

function normalizarHex(raw: string | undefined): string {
  const limpio = (raw ?? "").trim();
  if (HEX_REGEX.test(limpio)) return limpio.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(limpio)) {
    const [, r, g, b] = limpio;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "#e8c56a";
}

export function ColorPickerPopover({
  value,
  onChange,
  onCommit,
  ariaLabel = "Selector de color",
  title,
  className = "",
  style,
  children,
  disabled = false,
  width = 168
}: ColorPickerPopoverProps) {
  const hexValido = normalizarHex(value);
  const [abierto, setAbierto] = useState(false);
  const [colorInterno, setColorInterno] = useState(hexValido);
  const [hexTexto, setHexTexto] = useState(hexValido);
  const [posicion, setPosicion] = useState<{ left: number; top: number }>({
    left: 16,
    top: 16
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const iroHostRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<iro.ColorPicker | null>(null);
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  onChangeRef.current = onChange;
  onCommitRef.current = onCommit;

  useEffect(() => {
    setColorInterno(hexValido);
    setHexTexto(hexValido);
    if (pickerRef.current && pickerRef.current.color.hexString.toLowerCase() !== hexValido) {
      pickerRef.current.color.hexString = hexValido;
    }
  }, [hexValido]);

  const recalcularPosicion = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const anchoPop = Math.max(width + 32, 212);
    const altoPop = width + 112;
    const margen = 10;

    let left = rect.left + rect.width / 2 - anchoPop / 2;
    left = Math.max(margen, Math.min(left, window.innerWidth - anchoPop - margen));

    let top = rect.bottom + 8;
    if (top + altoPop > window.innerHeight - margen && rect.top - altoPop - 8 >= margen) {
      top = rect.top - altoPop - 8;
    } else {
      top = Math.max(margen, Math.min(top, window.innerHeight - altoPop - margen));
    }

    setPosicion({ left, top });
  };

  useEffect(() => {
    if (!abierto) return;
    recalcularPosicion();

    const host = iroHostRef.current;
    if (!host) return;
    host.innerHTML = "";

    const picker = iro.ColorPicker(host, {
      width,
      color: colorInterno,
      borderWidth: 2,
      borderColor: "#ffffff",
      layoutDirection: "vertical",
      layout: [
        {
          component: iro.ui.Wheel
        },
        {
          component: iro.ui.Slider,
          options: { sliderType: "value" }
        }
      ]
    });

    const alCambiar = (color: iro.Color) => {
      const hex = color.hexString.toLowerCase();
      setColorInterno(hex);
      setHexTexto(hex);
      onChangeRef.current?.(hex);
    };

    const alTerminar = (color: iro.Color) => {
      const hex = color.hexString.toLowerCase();
      setColorInterno(hex);
      setHexTexto(hex);
      onCommitRef.current?.(hex);
    };

    picker.on("color:change", alCambiar);
    picker.on("input:end", alTerminar);
    pickerRef.current = picker;

    const alClickFuera = (ev: PointerEvent) => {
      const objetivo = ev.target as Node | null;
      if (!objetivo) return;
      if (popoverRef.current?.contains(objetivo)) return;
      if (triggerRef.current?.contains(objetivo)) return;
      setAbierto(false);
    };

    const alTecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        setAbierto(false);
      }
    };

    window.addEventListener("pointerdown", alClickFuera, true);
    window.addEventListener("keydown", alTecla);
    window.addEventListener("resize", recalcularPosicion);

    return () => {
      picker.off("color:change", alCambiar);
      picker.off("input:end", alTerminar);
      pickerRef.current = null;
      host.innerHTML = "";
      window.removeEventListener("pointerdown", alClickFuera, true);
      window.removeEventListener("keydown", alTecla);
      window.removeEventListener("resize", recalcularPosicion);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, width]);

  function aplicarHexManual(raw: string, esCommit: boolean): void {
    setHexTexto(raw);
    const conAlmohadilla = raw.startsWith("#") ? raw : `#${raw}`;
    if (HEX_REGEX.test(conAlmohadilla)) {
      const limpio = conAlmohadilla.toLowerCase();
      setColorInterno(limpio);
      if (pickerRef.current) {
        pickerRef.current.color.hexString = limpio;
      }
      onChangeRef.current?.(limpio);
      if (esCommit) {
        onCommitRef.current?.(limpio);
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ? `iro-trigger ${className}` : "iro-trigger"}
        style={{ background: hexValido, ...style }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        title={title ?? ariaLabel}
        onPointerDown={ev => ev.stopPropagation()}
        onClick={ev => {
          ev.stopPropagation();
          if (disabled) return;
          setAbierto(prev => !prev);
        }}
      >
        {children}
      </button>

      {abierto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="iro-popover"
            role="dialog"
            aria-label={ariaLabel}
            style={{ left: `${posicion.left}px`, top: `${posicion.top}px` }}
            onPointerDown={ev => ev.stopPropagation()}
            onClick={ev => ev.stopPropagation()}
          >
            <div className="iro-popover-cabecera">
              <span
                className="iro-popover-muestra"
                style={{ background: colorInterno }}
                aria-hidden="true"
              />
              <span className="iro-popover-titulo">{ariaLabel}</span>
              <button
                type="button"
                className="iro-popover-cerrar"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar selector de color"
              >
                <X size={13} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div ref={iroHostRef} className="iro-wheel-host" />

            <div className="iro-popover-pie">
              <input
                type="text"
                className="iro-hex-input"
                value={hexTexto}
                maxLength={7}
                spellCheck={false}
                aria-label="Código hexadecimal del color"
                onChange={ev => aplicarHexManual(ev.target.value, false)}
                onBlur={() => {
                  const normalizado = normalizarHex(hexTexto);
                  setHexTexto(normalizado);
                  onCommitRef.current?.(normalizado);
                }}
                onKeyDown={ev => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    aplicarHexManual(hexTexto, true);
                    setAbierto(false);
                  }
                }}
              />
              <button
                type="button"
                className="iro-btn-listo"
                onClick={() => {
                  onCommitRef.current?.(colorInterno);
                  setAbierto(false);
                }}
              >
                Listo
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
