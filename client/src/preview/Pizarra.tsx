import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { COLORES_POSIT } from "./datos";
import type { PositPreview } from "./tipos";

interface PizarraProps {
  posits: PositPreview[];
  onPosits: Dispatch<SetStateAction<PositPreview[]>>;
  onVolver: () => void;
}

interface PositProps {
  posit: PositPreview;
  activo: boolean;
  onActivar: (id: string) => void;
  onTexto: (id: string, texto: string) => void;
  onColor: (id: string, color: string) => void;
  onBorrar: (id: string) => void;
  onArrastrar: (evento: ReactPointerEvent, posit: PositPreview) => void;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function nuevoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `posit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Elige texto oscuro o claro según la luminosidad del color del posit. */
function textoLegible(color: string): string {
  const limpio = color.replace("#", "");
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map(caracter => caracter + caracter)
          .join("")
      : limpio;

  const r = parseInt(completo.slice(0, 2), 16) || 0;
  const g = parseInt(completo.slice(2, 4), 16) || 0;
  const b = parseInt(completo.slice(4, 6), 16) || 0;
  const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luz > 0.62 ? "#2a2433" : "#fbf8f2";
}

/** Mármol suave: degradados + vetas SVG. Sin imágenes, pesa 0 KB. */
function Marmol() {
  return (
    <div className="marmol" aria-hidden="true">
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="none">
        <g
          fill="none"
          stroke="rgba(110, 110, 125, 0.10)"
          strokeWidth="5"
          strokeLinecap="round"
        >
          <path d="M-40 150 C 220 90 420 210 720 140 S 1180 250 1660 170" />
          <path d="M-30 610 C 260 520 460 690 780 600 S 1240 760 1660 650" />
          <path d="M230 -30 C 300 190 190 380 320 600 S 250 860 400 1040" />
        </g>
        <g
          fill="none"
          stroke="rgba(110, 110, 125, 0.20)"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M-40 150 C 220 90 420 210 720 140 S 1180 250 1660 170" />
          <path d="M-30 610 C 260 520 460 690 780 600 S 1240 760 1660 650" />
          <path d="M230 -30 C 300 190 190 380 320 600 S 250 860 400 1040" />
          <path d="M980 -20 C 900 210 1060 400 940 620 S 1010 880 920 1030" />
        </g>
      </svg>
    </div>
  );
}

function Posit({
  posit,
  activo,
  onActivar,
  onTexto,
  onColor,
  onBorrar,
  onArrastrar
}: PositProps) {
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [posit.texto]);

  const estilo = {
    left: `${posit.x}%`,
    top: `${posit.y}%`,
    background: posit.color,
    color: textoLegible(posit.color),
    "--giro": `${posit.giro}deg`
  } as CSSProperties;

  return (
    <div
      className={`posit${activo ? " activo" : ""}`}
      style={estilo}
      onPointerDown={evento => onArrastrar(evento, posit)}
      onClick={() => onActivar(posit.id)}
    >
      <div className="posit-barra" onPointerDown={evento => evento.stopPropagation()}>
        {COLORES_POSIT.map(color => (
          <button
            key={color.valor}
            type="button"
            className={`cuadro${posit.color === color.valor ? " activo" : ""}`}
            style={{ background: color.valor }}
            title={color.nombre}
            onClick={evento => {
              evento.stopPropagation();
              onColor(posit.id, color.valor);
            }}
          />
        ))}
        <button
          type="button"
          className="posit-borrar"
          title="Borrar posit"
          onClick={evento => {
            evento.stopPropagation();
            onBorrar(posit.id);
          }}
        >
          ×
        </button>
      </div>

      <textarea
        ref={area}
        value={posit.texto}
        placeholder="Escribe una nota…"
        onChange={evento => onTexto(posit.id, evento.target.value)}
        onPointerDown={evento => evento.stopPropagation()}
        onClick={evento => {
          evento.stopPropagation();
          onActivar(posit.id);
        }}
      />
    </div>
  );
}

export function Pizarra({ posits, onPosits, onVolver }: PizarraProps) {
  const [activo, setActivo] = useState<string | null>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{
    id: string;
    inicioX: number;
    inicioY: number;
    base: { x: number; y: number };
    rect: DOMRect;
  } | null>(null);

  useEffect(() => {
    function mover(evento: PointerEvent) {
      const actual = arrastre.current;
      if (!actual) return;

      const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
      const dy = ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;

      onPosits(prev =>
        prev.map(posit =>
          posit.id === actual.id
            ? {
                ...posit,
                x: limitar(actual.base.x + dx, 8, 92),
                y: limitar(actual.base.y + dy, 10, 90)
              }
            : posit
        )
      );
    }

    function soltar() {
      arrastre.current = null;
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [onPosits]);

  function crearPosit(x: number, y: number): void {
    const posit: PositPreview = {
      id: nuevoId(),
      texto: "",
      color: COLORES_POSIT[3].valor,
      x: limitar(x, 8, 92),
      y: limitar(y, 10, 90),
      giro: (Math.random() - 0.5) * 4
    };

    onPosits(prev => [...prev, posit]);
    setActivo(posit.id);
  }

  function iniciarArrastre(evento: ReactPointerEvent, posit: PositPreview): void {
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    arrastre.current = {
      id: posit.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: { x: posit.x, y: posit.y },
      rect
    };
    setActivo(posit.id);
  }

  function cambiarTexto(id: string, texto: string): void {
    onPosits(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, texto } : posit))
    );
  }

  function cambiarColor(id: string, color: string): void {
    onPosits(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, color } : posit))
    );
  }

  function borrarPosit(id: string): void {
    onPosits(prev => prev.filter(posit => posit.id !== id));
    setActivo(null);
  }

  function dobleClic(evento: ReactMouseEvent<HTMLDivElement>): void {
    if ((evento.target as HTMLElement).closest(".posit")) return;

    const rect = evento.currentTarget.getBoundingClientRect();
    const x = ((evento.clientX - rect.left) / rect.width) * 100;
    const y = ((evento.clientY - rect.top) / rect.height) * 100;
    crearPosit(x, y);
  }

  return (
    <div className="pizarra-page">
      <Marmol />

      <div className="pizarra-barra">
        <button type="button" className="pizarra-btn" onClick={onVolver}>
          ← Volver
        </button>

        <button
          type="button"
          className="pizarra-btn pizarra-btn-nuevo"
          onClick={() => crearPosit(50, 50)}
        >
          + Nuevo posit
        </button>
      </div>

      <div className="pizarra-lienzo" ref={lienzo} onDoubleClick={dobleClic}>
        {posits.map(posit => (
          <Posit
            key={posit.id}
            posit={posit}
            activo={activo === posit.id}
            onActivar={setActivo}
            onTexto={cambiarTexto}
            onColor={cambiarColor}
            onBorrar={borrarPosit}
            onArrastrar={iniciarArrastre}
          />
        ))}
      </div>

      <p className="pizarra-pista">
        Doble clic en el mármol para crear un posit · arrastra para moverlo ·
        los cuadraditos cambian el color
      </p>
    </div>
  );
}
