import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { archivosApi } from "../api/archivos.api";
import type {
  EntradaOfertaIntercambio,
  OfertaArchivoIntercambio,
  OfertaIntercambio,
  OfertaPositIntercambio,
  PublicArchivo,
  SesionIntercambio
} from "../api/types";
import type {
  DivisaConfig,
  ElementoMesa,
  JugadorPreview,
  ObjetoMochila
} from "./tipos";

export interface IntercambioModalProps {
  sesion: SesionIntercambio;
  miUsuarioId: string;
  jugadores: JugadorPreview[];
  divisasConfig: DivisaConfig[];
  divisasSaldos: Record<string, number>;
  mochila: ObjetoMochila[];
  archivosDisponibles: PublicArchivo[];
  positsDisponibles: Array<Extract<ElementoMesa, { tipo: "posit" }>>;
  retratosPorJugador?: Record<string, string | null>;
  onActualizarOferta: (oferta: EntradaOfertaIntercambio) => void | Promise<void>;
  onMarcarListo: (listo: boolean) => void | Promise<void>;
  onCancelar: () => void | Promise<void>;
}

const OFERTA_VACIA: OfertaIntercambio = {
  monedas: {},
  objetos: [],
  archivos: [],
  posits: []
};

export function IntercambioModal({
  sesion,
  miUsuarioId,
  jugadores,
  divisasConfig,
  divisasSaldos,
  mochila,
  archivosDisponibles,
  positsDisponibles,
  retratosPorJugador,
  onActualizarOferta,
  onMarcarListo,
  onCancelar
}: IntercambioModalProps) {
  const otroUsuarioId =
    sesion.participantes.find(id => id !== miUsuarioId) ?? sesion.participantes[0];
  const otroJugador = jugadores.find(
    j => (j.userId ?? j.usuarioId ?? j.id) === otroUsuarioId
  );
  const otroNombre =
    sesion.nombres[otroUsuarioId] ?? otroJugador?.nombre ?? "Jugador";
  const otroColor = otroJugador?.color ?? "#8fb8ff";
  const otroRetratoId =
    otroJugador?.retratoArchivoId ?? retratosPorJugador?.[otroUsuarioId] ?? null;

  const miOfertaServidor = sesion.ofertas[miUsuarioId] ?? OFERTA_VACIA;
  const suOferta = sesion.ofertas[otroUsuarioId] ?? OFERTA_VACIA;
  const tuListo = Boolean(sesion.listos[miUsuarioId]);
  const suListo = Boolean(sesion.listos[otroUsuarioId]);

  const [monedasDraft, setMonedasDraft] = useState<Record<string, number>>(
    () => ({ ...miOfertaServidor.monedas })
  );
  const [objetosDraft, setObjetosDraft] = useState<Record<string, number>>(() => {
    const mapa: Record<string, number> = {};
    for (const o of miOfertaServidor.objetos) {
      mapa[o.objetoId] = o.cantidad;
    }
    return mapa;
  });
  const [archivosDraft, setArchivosDraft] = useState<OfertaArchivoIntercambio[]>(
    () => [...miOfertaServidor.archivos]
  );
  const [positsDraft, setPositsDraft] = useState<OfertaPositIntercambio[]>(
    () => [...miOfertaServidor.posits]
  );

  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setMonedasDraft({ ...miOfertaServidor.monedas });
    const mapaObj: Record<string, number> = {};
    for (const o of miOfertaServidor.objetos) {
      mapaObj[o.objetoId] = o.cantidad;
    }
    setObjetosDraft(mapaObj);
    setArchivosDraft([...miOfertaServidor.archivos]);
    setPositsDraft([...miOfertaServidor.posits]);
  }, [sesion.updatedAt, miOfertaServidor]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function construirPayload(
    monedas: Record<string, number>,
    objetos: Record<string, number>,
    archivos: OfertaArchivoIntercambio[],
    posits: OfertaPositIntercambio[]
  ): EntradaOfertaIntercambio {
    const monedasLimpias: Record<string, number> = {};
    for (const [k, v] of Object.entries(monedas)) {
      const n = Math.max(0, Math.trunc(v || 0));
      if (n > 0) monedasLimpias[k] = n;
    }
    const objetosLimpios = Object.entries(objetos)
      .map(([objetoId, cant]) => ({ objetoId, cantidad: Math.max(0, Math.trunc(cant || 0)) }))
      .filter(o => o.cantidad > 0);
    return {
      monedas: monedasLimpias,
      objetos: objetosLimpios,
      archivos,
      posits
    };
  }

  function emitirOferta(
    monedas: Record<string, number>,
    objetos: Record<string, number>,
    archivos: OfertaArchivoIntercambio[],
    posits: OfertaPositIntercambio[],
    inmediato: boolean
  ): void {
    const payload = construirPayload(monedas, objetos, archivos, posits);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inmediato) {
      void onActualizarOferta(payload);
    } else {
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void onActualizarOferta(payload);
      }, 220);
    }
  }

  function cambiarMoneda(divisaId: string, valor: number, maxSaldo: number): void {
    const clamped = Math.max(0, Math.min(maxSaldo, Math.trunc(Number.isFinite(valor) ? valor : 0)));
    const siguiente = { ...monedasDraft, [divisaId]: clamped };
    setMonedasDraft(siguiente);
    emitirOferta(siguiente, objetosDraft, archivosDraft, positsDraft, false);
  }

  function cambiarObjeto(objetoId: string, cantidad: number, maxCant: number): void {
    const clamped = Math.max(0, Math.min(maxCant, Math.trunc(Number.isFinite(cantidad) ? cantidad : 0)));
    const siguiente = { ...objetosDraft, [objetoId]: clamped };
    setObjetosDraft(siguiente);
    emitirOferta(monedasDraft, siguiente, archivosDraft, positsDraft, false);
  }

  function alternarArchivo(archivo: PublicArchivo): void {
    const existe = archivosDraft.some(a => a.archivoId === archivo.id);
    const siguiente = existe
      ? archivosDraft.filter(a => a.archivoId !== archivo.id)
      : [...archivosDraft, { archivoId: archivo.id, nombre: archivo.nombre, tipoMime: archivo.tipo }];
    setArchivosDraft(siguiente);
    emitirOferta(monedasDraft, objetosDraft, siguiente, positsDraft, true);
  }

  function alternarPosit(posit: Extract<ElementoMesa, { tipo: "posit" }>): void {
    const existe = positsDraft.some(p => p.positId === posit.id);
    const siguiente = existe
      ? positsDraft.filter(p => p.positId !== posit.id)
      : [
          ...positsDraft,
          {
            positId: posit.id,
            titulo: posit.texto.trim().slice(0, 40) || "Nota",
            contenido: posit.texto,
            color: posit.color
          }
        ];
    setPositsDraft(siguiente);
    emitirOferta(monedasDraft, objetosDraft, archivosDraft, siguiente, true);
  }

  const suMonedasLista = useMemo(
    () =>
      Object.entries(suOferta.monedas).filter(([, v]) => Number(v) > 0),
    [suOferta.monedas]
  );

  const suOfertaVacia =
    suMonedasLista.length === 0 &&
    suOferta.objetos.length === 0 &&
    suOferta.archivos.length === 0 &&
    suOferta.posits.length === 0;

  return (
    <div
      className="intercambio-modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-label={`Intercambio con ${otroNombre}`}
    >
      <div className="intercambio-modal">
        <header className="intercambio-cabecera">
          <div className="intercambio-otro-info">
            {otroRetratoId ? (
              <img
                className="intercambio-retrato"
                src={archivosApi.url(otroRetratoId)}
                alt={otroNombre}
                style={{ "--color": otroColor } as CSSProperties}
              />
            ) : (
              <span
                className="intercambio-retrato-fallback"
                style={{ "--color": otroColor } as CSSProperties}
                aria-hidden="true"
              />
            )}
            <div className="intercambio-titulo-bloque">
              <h2 className="intercambio-titulo">
                <ArrowLeftRight size={16} aria-hidden="true" />
                <span>Intercambio con {otroNombre}</span>
              </h2>
              <p className="intercambio-subtitulo">
                Editar la oferta reinicia la confirmación de ambos jugadores.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="dados-cerrar"
            onClick={() => void onCancelar()}
            aria-label="Cancelar y cerrar intercambio"
          >
            <X size={15} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </header>

        <div className="intercambio-columnas">
          <section className="intercambio-columna intercambio-tu-oferta">
            <div className="intercambio-col-cabecera">
              <h3>Tu oferta</h3>
              <span className={`intercambio-estado-badge${tuListo ? " listo" : ""}`}>
                {tuListo ? "Listo" : "Editando"}
              </span>
            </div>

            <div className="intercambio-bloque">
              <h4 className="intercambio-bloque-titulo">Divisas</h4>
              {divisasConfig.map(d => {
                const saldo = Math.max(0, Math.trunc(divisasSaldos[d.id] ?? 0));
                const ofrecido = monedasDraft[d.id] ?? 0;
                return (
                  <label key={d.id} className="intercambio-fila-divisa">
                    <span className="intercambio-divisa-etiqueta">
                      <span
                        className="intercambio-divisa-punto"
                        style={{ backgroundColor: d.color }}
                      />
                      <span>{d.nombre}</span>
                      <small className="intercambio-saldo">({saldo} disp.)</small>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={saldo}
                      value={ofrecido}
                      disabled={saldo <= 0}
                      onChange={e => cambiarMoneda(d.id, Number(e.target.value), saldo)}
                    />
                  </label>
                );
              })}
            </div>

            <div className="intercambio-bloque">
              <h4 className="intercambio-bloque-titulo">Mochila</h4>
              {mochila.length === 0 ? (
                <p className="intercambio-vacio">Tu mochila está vacía.</p>
              ) : (
                <div className="intercambio-lista">
                  {mochila.map(obj => {
                    const cant = objetosDraft[obj.id] ?? 0;
                    return (
                      <div key={obj.id} className="intercambio-item-fila">
                        <span className="intercambio-item-nombre">
                          <span>{obj.emoji ?? "🎒"}</span>
                          <span>{obj.nombre}</span>
                          <small className="intercambio-saldo">(x{obj.cantidad})</small>
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={obj.cantidad}
                          value={cant}
                          aria-label={`Cantidad de ${obj.nombre} a ofrecer`}
                          onChange={e =>
                            cambiarObjeto(obj.id, Number(e.target.value), obj.cantidad)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="intercambio-bloque">
              <h4 className="intercambio-bloque-titulo">Archivos</h4>
              {archivosDisponibles.length === 0 ? (
                <p className="intercambio-vacio">Sin archivos disponibles.</p>
              ) : (
                <div className="intercambio-lista">
                  {archivosDisponibles.map(arch => {
                    const marcado = archivosDraft.some(a => a.archivoId === arch.id);
                    return (
                      <label key={arch.id} className="intercambio-check-fila">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternarArchivo(arch)}
                        />
                        <span className="intercambio-item-nombre">{arch.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="intercambio-bloque">
              <h4 className="intercambio-bloque-titulo">Posits</h4>
              {positsDisponibles.length === 0 ? (
                <p className="intercambio-vacio">Sin posits en tu mesa.</p>
              ) : (
                <div className="intercambio-lista">
                  {positsDisponibles.map(posit => {
                    const marcado = positsDraft.some(p => p.positId === posit.id);
                    return (
                      <label key={posit.id} className="intercambio-check-fila">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternarPosit(posit)}
                        />
                        <span
                          className="intercambio-posit-chip"
                          style={{ borderLeftColor: posit.color }}
                        >
                          {posit.texto.trim().slice(0, 48) || "(Posit vacío)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="intercambio-columna intercambio-su-oferta">
            <div className="intercambio-col-cabecera">
              <h3>Oferta de {otroNombre}</h3>
              <span className={`intercambio-estado-badge${suListo ? " listo" : ""}`}>
                {suListo ? "Listo" : "Pendiente"}
              </span>
            </div>

            {suOfertaVacia ? (
              <p className="intercambio-vacio">
                {otroNombre} aún no ha añadido nada a su oferta.
              </p>
            ) : (
              <>
                {suMonedasLista.length > 0 && (
                  <div className="intercambio-bloque">
                    <h4 className="intercambio-bloque-titulo">Divisas</h4>
                    <div className="intercambio-lista">
                      {suMonedasLista.map(([divisaId, cant]) => {
                        const cfg = divisasConfig.find(d => d.id === divisaId);
                        return (
                          <div key={divisaId} className="intercambio-item-lectura">
                            <span
                              className="intercambio-divisa-punto"
                              style={{ backgroundColor: cfg?.color ?? "#e8c56a" }}
                            />
                            <span>
                              {cant} {cfg?.nombre ?? divisaId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {suOferta.objetos.length > 0 && (
                  <div className="intercambio-bloque">
                    <h4 className="intercambio-bloque-titulo">Objetos</h4>
                    <div className="intercambio-lista">
                      {suOferta.objetos.map(obj => (
                        <div key={obj.objetoId} className="intercambio-item-lectura">
                          <span>{obj.emoji ?? "🎒"}</span>
                          <span>
                            {obj.nombre ?? "Objeto"} × {obj.cantidad}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {suOferta.archivos.length > 0 && (
                  <div className="intercambio-bloque">
                    <h4 className="intercambio-bloque-titulo">Archivos</h4>
                    <div className="intercambio-lista">
                      {suOferta.archivos.map(arch => (
                        <div key={arch.archivoId} className="intercambio-item-lectura">
                          <span>📄 {arch.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {suOferta.posits.length > 0 && (
                  <div className="intercambio-bloque">
                    <h4 className="intercambio-bloque-titulo">Posits</h4>
                    <div className="intercambio-lista">
                      {suOferta.posits.map(posit => (
                        <div
                          key={posit.positId}
                          className="intercambio-posit-chip"
                          style={{ borderLeftColor: posit.color ?? "#f7ffae" }}
                        >
                          {posit.contenido || posit.titulo || "Nota"}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="intercambio-footer">
          <button
            type="button"
            className="intercambio-btn-cancelar"
            onClick={() => void onCancelar()}
          >
            Cancelar intercambio
          </button>
          <button
            type="button"
            className={`intercambio-btn-listo${tuListo ? " activo" : ""}`}
            onClick={() => void onMarcarListo(!tuListo)}
          >
            <Check size={15} aria-hidden="true" />
            <span>
              {tuListo
                ? "Listo (pulsa para editar)"
                : suListo
                  ? "Confirmar trueque"
                  : "Marcar Listo"}
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
}
