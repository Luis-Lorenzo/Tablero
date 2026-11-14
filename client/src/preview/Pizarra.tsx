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
  Snowflake,
  Sparkles,
  Trash2
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
import type {
  DocumentoMesa,
  ImagenEscenaPreview,
  PositPreview,
  Punto,
  TrazoPizarra
} from "./tipos";

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
}

interface PositProps {
  posit: PositPreview;
  activo: boolean;
  bloqueado?: boolean;
  enMesa?: boolean;
  onActivar: (id: string) => void;
  onTexto: (id: string, texto: string) => void;
  onColor: (id: string, color: string) => void;
  onArchivar?: (id: string) => void;
  onBorrar: (id: string) => void;
  onArrastrar: (evento: ReactPointerEvent, posit: PositPreview) => void;
}

type ModoHerramienta = "cursor" | "dibujar" | "borrar";

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
  onArchivar,
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
  congelada,
  onCongelada,
  onVolver,
  esMaster,
  colorJugador,
  nombreJugador,
  imagenEscena,
  imagenProyectada,
  onCambiarEscena,
  onProyectarImagen
}: PizarraProps) {
  const [trazosInternos, setTrazosInternos] = useState<TrazoPizarra[]>([]);
  const [docsInternos, setDocsInternos] = useState<DocumentoMesa[]>([]);
  const [congeladaInterna, setCongeladaInterna] = useState(false);

  const listaTrazos = trazos ?? trazosInternos;
  const setListaTrazos = onTrazos ?? setTrazosInternos;
  const listaDocs = documentosPizarra ?? docsInternos;
  const setListaDocs = onDocumentosPizarra ?? setDocsInternos;
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

  const herramientaEfectiva: ModoHerramienta = bloqueado
    ? "cursor"
    : modoHerramienta;

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
  }, [onPosits, setListaDocs, setListaTrazos, borrarTrazosEnPunto]);

  function crearPosit(x: number, y: number): void {
    if (bloqueado) return;
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

    onPosits(prev => [...prev, posit]);
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

  function alPulsarLienzo(evento: ReactPointerEvent<HTMLDivElement>): void {
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
      accionRef.current = { tipo: "borrar", rect };
      borrarTrazosEnPunto({ x, y });
    }
  }

  function cambiarTexto(id: string, texto: string): void {
    if (bloqueado) return;
    onPosits(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, texto } : posit))
    );
  }

  function cambiarColor(id: string, color: string): void {
    if (bloqueado) return;
    onPosits(prev =>
      prev.map(posit => (posit.id === id ? { ...posit, color } : posit))
    );
  }

  function borrarPosit(id: string): void {
    if (bloqueado) return;
    onPosits(prev => prev.filter(posit => posit.id !== id));
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

  function alSoltarEnLienzo(evento: ReactDragEvent<HTMLDivElement>): void {
    if (bloqueado) return;
    evento.preventDefault();
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return;

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
    if (!item) return;

    const x = ((evento.clientX - rect.left) / rect.width) * 100;
    const y = ((evento.clientY - rect.top) / rect.height) * 100;
    colocarDocumentoEnLienzo(item, x, y);
  }

  async function alSubirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(evento.target.files ?? []);
    evento.target.value = "";
    if (elegidos.length === 0) return;

    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setSubiendoArchivo(true);
    setErrorArchivos(null);
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
          setArchivos(prev => [
            {
              id: nuevoId(),
              nombre: archivo.name,
              tipo: archivo.type || "application/octet-stream",
              vista,
              tamano: archivo.size,
              url
            },
            ...prev
          ]);
        } else {
          const creado = await archivosApi.subir(archivo);
          setArchivos(prev => [archivoAItem(creado), ...prev]);
        }
      }
    } catch (fallo) {
      setErrorArchivos(describeError(fallo));
    } finally {
      setSubiendoArchivo(false);
    }
  }

  async function borrarArchivoPizarra(item: ArchivoPizarraItem): Promise<void> {
    if (bloqueado) return;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    setErrorArchivos(null);
    try {
      if (!esPreview) {
        await archivosApi.borrar(item.id);
      }
      setArchivos(prev => prev.filter(archivo => archivo.id !== item.id));
      setListaDocs(prev => prev.filter(doc => doc.id !== item.id));
      setVisorArchivo(actual => (actual?.id === item.id ? null : actual));
    } catch (fallo) {
      setErrorArchivos(describeError(fallo));
    }
  }

  function borrarTodoPizarra(): void {
    setListaTrazos([]);
    onPosits([]);
    setListaDocs([]);
    setActivo(null);
    setConfirmarBorrarTodo(false);
  }

  const todosTrazos = trazoEnCurso
    ? [...listaTrazos, trazoEnCurso]
    : listaTrazos;
  const coloresPalette = Array.from(
    new Set([
      ...(esMaster ? ["#d49b27"] : colorJugador ? [colorJugador] : []),
      ...COLORES_TINTA.map(c => c.valor)
    ])
  );

  return (
    <div className="pizarra-page">
      <PergaminoPizarra />

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
                onClick={() => setListaTrazos([])}
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
          }`}
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

          {imagenEscena && (
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

            return (
              <div
                key={doc.id}
                className={`pizarra-ficha-doc${bloqueado ? " bloqueado" : ""}`}
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
                      ? "pizarra-ficha-imagen"
                      : `ficha-doc-hoja ${formato.clase}`
                  }
                  title={`Abrir ${doc.nombre}`}
                  aria-label={`Abrir ${doc.nombre}`}
                  onClick={() => {
                    if (arrastreDocMovido.current) return;
                    setVisorArchivo(doc);
                  }}
                >
                  {imgSrc ? (
                    <img src={imgSrc} alt={doc.nombre} draggable={false} />
                  ) : (
                    <span className="ficha-doc-codigo">{formato.codigo}</span>
                  )}
                </button>

                <span className="ficha-doc-nombre" title={doc.nombre}>
                  {doc.nombre}
                </span>
              </div>
            );
          })}

          {posits.map(posit => (
            <Posit
              key={posit.id}
              posit={posit}
              activo={activo === posit.id}
              bloqueado={bloqueado}
              onActivar={setActivo}
              onTexto={cambiarTexto}
              onColor={cambiarColor}
              onBorrar={borrarPosit}
              onArrastrar={iniciarArrastrePosit}
            />
          ))}

          <p className="pizarra-pista">
            {bloqueado
              ? "Pizarra en modo lectura · puedes consultar archivos e imágenes"
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
