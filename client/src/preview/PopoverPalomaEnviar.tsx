import { useEffect, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { nuevoIdElemento } from "./compartir";
import { IconoPaloma } from "./inventario";
import type {
  DivisaConfig,
  ElementoMesa,
  JugadorPreview,
  ObjetoMochila
} from "./tipos";

type TabPaloma = "carta" | "mochila" | "mesa";

export interface PopoverPalomaEnviarProps {
  esMaster: boolean;
  hostName?: string;
  destinatarios: JugadorPreview[];
  destinoId: string | null;
  onCambiarDestinoId: (id: string) => void;
  mochila: ObjetoMochila[];
  elementosEnviables: ElementoMesa[];
  divisasLista: DivisaConfig[];
  saldoDeDivisa: (divisaId: string) => number;
  onEnviarChat?: (texto: string, destinatarioId: string | null) => void | Promise<void>;
  onEnviarObjetoMochila?: (
    destino: JugadorPreview,
    objeto: ObjetoMochila,
    cantidad: number
  ) => void | Promise<void>;
  onEnviarElemento?: (
    destino: JugadorPreview,
    elemento: ElementoMesa
  ) => void | Promise<void>;
  onTransferirDivisa?: (
    destino: JugadorPreview,
    divisaId: string,
    cantidad: number
  ) => void | Promise<boolean | void>;
  onMostrarAviso: (mensaje: string) => void;
  onCerrar: () => void;
  className?: string;
  style?: CSSProperties;
}

export function PopoverPalomaEnviar({
  esMaster,
  hostName,
  destinatarios,
  destinoId,
  onCambiarDestinoId,
  mochila,
  elementosEnviables,
  divisasLista,
  saldoDeDivisa,
  onEnviarChat,
  onEnviarObjetoMochila,
  onEnviarElemento,
  onTransferirDivisa,
  onMostrarAviso,
  onCerrar,
  className,
  style
}: PopoverPalomaEnviarProps) {
  const [tab, setTab] = useState<TabPaloma>(esMaster ? "mesa" : "carta");
  const [mensajeCarta, setMensajeCarta] = useState("");
  const [cantidadesMochila, setCantidadesMochila] = useState<Record<string, number>>({});
  const [divisaSelId, setDivisaSelId] = useState<string>(
    divisasLista[0]?.id ?? "principal"
  );
  const [cantidadMonedas, setCantidadMonedas] = useState<number>(1);
  const [enviandoMonedas, setEnviandoMonedas] = useState(false);

  useEffect(() => {
    if (divisasLista.length > 0 && !divisasLista.some(d => d.id === divisaSelId)) {
      setDivisaSelId(divisasLista[0].id);
    }
  }, [divisasLista, divisaSelId]);

  const destinoActivo =
    destinatarios.find(j => j.id === (destinoId ?? destinatarios[0]?.id)) ??
    destinatarios[0] ??
    null;

  const masterDestino = !esMaster
    ? destinatarios.find(
        j =>
          j.id === "master" ||
          (hostName ? j.nombre.trim().toLowerCase() === hostName.trim().toLowerCase() : false)
      ) ?? null
    : null;

  const elementosFiltrados = esMaster
    ? elementosEnviables
    : elementosEnviables.filter(el => el.tipo !== "macro");

  const saldoActual = saldoDeDivisa(divisaSelId);
  const divisaActualMeta =
    divisasLista.find(d => d.id === divisaSelId) ?? divisasLista[0];

  function etiquetaJugador(j: JugadorPreview): string {
    return j.apodo?.trim() ? j.apodo.trim() : j.nombre;
  }

  function obtenerCantidadItem(item: ObjetoMochila): number {
    const raw = cantidadesMochila[item.id] ?? 1;
    return Math.max(1, Math.min(item.cantidad, raw));
  }

  function ajustarCantidadItem(item: ObjetoMochila, siguiente: number): void {
    const acotado = Math.max(1, Math.min(item.cantidad, Math.trunc(siguiente) || 1));
    setCantidadesMochila(prev => ({ ...prev, [item.id]: acotado }));
  }

  async function manejarEnviarSusurro(): Promise<void> {
    if (!destinoActivo) return;
    const limpio = mensajeCarta.trim();
    if (!limpio) return;
    const receptorChatId = destinoActivo.usuarioId ?? destinoActivo.id;
    if (onEnviarChat) {
      await onEnviarChat(limpio, receptorChatId);
    }
    onMostrarAviso(`Carta enviada en privado a ${etiquetaJugador(destinoActivo)}.`);
    setMensajeCarta("");
    onCerrar();
  }

  async function manejarEnviarComoPosit(): Promise<void> {
    if (!destinoActivo) return;
    const limpio = mensajeCarta.trim();
    if (!limpio) return;
    const positNuevo: ElementoMesa = {
      id: nuevoIdElemento(),
      tipo: "posit",
      texto: limpio,
      color: "#fff3a6",
      giro: -2,
      x: 50,
      y: 50
    };
    if (onEnviarElemento) {
      await onEnviarElemento(destinoActivo, positNuevo);
    } else {
      onMostrarAviso(`Nota enviada a ${etiquetaJugador(destinoActivo)}.`);
    }
    setMensajeCarta("");
    onCerrar();
  }

  async function manejarEnviarObjeto(item: ObjetoMochila): Promise<void> {
    if (!destinoActivo) return;
    const cant = obtenerCantidadItem(item);
    if (onEnviarObjetoMochila) {
      await onEnviarObjetoMochila(destinoActivo, item, cant);
    } else {
      onMostrarAviso(`${item.nombre} (x${cant}) enviado a ${etiquetaJugador(destinoActivo)}.`);
    }
    onCerrar();
  }

  async function manejarEnviarMonedas(): Promise<void> {
    if (!destinoActivo || enviandoMonedas) return;
    const cant = Math.max(1, Math.min(saldoActual, Math.trunc(cantidadMonedas) || 0));
    if (cant <= 0 || saldoActual <= 0) return;
    setEnviandoMonedas(true);
    try {
      if (onTransferirDivisa) {
        const ok = await onTransferirDivisa(destinoActivo, divisaSelId, cant);
        if (ok !== false) {
          onCerrar();
        }
      } else {
        onMostrarAviso(
          `${cant} ${divisaActualMeta?.nombre ?? "monedas"} enviadas a ${etiquetaJugador(destinoActivo)}.`
        );
        onCerrar();
      }
    } finally {
      setEnviandoMonedas(false);
    }
  }

  return (
    <div
      className={className ?? "divisa-popover hud-enviar-popover"}
      role="dialog"
      aria-label="Paloma mensajera"
      style={style}
    >
      <div className="dados-selector-cabecera">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconoPaloma size={16} />
          <span>Paloma mensajera</span>
        </span>
        <button
          type="button"
          className="dados-cerrar"
          onClick={onCerrar}
          aria-label="Cerrar panel de envío"
        >
          <X size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {destinatarios.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          No hay otros jugadores activos en la mesa.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.78, fontWeight: 700 }}>
                1. Destinatario
              </span>
              {masterDestino && (
                <button
                  type="button"
                  className={`mochila-destino-chip${
                    destinoActivo?.id === masterDestino.id ? " activo" : ""
                  }`}
                  onClick={() => onCambiarDestinoId(masterDestino.id)}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderColor: "#e8c56a",
                    color: "#f8e2a0"
                  }}
                >
                  👑 Al Máster
                </button>
              )}
            </div>
            <div
              className="mochila-destinos"
              style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
            >
              {destinatarios.map(j => {
                const seleccionado = destinoActivo?.id === j.id;
                return (
                  <button
                    key={j.id}
                    type="button"
                    className={`mochila-destino-chip${seleccionado ? " activo" : ""}`}
                    onClick={() => onCambiarDestinoId(j.id)}
                    style={{
                      borderColor: seleccionado ? j.color : undefined,
                      boxShadow: seleccionado ? `0 0 0 1px ${j.color}` : undefined
                    }}
                  >
                    {etiquetaJugador(j)}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Tipo de envío"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 4
            }}
          >
            {(
              [
                { id: "carta", label: "✉️ Carta" },
                { id: "mochila", label: "🎒 Mochila" },
                { id: "mesa", label: "📄 Mesa" }
              ] as const
            ).map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`mochila-destino-chip${tab === t.id ? " activo" : ""}`}
                onClick={() => setTab(t.id)}
                style={{
                  justifyContent: "center",
                  padding: "5px 6px",
                  fontSize: 11,
                  fontWeight: 700
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "carta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                className="paloma-textarea"
                value={mensajeCarta}
                onChange={e => setMensajeCarta(e.target.value)}
                placeholder={`Escribe un mensaje privado para ${
                  destinoActivo ? etiquetaJugador(destinoActivo) : "el destinatario"
                }...`}
                rows={3}
                maxLength={600}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="macro-lanzar-btn"
                  disabled={!mensajeCarta.trim()}
                  onClick={() => void manejarEnviarSusurro()}
                  style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
                >
                  ✉️ Enviar susurro
                </button>
                <button
                  type="button"
                  className="macro-lanzar-btn"
                  disabled={!mensajeCarta.trim()}
                  onClick={() => void manejarEnviarComoPosit()}
                  style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
                  title="Envía el texto como nota adhesiva (posit) privada"
                >
                  📝 Como nota
                </button>
              </div>
            </div>
          )}

          {tab === "mochila" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="paloma-monedas-caja">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  <span>🪙 Enviar monedas</span>
                  <span style={{ opacity: 0.78 }}>
                    Saldo: {saldoActual} {divisaActualMeta?.nombre ?? ""}
                  </span>
                </div>

                {divisasLista.length > 1 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {divisasLista.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        className={`mochila-destino-chip${
                          divisaSelId === d.id ? " activo" : ""
                        }`}
                        onClick={() => setDivisaSelId(d.id)}
                        style={{
                          fontSize: 11,
                          padding: "2px 7px",
                          borderColor: divisaSelId === d.id ? d.color : undefined
                        }}
                      >
                        {d.nombre} ({saldoDeDivisa(d.id)})
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    className="paloma-monedas-input"
                    type="number"
                    min={1}
                    max={Math.max(1, saldoActual)}
                    value={cantidadMonedas}
                    onChange={e =>
                      setCantidadMonedas(Math.max(1, Math.trunc(Number(e.target.value)) || 1))
                    }
                  />
                  {[1, 5, 10].map(step => (
                    <button
                      key={step}
                      type="button"
                      className="mochila-destino-chip"
                      onClick={() =>
                        setCantidadMonedas(c =>
                          Math.min(Math.max(1, saldoActual), Math.max(1, c + step))
                        )
                      }
                      style={{ fontSize: 11, padding: "3px 6px" }}
                    >
                      +{step}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="macro-lanzar-btn"
                    disabled={saldoActual <= 0 || cantidadMonedas <= 0 || enviandoMonedas}
                    onClick={() => void manejarEnviarMonedas()}
                    style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px" }}
                  >
                    {enviandoMonedas ? "..." : "Enviar"}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, opacity: 0.78, fontWeight: 700 }}>
                  🎒 Objetos en mochila
                </span>
                {mochila.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    Tu mochila está vacía.
                  </p>
                ) : (
                  mochila.map(item => {
                    const cant = obtenerCantidadItem(item);
                    return (
                      <div
                        key={`mochila-${item.id}`}
                        className="paloma-item-fila"
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                            overflow: "hidden"
                          }}
                        >
                          <span>{item.emoji ?? "🎒"}</span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {item.nombre}
                          </span>
                          <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0 }}>
                            (x{item.cantidad})
                          </span>
                        </span>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            flexShrink: 0
                          }}
                        >
                          {item.cantidad > 1 && (
                            <>
                              <button
                                type="button"
                                className="mochila-destino-chip"
                                onClick={() => ajustarCantidadItem(item, cant - 1)}
                                style={{ padding: "1px 6px", fontSize: 11 }}
                                aria-label="Menos cantidad"
                              >
                                -
                              </button>
                              <span
                                style={{
                                  minWidth: 18,
                                  textAlign: "center",
                                  fontSize: 11,
                                  fontWeight: 700
                                }}
                              >
                                {cant}
                              </span>
                              <button
                                type="button"
                                className="mochila-destino-chip"
                                onClick={() => ajustarCantidadItem(item, cant + 1)}
                                style={{ padding: "1px 6px", fontSize: 11 }}
                                aria-label="Más cantidad"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="mochila-destino-chip"
                                onClick={() => ajustarCantidadItem(item, item.cantidad)}
                                style={{ padding: "1px 5px", fontSize: 10 }}
                                title="Seleccionar todo"
                              >
                                Todo
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="macro-lanzar-btn"
                            onClick={() => void manejarEnviarObjeto(item)}
                            style={{ fontSize: 11, padding: "4px 8px" }}
                          >
                            Enviar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === "mesa" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {elementosFiltrados.length === 0 ? (
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  No tienes notas ni documentos en la mesa para enviar.
                </p>
              ) : (
                elementosFiltrados.map(elem => {
                  const etiqueta =
                    elem.tipo === "posit"
                      ? elem.texto.trim() || "Posit sin texto"
                      : elem.nombre;
                  const icono =
                    elem.tipo === "posit"
                      ? "📝"
                      : elem.tipo === "archivo"
                        ? "📄"
                        : elem.tipo === "objeto"
                          ? elem.emoji ?? "🎒"
                          : "◆";
                  const sub =
                    elem.tipo === "posit"
                      ? "Posit"
                      : elem.tipo === "archivo"
                        ? "Doc"
                        : elem.tipo === "objeto"
                          ? `Objeto x${elem.cantidad}`
                          : "Macro";
                  return (
                    <button
                      key={`elem-${elem.id}`}
                      type="button"
                      className="macro-lanzar-btn"
                      style={{ width: "100%", justifyContent: "space-between" }}
                      onClick={() => {
                        if (!destinoActivo) return;
                        if (onEnviarElemento) {
                          void onEnviarElemento(destinoActivo, elem);
                        } else {
                          onMostrarAviso(
                            `Enviado (${etiqueta}) a ${etiquetaJugador(destinoActivo)}.`
                          );
                        }
                        onCerrar();
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        <span>{icono}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          {etiqueta}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.75, flexShrink: 0 }}>
                        {sub}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
