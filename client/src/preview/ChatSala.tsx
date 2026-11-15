import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { Crown, FolderUp, Lock, MessageSquare, Minus, Plus, Send, X } from "lucide-react";
import type { JugadorPreview, MensajeSala, RectPizarra } from "./tipos";

interface ChatSalaProps {
  rect: RectPizarra;
  jugadores: JugadorPreview[];
  miUsuarioId: string;
  mensajes: MensajeSala[];
  onEnviarMensaje: (texto: string, destinatarioId: string | null) => void | Promise<void>;
  onIniciarArrastre?: (evento: ReactPointerEvent) => void;
  onIniciarRedimension?: (evento: ReactPointerEvent) => void;
  compartirAbierto?: boolean;
  onToggleCompartir?: (ancla?: { left: number; bottom: number }) => void;
}

interface Destinatario {
  id: string;
  nombre: string;
}

function formatearHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function extraerFiltroMencion(texto: string): string | null {
  const match = /(?:^|\s)@([^\s]*)$/.exec(texto);
  return match ? match[1] : null;
}

export function ChatSala({
  rect,
  jugadores,
  miUsuarioId,
  mensajes,
  onEnviarMensaje,
  onIniciarArrastre,
  onIniciarRedimension,
  compartirAbierto = false,
  onToggleCompartir
}: ChatSalaProps) {
  const [plegado, setPlegado] = useState(false);
  const [texto, setTexto] = useState("");
  const [destinatario, setDestinatario] = useState<Destinatario | null>(null);
  const [indiceMencion, setIndiceMencion] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (plegado || !listaRef.current) return;
    listaRef.current.scrollTop = listaRef.current.scrollHeight;
  }, [mensajes.length, plegado]);

  const filtroMencion = extraerFiltroMencion(texto);
  const candidatos =
    filtroMencion === null
      ? []
      : jugadores.filter(j => {
          if (!j.activo) return false;
          const uid = j.userId ?? j.id;
          if (uid === miUsuarioId) return false;
          return j.nombre.toLowerCase().includes(filtroMencion.toLowerCase());
        });

  const indiceActivo =
    candidatos.length === 0 ? 0 : Math.min(indiceMencion, candidatos.length - 1);

  function seleccionarMencion(jugador: JugadorPreview): void {
    const uid = jugador.userId ?? jugador.id;
    setDestinatario({ id: uid, nombre: jugador.nombre });
    setTexto(prev =>
      prev.replace(/(?:^|\s)@[^\s]*$/, coincidencia =>
        coincidencia.startsWith(" ") ? " " : ""
      )
    );
    setIndiceMencion(0);
    inputRef.current?.focus();
  }

  async function manejarEnvio(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;

    setEnviando(true);
    try {
      await onEnviarMensaje(limpio, destinatario?.id ?? null);
      setTexto("");
    } finally {
      setEnviando(false);
    }
  }

  function manejarTecla(evento: KeyboardEvent<HTMLInputElement>): void {
    if (candidatos.length > 0) {
      if (evento.key === "ArrowDown") {
        evento.preventDefault();
        setIndiceMencion(i => (i + 1) % candidatos.length);
        return;
      }
      if (evento.key === "ArrowUp") {
        evento.preventDefault();
        setIndiceMencion(i => (i - 1 + candidatos.length) % candidatos.length);
        return;
      }
      if (evento.key === "Enter" || evento.key === "Tab") {
        evento.preventDefault();
        seleccionarMencion(candidatos[indiceActivo]);
        return;
      }
      if (evento.key === "Escape") {
        evento.preventDefault();
        setTexto(prev =>
          prev.replace(/(?:^|\s)@[^\s]*$/, coincidencia =>
            coincidencia.startsWith(" ") ? " " : ""
          )
        );
        return;
      }
    }

    if (evento.key === "Backspace" && texto === "" && destinatario) {
      setDestinatario(null);
    }
  }

  const estilo: CSSProperties = plegado
    ? { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%` }
    : {
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`
      };

  return (
    <section
      className={`sala-chat${plegado ? " plegado" : ""}`}
      style={estilo}
      aria-label="Chat de la sala"
    >
      <header className="chat-cabecera" onPointerDown={onIniciarArrastre}>
        <div className="chat-cabecera-izq">
          <span className="chat-titulo">
            <MessageSquare size={13} aria-hidden="true" />
            <span>Chat</span>
          </span>
          {onToggleCompartir && (
            <button
              type="button"
              className={`chat-compartir-btn${compartirAbierto ? " activo" : ""}`}
              onPointerDown={e => e.stopPropagation()}
              onClick={evento => {
                const caja = evento.currentTarget.closest(".sala-chat")?.getBoundingClientRect();
                onToggleCompartir(caja ? { left: caja.left, bottom: caja.bottom } : undefined);
              }}
              aria-expanded={compartirAbierto}
              aria-label="Pasar notas y archivos"
              title="Pasar notas y archivos"
            >
              <FolderUp size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="chat-plegar-btn"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setPlegado(p => !p)}
          aria-expanded={!plegado}
          aria-label={plegado ? "Expandir chat" : "Plegar chat"}
          title={plegado ? "Expandir chat" : "Plegar chat"}
        >
          {plegado ? <Plus size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
        </button>
      </header>

      {!plegado && (
        <>
          <div ref={listaRef} className="chat-mensajes">
            {mensajes.length === 0 ? (
              <p className="chat-vacio">
                Escribe un mensaje o usa <code>@</code> para susurrar en privado.
              </p>
            ) : (
              mensajes.map(msg => {
                const esPrivado = msg.destinatarioId !== null;
                const esMio = msg.autorId === miUsuarioId;
                const clase = [
                  "chat-msg",
                  esPrivado ? "privado" : "",
                  msg.esSistema ? "sistema" : ""
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div key={msg.id} className={clase}>
                    <div className="chat-msg-meta">
                      {esPrivado ? (
                        <span className="chat-msg-privado-etiqueta">
                          <Lock size={11} aria-hidden="true" />
                          <span>
                            {esMio
                              ? `Susurro a @${msg.destinatarioNombre ?? "jugador"}`
                              : `Susurro de ${msg.autorNombre}`}
                          </span>
                        </span>
                      ) : (
                        <span className="chat-msg-autor">{msg.autorNombre}</span>
                      )}
                      <span className="chat-msg-hora">{formatearHora(msg.createdAt)}</span>
                    </div>
                    <p className="chat-msg-texto">{msg.texto}</p>
                  </div>
                );
              })
            )}
          </div>

          <div className="chat-pie">
            {candidatos.length > 0 && (
              <ul className="chat-menciones" role="listbox" aria-label="Mencionar jugador">
                {candidatos.map((jugador, idx) => (
                  <li key={jugador.userId ?? jugador.id}>
                    <button
                      type="button"
                      className={`chat-mencion-item${idx === indiceActivo ? " activo" : ""}`}
                      onMouseDown={e => {
                        e.preventDefault();
                        seleccionarMencion(jugador);
                      }}
                    >
                      <span
                        className="chat-mencion-color"
                        style={{ backgroundColor: jugador.color }}
                      />
                      <span className="chat-mencion-nombre">{jugador.nombre}</span>
                      {jugador.esMaster && (
                        <span className="chat-mencion-rol">
                          <Crown size={10} aria-hidden="true" />
                          <span>Máster</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {destinatario && (
              <div className="chat-destinatario-chip">
                <Lock size={11} aria-hidden="true" />
                <span>Privado a @{destinatario.nombre}</span>
                <button
                  type="button"
                  onClick={() => setDestinatario(null)}
                  aria-label="Cancelar mensaje privado"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            )}

            <form className="chat-form" onSubmit={manejarEnvio}>
              <input
                ref={inputRef}
                type="text"
                className="chat-input"
                value={texto}
                maxLength={500}
                placeholder={
                  destinatario
                    ? `Susurrar a @${destinatario.nombre}…`
                    : "Mensaje… (@ para privado)"
                }
                onChange={e => {
                  setTexto(e.target.value);
                  setIndiceMencion(0);
                }}
                onKeyDown={manejarTecla}
                aria-label="Mensaje de chat"
              />
              <button
                type="submit"
                className="chat-enviar-btn"
                disabled={enviando || !texto.trim()}
                aria-label="Enviar mensaje"
              >
                <Send size={13} aria-hidden="true" />
              </button>
            </form>
          </div>
          {onIniciarRedimension && (
            <span
              className="chat-tirador"
              onPointerDown={onIniciarRedimension}
              title="Redimensionar chat"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </section>
  );
}
