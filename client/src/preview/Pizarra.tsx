import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction
} from "react";
import { DocumentoVisorModal, PanelImagenesMasterModal } from "./Archivador";
import { nuevoId, textoLegible, urlImagenEscena } from "./calibracion";
import { COLORES_POSIT } from "./datos";
import type { ImagenEscenaPreview, PositPreview } from "./tipos";

interface PizarraProps {
  posits: PositPreview[];
  onPosits: Dispatch<SetStateAction<PositPreview[]>>;
  onVolver: () => void;
  esMaster?: boolean;
  imagenEscena?: ImagenEscenaPreview | null;
  imagenProyectada?: ImagenEscenaPreview | null;
  onCambiarEscena?: (imagen: ImagenEscenaPreview | null) => void;
  onProyectarImagen?: (imagen: ImagenEscenaPreview | null) => void;
}

interface PositProps {
  posit: PositPreview;
  activo: boolean;
  onActivar: (id: string) => void;
  onTexto: (id: string, texto: string) => void;
  onColor: (id: string, color: string) => void;
  onArchivar?: (id: string) => void;
  onBorrar: (id: string) => void;
  onArrastrar: (evento: ReactPointerEvent, posit: PositPreview) => void;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
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

export function Posit({
  posit,
  activo,
  onActivar,
  onTexto,
  onColor,
  onArchivar,
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

  export function Pizarra({
    posits,
    onPosits,
    onVolver,
    esMaster,
    imagenEscena,
    imagenProyectada,
    onCambiarEscena,
    onProyectarImagen
  }: PizarraProps) {
    const [activo, setActivo] = useState<string | null>(null);
    const [escenaMinimizada, setEscenaMinimizada] = useState(false);
    const [panelMasterAbierto, setPanelMasterAbierto] = useState(false);
    const [visorEscena, setVisorEscena] = useState(false);
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
      if ((evento.target as HTMLElement).closest(".posit, .pizarra-escena-tarjeta")) {
        return;
      }

      const rect = evento.currentTarget.getBoundingClientRect();
      const x = ((evento.clientX - rect.left) / rect.width) * 100;
      const y = ((evento.clientY - rect.top) / rect.height) * 100;
      crearPosit(x, y);
    }

    return (
      <div className="pizarra-page">
        <Marmol />

        <div className="pizarra-barra">
          <div className="pizarra-barra-izq">
            <button type="button" className="pizarra-btn" onClick={onVolver}>
              ← Volver
            </button>
            {esMaster && (
              <span className="master-pill-badge">👑 MODO MÁSTER</span>
            )}
          </div>

          <div className="pizarra-barra-der">
            {esMaster && (onCambiarEscena || onProyectarImagen) && (
              <button
                type="button"
                className="master-btn-dorado"
                onClick={() => setPanelMasterAbierto(true)}
              >
                🖼 Imagen de escena
              </button>
            )}
            <button
              type="button"
              className="pizarra-btn pizarra-btn-nuevo"
              onClick={() => crearPosit(50, 50)}
            >
              + Nuevo posit
            </button>
          </div>
        </div>

        <div className="pizarra-lienzo" ref={lienzo} onDoubleClick={dobleClic}>
          {imagenEscena && (
            <aside
              className={`pizarra-escena-tarjeta${escenaMinimizada ? " minimizada" : ""}`}
              onDoubleClick={evento => evento.stopPropagation()}
            >
              {escenaMinimizada ? (
                <button
                  type="button"
                  className="pizarra-escena-mini-btn"
                  onClick={() => setEscenaMinimizada(false)}
                >
                  🖼 Escena: {imagenEscena.titulo ?? "Ver imagen del Máster"}
                </button>
              ) : (
                <>
                  <div className="pizarra-escena-cabecera">
                    <span>🖼 Escena del Máster</span>
                    <div className="pizarra-escena-cabecera-btns">
                      <button
                        type="button"
                        onClick={() => setVisorEscena(true)}
                        title="Ampliar imagen"
                      >
                        Ampliar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEscenaMinimizada(true)}
                        title="Minimizar"
                      >
                        —
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="pizarra-escena-img-btn"
                    onClick={() => setVisorEscena(true)}
                    title="Pulsar para ver en grande"
                  >
                    <img
                      src={urlImagenEscena(imagenEscena)}
                      alt={imagenEscena.titulo ?? "Escena de la campaña"}
                    />
                  </button>

                  {imagenEscena.titulo && (
                    <p className="pizarra-escena-titulo">{imagenEscena.titulo}</p>
                  )}

                  {esMaster && (onProyectarImagen || onCambiarEscena) && (
                    <div className="pizarra-escena-master-btns">
                      {onProyectarImagen && (
                        <button
                          type="button"
                          className={`master-accion-btn${imagenProyectada?.id === imagenEscena.id ? " activo" : ""
                            }`}
                          onClick={() =>
                            onProyectarImagen(
                              imagenProyectada?.id === imagenEscena.id
                                ? null
                                : imagenEscena
                            )
                          }
                        >
                          {imagenProyectada?.id === imagenEscena.id
                            ? "✦ Quitar proyección"
                            : "✦ Mostrar a todos"}
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

        {visorEscena && imagenEscena && (
          <DocumentoVisorModal
            archivo={{
              id: imagenEscena.id,
              nombre: imagenEscena.titulo ?? "Escena de campaña",
              vista: "imagen",
              url: urlImagenEscena(imagenEscena)
            }}
            esMaster={esMaster}
            imagenEscena={imagenEscena}
            imagenProyectada={imagenProyectada}
            onCambiarEscena={onCambiarEscena}
            onProyectarImagen={onProyectarImagen}
            onCerrar={() => setVisorEscena(false)}
          />
        )}
      </div>
    );
  }
