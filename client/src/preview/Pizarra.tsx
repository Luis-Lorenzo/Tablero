import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
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
import { describeError } from "../presentation/errorMessages";
import { DocumentoVisorModal, PanelImagenesMasterModal } from "./Archivador";
import {
  infoFormatoArchivo,
  nuevoId,
  textoLegible,
  trazoTocaPunto,
  urlImagenEscena
} from "./calibracion";
import { COLORES_POSIT } from "./datos";
import { reproducirSonidoPing } from "./sonido";
import type {
  DocumentoMesa,
  ElementoMesa,
  ImagenEscenaPreview,
  PingVisual,
  PositPreview,
  Punto,
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
  tamanoImagenesEscena?: Record<string, { w: number; h: number }>;
  onTamanoImagenesEscena?: Dispatch<
    SetStateAction<Record<string, { w: number; h: number }>>
  >;
  congelada?: boolean;
  onCongelada?: Dispatch<SetStateAction<boolean>>;
  onVolver: () => void;
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
  onActivar: (id: string) => void;
  onTexto: (id: string, texto: string) => void;
  onColor: (id: string, color: string) => void;
  onCompartirATodos?: (id: string) => void;
  onArchivar?: (id: string) => void;
  onSacarAMesa?: (id: string) => void;
  onBorrar: (id: string) => void;
  onArrastrar: (evento: ReactPointerEvent, posit: PositPreview) => void;
}

type ModoHerramienta = "cursor" | "dibujar" | "borrar" | "ping";

interface InstantaneaPizarra {
  trazos: TrazoPizarra[];
  posits: PositPreview[];
  documentos: DocumentoMesa[];
}

type AccionLienzo =
  | {
      tipo: "posit";
      id: string;
      inicioX: number;
      inicioY: number;
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
      tipo: "dibujar";
      trazo: TrazoPizarra;
      rect: DOMRect;
    }
  | {
      tipo: "borrar";
      rect: DOMRect;
    };

const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

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
  if (archivo.type === "text/plain" || archivo.name.endsWith(".txt")) {
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
  onActivar,
  onTexto,
  onColor,
  onCompartirATodos,
  onArchivar,
  onSacarAMesa,
  onBorrar,
  onArrastrar
}: PositProps) {
  const area = useRef<HTMLTextAreaElement>(null);
  const inicioPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [editandoMesa, setEditandoMesa] = useState(false);

  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [posit.texto]);

  const esMasterPosit = Boolean(posit.esMaster);
  const colorAura = esMasterPosit
    ? "#e8c56a"
    : (posit.autorColor ?? "#a98fce");

  const estilo = {
    left: `${posit.x}%`,
    top: `${posit.y}%`,
    background: posit.color,
    color: textoLegible(posit.color),
    "--giro": `${posit.giro}deg`,
    "--aura-color": colorAura
  } as CSSProperties;

  return (
    <div
      className={[
        "posit",
        enMesa ? "posit-mesa-nota" : "",
        activo && !bloqueado ? "activo" : "",
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
              if (enMesa) {
                inicioPointerRef.current = {
                  x: evento.clientX,
                  y: evento.clientY
                };
              }
              onArrastrar(evento, posit);
            }
      }
      onClick={evento => {
        if (bloqueado) return;
        if (enMesa && inicioPointerRef.current) {
          const dist = Math.hypot(
            evento.clientX - inicioPointerRef.current.x,
            evento.clientY - inicioPointerRef.current.y
          );
          inicioPointerRef.current = null;
          if (dist > 5) return;
          onActivar(posit.id);
          setEditandoMesa(true);
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
        placeholder={bloqueado ? "" : "Escribe una nota…"}
        style={enMesa && !editandoMesa ? { pointerEvents: "none" } : undefined}
        onBlur={() => {
          if (enMesa) setEditandoMesa(false);
        }}
        onChange={evento => {
          if (!bloqueado) onTexto(posit.id, evento.target.value);
        }}
        onPointerDown={evento => {
          if (!bloqueado && (!enMesa || editandoMesa)) {
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
  tamanoImagenesEscena: tamanoImagenesEscenaProp,
  onTamanoImagenesEscena,
  congelada,
  onCongelada,
  onVolver,
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
  const [vistaPizarra, setVistaPizarra] = useState<"pizarra" | "escena">("pizarra");
  const [trazosInternos, setTrazosInternos] = useState<TrazoPizarra[]>([]);
  const [trazosEscenaInternos, setTrazosEscenaInternos] = useState<TrazoPizarra[]>([]);
  const [positsEscenaInternos, setPositsEscenaInternos] = useState<PositPreview[]>([]);
  const [docsInternos, setDocsInternos] = useState<DocumentoMesa[]>([]);
  const [docsEscenaInternos, setDocsEscenaInternos] = useState<DocumentoMesa[]>([]);
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
  const [modoHerramienta, setModoHerramienta] =
    useState<ModoHerramienta>("cursor");
  const [colorTinta, setColorTinta] = useState<string>(
    () => (esMaster ? "#d49b27" : (colorJugador ?? "#2b2118"))
  );
  const [grosorTinta, setGrosorTinta] = useState<number>(4);
  const [trazoEnCurso, setTrazoEnCurso] = useState<TrazoPizarra | null>(null);

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

  const lienzo = useRef<HTMLDivElement>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);
  const accionRef = useRef<AccionLienzo | null>(null);
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
        : modoHerramienta;

  const guardarInstantanea = useCallback(() => {
    const pila = esVistaEscena
      ? historialEscenaRef.current
      : historialPizarraRef.current;
    pila.push({
      trazos: listaTrazos,
      posits: listaPositsActiva,
      documentos: listaDocs
    });
    if (pila.length > 30) {
      pila.shift();
    }
    if (esVistaEscena) {
      setPuedeDeshacerEscena(true);
    } else {
      setPuedeDeshacerPizarra(true);
    }
  }, [esVistaEscena, listaTrazos, listaPositsActiva, listaDocs]);

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
    setActivo(null);
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
    setListaDocs
  ]);

  useEffect(() => {
    function alTecla(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "z" && !evento.shiftKey) {
        const tag = (evento.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        evento.preventDefault();
        deshacer();
      }
    }
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [deshacer]);

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
      .listar()
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
  }, []);

  const borrarTrazosEnPunto = useCallback(
    (punto: Punto) => {
      setListaTrazos(prev => {
        const filtrados = prev.filter(
          trazo => !trazoTocaPunto(trazo, punto, 2.8)
        );
        return filtrados.length === prev.length ? prev : filtrados;
      });
    },
    [setListaTrazos]
  );

  useEffect(() => {
    function mover(evento: PointerEvent) {
      const actual = accionRef.current;
      if (!actual) return;

      if (actual.tipo === "posit") {
        const dx = ((evento.clientX - actual.inicioX) / actual.rect.width) * 100;
        const dy =
          ((evento.clientY - actual.inicioY) / actual.rect.height) * 100;
        setListaPositsActiva(prev =>
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
        return;
      }

      if (actual.tipo === "doc-tam") {
        const w = Math.round(
          limitar(actual.baseW + (evento.clientX - actual.inicioX), 80, 1400)
        );
        const h = Math.round(
          limitar(actual.baseH + (evento.clientY - actual.inicioY), 60, 1000)
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
                  x: limitar(actual.base.x + dx, 6, 94),
                  y: limitar(actual.base.y + dy, 10, 90)
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
                  x: limitar(actual.base.x + dx, 6, 94),
                  y: limitar(actual.base.y + dy, 10, 90)
                }
              : obj
          )
        );
        return;
      }

      const x = limitar(
        ((evento.clientX - actual.rect.left) / actual.rect.width) * 100,
        0,
        100
      );
      const y = limitar(
        ((evento.clientY - actual.rect.top) / actual.rect.height) * 100,
        0,
        100
      );

      if (actual.tipo === "dibujar") {
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

      if (actual?.tipo === "dibujar") {
        setTrazoEnCurso(null);
        if (actual.trazo.puntos.length >= 1) {
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
    setListaDocs,
    setListaObjetos,
    setListaTrazos,
    borrarTrazosEnPunto,
    guardarInstantanea
  ]);

  function crearPosit(x: number, y: number): void {
    if (bloqueado) return;
    guardarInstantanea();
    const posit: PositPreview = {
      id: nuevoId(),
      texto: "",
      color: COLORES_POSIT[3].valor,
      x: limitar(x, 8, 92),
      y: limitar(y, 10, 90),
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
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    evento.stopPropagation();
    accionRef.current = {
      tipo: "posit",
      id: posit.id,
      inicioX: evento.clientX,
      inicioY: evento.clientY,
      base: { x: posit.x, y: posit.y },
      rect
    };
    setActivo(posit.id);
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
      baseH: actual.h
    };
  }

  function iniciarArrastreDoc(
    evento: ReactPointerEvent,
    doc: DocumentoMesa
  ): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.stopPropagation();
    setActivo(null);
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
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    evento.stopPropagation();
    setActivo(null);
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
    if (herramientaEfectiva === "ping") {
      if ((evento.target as HTMLElement).closest(".pizarra-escena-tarjeta")) {
        return;
      }
      const rect = lienzo.current?.getBoundingClientRect();
      if (!rect) return;
      evento.preventDefault();

      const x = limitar(((evento.clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = limitar(((evento.clientY - rect.top) / rect.height) * 100, 0, 100);
      lanzarPing(x, y);
      return;
    }

    if (bloqueado) return;
    if (herramientaEfectiva === "cursor") {
      if (!(evento.target as HTMLElement).closest(".posit")) {
        setActivo(null);
      }
      return;
    }

    if ((evento.target as HTMLElement).closest(".pizarra-escena-tarjeta")) {
      return;
    }

    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

    evento.preventDefault();
    const x = limitar(((evento.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = limitar(((evento.clientY - rect.top) / rect.height) * 100, 0, 100);

    if (herramientaEfectiva === "dibujar") {
      const nuevoTrazo: TrazoPizarra = {
        id: nuevoId(),
        color: colorTinta,
        grosor: grosorTinta,
        puntos: [{ x, y }]
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

  function borrarPosit(id: string): void {
    if (bloqueado) return;
    guardarInstantanea();
    setListaPositsActiva(prev => prev.filter(posit => posit.id !== id));
    setActivo(actual => (actual === id ? null : actual));
  }

  function dobleClic(evento: ReactMouseEvent<HTMLDivElement>): void {
    if (bloqueado || herramientaEfectiva !== "cursor") return;
    if (
      (evento.target as HTMLElement).closest(
        ".posit, .pizarra-escena-tarjeta, .pizarra-ficha-doc"
      )
    ) {
      return;
    }

    const rect = evento.currentTarget.getBoundingClientRect();
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
    const offset = (listaDocs.length % 5) * 4;
    const px = limitar(x ?? 28 + offset, 8, 92);
    const py = limitar(y ?? 26 + offset, 12, 88);

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
          const creado = await archivosApi.subir(archivo);
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
    setActivo(null);
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
    setConfirmarBorrarTodo(false);
    setTrazoEnCurso(null);
    if (nuevaVista === "escena" && esColorOscuro(colorTinta)) {
      setColorTinta("#f4f7ff");
    } else if (nuevaVista === "pizarra" && colorTinta === "#f4f7ff") {
      setColorTinta(esMaster ? "#d49b27" : (colorJugador ?? "#2b2118"));
    }
  }

  return (
    <div className={`pizarra-page${esVistaEscena ? " vista-escena" : ""}`}>
      {!esVistaEscena && <PergaminoPizarra />}

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
            onClick={() => crearPosit(50, 50)}
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

          {herramientaEfectiva === "dibujar" && !bloqueado && (
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
                <button
                  type="button"
                  className="pizarra-sidebar-subir"
                  onClick={() => selectorArchivo.current?.click()}
                  disabled={subiendoArchivo}
                >
                  {subiendoArchivo ? "Subiendo…" : "+ Subir"}
                </button>
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
          className={`pizarra-lienzo modo-${herramientaEfectiva}${
            bloqueado ? " congelada" : ""
          }${esVistaEscena ? " vista-escena" : ""}`}
          ref={lienzo}
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
          {esVistaEscena && (
            <div className="pizarra-escena-cielo" aria-hidden="true">
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

          {esVistaEscena && imagenEscena && (
            <img
              className="pizarra-escena-fondo-img"
              src={urlImagenEscena(imagenEscena)}
              alt={imagenEscena.titulo ?? "Escena de la campaña"}
              draggable={false}
            />
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
                  <span>{imagenEscena ? "Cambiar escena" : "Subir o elegir escena"}</span>
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

          <svg
            className="pizarra-dibujo-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {todosTrazos.map(trazo =>
              trazo.puntos.length === 1 ? (
                <circle
                  key={trazo.id}
                  cx={trazo.puntos[0].x}
                  cy={trazo.puntos[0].y}
                  r={Math.max(0.2, trazo.grosor * 0.08)}
                  fill={trazo.color}
                />
              ) : (
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
              )
            )}
          </svg>

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

          {listaDocs.map(doc => {
            const formato = infoFormatoArchivo(doc.vista);
            const esImg = doc.vista === "imagen";
            const imgSrc = esImg ? (doc.url ?? archivosApi.url(doc.id)) : null;
            const esImgGrandeEscena = esVistaEscena && Boolean(imgSrc);
            const tamImg = tamanoImagenesEscena[doc.id];

            return (
              <div
                key={doc.id}
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
              onActivar={setActivo}
              onTexto={cambiarTexto}
              onColor={cambiarColor}
              onSacarAMesa={onSacarDePizarraAMesa ? sacarPositAMesa : undefined}
              onBorrar={borrarPosit}
              onArrastrar={iniciarArrastrePosit}
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

          <p className="pizarra-pista">
            {bloqueado
              ? "Pizarra en modo lectura · puedes consultar archivos e imágenes"
              : esVistaEscena
                ? herramientaEfectiva === "dibujar"
                  ? "Pinta directamente sobre la escena · los trazos son independientes de la Pizarra"
                  : herramientaEfectiva === "borrar"
                    ? "Mantén pulsado y pasa sobre un trazo de la escena para borrarlo"
                    : "Vista Escena · doble clic para crear un posit o usa Dibujar arriba"
                : herramientaEfectiva === "dibujar"
                  ? "Arrastra sobre el pergamino para dibujar · elige color y grosor arriba"
                  : herramientaEfectiva === "borrar"
                    ? "Mantén pulsado y pasa sobre un trazo para borrarlo"
                    : "Doble clic en el pergamino para crear un posit · arrastra archivos desde la columna izquierda"}
          </p>
        </div>
      </div>

      {panelMasterAbierto && (
        <PanelImagenesMasterModal
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
