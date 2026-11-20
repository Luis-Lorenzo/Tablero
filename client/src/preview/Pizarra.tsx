import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eraser,
  Hand,
  Image as ImageIcon,
  Lock,
  Minus,
  Paintbrush,
  Pencil,
  Plus,
  Radio,
  Snowflake,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Users
} from "lucide-react";
import type {
  CSSProperties,
  ChangeEvent,
  Dispatch,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { archivosApi } from "../api/archivos.api";
import type { PublicArchivo } from "../api/types";
import { ColorPickerPopover } from "../presentation/components/ColorPickerPopover";
import { describeError } from "../presentation/errorMessages";
import { DocumentoVisorModal, PanelImagenesMasterModal } from "./Archivador";
import {
  infoFormatoArchivo,
  nuevoId,
  textoLegible,
  trazoTocaPunto,
  urlImagenEscena
} from "./calibracion";
import {
  COLORES_POSIT,
  guardarColorExtraPosit,
  obtenerColoresExtraPosit
} from "./datos";
import { reproducirSonidoPing } from "./sonido";
import type {
  DocumentoMesa,
  ElementoMesa,
  ImagenEscenaPreview,
  PingVisual,
  PositPreview,
  Punto,
  TamanoTextoEscena,
  TextoEscena,
  TrazoPizarra
} from "./tipos";

type ObjetoPizarra = Extract<ElementoMesa, { tipo: "objeto" }>;

interface ArchivoPizarraItem {
  id: string;
  nombre: string;
  tipo: string;
  vista: string;
  tamano: number;
  url?: string;
}

interface PizarraProps {
  posits: PositPreview[];
  onPosits: Dispatch<SetStateAction<PositPreview[]>>;
  trazos?: TrazoPizarra[];
  onTrazos?: Dispatch<SetStateAction<TrazoPizarra[]>>;
  documentosPizarra?: DocumentoMesa[];
  onDocumentosPizarra?: Dispatch<SetStateAction<DocumentoMesa[]>>;
  objetosPizarra?: ObjetoPizarra[];
  onObjetosPizarra?: Dispatch<SetStateAction<ObjetoPizarra[]>>;
  onSacarDePizarraAMesa?: (elemento: ElementoMesa) => void;
  trazosEscena?: TrazoPizarra[];
  onTrazosEscena?: Dispatch<SetStateAction<TrazoPizarra[]>>;
  positsEscena?: PositPreview[];
  onPositsEscena?: Dispatch<SetStateAction<PositPreview[]>>;
  docsEscena?: DocumentoMesa[];
  onDocsEscena?: Dispatch<SetStateAction<DocumentoMesa[]>>;
  textosEscena?: TextoEscena[];
  onTextosEscena?: Dispatch<SetStateAction<TextoEscena[]>>;
  tamanoImagenesEscena?: Record<string, { w: number; h: number }>;
  onTamanoImagenesEscena?: Dispatch<
    SetStateAction<Record<string, { w: number; h: number }>>
  >;
  vistaPizarra?: "pizarra" | "escena";
  onVistaPizarra?: (vista: "pizarra" | "escena") => void;
  onAbrirArchivador?: () => void;
  congelada?: boolean;
  onCongelada?: Dispatch<SetStateAction<boolean>>;
  onVolver: () => void;
  mesaId?: string;
  miUsuarioId?: string;
  esMaster?: boolean;
  colorJugador?: string;
  nombreJugador?: string;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
  onArchivosCambiados?: () => void;
  pingsActivos?: PingVisual[];
  onEnviarPing?: (datos: { x: number; y: number; vista: "pizarra" | "escena" }) => void;
}

function esColorOscuro(hex: string): boolean {
  const limpio = hex.trim().replace("#", "");
  if (limpio.length !== 6) return false;
  const r = Number.parseInt(limpio.slice(0, 2), 16) / 255;
  const g = Number.parseInt(limpio.slice(2, 4), 16) / 255;
  const b = Number.parseInt(limpio.slice(4, 6), 16) / 255;
  if ([r, g, b].some(Number.isNaN)) return false;
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia < 0.35;
}

interface PositProps {
  posit: PositPreview;
  activo: boolean;
  bloqueado?: boolean;
  enMesa?: boolean;
  miUsuarioId?: string;
  zoom?: number;
  onActivar: (id: string) => void;
  onTexto: (id: string, texto: string) => void;
  onColor: (id: string, color: string) => void;
  onCompartirATodos?: (id: string) => void;
  onArchivar?: (id: string) => void;
  onSacarAMesa?: (id: string) => void;
  onBorrar: (id: string) => void;
  onArrastrar: (evento: ReactPointerEvent, posit: PositPreview) => void;
  onRedimensionar?: (id: string, ancho: number, alto: number) => void;
}

type ModoHerramienta =
  | "cursor"
  | "dibujar"
  | "linea"
  | "flecha"
  | "borrar"
  | "ping"
  | "texto";

interface InstantaneaPizarra {
  trazos: TrazoPizarra[];
  posits: PositPreview[];
  documentos: DocumentoMesa[];
  textos?: TextoEscena[];
}

interface CamaraLienzo {
  pan: Punto;
  zoom: number;
}

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3;

type AccionLienzo =
  | {
      tipo: "posit";
      id: string;
      inicioX: number;
      inicioY: number;
      movido: boolean;
      base: Punto;
      rect: DOMRect;
    }
  | {
      tipo: "texto";
      id: string;
      inicioX: number;
      inicioY: number;
      movido: boolean;
      base: Punto;
      rect: DOMRect;
    }
  | {
      tipo: "doc";
      id: string;
      inicioX: number;
      inicioY: number;
      movido: boolean;
      base: Punto;
      rect: DOMRect;
    }
  | {
      tipo: "doc-tam";
      id: string;
      inicioX: number;
      inicioY: number;
      baseW: number;
      baseH: number;
      zoom: number;
    }
  | {
      tipo: "objeto";
      id: string;
      inicioX: number;
      inicioY: number;
      base: Punto;
      rect: DOMRect;
    }
  | {
      tipo: "pan";
      inicioX: number;
      inicioY: number;
      basePan: Punto;
      vista: "pizarra" | "escena";
    }
  | {
      tipo: "dibujar";
      trazo: TrazoPizarra;
      rect: DOMRect;
    }
  | {
      tipo: "borrar";
      rect: DOMRect;
    };

const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,.md,.json,.csv,text/markdown,application/json,text/csv";

const COLORES_TINTA = [
  { nombre: "Carbón", valor: "#2b2118" },
  { nombre: "Lacre", valor: "#b83232" },
  { nombre: "Cobalto", valor: "#1f4e8c" },
  { nombre: "Bosque", valor: "#1f6f4a" },
  { nombre: "Dorado", valor: "#d49b27" },
  { nombre: "Tiza", valor: "#fbf7ef" }
] as const;

const GROSORES_TINTA = [
  { etiqueta: "Fino", valor: 2.5 },
  { etiqueta: "Medio", valor: 5 },
  { etiqueta: "Grueso", valor: 9 }
] as const;

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function vistaPorArchivo(archivo: File): string {
  if (archivo.type.startsWith("image/")) return "imagen";
  if (archivo.type === "application/pdf" || archivo.name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    archivo.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    archivo.name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    archivo.type.startsWith("text/") ||
    archivo.type === "application/json" ||
    archivo.name.endsWith(".txt") ||
    archivo.name.endsWith(".md") ||
    archivo.name.endsWith(".json") ||
    archivo.name.endsWith(".csv")
  ) {
    return "texto";
  }
  return "ninguna";
}

function archivoAItem(archivo: PublicArchivo): ArchivoPizarraItem {
  return {
    id: archivo.id,
    nombre: archivo.nombre,
    tipo: archivo.tipo,
    vista: archivo.vista,
    tamano: archivo.tamano
  };
}

/** Fondo de pergamino claro y limpio. */
function PergaminoPizarra() {
  return <div className="pergamino-fondo" aria-hidden="true" />;
}

function IconoPapelera() {
  return <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />;
}

export function Posit({
  posit,
  activo,
  bloqueado,
  enMesa = false,
  miUsuarioId,
  zoom = 1,
  onActivar,
  onTexto,
  onColor,
  onCompartirATodos,
  onArchivar,
  onSacarAMesa,
  onBorrar,
  onArrastrar,
  onRedimensionar
}: PositProps) {
  const raizRef = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const inicioPointerRef = useRef<{ x: number; y: number } | null>(null);
  const limpiezaRedimensionRef = useRef<(() => void) | null>(null);
  const [editando, setEditando] = useState(false);
  const [coloresExtra, setColoresExtra] = useState<Array<string | null>>(() =>
    obtenerColoresExtraPosit(miUsuarioId)
  );

  useEffect(() => {
    const sincronizar = () => {
      setColoresExtra(obtenerColoresExtraPosit(miUsuarioId));
    };
    const timer = window.setTimeout(sincronizar, 0);
    window.addEventListener("pocketrol:posit-colores", sincronizar);
    window.addEventListener("storage", sincronizar);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pocketrol:posit-colores", sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, [miUsuarioId]);

  useEffect(() => {
    return () => {
      limpiezaRedimensionRef.current?.();
    };
  }, []);

  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [posit.texto, posit.ancho, posit.alto]);

  function iniciarRedimension(evento: ReactPointerEvent<HTMLSpanElement>): void {
    if (bloqueado || !onRedimensionar) return;
    evento.stopPropagation();
    evento.preventDefault();
    onActivar(posit.id);

    limpiezaRedimensionRef.current?.();
    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    const escala = zoom > 0 ? zoom : 1;
    const baseW =
      raizRef.current?.offsetWidth ?? posit.ancho ?? (enMesa ? 158 : 216);
    const baseH =
      raizRef.current?.offsetHeight ?? posit.alto ?? (enMesa ? 108 : 152);

    const mover = (ev: PointerEvent) => {
      const nuevoAncho = Math.round(
        limitar(baseW + (ev.clientX - inicioX) / escala, 150, 460)
      );
      const nuevoAlto = Math.round(
        limitar(baseH + (ev.clientY - inicioY) / escala, 110, 420)
      );
      onRedimensionar(posit.id, nuevoAncho, nuevoAlto);
    };

    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      limpiezaRedimensionRef.current = null;
    };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    limpiezaRedimensionRef.current = soltar;
  }

  const esMasterPosit = Boolean(posit.esMaster);
  const colorAura = esMasterPosit
    ? "#e8c56a"
    : (posit.autorColor ?? "#a98fce");

  const estilo = {
    left: `${posit.x}%`,
    top: `${posit.y}%`,
    width: posit.ancho ? `${posit.ancho}px` : undefined,
    minHeight: posit.alto ? `${posit.alto}px` : undefined,
    background: posit.color,
    color: textoLegible(posit.color),
    "--giro": `${posit.giro}deg`,
    "--aura-color": colorAura
  } as CSSProperties;

  return (
    <div
      ref={raizRef}
      data-supr-id={posit.id}
      data-supr-tipo="posit"
      className={[
        "posit",
        enMesa ? "posit-mesa-nota" : "",
        activo && !bloqueado ? "activo" : "",
        editando && !bloqueado ? "editando" : "",
        esMasterPosit ? "posit-master" : "posit-jugador",
        bloqueado ? "bloqueado" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={estilo}
      onPointerDown={
        bloqueado
          ? undefined
          : evento => {
              inicioPointerRef.current = {
                x: evento.clientX,
                y: evento.clientY
              };
              onArrastrar(evento, posit);
            }
      }
      onClick={evento => {
        if (bloqueado) return;
        if (inicioPointerRef.current) {
          const dist = Math.hypot(
            evento.clientX - inicioPointerRef.current.x,
            evento.clientY - inicioPointerRef.current.y
          );
          inicioPointerRef.current = null;
          if (dist > 5) return;
          onActivar(posit.id);
          setEditando(true);
          window.requestAnimationFrame(() => area.current?.focus());
          return;
        }
        onActivar(posit.id);
      }}
    >
      {(esMasterPosit || posit.autorNombre) && (
        <span
          className={`posit-autor-chip${esMasterPosit ? " master" : ""}`}
          title={
            esMasterPosit
              ? "Nota del Máster"
              : `Nota de ${posit.autorNombre}`
          }
        >
          {esMasterPosit ? (
            <>
              <Crown size={12} strokeWidth={2.2} aria-hidden="true" />
              <span>Máster</span>
            </>
          ) : (
            posit.autorNombre
          )}
        </span>
      )}

      {!bloqueado && (
        <div
          className="posit-barra"
          onPointerDown={evento => evento.stopPropagation()}
        >
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
          <span className="posit-colores-separador" aria-hidden="true">|</span>
          <div className="posit-extra-colores">
            {coloresExtra.map((colorExtra, idx) => {
              const activoSlot = Boolean(
                colorExtra && posit.color === colorExtra
              );
              return (
                <ColorPickerPopover
                  key={idx}
                  value={colorExtra ?? posit.color}
                  onChange={elegido => {
                    const nuevos = guardarColorExtraPosit(
                      idx,
                      elegido,
                      miUsuarioId
                    );
                    setColoresExtra(nuevos);
                    onColor(posit.id, elegido);
                  }}
                  className={`posit-slot-wrap cuadro${
                    colorExtra ? "" : " extra-vacio"
                  }${activoSlot ? " activo" : ""}`}
                  style={
                    colorExtra
                      ? { background: colorExtra }
                      : { background: "transparent" }
                  }
                  ariaLabel={
                    colorExtra
                      ? `Color personalizado ${idx + 1}: ${colorExtra}`
                      : `Elegir color personalizado ${idx + 1}`
                  }
                  title={
                    colorExtra
                      ? `Cambiar color personalizado ${idx + 1} (${colorExtra})`
                      : `Elegir color personalizado ${idx + 1}`
                  }
                >
                  {!colorExtra && (
                    <Plus size={9} strokeWidth={2.5} aria-hidden="true" />
                  )}
                </ColorPickerPopover>
              );
            })}
          </div>
          {onCompartirATodos && (
            <button
              type="button"
              className="doc-master-icono"
              title="Dar a todos"
              aria-label="Dar a todos"
              onClick={evento => {
                evento.stopPropagation();
                onCompartirATodos(posit.id);
              }}
            >
              <Users size={13} strokeWidth={2.1} aria-hidden="true" />
            </button>
          )}
          {onArchivar && (
            <button
              type="button"
              className="posit-archivar"
              title="Archivar posit"
              aria-label="Archivar posit"
              onClick={evento => {
                evento.stopPropagation();
                onArchivar(posit.id);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {onSacarAMesa && (
            <button
              type="button"
              className="posit-sacar-mesa"
              title="Sacar a mesa"
              aria-label="Sacar posit a mi mesa"
              style={{
                padding: "2px 6px",
                borderRadius: 6,
                border: "1px solid rgb(232 197 106 / 55%)",
                background: "rgb(232 197 106 / 18%)",
                color: "#fff3d1",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
              onClick={evento => {
                evento.stopPropagation();
                onSacarAMesa(posit.id);
              }}
            >
              Sacar a mesa
            </button>
          )}
          <button
            type="button"
            className="posit-borrar"
            title="Borrar posit"
            aria-label="Borrar posit"
            onClick={evento => {
              evento.stopPropagation();
              onBorrar(posit.id);
            }}
          >
            <IconoPapelera />
          </button>
        </div>
      )}

      <textarea
        ref={area}
        value={posit.texto}
        readOnly={bloqueado}
        spellCheck={false}
        placeholder={bloqueado ? "" : "Escribe una nota…"}
        style={!editando ? { pointerEvents: "none" } : undefined}
        onBlur={() => setEditando(false)}
        onKeyDown={evento => {
          if (evento.key === "Escape") {
            area.current?.blur();
          }
        }}
        onChange={evento => {
          if (!bloqueado) onTexto(posit.id, evento.target.value);
        }}
        onPointerDown={evento => {
          if (!bloqueado && editando) {
            evento.stopPropagation();
          }
        }}
        onClick={evento => {
          if (!bloqueado) {
            evento.stopPropagation();
            onActivar(posit.id);
          }
        }}
      />

      {!bloqueado && onRedimensionar && (
        <span
          className="posit-tirador"
          title="Redimensionar posit"
          aria-hidden="true"
          onPointerDown={iniciarRedimension}
        />
      )}
    </div>
  );
}

interface CuadroTextoEscenaProps {
  item: TextoEscena;
  activo: boolean;
  editando: boolean;
  bloqueado?: boolean;
  colores: string[];
  zoom: number;
  onActivar: (id: string) => void;
  onIniciarEdicion: (id: string) => void;
  onTerminarEdicion: () => void;
  onTexto: (id: string, texto: string) => void;
  onColor: (id: string, color: string) => void;
  onTamano: (id: string, tamano: TamanoTextoEscena) => void;
  onAncho: (id: string, ancho: number) => void;
  onBorrar: (id: string) => void;
  onArrastrar: (evento: ReactPointerEvent, item: TextoEscena) => void;
}

const TAMANOS_TEXTO_ESCENA: ReadonlyArray<{
  valor: TamanoTextoEscena;
  etiqueta: string;
  titulo: string;
}> = [
  { valor: "sm", etiqueta: "S", titulo: "Pequeño" },
  { valor: "md", etiqueta: "M", titulo: "Mediano" },
  { valor: "lg", etiqueta: "L", titulo: "Grande" }
];

function CuadroTextoEscena({
  item,
  activo,
  editando,
  bloqueado,
  colores,
  zoom,
  onActivar,
  onIniciarEdicion,
  onTerminarEdicion,
  onTexto,
  onColor,
  onTamano,
  onAncho,
  onBorrar,
  onArrastrar
}: CuadroTextoEscenaProps) {
  const raizRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const inicioPointerRef = useRef<{ x: number; y: number } | null>(null);
  const limpiezaRedimensionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      limpiezaRedimensionRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (editando && !bloqueado) {
      const raf = window.requestAnimationFrame(() => {
        areaRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [editando, bloqueado]);

  useEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [item.texto, item.tamano, item.ancho]);

  function iniciarRedimensionAncho(
    evento: ReactPointerEvent<HTMLSpanElement>
  ): void {
    if (bloqueado) return;
    evento.stopPropagation();
    evento.preventDefault();
    onActivar(item.id);
    limpiezaRedimensionRef.current?.();

    const inicioX = evento.clientX;
    const escala = zoom > 0 ? zoom : 1;
    const baseW = raizRef.current?.offsetWidth ?? item.ancho ?? 240;

    const mover = (ev: PointerEvent) => {
      const nuevoAncho = Math.round(
        limitar(baseW + (ev.clientX - inicioX) / escala, 120, 680)
      );
      onAncho(item.id, nuevoAncho);
    };

    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      limpiezaRedimensionRef.current = null;
    };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    limpiezaRedimensionRef.current = soltar;
  }

  return (
    <div
      ref={raizRef}
      data-supr-id={item.id}
      data-supr-tipo="texto"
      className={[
        "pizarra-texto-escena",
        `tam-${item.tamano}`,
        activo && !bloqueado ? "activo" : "",
        editando && !bloqueado ? "editando" : "",
        bloqueado ? "bloqueado" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        color: item.color,
        width: item.ancho ? `${item.ancho}px` : undefined
      }}
      onPointerDown={
        bloqueado
          ? undefined
          : evento => {
              inicioPointerRef.current = {
                x: evento.clientX,
                y: evento.clientY
              };
              onArrastrar(evento, item);
            }
      }
      onClick={evento => {
        evento.stopPropagation();
        if (bloqueado) return;
        if (inicioPointerRef.current) {
          const dist = Math.hypot(
            evento.clientX - inicioPointerRef.current.x,
            evento.clientY - inicioPointerRef.current.y
          );
          inicioPointerRef.current = null;
          if (dist > 5) return;
          onActivar(item.id);
          onIniciarEdicion(item.id);
          return;
        }
        onActivar(item.id);
      }}
      onDoubleClick={evento => evento.stopPropagation()}
    >
      {activo && !bloqueado && (
        <div
          className="pizarra-texto-barra"
          onPointerDown={evento => evento.stopPropagation()}
          onClick={evento => evento.stopPropagation()}
        >
          <div className="pizarra-texto-barra-colores">
            {colores.map(c => (
              <button
                key={c}
                type="button"
                className={`pizarra-color-dot${item.color === c ? " activo" : ""}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                onClick={() => onColor(item.id, c)}
              />
            ))}
          </div>
          <div className="pizarra-texto-barra-tamanos">
            {TAMANOS_TEXTO_ESCENA.map(t => (
              <button
                key={t.valor}
                type="button"
                className={`pizarra-texto-tam-btn${
                  item.tamano === t.valor ? " activo" : ""
                }`}
                title={t.titulo}
                onClick={() => onTamano(item.id, t.valor)}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="posit-borrar"
            title="Borrar texto"
            aria-label="Borrar texto"
            onClick={() => onBorrar(item.id)}
          >
            <IconoPapelera />
          </button>
        </div>
      )}

      <textarea
        ref={areaRef}
        value={item.texto}
        readOnly={bloqueado}
        spellCheck={false}
        rows={1}
        placeholder={bloqueado ? "" : "Escribe…"}
        style={!editando ? { pointerEvents: "none" } : undefined}
        onBlur={onTerminarEdicion}
        onKeyDown={evento => {
          if (evento.key === "Escape") {
            areaRef.current?.blur();
          }
        }}
        onChange={evento => {
          if (!bloqueado) onTexto(item.id, evento.target.value);
        }}
        onPointerDown={evento => {
          if (!bloqueado && editando) {
            evento.stopPropagation();
          }
        }}
      />

      {activo && !bloqueado && (
        <span
          className="pizarra-texto-tirador"
          title="Ajustar ancho del texto"
          aria-hidden="true"
          onPointerDown={iniciarRedimensionAncho}
        />
      )}
    </div>
  );
}

export function Pizarra({
  posits,
  onPosits,
  trazos,
  onTrazos,
  documentosPizarra,
  onDocumentosPizarra,
  objetosPizarra,
  onObjetosPizarra,
  onSacarDePizarraAMesa,
  trazosEscena: trazosEscenaProp,
  onTrazosEscena,
  positsEscena: positsEscenaProp,
  onPositsEscena,
  docsEscena: docsEscenaProp,
  onDocsEscena,
  textosEscena: textosEscenaProp,
  onTextosEscena,
  tamanoImagenesEscena: tamanoImagenesEscenaProp,
  onTamanoImagenesEscena,
  vistaPizarra: vistaPizarraProp,
  onVistaPizarra,
  onAbrirArchivador,
  congelada,
  onCongelada,
  onVolver,
  mesaId,
  miUsuarioId,
  esMaster,
  colorJugador,
  nombreJugador,
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen,
  onArchivosCambiados,
  pingsActivos,
  onEnviarPing
}: PizarraProps) {
  const [vistaPizarraInterna, setVistaPizarraInterna] = useState<
    "pizarra" | "escena"
  >("pizarra");
  const vistaPizarra = vistaPizarraProp ?? vistaPizarraInterna;
  const setVistaPizarra = useCallback(
    (nueva: "pizarra" | "escena") => {
      onVistaPizarra?.(nueva);
      if (vistaPizarraProp === undefined) {
        setVistaPizarraInterna(nueva);
      }
    },
    [onVistaPizarra, vistaPizarraProp]
  );

  const [trazosInternos, setTrazosInternos] = useState<TrazoPizarra[]>([]);
  const [trazosEscenaInternos, setTrazosEscenaInternos] = useState<TrazoPizarra[]>([]);
  const [positsEscenaInternos, setPositsEscenaInternos] = useState<PositPreview[]>([]);
  const [docsInternos, setDocsInternos] = useState<DocumentoMesa[]>([]);
  const [docsEscenaInternos, setDocsEscenaInternos] = useState<DocumentoMesa[]>([]);
  const [textosEscenaInternos, setTextosEscenaInternos] = useState<TextoEscena[]>([]);
  const [objetosInternos, setObjetosInternos] = useState<ObjetoPizarra[]>([]);
  const [tamanoImagenesEscenaInterno, setTamanoImagenesEscenaInterno] = useState<
    Record<string, { w: number; h: number }>
  >({});
  const [congeladaInterna, setCongeladaInterna] = useState(false);

  const trazosEscena = trazosEscenaProp ?? trazosEscenaInternos;
  const setTrazosEscena = onTrazosEscena ?? setTrazosEscenaInternos;
  const positsEscena = positsEscenaProp ?? positsEscenaInternos;
  const setPositsEscena = onPositsEscena ?? setPositsEscenaInternos;
  const docsEscena = docsEscenaProp ?? docsEscenaInternos;
  const setDocsEscena = onDocsEscena ?? setDocsEscenaInternos;
  const textosEscena = textosEscenaProp ?? textosEscenaInternos;
  const setTextosEscena = onTextosEscena ?? setTextosEscenaInternos;
  const tamanoImagenesEscena =
    tamanoImagenesEscenaProp ?? tamanoImagenesEscenaInterno;
  const setTamanoImagenesEscena =
    onTamanoImagenesEscena ?? setTamanoImagenesEscenaInterno;

  const esVistaEscena = vistaPizarra === "escena";
  const listaTrazos = esVistaEscena ? trazosEscena : (trazos ?? trazosInternos);
  const setListaTrazos = esVistaEscena
    ? setTrazosEscena
    : (onTrazos ?? setTrazosInternos);
  const listaPositsActiva = esVistaEscena ? positsEscena : posits;
  const setListaPositsActiva = esVistaEscena ? setPositsEscena : onPosits;
  const listaDocs = esVistaEscena
    ? docsEscena
    : (documentosPizarra ?? docsInternos);
  const setListaDocs = esVistaEscena
    ? setDocsEscena
    : (onDocumentosPizarra ?? setDocsInternos);
  const listaObjetos = objetosPizarra ?? objetosInternos;
  const setListaObjetos = onObjetosPizarra ?? setObjetosInternos;
  const pizarraCongelada = congelada ?? congeladaInterna;
  const setPizarraCongelada = onCongelada ?? setCongeladaInterna;

  const bloqueado = pizarraCongelada && !esMaster;

  const [activo, setActivo] = useState<string | null>(null);
  const [textoEditandoId, setTextoEditandoId] = useState<string | null>(null);
  const [modoHerramienta, setModoHerramienta] =
    useState<ModoHerramienta>("cursor");
  const [formaActiva, setFormaActiva] = useState<"linea" | "flecha">("flecha");
  const [menuFormasAbierto, setMenuFormasAbierto] = useState(false);
  const [colorTinta, setColorTinta] = useState<string>(
    () => (esMaster ? "#d49b27" : (colorJugador ?? "#2b2118"))
  );
  const [grosorTinta, setGrosorTinta] = useState<number>(4);
  const [colorTexto, setColorTexto] = useState<string>("#f4f7ff");
  const [tamanoTexto, setTamanoTexto] = useState<TamanoTextoEscena>("md");
  const [trazoEnCurso, setTrazoEnCurso] = useState<TrazoPizarra | null>(null);

  const [camaras, setCamaras] = useState<{
    pizarra: CamaraLienzo;
    escena: CamaraLienzo;
  }>({
    pizarra: { pan: { x: 0, y: 0 }, zoom: 1 },
    escena: { pan: { x: 0, y: 0 }, zoom: 1 }
  });
  const camara = camaras[vistaPizarra];
  const [espacioPulsado, setEspacioPulsado] = useState(false);
  const [haciendoPan, setHaciendoPan] = useState(false);
  const [mundoTamano, setMundoTamano] = useState<{ w: number; h: number }>({
    w: 1200,
    h: 720
  });

  const [sidebarAbierta, setSidebarAbierta] = useState(true);
  const [archivos, setArchivos] = useState<ArchivoPizarraItem[]>([]);
  const [cargandoArchivos, setCargandoArchivos] = useState(true);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
  const [confirmarBorrarTodo, setConfirmarBorrarTodo] = useState(false);

  const [escenaMinimizada, setEscenaMinimizada] = useState(false);
  const [panelMasterAbierto, setPanelMasterAbierto] = useState(false);
  const [visorArchivo, setVisorArchivo] = useState<ArchivoPizarraItem | null>(
    null
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);
  const formasMenuRef = useRef<HTMLDivElement>(null);
  const accionRef = useRef<AccionLienzo | null>(null);
  const espacioPulsadoRef = useRef(false);
  const arrastreDocMovido = useRef(false);
  const archivoDragRef = useRef<ArchivoPizarraItem | null>(null);
  const historialPizarraRef = useRef<InstantaneaPizarra[]>([]);
  const historialEscenaRef = useRef<InstantaneaPizarra[]>([]);
  const [puedeDeshacerPizarra, setPuedeDeshacerPizarra] = useState(false);
  const [puedeDeshacerEscena, setPuedeDeshacerEscena] = useState(false);
  const [pingsLocales, setPingsLocales] = useState<PingVisual[]>([]);

  const herramientaEfectiva: ModoHerramienta =
    modoHerramienta === "ping"
      ? "ping"
      : bloqueado
        ? "cursor"
        : modoHerramienta === "texto" && !esVistaEscena
          ? "cursor"
          : modoHerramienta;

  const limitarPan = useCallback(
    (pan: Punto, zoom: number): Punto => {
      const vp = viewportRef.current;
      const w = vp?.clientWidth || mundoTamano.w || 1200;
      const h = vp?.clientHeight || mundoTamano.h || 720;
      return {
        x: limitar(pan.x, -(2 * w * zoom) + w * 0.15, w * zoom + w * 0.85),
        y: limitar(pan.y, -(2 * h * zoom) + h * 0.15, h * zoom + h * 0.85)
      };
    },
    [mundoTamano.h, mundoTamano.w]
  );

  const aplicarZoomEnPunto = useCallback(
    (nuevoZoomRaw: number, clientX?: number, clientY?: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const vpRect = vp.getBoundingClientRect();
      const cx = clientX !== undefined ? clientX - vpRect.left : vpRect.width / 2;
      const cy = clientY !== undefined ? clientY - vpRect.top : vpRect.height / 2;
      const nuevoZoom = limitar(nuevoZoomRaw, ZOOM_MIN, ZOOM_MAX);

      setCamaras(prev => {
        const actual = prev[vistaPizarra];
        if (Math.abs(nuevoZoom - actual.zoom) < 0.001) return prev;
        const escala = nuevoZoom / actual.zoom;
        const nuevoPan = limitarPan(
          {
            x: cx - (cx - actual.pan.x) * escala,
            y: cy - (cy - actual.pan.y) * escala
          },
          nuevoZoom
        );
        return {
          ...prev,
          [vistaPizarra]: { pan: nuevoPan, zoom: nuevoZoom }
        };
      });
    },
    [limitarPan, vistaPizarra]
  );

  const restablecerCamara = useCallback(() => {
    setCamaras(prev => ({
      ...prev,
      [vistaPizarra]: { pan: { x: 0, y: 0 }, zoom: 1 }
    }));
  }, [vistaPizarra]);

  const centroVisibleLienzo = useCallback((): Punto => {
    const vp = viewportRef.current?.getBoundingClientRect();
    const rect = lienzo.current?.getBoundingClientRect();
    if (!vp || !rect || rect.width === 0 || rect.height === 0) {
      return { x: 50, y: 50 };
    }
    const cx = vp.left + vp.width / 2;
    const cy = vp.top + vp.height / 2;
    return {
      x: limitar(((cx - rect.left) / rect.width) * 100, -92, 192),
      y: limitar(((cy - rect.top) / rect.height) * 100, -92, 192)
    };
  }, []);

  useEffect(() => {
    const el = lienzo.current;
    if (!el) return;
    const actualizar = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setMundoTamano({ w: el.clientWidth, h: el.clientHeight });
      }
    };
    const timer = window.setTimeout(actualizar, 0);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", actualizar);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("resize", actualizar);
      };
    }
    const obs = new ResizeObserver(actualizar);
    obs.observe(el);
    return () => {
      window.clearTimeout(timer);
      obs.disconnect();
    };
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const alRueda = (evento: WheelEvent) => {
      const target = evento.target as HTMLElement | null;
      if (
        target?.closest(
          ".pizarra-escena-tarjeta, .pizarra-escena-barra-flotante, .pizarra-zoom-controles"
        )
      ) {
        return;
      }
      evento.preventDefault();
      const factor = Math.exp(-evento.deltaY * 0.0015);
      const actualZoom = camaras[vistaPizarra].zoom;
      aplicarZoomEnPunto(
        actualZoom * factor,
        evento.clientX,
        evento.clientY
      );
    };
    vp.addEventListener("wheel", alRueda, { passive: false });
    return () => vp.removeEventListener("wheel", alRueda);
  }, [aplicarZoomEnPunto, camaras, vistaPizarra]);

  useEffect(() => {
    function alKeyDown(evento: KeyboardEvent) {
      if (evento.code === "Space" || evento.key === " ") {
        const target = evento.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable='true']")) {
          return;
        }
        evento.preventDefault();
        if (!espacioPulsadoRef.current) {
          espacioPulsadoRef.current = true;
          setEspacioPulsado(true);
        }
      }
    }
    function alKeyUp(evento: KeyboardEvent) {
      if (evento.code === "Space" || evento.key === " ") {
        espacioPulsadoRef.current = false;
        setEspacioPulsado(false);
      }
    }
    function alBlur() {
      espacioPulsadoRef.current = false;
      setEspacioPulsado(false);
    }
    window.addEventListener("keydown", alKeyDown);
    window.addEventListener("keyup", alKeyUp);
    window.addEventListener("blur", alBlur);
    return () => {
      window.removeEventListener("keydown", alKeyDown);
      window.removeEventListener("keyup", alKeyUp);
      window.removeEventListener("blur", alBlur);
    };
  }, []);

  useEffect(() => {
    if (!menuFormasAbierto) return;
    function alClickFuera(evento: globalThis.PointerEvent) {
      if (
        formasMenuRef.current &&
        !formasMenuRef.current.contains(evento.target as Node)
      ) {
        setMenuFormasAbierto(false);
      }
    }
    window.addEventListener("pointerdown", alClickFuera);
    return () => window.removeEventListener("pointerdown", alClickFuera);
  }, [menuFormasAbierto]);

  const guardarInstantanea = useCallback(() => {
    const pila = esVistaEscena
      ? historialEscenaRef.current
      : historialPizarraRef.current;
    pila.push({
      trazos: listaTrazos,
      posits: listaPositsActiva,
      documentos: listaDocs,
      textos: esVistaEscena ? textosEscena : undefined
    });
    if (pila.length > 30) {
      pila.shift();
    }
    if (esVistaEscena) {
      setPuedeDeshacerEscena(true);
    } else {
      setPuedeDeshacerPizarra(true);
    }
  }, [esVistaEscena, listaTrazos, listaPositsActiva, listaDocs, textosEscena]);

  const deshacer = useCallback(() => {
    if (bloqueado) return;
    const pila = esVistaEscena
      ? historialEscenaRef.current
      : historialPizarraRef.current;
    const anterior = pila.pop();
    if (!anterior) return;
    setListaTrazos(anterior.trazos);
    setListaPositsActiva(anterior.posits);
    setListaDocs(anterior.documentos);
    if (esVistaEscena && anterior.textos) {
      setTextosEscena(anterior.textos);
    }
    setActivo(null);
    setTextoEditandoId(null);
    if (esVistaEscena) {
      setPuedeDeshacerEscena(pila.length > 0);
    } else {
      setPuedeDeshacerPizarra(pila.length > 0);
    }
  }, [
    bloqueado,
    esVistaEscena,
    setListaTrazos,
    setListaPositsActiva,
    setListaDocs,
    setTextosEscena
  ]);

  useEffect(() => {
    let ultimoSupr: { id: string; tipo: string } | null = null;
    function alPointerDown(evento: globalThis.PointerEvent) {
      const nodo = (evento.target as HTMLElement | null)?.closest<HTMLElement>("[data-supr-id]");
      if (nodo?.dataset.suprId && nodo.dataset.suprTipo) {
        ultimoSupr = { id: nodo.dataset.suprId, tipo: nodo.dataset.suprTipo };
      } else {
        ultimoSupr = null;
      }
    }
    function alTecla(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "z" && !evento.shiftKey) {
        const tag = (evento.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        evento.preventDefault();
        deshacer();
        return;
      }
      if (evento.key === "Delete" && !bloqueado) {
        const target = evento.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
        const hoverNodo = document.querySelector<HTMLElement>("[data-supr-id]:hover");
        const id = hoverNodo?.dataset.suprId ?? ultimoSupr?.id;
        const tipo = hoverNodo?.dataset.suprTipo ?? ultimoSupr?.tipo;
        if (!id || !tipo) return;
        evento.preventDefault();
        if (tipo === "posit") {
          guardarInstantanea();
          setListaPositsActiva(prev => prev.filter(p => p.id !== id));
          setActivo(actual => (actual === id ? null : actual));
        } else if (tipo === "archivo") {
          guardarInstantanea();
          setListaDocs(prev => prev.filter(d => d.id !== id));
        } else if (tipo === "objeto") {
          setListaObjetos(prev => prev.filter(o => o.id !== id));
        } else if (tipo === "texto" && esVistaEscena) {
          guardarInstantanea();
          setTextosEscena(prev => prev.filter(t => t.id !== id));
          setActivo(actual => (actual === id ? null : actual));
          setTextoEditandoId(actual => (actual === id ? null : actual));
        }
        ultimoSupr = null;
      }
    }
    window.addEventListener("pointerdown", alPointerDown);
    window.addEventListener("keydown", alTecla);
    return () => {
      window.removeEventListener("pointerdown", alPointerDown);
      window.removeEventListener("keydown", alTecla);
    };
  }, [
    bloqueado,
    deshacer,
    esVistaEscena,
    guardarInstantanea,
    setListaDocs,
    setListaObjetos,
    setListaPositsActiva,
    setTextosEscena
  ]);

  const lanzarPing = useCallback(
    (x: number, y: number) => {
      if (onEnviarPing) {
        onEnviarPing({ x, y, vista: vistaPizarra });
        return;
      }
      const id = nuevoId();
      const color = esMaster ? "#e8c56a" : (colorJugador ?? "#74569b");
      reproducirSonidoPing();
      setPingsLocales(prev => [
        ...prev,
        { id, x, y, color, vista: vistaPizarra, autorNombre: nombreJugador }
      ]);
      window.setTimeout(() => {
        setPingsLocales(prev => prev.filter(p => p.id !== id));
      }, 2400);
    },
    [onEnviarPing, vistaPizarra, esMaster, colorJugador, nombreJugador]
  );

  useEffect(() => {
    let activoComponente = true;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    archivosApi
      .listar(mesaId)
      .then(lista => {
        if (!activoComponente) return;
        setArchivos(lista.map(archivoAItem));
      })
      .catch(fallo => {
        if (!activoComponente || esPreview) return;
        setErrorArchivos(describeError(fallo));
      })
      .finally(() => {
        if (activoComponente) setCargandoArchivos(false);
      });

    return () => {
      activoComponente = false;
    };
  }, [mesaId]);

  const borrarTrazosEnPunto = useCallback(
    (punto: Punto) => {
      const umbral = limitar(2.8 / Math.max(0.35, camara.zoom), 1.0, 6.5);
      setListaTrazos(prev => {
        const filtrados = prev.filter(
          trazo => !trazoTocaPunto(trazo, punto, umbral)
        );
        return filtrados.length === prev.length ? prev : filtrados;
      });
    },
    [camara.zoom, setListaTrazos]
  );

  useEffect(() => {
    function mover(evento: PointerEvent) {
      const actual = accionRef.current;
      if (!actual) return;

      if (actual.tipo === "pan") {
        const dx = evento.clientX - actual.inicioX;
        const dy = evento.clientY - actual.inicioY;
        setCamaras(prev => {
          const cam = prev[actual.vista];
          const nuevoPan = limitarPan(
            { x: actual.basePan.x + dx, y: actual.basePan.y + dy },
            cam.zoom
          );
          return {
            ...prev,
            [actual.vista]: { ...cam, pan: nuevoPan }
          };
        });
        return;
      }

      if (actual.tipo === "posit") {
        if (
          !actual.movido &&
          Math.hypot(
            evento.clientX - actual.inicioX,
            evento.clientY - actual.inicioY
          ) > 5
        ) {
          actual.movido = true;
          guardarInstantanea();
        }
        if (!actual.movido) return;

        const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
        const dy =
          ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;
        setListaPositsActiva(prev =>
          prev.map(posit =>
            posit.id === actual.id
              ? {
                  ...posit,
                  x: limitar(actual.base.x + dx, -92, 192),
                  y: limitar(actual.base.y + dy, -92, 192)
                }
              : posit
          )
        );
        return;
      }

      if (actual.tipo === "texto") {
        if (
          !actual.movido &&
          Math.hypot(
            evento.clientX - actual.inicioX,
            evento.clientY - actual.inicioY
          ) > 5
        ) {
          actual.movido = true;
          guardarInstantanea();
        }
        if (!actual.movido) return;

        const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
        const dy =
          ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;
        setTextosEscena(prev =>
          prev.map(item =>
            item.id === actual.id
              ? {
                  ...item,
                  x: limitar(actual.base.x + dx, -92, 192),
                  y: limitar(actual.base.y + dy, -92, 192)
                }
              : item
          )
        );
        return;
      }

      if (actual.tipo === "doc-tam") {
        const escala = actual.zoom > 0 ? actual.zoom : 1;
        const w = Math.round(
          limitar(
            actual.baseW + (evento.clientX - actual.inicioX) / escala,
            80,
            1400
          )
        );
        const h = Math.round(
          limitar(
            actual.baseH + (evento.clientY - actual.inicioY) / escala,
            60,
            1000
          )
        );
        setTamanoImagenesEscena(prev => ({
          ...prev,
          [actual.id]: { w, h }
        }));
        return;
      }

      if (actual.tipo === "doc") {
        if (
          !actual.movido &&
          Math.hypot(
            evento.clientX - actual.inicioX,
            evento.clientY - actual.inicioY
          ) > 5
        ) {
          actual.movido = true;
          arrastreDocMovido.current = true;
        }
        if (!actual.movido) return;

        const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
        const dy =
          ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;
        setListaDocs(prev =>
          prev.map(doc =>
            doc.id === actual.id
              ? {
                  ...doc,
                  x: limitar(actual.base.x + dx, -92, 192),
                  y: limitar(actual.base.y + dy, -92, 192)
                }
              : doc
          )
        );
        return;
      }

      if (actual.tipo === "objeto") {
        const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
        const dy = ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;
        setListaObjetos(prev =>
          prev.map(obj =>
            obj.id === actual.id
              ? {
                  ...obj,
                  x: limitar(actual.base.x + dx, -92, 192),
                  y: limitar(actual.base.y + dy, -92, 192)
                }
              : obj
          )
        );
        return;
      }

      const x = limitar(
        ((evento.clientX - actual.rect.left) / actual.rect.width) * 100,
        -100,
        200
      );
      const y = limitar(
        ((evento.clientY - actual.rect.top) / actual.rect.height) * 100,
        -100,
        200
      );

      if (actual.tipo === "dibujar") {
        const forma = actual.trazo.forma ?? "libre";
        if (forma === "linea" || forma === "flecha") {
          const inicio = actual.trazo.puntos[0];
          let finX = x;
          let finY = y;
          if (evento.shiftKey && actual.rect.width > 0 && actual.rect.height > 0) {
            const dxPx = (x - inicio.x) * (actual.rect.width / 100);
            const dyPx = (y - inicio.y) * (actual.rect.height / 100);
            const distPx = Math.hypot(dxPx, dyPx);
            if (distPx > 0) {
              const ang =
                Math.round(Math.atan2(dyPx, dxPx) / (Math.PI / 4)) *
                (Math.PI / 4);
              finX = limitar(
                inicio.x + (Math.cos(ang) * distPx * 100) / actual.rect.width,
                -100,
                200
              );
              finY = limitar(
                inicio.y + (Math.sin(ang) * distPx * 100) / actual.rect.height,
                -100,
                200
              );
            }
          }
          const actualizado: TrazoPizarra = {
            ...actual.trazo,
            puntos: [inicio, { x: finX, y: finY }]
          };
          actual.trazo = actualizado;
          setTrazoEnCurso(actualizado);
          return;
        }

        const puntos = actual.trazo.puntos;
        const ultimo = puntos[puntos.length - 1];
        if (!ultimo || Math.hypot(x - ultimo.x, y - ultimo.y) >= 0.35) {
          const actualizado: TrazoPizarra = {
            ...actual.trazo,
            puntos: [...puntos, { x, y }]
          };
          actual.trazo = actualizado;
          setTrazoEnCurso(actualizado);
        }
        return;
      }

      if (actual.tipo === "borrar") {
        borrarTrazosEnPunto({ x, y });
      }
    }

    function soltar() {
      const actual = accionRef.current;
      accionRef.current = null;

      if (actual?.tipo === "pan") {
        setHaciendoPan(false);
      }

      if (actual?.tipo === "dibujar") {
        setTrazoEnCurso(null);
        const forma = actual.trazo.forma ?? "libre";
        const esFormaRecta = forma === "linea" || forma === "flecha";
        const valido = esFormaRecta
          ? actual.trazo.puntos.length >= 2 &&
            Math.hypot(
              actual.trazo.puntos[1].x - actual.trazo.puntos[0].x,
              actual.trazo.puntos[1].y - actual.trazo.puntos[0].y
            ) > 0.25
          : actual.trazo.puntos.length >= 1;
        if (valido) {
          guardarInstantanea();
          setListaTrazos(prev => [...prev, actual.trazo]);
        }
      }

      if (arrastreDocMovido.current) {
        window.setTimeout(() => {
          arrastreDocMovido.current = false;
        }, 0);
      }
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);

    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [
    setListaPositsActiva,
    setTextosEscena,
    setListaDocs,
    setListaObjetos,
    setListaTrazos,
    setTamanoImagenesEscena,
    borrarTrazosEnPunto,
    guardarInstantanea,
    limitarPan
  ]);

  function crearPosit(x: number, y: number): void {
    if (bloqueado) return;
    guardarInstantanea();
    const posit: PositPreview = {
      id: nuevoId(),
      texto: "",
      color: COLORES_POSIT[3].valor,
      x: limitar(x, -92, 192),
      y: limitar(y, -92, 192),
      giro: (Math.random() - 0.5) * 4,
      autorNombre: esMaster ? "Máster" : nombreJugador,
      autorColor: esMaster ? "#e8c56a" : colorJugador,
      esMaster: Boolean(esMaster)
    };

    setListaPositsActiva(prev => [...prev, posit]);
    setActivo(posit.id);
    setModoHerramienta("cursor");
  }

  function iniciarArrastrePosit(
    evento: ReactPointerEvent,
    posit: PositPreview
  ): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    if (evento.button === 1 || espacioPulsadoRef.current) return;
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    evento.stopPropagation();
    accionRef.current = {
      tipo: "posit",
      id: posit.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      movido: false,
      base: { x: posit.x, y: posit.y },
      rect
    };
    setActivo(posit.id);
    setTextoEditandoId(null);
  }

  function iniciarArrastreTextoEscena(
    evento: ReactPointerEvent,
    item: TextoEscena
  ): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    if (evento.button === 1 || espacioPulsadoRef.current) return;
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    evento.stopPropagation();
    accionRef.current = {
      tipo: "texto",
      id: item.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      movido: false,
      base: { x: item.x, y: item.y },
      rect
    };
    setActivo(item.id);
  }

  function iniciarRedimensionDoc(
    evento: ReactPointerEvent,
    docId: string,
    actual: { w: number; h: number }
  ): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    evento.preventDefault();
    evento.stopPropagation();
    arrastreDocMovido.current = true;
    accionRef.current = {
      tipo: "doc-tam",
      id: docId,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      baseW: actual.w,
      baseH: actual.h,
      zoom: camara.zoom
    };
  }

  function iniciarArrastreDoc(
    evento: ReactPointerEvent,
    doc: DocumentoMesa
  ): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    if (evento.button === 1 || espacioPulsadoRef.current) return;
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.stopPropagation();
    setActivo(null);
    setTextoEditandoId(null);
    arrastreDocMovido.current = false;
    accionRef.current = {
      tipo: "doc",
      id: doc.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      movido: false,
      base: { x: doc.x, y: doc.y },
      rect
    };
  }

  function iniciarArrastreObjeto(
    evento: ReactPointerEvent,
    objeto: ObjetoPizarra
  ): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    if (evento.button === 1 || espacioPulsadoRef.current) return;
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    evento.stopPropagation();
    setActivo(null);
    setTextoEditandoId(null);
    accionRef.current = {
      tipo: "objeto",
      id: objeto.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: { x: objeto.x, y: objeto.y },
      rect
    };
  }

  function sacarPositAMesa(id: string): void {
    if (!onSacarDePizarraAMesa) return;
    const posit = listaPositsActiva.find(p => p.id === id);
    if (!posit) return;
    guardarInstantanea();
    setListaPositsActiva(prev => prev.filter(p => p.id !== id));
    if (activo === id) setActivo(null);
    onSacarDePizarraAMesa({
      id: posit.id,
      tipo: "posit",
      texto: posit.texto,
      color: posit.color,
      giro: posit.giro,
      x: posit.x,
      y: posit.y,
      autorNombre: posit.autorNombre,
      autorColor: posit.autorColor,
      esMaster: posit.esMaster
    });
  }

  function sacarDocAMesa(doc: DocumentoMesa): void {
    if (!onSacarDePizarraAMesa) return;
    guardarInstantanea();
    setListaDocs(prev => prev.filter(d => d.id !== doc.id));
    onSacarDePizarraAMesa({
      id: doc.id,
      tipo: "archivo",
      archivoId: doc.id,
      nombre: doc.nombre,
      mime: doc.tipo,
      vista: doc.vista,
      tamano: doc.tamano,
      x: doc.x,
      y: doc.y,
      contenidoLocal: doc.url
    });
  }

  function sacarObjetoAMesa(objeto: ObjetoPizarra): void {
    if (!onSacarDePizarraAMesa) return;
    setListaObjetos(prev => prev.filter(o => o.id !== objeto.id));
    onSacarDePizarraAMesa(objeto);
  }

  function alPulsarLienzo(evento: ReactPointerEvent<HTMLDivElement>): void {
    const target = evento.target as HTMLElement;
    if (
      target.closest(
        ".pizarra-escena-tarjeta, .pizarra-escena-barra-flotante, .pizarra-zoom-controles"
      )
    ) {
      return;
    }

    if (
      evento.button === 1 ||
      (espacioPulsadoRef.current && evento.button === 0)
    ) {
      evento.preventDefault();
      setHaciendoPan(true);
      accionRef.current = {
        tipo: "pan",
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        basePan: camara.pan,
        vista: vistaPizarra
      };
      return;
    }

    if (herramientaEfectiva === "ping") {
      const rect = lienzo.current?.getBoundingClientRect();
      if (!rect) return;
      evento.preventDefault();

      const x = limitar(
        ((evento.clientX - rect.left) / rect.width) * 100,
        -100,
        200
      );
      const y = limitar(
        ((evento.clientY - rect.top) / rect.height) * 100,
        -100,
        200
      );
      lanzarPing(x, y);
      return;
    }

    if (bloqueado) {
      if (
        evento.button === 0 &&
        !target.closest(
          ".posit, .pizarra-ficha-doc, .mesa-objeto, .pizarra-texto-escena, button, input, textarea"
        )
      ) {
        evento.preventDefault();
        setHaciendoPan(true);
        accionRef.current = {
          tipo: "pan",
          inicioX: evento.clientX,
          inicioY: evento.clientY,
          basePan: camara.pan,
          vista: vistaPizarra
        };
      }
      return;
    }

    if (herramientaEfectiva === "cursor") {
      if (!target.closest(".posit, .pizarra-texto-escena")) {
        setActivo(null);
        setTextoEditandoId(null);
      }
      if (
        evento.button === 0 &&
        !target.closest(
          ".posit, .pizarra-ficha-doc, .mesa-objeto, .pizarra-texto-escena, button, input, textarea"
        )
      ) {
        setHaciendoPan(true);
        accionRef.current = {
          tipo: "pan",
          inicioX: evento.clientX,
          inicioY: evento.clientY,
          basePan: camara.pan,
          vista: vistaPizarra
        };
      }
      return;
    }

    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    const x = limitar(
      ((evento.clientX - rect.left) / rect.width) * 100,
      -100,
      200
    );
    const y = limitar(
      ((evento.clientY - rect.top) / rect.height) * 100,
      -100,
      200
    );

    if (herramientaEfectiva === "texto" && esVistaEscena) {
      if (target.closest(".pizarra-texto-escena")) return;
      guardarInstantanea();
      const nuevoTexto: TextoEscena = {
        id: nuevoId(),
        texto: "",
        x: limitar(x, -92, 192),
        y: limitar(y, -92, 192),
        color: colorTexto,
        tamano: tamanoTexto,
        autorId: miUsuarioId,
        autorNombre: esMaster ? "Máster" : nombreJugador
      };
      setTextosEscena(prev => [...prev, nuevoTexto]);
      setActivo(nuevoTexto.id);
      setTextoEditandoId(nuevoTexto.id);
      setModoHerramienta("cursor");
      return;
    }

    if (
      herramientaEfectiva === "dibujar" ||
      herramientaEfectiva === "linea" ||
      herramientaEfectiva === "flecha"
    ) {
      const esForma =
        herramientaEfectiva === "linea" || herramientaEfectiva === "flecha";
      const nuevoTrazo: TrazoPizarra = {
        id: nuevoId(),
        color: colorTinta,
        grosor: grosorTinta,
        puntos: esForma ? [{ x, y }, { x, y }] : [{ x, y }],
        forma: herramientaEfectiva === "dibujar" ? "libre" : herramientaEfectiva
      };
      accionRef.current = { tipo: "dibujar", trazo: nuevoTrazo, rect };
      setTrazoEnCurso(nuevoTrazo);
      return;
    }

    if (herramientaEfectiva === "borrar") {
      guardarInstantanea();
      accionRef.current = { tipo: "borrar", rect };
      borrarTrazosEnPunto({ x, y });
    }
  }

  function cambiarTexto(id: string, texto: string): void {
    if (bloqueado) return;
    setListaPositsActiva(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, texto } : posit))
    );
  }

  function cambiarColor(id: string, color: string): void {
    if (bloqueado) return;
    setListaPositsActiva(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, color } : posit))
    );
  }

  function redimensionarPosit(id: string, ancho: number, alto: number): void {
    if (bloqueado) return;
    setListaPositsActiva(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, ancho, alto } : posit))
    );
  }

  function borrarPosit(id: string): void {
    if (bloqueado) return;
    guardarInstantanea();
    setListaPositsActiva(prev => prev.filter(posit => posit.id !== id));
    setActivo(actual => (actual === id ? null : actual));
  }

  function cambiarTextoEscena(id: string, texto: string): void {
    if (bloqueado) return;
    setTextosEscena(prev =>
      prev.map(item => (item.id === id ? { ...item, texto } : item))
    );
  }

  function cambiarColorTextoEscena(id: string, color: string): void {
    if (bloqueado) return;
    guardarInstantanea();
    setTextosEscena(prev =>
      prev.map(item => (item.id === id ? { ...item, color } : item))
    );
  }

  function cambiarTamanoTextoEscena(
    id: string,
    tamano: TamanoTextoEscena
  ): void {
    if (bloqueado) return;
    guardarInstantanea();
    setTextosEscena(prev =>
      prev.map(item => (item.id === id ? { ...item, tamano } : item))
    );
  }

  function cambiarAnchoTextoEscena(id: string, ancho: number): void {
    if (bloqueado) return;
    setTextosEscena(prev =>
      prev.map(item => (item.id === id ? { ...item, ancho } : item))
    );
  }

  function borrarTextoEscena(id: string): void {
    if (bloqueado) return;
    guardarInstantanea();
    setTextosEscena(prev => prev.filter(item => item.id !== id));
    setActivo(actual => (actual === id ? null : actual));
    setTextoEditandoId(actual => (actual === id ? null : actual));
  }

  function dobleClic(evento: ReactMouseEvent<HTMLDivElement>): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    if (
      (evento.target as HTMLElement).closest(
        ".posit, .pizarra-escena-tarjeta, .pizarra-ficha-doc, .pizarra-texto-escena, .pizarra-escena-barra-flotante, .pizarra-zoom-controles"
      )
    ) {
      return;
    }

    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = ((evento.clientX - rect.left) / rect.width) * 100;
    const y = ((evento.clientY - rect.top) / rect.height) * 100;
    crearPosit(x, y);
  }

  function colocarDocumentoEnLienzo(
    archivo: ArchivoPizarraItem,
    x?: number,
    y?: number
  ): void {
    if (bloqueado) return;
    const centro = centroVisibleLienzo();
    const offset = x === undefined ? (listaDocs.length % 5) * 3 : 0;
    const px = limitar((x ?? centro.x) + offset, -92, 192);
    const py = limitar((y ?? centro.y) + offset, -92, 192);

    setListaDocs(prev => {
      const existe = prev.some(doc => doc.id === archivo.id);
      if (existe) {
        return prev.map(doc =>
          doc.id === archivo.id ? { ...doc, x: px, y: py } : doc
        );
      }
      return [
        ...prev,
        {
          id: archivo.id,
          nombre: archivo.nombre,
          tipo: archivo.tipo,
          vista: archivo.vista,
          tamano: archivo.tamano,
          x: px,
          y: py,
          url: archivo.url
        }
      ];
    });
    setModoHerramienta("cursor");
  }

  function quitarDocumentoDeLienzo(id: string): void {
    if (bloqueado) return;
    setListaDocs(prev => prev.filter(doc => doc.id !== id));
  }

  async function subirArchivosLista(elegidos: File[]): Promise<ArchivoPizarraItem[]> {
    if (elegidos.length === 0) return [];

    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setSubiendoArchivo(true);
    setErrorArchivos(null);
    const subidos: ArchivoPizarraItem[] = [];

    try {
      for (const archivo of elegidos) {
        if (esPreview) {
          const vista = vistaPorArchivo(archivo);
          const url =
            vista === "imagen"
              ? await new Promise<string>((resolve, reject) => {
                  const lector = new FileReader();
                  lector.onload = () => resolve(String(lector.result ?? ""));
                  lector.onerror = () => reject(new Error("read_error"));
                  lector.readAsDataURL(archivo);
                })
              : undefined;
          const nuevo: ArchivoPizarraItem = {
            id: nuevoId(),
            nombre: archivo.name,
            tipo: archivo.type || "application/octet-stream",
            vista,
            tamano: archivo.size,
            url
          };
          setArchivos(prev => [nuevo, ...prev]);
          subidos.push(nuevo);
        } else {
          const creado = await archivosApi.subir(archivo, mesaId);
          const nuevo = archivoAItem(creado);
          setArchivos(prev => [nuevo, ...prev]);
          subidos.push(nuevo);
        }
      }
      if (!esPreview && subidos.length > 0) {
        onArchivosCambiados?.();
      }
    } catch (fallo) {
      setErrorArchivos(describeError(fallo));
    } finally {
      setSubiendoArchivo(false);
    }
    return subidos;
  }

  function alSoltarEnLienzo(evento: ReactDragEvent<HTMLDivElement>): void {
    if (bloqueado) return;
    evento.preventDefault();
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((evento.clientX - rect.left) / rect.width) * 100;
    const y = ((evento.clientY - rect.top) / rect.height) * 100;

    let item: ArchivoPizarraItem | null = archivoDragRef.current;
    const bruto = evento.dataTransfer.getData("application/x-pocketrol-doc");
    if (bruto) {
      try {
        item = JSON.parse(bruto) as ArchivoPizarraItem;
      } catch {
        // Mantiene el fallback en memoria si el parse falla.
      }
    }
    archivoDragRef.current = null;
    if (item) {
      colocarDocumentoEnLienzo(item, x, y);
      return;
    }

    const files = Array.from(evento.dataTransfer.files ?? []);
    if (files.length > 0) {
      void subirArchivosLista(files).then(subidos => {
        subidos.forEach((subido, idx) => {
          colocarDocumentoEnLienzo(subido, x + idx * 3, y + idx * 3);
        });
      });
    }
  }

  async function alSubirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    await subirArchivosLista(elegidos);
  }

  async function borrarArchivoPizarra(item: ArchivoPizarraItem): Promise<void> {
    if (bloqueado) return;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setErrorArchivos(null);
    try {
      if (!esPreview) {
        await archivosApi.borrar(item.id);
        onArchivosCambiados?.();
      }
      setArchivos(prev => prev.filter(archivo => archivo.id !== item.id));
      setListaDocs(prev => prev.filter(doc => doc.id !== item.id));
      setVisorArchivo(actual => (actual?.id === item.id ? null : actual));
    } catch (fallo) {
      setErrorArchivos(describeError(fallo));
    }
  }

  function borrarTodoPizarra(): void {
    guardarInstantanea();
    setListaTrazos([]);
    setListaPositsActiva([]);
    setListaDocs([]);
    if (esVistaEscena) {
      setTextosEscena([]);
    }
    setActivo(null);
    setTextoEditandoId(null);
    setConfirmarBorrarTodo(false);
  }

  const puedeDeshacer = esVistaEscena ? puedeDeshacerEscena : puedeDeshacerPizarra;
  const pingsVisibles = (pingsActivos ?? pingsLocales).filter(
    p => p.vista === vistaPizarra
  );

  const todosTrazos = trazoEnCurso
    ? [...listaTrazos, trazoEnCurso]
    : listaTrazos;
  const coloresPalette = Array.from(
    new Set([
      ...(esVistaEscena ? ["#f4f7ff"] : []),
      ...(esMaster ? ["#d49b27"] : colorJugador ? [colorJugador] : []),
      ...COLORES_TINTA.map(c => c.valor)
    ])
  );

  function cambiarVistaPizarra(nuevaVista: "pizarra" | "escena"): void {
    setVistaPizarra(nuevaVista);
    setActivo(null);
    setTextoEditandoId(null);
    setConfirmarBorrarTodo(false);
    setTrazoEnCurso(null);
    setMenuFormasAbierto(false);
    if (nuevaVista !== "escena" && modoHerramienta === "texto") {
      setModoHerramienta("cursor");
    }
    if (nuevaVista === "escena" && esColorOscuro(colorTinta)) {
      setColorTinta("#f4f7ff");
    } else if (nuevaVista === "pizarra" && colorTinta === "#f4f7ff") {
      setColorTinta(esMaster ? "#d49b27" : (colorJugador ?? "#2b2118"));
    }
  }

  const esHerramientaForma =
    herramientaEfectiva === "linea" || herramientaEfectiva === "flecha";
  const mostrarOpcionesTinta =
    (herramientaEfectiva === "dibujar" || esHerramientaForma) && !bloqueado;

  return (
    <div className={`pizarra-page${esVistaEscena ? " vista-escena" : ""}`}>
      <nav className="pizarra-vista-tabs" aria-label="Vistas de la pizarra">
        <button
          type="button"
          className={`pizarra-vista-tab pizarra-vista-tab-pizarra${!esVistaEscena ? " activo" : ""}`}
          onClick={() => cambiarVistaPizarra("pizarra")}
          aria-pressed={!esVistaEscena}
        >
          Pizarra
        </button>
        <button
          type="button"
          className={`pizarra-vista-tab pizarra-vista-tab-escena${esVistaEscena ? " activo" : ""}`}
          onClick={() => cambiarVistaPizarra("escena")}
          aria-pressed={esVistaEscena}
        >
          Escena
        </button>
      </nav>

      <header
        className={`pizarra-barra${esMaster ? " pizarra-barra-master" : ""}`}
      >
        <div className="pizarra-barra-izq">
          <button type="button" className="pizarra-btn" onClick={onVolver}>
            <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>Volver</span>
          </button>
          {esMaster && (
            <span className="master-pill-badge">
              <Crown size={12} strokeWidth={2.2} aria-hidden="true" />
              <span>MODO MÁSTER</span>
            </span>
          )}
          <button
            type="button"
            className="pizarra-btn pizarra-btn-nuevo"
            onClick={() => {
              const centro = centroVisibleLienzo();
              crearPosit(centro.x, centro.y);
            }}
            disabled={bloqueado}
          >
            <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
            <span>Nuevo posit</span>
          </button>
        </div>

        <div className="pizarra-barra-centro">
          <div
            className="pizarra-herramientas"
            role="group"
            aria-label="Herramientas de pizarra"
          >
            <button
              type="button"
              className={`pizarra-tool-btn${
                herramientaEfectiva === "cursor" ? " activo" : ""
              }`}
              onClick={() => setModoHerramienta("cursor")}
              title="Mover posits y fichas"
            >
              <Hand size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Posits</span>
            </button>
            <button
              type="button"
              className={`pizarra-tool-btn${
                herramientaEfectiva === "dibujar" ? " activo" : ""
              }`}
              disabled={bloqueado}
              onClick={() => setModoHerramienta("dibujar")}
              title="Dibujar sobre la pizarra"
            >
              <Pencil size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Dibujar</span>
            </button>
            <div ref={formasMenuRef} className="pizarra-formas-wrap">
              <button
                type="button"
                className={`pizarra-tool-btn pizarra-tool-formas${
                  esHerramientaForma ? " activo" : ""
                }`}
                disabled={bloqueado}
                aria-expanded={menuFormasAbierto}
                aria-haspopup="menu"
                onClick={() => {
                  if (esHerramientaForma) {
                    setMenuFormasAbierto(abierto => !abierto);
                  } else {
                    setModoHerramienta(formaActiva);
                    setMenuFormasAbierto(true);
                  }
                }}
                title="Dibujar líneas rectas o flechas (mantén Shift para ángulos de 45°)"
              >
                {formaActiva === "flecha" ? (
                  <ArrowUpRight size={14} strokeWidth={2.1} aria-hidden="true" />
                ) : (
                  <Minus size={14} strokeWidth={2.1} aria-hidden="true" />
                )}
                <span>{formaActiva === "flecha" ? "Flecha" : "Línea"}</span>
                <ChevronDown size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
              {menuFormasAbierto && !bloqueado && (
                <div className="pizarra-formas-menu" role="menu">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={formaActiva === "linea"}
                    className={`pizarra-formas-opcion${
                      formaActiva === "linea" ? " activo" : ""
                    }`}
                    onClick={() => {
                      setFormaActiva("linea");
                      setModoHerramienta("linea");
                      setMenuFormasAbierto(false);
                    }}
                  >
                    <Minus size={14} strokeWidth={2.1} aria-hidden="true" />
                    <span>Línea recta</span>
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={formaActiva === "flecha"}
                    className={`pizarra-formas-opcion${
                      formaActiva === "flecha" ? " activo" : ""
                    }`}
                    onClick={() => {
                      setFormaActiva("flecha");
                      setModoHerramienta("flecha");
                      setMenuFormasAbierto(false);
                    }}
                  >
                    <ArrowUpRight size={14} strokeWidth={2.1} aria-hidden="true" />
                    <span>Flecha</span>
                  </button>
                </div>
              )}
            </div>
            {esVistaEscena && (
              <button
                type="button"
                className={`pizarra-tool-btn${
                  herramientaEfectiva === "texto" ? " activo" : ""
                }`}
                disabled={bloqueado}
                onClick={() => setModoHerramienta("texto")}
                title="Añadir cuadro de texto en la escena"
              >
                <Type size={14} strokeWidth={2.1} aria-hidden="true" />
                <span>Texto</span>
              </button>
            )}
            <button
              type="button"
              className={`pizarra-tool-btn${
                herramientaEfectiva === "borrar" ? " activo" : ""
              }`}
              disabled={bloqueado}
              onClick={() => setModoHerramienta("borrar")}
              title="Borrar trazos dibujados"
            >
              <Eraser size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Borrador</span>
            </button>
            <button
              type="button"
              className={`pizarra-tool-btn${
                herramientaEfectiva === "ping" ? " activo" : ""
              }`}
              onClick={() => setModoHerramienta("ping")}
              title="Señalar un punto temporalmente con un ping"
            >
              <Radio size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Ping</span>
            </button>
          </div>

          {mostrarOpcionesTinta && (
            <div className="pizarra-tinta-opciones">
              <div className="pizarra-tinta-colores" title="Color del trazo">
                {coloresPalette.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`pizarra-color-dot${
                      colorTinta === color ? " activo" : ""
                    }`}
                    style={{ background: color }}
                    aria-label={`Color ${color}`}
                    onClick={() => setColorTinta(color)}
                  />
                ))}
              </div>
              <div className="pizarra-tinta-grosores" title="Grosor del trazo">
                {GROSORES_TINTA.map(item => (
                  <button
                    key={item.valor}
                    type="button"
                    className={`pizarra-grosor-btn${
                      grosorTinta === item.valor ? " activo" : ""
                    }`}
                    onClick={() => setGrosorTinta(item.valor)}
                  >
                    {item.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          )}

          {herramientaEfectiva === "texto" && esVistaEscena && !bloqueado && (
            <div className="pizarra-tinta-opciones pizarra-texto-opciones">
              <div className="pizarra-tinta-colores" title="Color del texto">
                {coloresPalette.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`pizarra-color-dot${
                      colorTexto === color ? " activo" : ""
                    }`}
                    style={{ background: color }}
                    aria-label={`Color de texto ${color}`}
                    onClick={() => setColorTexto(color)}
                  />
                ))}
              </div>
              <div className="pizarra-tinta-grosores" title="Tamaño del texto">
                {(
                  [
                    { valor: "sm", etiqueta: "Pequeño" },
                    { valor: "md", etiqueta: "Mediano" },
                    { valor: "lg", etiqueta: "Grande" }
                  ] as const
                ).map(item => (
                  <button
                    key={item.valor}
                    type="button"
                    className={`pizarra-grosor-btn${
                      tamanoTexto === item.valor ? " activo" : ""
                    }`}
                    onClick={() => setTamanoTexto(item.valor)}
                  >
                    {item.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pizarra-barra-der">
          {!bloqueado && (
            <button
              type="button"
              className="pizarra-btn"
              disabled={!puedeDeshacer}
              onClick={deshacer}
              title="Deshacer último cambio (Ctrl+Z)"
            >
              <Undo2 size={14} strokeWidth={2.1} aria-hidden="true" />
              <span>Deshacer</span>
            </button>
          )}
          {esMaster && (
            <>
              <button
                type="button"
                className={`pizarra-btn pizarra-btn-congelar${
                  pizarraCongelada ? " activo" : ""
                }`}
                onClick={() => setPizarraCongelada(valor => !valor)}
                title="Impide a los jugadores dibujar, borrar o mover posits"
              >
                <Snowflake size={14} strokeWidth={2.1} aria-hidden="true" />
                <span>{pizarraCongelada ? "Congelada" : "Congelar"}</span>
              </button>

              <button
                type="button"
                className="pizarra-btn"
                disabled={listaTrazos.length === 0}
                onClick={() => {
                  guardarInstantanea();
                  setListaTrazos([]);
                }}
                title="Borrar solo los dibujos trazados"
              >
                <Paintbrush size={14} strokeWidth={2.1} aria-hidden="true" />
                <span>Dibujos</span>
              </button>

              {confirmarBorrarTodo ? (
                <div className="pizarra-confirmar-borrar">
                  <button
                    type="button"
                    className="pizarra-btn pizarra-btn-peligro"
                    onClick={borrarTodoPizarra}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    className="pizarra-btn"
                    onClick={() => setConfirmarBorrarTodo(false)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="pizarra-btn pizarra-btn-peligro"
                  onClick={() => setConfirmarBorrarTodo(true)}
                  title="Vaciar dibujos, posits y fichas de la pizarra"
                >
                  <Trash2 size={14} strokeWidth={2.1} aria-hidden="true" />
                  <span>Borrar todo</span>
                </button>
              )}

              {(onCambiarEscena || onProyectarImagen) && (
                <button
                  type="button"
                  className="master-btn-dorado"
                  onClick={() => setPanelMasterAbierto(true)}
                >
                  <ImageIcon size={14} strokeWidth={2.1} aria-hidden="true" />
                  <span>Escena</span>
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="pizarra-area-trabajo">
        <aside
          className={`pizarra-sidebar${sidebarAbierta ? "" : " plegada"}`}
          aria-label="Documentos e imágenes de la pizarra"
        >
          <button
            type="button"
            className="pizarra-sidebar-toggle"
            onClick={() => setSidebarAbierta(abierta => !abierta)}
            title={
              sidebarAbierta ? "Ocultar columna" : "Mostrar archivos y pistas"
            }
            aria-label={
              sidebarAbierta ? "Ocultar columna" : "Mostrar columna"
            }
          >
            {sidebarAbierta ? (
              <ChevronLeft size={14} strokeWidth={2.3} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} strokeWidth={2.3} aria-hidden="true" />
            )}
          </button>

          {sidebarAbierta && (
            <div className="pizarra-sidebar-cuerpo">
              <div className="pizarra-sidebar-cabecera">
                <div className="pizarra-sidebar-titulo-wrap">
                  <h2>Documentos e imágenes</h2>
                  <span className="pizarra-sidebar-count">
                    {archivos.length}
                  </span>
                </div>
                <div className="pizarra-sidebar-cabecera-acciones">
                  {onAbrirArchivador && (
                    <button
                      type="button"
                      className="pizarra-sidebar-archivador-btn"
                      onClick={onAbrirArchivador}
                      title="Abrir Archivador"
                    >
                      <Archive size={13} strokeWidth={2.2} aria-hidden="true" />
                      <span>Archivador</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="pizarra-sidebar-subir"
                    onClick={() => selectorArchivo.current?.click()}
                    disabled={subiendoArchivo}
                  >
                    {subiendoArchivo ? "Subiendo…" : "+ Subir"}
                  </button>
                </div>
                <input
                  ref={selectorArchivo}
                  type="file"
                  multiple
                  accept={ACEPTADOS}
                  className="archivador-input"
                  onChange={alSubirArchivo}
                />
              </div>

              {errorArchivos && (
                <p className="pizarra-sidebar-error">{errorArchivos}</p>
              )}

              <div className="pizarra-sidebar-lista">
                {cargandoArchivos && archivos.length === 0 ? (
                  <p className="pizarra-sidebar-vacio">Cargando archivos…</p>
                ) : archivos.length === 0 ? (
                  <p className="pizarra-sidebar-vacio">
                    No hay documentos ni imágenes todavía. Pulsa «+ Subir» para
                    añadir material y arrastrarlo al tablero.
                  </p>
                ) : (
                  archivos.map(item => {
                    const formato = infoFormatoArchivo(item.vista);
                    const yaEnPizarra = listaDocs.some(
                      doc => doc.id === item.id
                    );
                    const imgSrc =
                      item.vista === "imagen"
                        ? (item.url ?? archivosApi.url(item.id))
                        : null;

                    return (
                      <div
                        key={item.id}
                        className="pizarra-sidebar-item"
                        draggable={!bloqueado}
                        onDragStart={evento => {
                          if (bloqueado) return;
                          archivoDragRef.current = item;
                          evento.dataTransfer.setData(
                            "application/x-pocketrol-doc",
                            JSON.stringify(item)
                          );
                          evento.dataTransfer.effectAllowed = "copyMove";
                        }}
                      >
                        <button
                          type="button"
                          className="pizarra-sidebar-item-abrir"
                          onClick={() => setVisorArchivo(item)}
                          title={`Abrir ${item.nombre}`}
                        >
                          {imgSrc ? (
                            <span className="pizarra-sidebar-thumb">
                              <img src={imgSrc} alt={item.nombre} />
                            </span>
                          ) : (
                            <span
                              className={`ficha-doc-hoja mini ${formato.clase}`}
                              style={
                                {
                                  "--doc-color": formato.color
                                } as CSSProperties
                              }
                            >
                              {formato.codigo}
                            </span>
                          )}
                          <span className="pizarra-sidebar-meta">
                            <span className="pizarra-sidebar-nombre">
                              {item.nombre}
                            </span>
                            <span className="pizarra-sidebar-tipo">
                              {formato.codigo}
                            </span>
                          </span>
                        </button>

                        {!bloqueado && (
                          <div className="pizarra-sidebar-acciones">
                            <button
                              type="button"
                              className={`pizarra-sidebar-sacar${
                                yaEnPizarra ? " en-tablero" : ""
                              }`}
                              onClick={() => colocarDocumentoEnLienzo(item)}
                              title={
                                yaEnPizarra
                                  ? "Ya está en la pizarra (clic para recolocar)"
                                  : "Sacar a la pizarra o arrastrar al tablero"
                              }
                            >
                              {yaEnPizarra ? (
                                <Check
                                  size={13}
                                  strokeWidth={2.5}
                                  aria-hidden="true"
                                />
                              ) : (
                                "Sacar"
                              )}
                            </button>
                            <button
                              type="button"
                              className="pizarra-sidebar-borrar"
                              onClick={() => {
                                void borrarArchivoPizarra(item);
                              }}
                              title={`Eliminar ${item.nombre}`}
                              aria-label={`Eliminar ${item.nombre}`}
                            >
                              <IconoPapelera />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </aside>

        <div
          ref={viewportRef}
          className={`pizarra-lienzo modo-${herramientaEfectiva}${
            bloqueado ? " congelada" : ""
          }${esVistaEscena ? " vista-escena" : ""}${
            espacioPulsado ? " espacio-pan" : ""
          }${haciendoPan ? " haciendo-pan" : ""}`}
          onPointerDown={alPulsarLienzo}
          onDoubleClick={dobleClic}
          onDragOver={evento => {
            if (!bloqueado) {
              evento.preventDefault();
              evento.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={alSoltarEnLienzo}
        >
          <div
            className="pizarra-mundo-transform"
            style={{
              transform: `translate3d(${camara.pan.x}px, ${camara.pan.y}px, 0) scale(${camara.zoom})`,
              transformOrigin: "0 0"
            }}
          >
            <div className="pizarra-mundo" ref={lienzo}>
              <div
                className="pizarra-mundo-fondo-3x3"
                style={{
                  left: "-100%",
                  top: "-100%",
                  width: "300%",
                  height: "300%"
                }}
                aria-hidden="true"
              >
                {!esVistaEscena ? (
                  <PergaminoPizarra />
                ) : (
                  <div className="pizarra-escena-cielo">
                    <svg
                      className="pizarra-escena-estrellas-svg"
                      viewBox="0 0 1200 720"
                      preserveAspectRatio="xMidYMid slice"
                    >
                      {[
                        { x: 68, y: 54, s: 5, c: "#ffffff", o: 0.9 },
                        { x: 142, y: 128, s: 3.5, c: "#bae6fd", o: 0.78 },
                        { x: 215, y: 42, s: 4, c: "#fef3c7", o: 0.85 },
                        { x: 294, y: 164, s: 6, c: "#ffffff", o: 0.95 },
                        { x: 378, y: 88, s: 3.2, c: "#e9d5ff", o: 0.72 },
                        { x: 466, y: 52, s: 4.5, c: "#ffffff", o: 0.88 },
                        { x: 548, y: 142, s: 3.5, c: "#bfdbfe", o: 0.75 },
                        { x: 640, y: 66, s: 5.5, c: "#fef9c3", o: 0.9 },
                        { x: 726, y: 124, s: 3, c: "#ffffff", o: 0.7 },
                        { x: 814, y: 46, s: 4.5, c: "#ddd6fe", o: 0.86 },
                        { x: 908, y: 152, s: 5, c: "#ffffff", o: 0.92 },
                        { x: 1004, y: 74, s: 3.8, c: "#bae6fd", o: 0.8 },
                        { x: 1112, y: 118, s: 5.5, c: "#ffffff", o: 0.9 },
                        { x: 92, y: 248, s: 4, c: "#e0f2fe", o: 0.82 },
                        { x: 186, y: 312, s: 5.5, c: "#ffffff", o: 0.9 },
                        { x: 274, y: 266, s: 3, c: "#fef3c7", o: 0.72 },
                        { x: 388, y: 342, s: 4.5, c: "#ffffff", o: 0.85 },
                        { x: 492, y: 256, s: 3.6, c: "#e9d5ff", o: 0.78 },
                        { x: 588, y: 318, s: 6, c: "#ffffff", o: 0.94 },
                        { x: 696, y: 246, s: 3.5, c: "#bae6fd", o: 0.76 },
                        { x: 794, y: 334, s: 4.2, c: "#ffffff", o: 0.86 },
                        { x: 892, y: 272, s: 3.2, c: "#fef9c3", o: 0.74 },
                        { x: 988, y: 326, s: 5.2, c: "#ffffff", o: 0.9 },
                        { x: 1104, y: 252, s: 3.8, c: "#ddd6fe", o: 0.8 },
                        { x: 64, y: 446, s: 3.5, c: "#ffffff", o: 0.78 },
                        { x: 162, y: 518, s: 4.8, c: "#bae6fd", o: 0.86 },
                        { x: 258, y: 432, s: 3.2, c: "#ffffff", o: 0.7 },
                        { x: 346, y: 544, s: 5.5, c: "#fef3c7", o: 0.9 },
                        { x: 454, y: 468, s: 4, c: "#ffffff", o: 0.84 },
                        { x: 556, y: 562, s: 3.4, c: "#e9d5ff", o: 0.76 },
                        { x: 668, y: 452, s: 5, c: "#ffffff", o: 0.9 },
                        { x: 762, y: 534, s: 3.6, c: "#bfdbfe", o: 0.78 },
                        { x: 868, y: 474, s: 5.8, c: "#ffffff", o: 0.92 },
                        { x: 964, y: 556, s: 3.5, c: "#fef9c3", o: 0.76 },
                        { x: 1068, y: 442, s: 4.4, c: "#ffffff", o: 0.86 },
                        { x: 1146, y: 518, s: 3.6, c: "#e0f2fe", o: 0.8 },
                        { x: 118, y: 638, s: 5, c: "#ffffff", o: 0.88 },
                        { x: 244, y: 668, s: 3.5, c: "#ddd6fe", o: 0.76 },
                        { x: 412, y: 646, s: 4.5, c: "#ffffff", o: 0.85 },
                        { x: 534, y: 678, s: 3.8, c: "#bae6fd", o: 0.8 },
                        { x: 718, y: 652, s: 5.5, c: "#ffffff", o: 0.92 },
                        { x: 846, y: 672, s: 3.4, c: "#fef3c7", o: 0.74 },
                        { x: 1018, y: 644, s: 4.8, c: "#ffffff", o: 0.88 },
                        { x: 1134, y: 668, s: 3.6, c: "#e9d5ff", o: 0.78 }
                      ].map((st, idx) => (
                        <polygon
                          key={idx}
                          points={`${st.x},${st.y - st.s} ${st.x + st.s * 0.68},${st.y} ${st.x},${st.y + st.s} ${st.x - st.s * 0.68},${st.y}`}
                          fill={st.c}
                          opacity={st.o}
                        />
                      ))}
                    </svg>
                  </div>
                )}
              </div>

              <div className="pizarra-centro-marco" aria-hidden="true" />

              {esVistaEscena && imagenEscena && (
                <img
                  className="pizarra-escena-fondo-img"
                  src={urlImagenEscena(imagenEscena)}
                  alt={imagenEscena.titulo ?? "Escena de la campaña"}
                  draggable={false}
                />
              )}

              <svg
                className="pizarra-dibujo-svg-3x3"
                viewBox="-100 -100 300 300"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {todosTrazos.map(trazo => {
                  const forma = trazo.forma ?? "libre";
                  if (forma === "linea" && trazo.puntos.length >= 2) {
                    const inicio = trazo.puntos[0];
                    const fin = trazo.puntos[trazo.puntos.length - 1];
                    return (
                      <line
                        key={trazo.id}
                        x1={inicio.x}
                        y1={inicio.y}
                        x2={fin.x}
                        y2={fin.y}
                        stroke={trazo.color}
                        strokeWidth={trazo.grosor}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  }
                  if (forma === "flecha" && trazo.puntos.length >= 2) {
                    const inicio = trazo.puntos[0];
                    const fin = trazo.puntos[trazo.puntos.length - 1];
                    const w = Math.max(1, mundoTamano.w);
                    const h = Math.max(1, mundoTamano.h);
                    const dxPx = (fin.x - inicio.x) * (w / 100);
                    const dyPx = (fin.y - inicio.y) * (h / 100);
                    const lenPx = Math.hypot(dxPx, dyPx);
                    let puntaPoints = "";
                    if (lenPx > 2) {
                      const ux = dxPx / lenPx;
                      const uy = dyPx / lenPx;
                      const px = -uy;
                      const py = ux;
                      const largoPx = Math.min(
                        Math.max(12, trazo.grosor * 3.2 + 6),
                        28
                      );
                      const anchoPx = largoPx * 0.55;
                      const a1x =
                        fin.x + (-ux * largoPx + px * anchoPx) * (100 / w);
                      const a1y =
                        fin.y + (-uy * largoPx + py * anchoPx) * (100 / h);
                      const a2x =
                        fin.x + (-ux * largoPx - px * anchoPx) * (100 / w);
                      const a2y =
                        fin.y + (-uy * largoPx - py * anchoPx) * (100 / h);
                      puntaPoints = `${a1x},${a1y} ${fin.x},${fin.y} ${a2x},${a2y}`;
                    }
                    return (
                      <g key={trazo.id}>
                        <line
                          x1={inicio.x}
                          y1={inicio.y}
                          x2={fin.x}
                          y2={fin.y}
                          stroke={trazo.color}
                          strokeWidth={trazo.grosor}
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        {puntaPoints && (
                          <polyline
                            points={puntaPoints}
                            fill="none"
                            stroke={trazo.color}
                            strokeWidth={trazo.grosor}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                      </g>
                    );
                  }
                  if (trazo.puntos.length === 1) {
                    return (
                      <circle
                        key={trazo.id}
                        cx={trazo.puntos[0].x}
                        cy={trazo.puntos[0].y}
                        r={Math.max(0.2, trazo.grosor * 0.08)}
                        fill={trazo.color}
                      />
                    );
                  }
                  return (
                    <polyline
                      key={trazo.id}
                      points={trazo.puntos.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={trazo.color}
                      strokeWidth={trazo.grosor}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>

              {listaDocs.map(doc => {
            const formato = infoFormatoArchivo(doc.vista);
            const esImg = doc.vista === "imagen";
            const imgSrc = esImg ? (doc.url ?? archivosApi.url(doc.id)) : null;
            const esImgGrandeEscena = esVistaEscena && Boolean(imgSrc);
            const tamImg = tamanoImagenesEscena[doc.id];

            return (
              <div
                key={doc.id}
                data-supr-id={doc.id}
                data-supr-tipo="archivo"
                className={`pizarra-ficha-doc${bloqueado ? " bloqueado" : ""}${
                  esImgGrandeEscena ? " escena-imagen-libre" : ""
                }`}
                style={
                  {
                    left: `${doc.x}%`,
                    top: `${doc.y}%`,
                    "--doc-color": formato.color
                  } as CSSProperties
                }
                onPointerDown={evento => iniciarArrastreDoc(evento, doc)}
                onDoubleClick={evento => evento.stopPropagation()}
              >
                {!bloqueado && (
                  <div
                    className="ficha-doc-barra"
                    onPointerDown={evento => evento.stopPropagation()}
                  >
                    {esMaster && esImg && onProyectarImagen && (
                      <button
                        type="button"
                        className={`doc-master-icono${
                          imagenProyectada?.id === doc.id ? " activo" : ""
                        }`}
                        title={
                          imagenProyectada?.id === doc.id
                            ? "Retirar proyección"
                            : "Mostrar a todos"
                        }
                        onClick={evento => {
                          evento.stopPropagation();
                          onProyectarImagen(
                            imagenProyectada?.id === doc.id
                              ? null
                              : {
                                  id: doc.id,
                                  titulo: doc.nombre,
                                  url: doc.url
                                }
                          );
                        }}
                      >
                        <Sparkles
                          size={13}
                          strokeWidth={2.1}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    {esMaster && esImg && onCambiarEscena && (
                      <button
                        type="button"
                        className={`doc-master-icono${
                          imagenEscena?.id === doc.id ? " activo" : ""
                        }`}
                        title={
                          imagenEscena?.id === doc.id
                            ? "Quitar escena de la sala"
                            : "Fijar en la pizarra de la sala"
                        }
                        onClick={evento => {
                          evento.stopPropagation();
                          onCambiarEscena(
                            imagenEscena?.id === doc.id
                              ? null
                              : {
                                  id: doc.id,
                                  titulo: doc.nombre,
                                  url: doc.url
                                }
                          );
                        }}
                      >
                        <ImageIcon
                          size={13}
                          strokeWidth={2.1}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    {onSacarDePizarraAMesa && (
                      <button
                        type="button"
                        className="posit-sacar-mesa"
                        title="Sacar a mesa"
                        aria-label={`Sacar ${doc.nombre} a mi mesa`}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid rgb(232 197 106 / 55%)",
                          background: "rgb(232 197 106 / 18%)",
                          color: "#fff3d1",
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}
                        onClick={evento => {
                          evento.stopPropagation();
                          sacarDocAMesa(doc);
                        }}
                      >
                        Sacar a mesa
                      </button>
                    )}
                    <button
                      type="button"
                      className="posit-borrar"
                      title="Quitar ficha de la pizarra"
                      aria-label={`Quitar ${doc.nombre} de la pizarra`}
                      onClick={evento => {
                        evento.stopPropagation();
                        quitarDocumentoDeLienzo(doc.id);
                      }}
                    >
                      <IconoPapelera />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className={
                    imgSrc
                      ? esImgGrandeEscena
                        ? "pizarra-ficha-imagen escena-grande"
                        : "pizarra-ficha-imagen"
                      : `ficha-doc-hoja ${formato.clase}`
                  }
                  style={
                    esImgGrandeEscena && tamImg
                      ? { width: `${tamImg.w}px`, height: `${tamImg.h}px` }
                      : undefined
                  }
                  title={`Abrir ${doc.nombre}`}
                  aria-label={`Abrir ${doc.nombre}`}
                  onClick={() => {
                    if (arrastreDocMovido.current) return;
                    setVisorArchivo(doc);
                  }}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={doc.nombre}
                      draggable={false}
                      onLoad={
                        esImgGrandeEscena
                          ? evento => {
                              if (tamanoImagenesEscena[doc.id]) return;
                              const natW = evento.currentTarget.naturalWidth || 420;
                              const natH = evento.currentTarget.naturalHeight || 300;
                              const maxW = Math.min(window.innerWidth * 0.62, 760);
                              const maxH = Math.min(window.innerHeight * 0.62, 560);
                              const escala = Math.min(1, maxW / natW, maxH / natH);
                              setTamanoImagenesEscena(prev =>
                                prev[doc.id]
                                  ? prev
                                  : {
                                      ...prev,
                                      [doc.id]: {
                                        w: Math.max(120, Math.round(natW * escala)),
                                        h: Math.max(90, Math.round(natH * escala))
                                      }
                                    }
                              );
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <span className="ficha-doc-codigo">{formato.codigo}</span>
                  )}
                </button>

                {esImgGrandeEscena && !bloqueado && herramientaEfectiva === "cursor" && (
                  <span
                    className="pizarra-escena-img-tirador"
                    title="Arrastra para redimensionar la imagen"
                    onPointerDown={evento =>
                      iniciarRedimensionDoc(
                        evento,
                        doc.id,
                        tamImg ?? { w: 420, h: 300 }
                      )
                    }
                  />
                )}

                <span className="ficha-doc-nombre" title={doc.nombre}>
                  {doc.nombre}
                </span>
              </div>
            );
          })}

          {listaPositsActiva.map(posit => (
            <Posit
              key={posit.id}
              posit={posit}
              activo={activo === posit.id}
              bloqueado={bloqueado}
              miUsuarioId={miUsuarioId}
              zoom={camara.zoom}
              onActivar={setActivo}
              onTexto={cambiarTexto}
              onColor={cambiarColor}
              onSacarAMesa={onSacarDePizarraAMesa ? sacarPositAMesa : undefined}
              onBorrar={borrarPosit}
              onArrastrar={iniciarArrastrePosit}
              onRedimensionar={redimensionarPosit}
            />
          ))}

          {esVistaEscena &&
            textosEscena.map(item => (
              <CuadroTextoEscena
                key={item.id}
                item={item}
                activo={activo === item.id}
                editando={textoEditandoId === item.id}
                bloqueado={bloqueado}
                colores={coloresPalette}
                zoom={camara.zoom}
                onActivar={setActivo}
                onIniciarEdicion={setTextoEditandoId}
                onTerminarEdicion={() =>
                  setTextoEditandoId(actual =>
                    actual === item.id ? null : actual
                  )
                }
                onTexto={cambiarTextoEscena}
                onColor={cambiarColorTextoEscena}
                onTamano={cambiarTamanoTextoEscena}
                onAncho={cambiarAnchoTextoEscena}
                onBorrar={borrarTextoEscena}
                onArrastrar={iniciarArrastreTextoEscena}
              />
            ))}

          {!esVistaEscena &&
            listaObjetos.map(objeto => {
              const imgObjeto =
                objeto.imagenLocal ??
                (objeto.archivoId ? archivosApi.url(objeto.archivoId) : null);

              return (
                <div
                  key={objeto.id}
                  data-supr-id={objeto.id}
                  data-supr-tipo="objeto"
                  className={`mesa-objeto${bloqueado ? " bloqueado" : ""}`}
                  style={{
                    left: `${objeto.x}%`,
                    top: `${objeto.y}%`,
                    zIndex: 7,
                    cursor:
                      bloqueado || herramientaEfectiva !== "cursor"
                        ? "default"
                        : "grab"
                  }}
                  onPointerDown={evento => iniciarArrastreObjeto(evento, objeto)}
                  onDoubleClick={evento => evento.stopPropagation()}
                >
                  <div className="mesa-objeto-cuadro">
                    {imgObjeto ? (
                      <img src={imgObjeto} alt={objeto.nombre} draggable={false} />
                    ) : (
                      <span className="mesa-objeto-emoji" aria-hidden="true">
                        {objeto.emoji ?? "🎒"}
                      </span>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        right: 4,
                        bottom: 4,
                        padding: "1px 5px",
                        borderRadius: 999,
                        background: "rgb(10 8 15 / 88%)",
                        border: "1px solid rgb(232 197 106 / 55%)",
                        color: "#fff3d1",
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1.2
                      }}
                    >
                      ×{objeto.cantidad}
                    </span>
                  </div>
                  <span className="mesa-objeto-nombre" title={objeto.nombre}>
                    {objeto.nombre}
                  </span>
                  {onSacarDePizarraAMesa && !bloqueado && (
                    <button
                      type="button"
                      className="posit-sacar-mesa"
                      title="Sacar a mesa"
                      aria-label={`Sacar ${objeto.nombre} a mi mesa`}
                      style={{
                        padding: "2px 7px",
                        borderRadius: 6,
                        border: "1px solid rgb(232 197 106 / 65%)",
                        background: "rgb(18 14 26 / 92%)",
                        color: "#fff3d1",
                        fontSize: 10.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                      onPointerDown={evento => evento.stopPropagation()}
                      onClick={evento => {
                        evento.stopPropagation();
                        sacarObjetoAMesa(objeto);
                      }}
                    >
                      Sacar a mesa
                    </button>
                  )}
                </div>
              );
            })}

          {pingsVisibles.map(ping => (
            <div
              key={ping.id}
              className="ping-onda"
              style={
                {
                  left: `${ping.x}%`,
                  top: `${ping.y}%`,
                  "--ping-color": ping.color
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <span className="ping-onda-anillo" />
              <span className="ping-onda-centro" />
            </div>
          ))}
            </div>
          </div>

          {pizarraCongelada && (
            <div className="pizarra-congelada-aviso">
              {esMaster ? (
                <>
                  <Snowflake size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    Pizarra congelada para los jugadores (tú sigues pudiendo
                    editar)
                  </span>
                </>
              ) : (
                <>
                  <Lock size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    Pizarra congelada por el Máster · modo solo lectura
                  </span>
                </>
              )}
            </div>
          )}

          {esVistaEscena && (imagenEscena || esMaster) && (
            <div
              className="pizarra-escena-barra-flotante"
              onPointerDown={evento => evento.stopPropagation()}
              onDoubleClick={evento => evento.stopPropagation()}
            >
              {imagenEscena?.titulo && (
                <span className="pizarra-escena-flotante-titulo">
                  {imagenEscena.titulo}
                </span>
              )}
              {esMaster && (
                <button
                  type="button"
                  className="pizarra-escena-flotante-btn"
                  onClick={() => setPanelMasterAbierto(true)}
                >
                  <ImageIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    {imagenEscena ? "Cambiar escena" : "Subir o elegir escena"}
                  </span>
                </button>
              )}
              {esMaster && imagenEscena && onCambiarEscena && (
                <button
                  type="button"
                  className="pizarra-escena-flotante-btn quitar"
                  onClick={() => onCambiarEscena(null)}
                >
                  Quitar
                </button>
              )}
            </div>
          )}

          {!esVistaEscena && imagenEscena && (
            <aside
              className={`pizarra-escena-tarjeta${
                escenaMinimizada ? " minimizada" : ""
              }`}
              onPointerDown={evento => evento.stopPropagation()}
              onDoubleClick={evento => evento.stopPropagation()}
            >
              {escenaMinimizada ? (
                <button
                  type="button"
                  className="pizarra-escena-mini-btn"
                  onClick={() => setEscenaMinimizada(false)}
                >
                  <ImageIcon size={14} strokeWidth={2.1} aria-hidden="true" />
                  <span>
                    Escena: {imagenEscena.titulo ?? "Ver imagen del Máster"}
                  </span>
                </button>
              ) : (
                <>
                  <div className="pizarra-escena-cabecera">
                    <span className="pizarra-escena-titulo-label">
                      <ImageIcon
                        size={14}
                        strokeWidth={2.1}
                        aria-hidden="true"
                      />
                      <span>Escena del Máster</span>
                    </span>
                    <div className="pizarra-escena-cabecera-btns">
                      <button
                        type="button"
                        onClick={() =>
                          setVisorArchivo({
                            id: imagenEscena.id,
                            nombre: imagenEscena.titulo ?? "Escena de campaña",
                            tipo: "image/png",
                            vista: "imagen",
                            tamano: 0,
                            url: urlImagenEscena(imagenEscena)
                          })
                        }
                        title="Ampliar imagen"
                      >
                        Ampliar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEscenaMinimizada(true)}
                        title="Minimizar"
                        aria-label="Minimizar escena"
                      >
                        <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                      </button>
                      {esMaster && onCambiarEscena && (
                        <button
                          type="button"
                          className="posit-borrar"
                          onClick={() => onCambiarEscena(null)}
                          title="Quitar escena de la pizarra"
                          aria-label="Quitar escena de la pizarra"
                        >
                          <IconoPapelera />
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="pizarra-escena-img-btn"
                    onClick={() =>
                      setVisorArchivo({
                        id: imagenEscena.id,
                        nombre: imagenEscena.titulo ?? "Escena de campaña",
                        tipo: "image/png",
                        vista: "imagen",
                        tamano: 0,
                        url: urlImagenEscena(imagenEscena)
                      })
                    }
                    title="Pulsar para ver en grande"
                  >
                    <img
                      src={urlImagenEscena(imagenEscena)}
                      alt={imagenEscena.titulo ?? "Escena de la campaña"}
                    />
                  </button>

                  {imagenEscena.titulo && (
                    <p className="pizarra-escena-titulo">
                      {imagenEscena.titulo}
                    </p>
                  )}

                  {esMaster && (onProyectarImagen || onCambiarEscena) && (
                    <div className="pizarra-escena-master-btns">
                      {onProyectarImagen && (
                        <button
                          type="button"
                          className={`master-accion-btn${
                            imagenProyectada?.id === imagenEscena.id
                              ? " activo"
                              : ""
                          }`}
                          onClick={() =>
                            onProyectarImagen(
                              imagenProyectada?.id === imagenEscena.id
                                ? null
                                : imagenEscena
                            )
                          }
                        >
                          {imagenProyectada?.id === imagenEscena.id ? (
                            <>
                              <Sparkles
                                size={13}
                                strokeWidth={2.1}
                                aria-hidden="true"
                              />
                              <span>Quitar proyección</span>
                            </>
                          ) : (
                            <>
                              <Sparkles
                                size={13}
                                strokeWidth={2.1}
                                aria-hidden="true"
                              />
                              <span>Mostrar a todos</span>
                            </>
                          )}
                        </button>
                      )}
                      {onCambiarEscena && (
                        <button
                          type="button"
                          className="master-quitar-btn"
                          onClick={() => onCambiarEscena(null)}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </aside>
          )}

          <div
            className="pizarra-zoom-controles"
            role="group"
            aria-label="Zoom del lienzo"
            onPointerDown={evento => evento.stopPropagation()}
            onDoubleClick={evento => evento.stopPropagation()}
          >
            <button
              type="button"
              className="pizarra-zoom-btn"
              onClick={() => aplicarZoomEnPunto(camara.zoom / 1.2)}
              disabled={camara.zoom <= ZOOM_MIN + 0.01}
              title="Alejar"
              aria-label="Alejar"
            >
              <Minus size={13} strokeWidth={2.3} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pizarra-zoom-btn pizarra-zoom-reset"
              onClick={restablecerCamara}
              title="Restablecer zoom y encuadre (100%)"
            >
              {Math.round(camara.zoom * 100)}%
            </button>
            <button
              type="button"
              className="pizarra-zoom-btn"
              onClick={() => aplicarZoomEnPunto(camara.zoom * 1.2)}
              disabled={camara.zoom >= ZOOM_MAX - 0.01}
              title="Acercar"
              aria-label="Acercar"
            >
              <Plus size={13} strokeWidth={2.3} aria-hidden="true" />
            </button>
          </div>

          <p className="pizarra-pista">
            {bloqueado
              ? "Pizarra en modo lectura · puedes consultar archivos e imágenes · rueda para zoom"
              : esVistaEscena
                ? herramientaEfectiva === "dibujar" ||
                  herramientaEfectiva === "linea" ||
                  herramientaEfectiva === "flecha"
                  ? "Arrastra sobre la escena para dibujar · mantén Shift para ángulos de 45° en líneas/flechas"
                  : herramientaEfectiva === "texto"
                    ? "Haz clic en cualquier punto de la escena para escribir texto"
                    : herramientaEfectiva === "borrar"
                      ? "Mantén pulsado y pasa sobre un trazo de la escena para borrarlo"
                      : "Vista Escena · arrastra el fondo o Espacio+arrastrar para mover · rueda para zoom"
                : herramientaEfectiva === "dibujar" ||
                    herramientaEfectiva === "linea" ||
                    herramientaEfectiva === "flecha"
                  ? "Arrastra sobre el pergamino para dibujar · mantén Shift para ángulos de 45° en líneas/flechas"
                  : herramientaEfectiva === "borrar"
                    ? "Mantén pulsado y pasa sobre un trazo para borrarlo"
                    : "Doble clic para crear un posit · arrastra el fondo o Espacio+arrastrar para mover · rueda para zoom"}
          </p>
        </div>
      </div>

      {panelMasterAbierto && (
        <PanelImagenesMasterModal
          mesaId={mesaId}
          tituloPanel="IMAGEN DE ESCENA DE LA PIZARRA"
          imagenEscena={imagenEscena}
          imagenProyectada={imagenProyectada}
          onCambiarEscena={onCambiarEscena}
          onProyectarImagen={onProyectarImagen}
          onCerrar={() => setPanelMasterAbierto(false)}
        />
      )}

      {visorArchivo && (
        <DocumentoVisorModal
          archivo={visorArchivo}
          esMaster={esMaster}
          imagenEscena={imagenEscena}
          imagenProyectada={imagenProyectada}
          onCambiarEscena={onCambiarEscena}
          onProyectarImagen={onProyectarImagen}
          onCerrar={() => setVisorArchivo(null)}
        />
      )}
    </div>
  );
}
