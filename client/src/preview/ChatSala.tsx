import { Fragment, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { Crown, Lock, MessageSquare, Minus, Plus, Send, X } from "lucide-react";
import type { JugadorPreview, MensajeSala, RectPizarra } from "./tipos";

interface ChatSalaProps {
  rect: RectPizarra;
  jugadores: JugadorPreview[];
  miUsuarioId: string;
  mensajes: MensajeSala[];
  onEnviarMensaje: (texto: string, destinatarioIds: string[] | null) => void | Promise<void>;
  onIniciarArrastre?: (evento: ReactPointerEvent) => void;
  onIniciarRedimension?: (evento: ReactPointerEvent) => void;
  compartirAbierto?: boolean;
  onToggleCompartir?: (ancla?: { left: number; bottom: number }) => void;
}

interface Destinatario {
  id: string;
  nombre: string;
}

type FiltroChat = "todo" | "chat" | "dados" | "urls";

const FILTROS_CHAT: ReadonlyArray<{ id: FiltroChat; etiqueta: string }> = [
  { id: "chat", etiqueta: "Chat" },
  { id: "dados", etiqueta: "Dados" },
  { id: "urls", etiqueta: "Enlaces" },
  { id: "todo", etiqueta: "Todo" }
];

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
  onIniciarRedimension
}: ChatSalaProps) {
  const [plegado, setPlegado] = useState(false);
  const [filtro, setFiltro] = useState<FiltroChat>("chat");
  const [texto, setTexto] = useState("");
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [indiceMencion, setIndiceMencion] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mensajesFiltrados = mensajes.filter(msg => {
    if (filtro === "chat") return !msg.esSistema && !msg.esDivisa;
    if (filtro === "dados") return Boolean(msg.esSistema) && !msg.esDivisa;
    if (filtro === "urls") return /https?:\/\/[^\s]+/i.test(msg.texto);
    return true;
  });

  useEffect(() => {
    if (plegado || !listaRef.current) return;
    listaRef.current.scrollTop = listaRef.current.scrollHeight;
  }, [mensajesFiltrados.length, filtro, plegado]);

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
    setDestinatarios(prev =>
      prev.some(d => d.id === uid) ? prev : [...prev, { id: uid, nombre: jugador.nombre }]
    );
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
      await onEnviarMensaje(
        limpio,
        destinatarios.length > 0 ? destinatarios.map(d => d.id) : null
      );
      setTexto("");
      setDestinatarios([]);
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

    if (evento.key === "Backspace" && texto === "" && destinatarios.length > 0) {
      setDestinatarios(prev => prev.slice(0, -1));
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
        </div>
        <div
          className="chat-filtros"
          role="tablist"
          aria-label="Filtrar mensajes"
          onPointerDown={e => e.stopPropagation()}
        >
          {FILTROS_CHAT.map((item, idx) => (
            <Fragment key={item.id}>
              {idx > 0 && (
                <span className="chat-filtro-sep" aria-hidden="true">
                  |
                </span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={filtro === item.id}
                className={`chat-filtro-btn${filtro === item.id ? " activo" : ""}`}
                onClick={() => setFiltro(item.id)}
              >
                {item.etiqueta}
              </button>
            </Fragment>
          ))}
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
            {mensajesFiltrados.length === 0 ? (
              <p className="chat-vacio">
                {filtro === "dados" ? (
                  "No hay tiradas de dados todavía."
                ) : filtro === "urls" ? (
                  "No hay enlaces compartidos todavía."
                ) : (
                  <>
                    Escribe un mensaje o usa <code>@</code> para susurrar en privado.
                  </>
                )}
              </p>
            ) : (
              mensajesFiltrados.map(msg => {
                const idsPrivados =
                  msg.destinatarioIds && msg.destinatarioIds.length > 0
                    ? msg.destinatarioIds
                    : msg.destinatarioId
                      ? [msg.destinatarioId]
                      : [];
                const nombresPrivados =
                  msg.destinatarioNombres && msg.destinatarioNombres.length > 0
                    ? msg.destinatarioNombres
                    : msg.destinatarioNombre
                      ? [msg.destinatarioNombre]
                      : [];
                const esPrivado = idsPrivados.length > 0;
                const esGrupal = nombresPrivados.length > 1;
                const listaNombres = nombresPrivados.map(n => `@${n}`).join(", ");
                const esMio = msg.autorId === miUsuarioId;
                const clase = [
                  "chat-msg",
                  esPrivado ? "privado" : "",
                  msg.esSistema ? "sistema" : ""
                ]
                  .filter(Boolean)
                  .join(" ");

                const etiquetaPrivado = esGrupal
                  ? esMio
                    ? `Susurro grupal a ${listaNombres}`
                    : `Susurro de ${msg.autorNombre} (para ${listaNombres})`
                  : esMio
                    ? `Susurro a @${nombresPrivados[0] ?? "jugador"}`
                    : `Susurro de ${msg.autorNombre}`;

                return (
                  <div key={msg.id} className={clase}>
                    <div className="chat-msg-meta">
                      {esPrivado ? (
                        <span className="chat-msg-privado-etiqueta">
                          <Lock size={11} aria-hidden="true" />
                          <span>{etiquetaPrivado}</span>
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

            {destinatarios.length > 0 && (
              <div className="chat-susurro-chips" role="group" aria-label="Destinatarios del susurro">
                <span className="chat-susurro-etiqueta">
                  <Lock size={11} aria-hidden="true" />
                  <span>Susurro a:</span>
                </span>
                {destinatarios.map(dest => (
                  <span key={dest.id} className="chat-susurro-chip">
                    <span>@{dest.nombre}</span>
                    <button
                      type="button"
                      className="chat-susurro-chip-quitar"
                      onClick={() =>
                        setDestinatarios(prev => prev.filter(d => d.id !== dest.id))
                      }
                      aria-label={`Quitar a ${dest.nombre}`}
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {destinatarios.length > 1 && (
                  <button
                    type="button"
                    className="chat-susurro-limpiar"
                    onClick={() => setDestinatarios([])}
                    aria-label="Limpiar todos los destinatarios"
                  >
                    Limpiar
                  </button>
                )}
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
                  destinatarios.length > 0
                    ? `Susurrar a ${destinatarios.map(d => `@${d.nombre}`).join(", ")}…`
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
