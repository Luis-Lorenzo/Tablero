import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";
import { ArrowLeft, FileText, Plus, Upload, User, X } from "lucide-react";
import { archivosApi } from "../api/archivos.api";
import type { PersonajeJugadorMesa, PublicArchivo } from "../api/types";
import { describeError } from "../presentation/errorMessages";
import { VisorArchivo } from "../presentation/components/VisorArchivo";
import type { ArchivoParaVisor } from "../presentation/components/VisorArchivo";
import { DocumentoVisorModal } from "./Archivador";
import { RecorteRetratoModal } from "./RecorteRetratoModal";
import { infoFormatoArchivo } from "./calibracion";

export type ActualizacionPersonaje = {
  retratoArchivoId?: string | null;
  fichaArchivoId?: string | null;
  fichaNombre?: string | null;
  pdfs?: { archivoId: string; nombre: string }[];
  notas?: string;
};

export interface PersonajePanelProps {
  mesaId?: string;
  onVolver: () => void;
  personaje?: PersonajeJugadorMesa | null;
  onActualizarPersonaje?: (
    datos: ActualizacionPersonaje
  ) => Promise<void> | void;
  apodoActual?: string;
  onActualizarApodo?: (apodo: string) => Promise<void> | void;
  colorJugador?: string;
  nombreJugador?: string;
  archivosDisponibles?: PublicArchivo[];
  onArchivosCambio?: (archivos: PublicArchivo[]) => void;
}

const ACEPTADOS =
  ".pdf,image/png,image/jpeg,image/gif,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,.md,.json,.csv,text/markdown,application/json,text/csv";
const ACEPTADOS_IMAGEN = "image/png,image/jpeg,image/gif,image/webp";

const PERSONAJE_VACIO: PersonajeJugadorMesa = {
  retratoArchivoId: null,
  fichaArchivoId: null,
  fichaNombre: null,
  pdfs: [],
  notas: ""
};

function inferirVistaPorNombre(nombre: string): string {
  const lower = nombre.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return "imagen";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "doc";
  return "texto";
}

export function PersonajePanel({
  mesaId,
  onVolver,
  personaje,
  onActualizarPersonaje,
  apodoActual = "",
  onActualizarApodo,
  colorJugador,
  nombreJugador,
  archivosDisponibles,
  onArchivosCambio
}: PersonajePanelProps) {
  const [archivos, setArchivos] = useState<PublicArchivo[]>(
    archivosDisponibles ?? []
  );
  const [subiendo, setSubiendo] = useState(false);
  const [guardandoPj, setGuardandoPj] = useState(false);
  const [guardandoApodo, setGuardandoApodo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visor, setVisor] = useState<
    | PublicArchivo
    | { id: string; nombre: string; tipo?: string; vista: string; url?: string }
    | null
  >(null);

  const [pjLocal, setPjLocal] = useState<PersonajeJugadorMesa>(
    personaje ?? PERSONAJE_VACIO
  );
  const [notasLocal, setNotasLocal] = useState(personaje?.notas ?? "");
  const [apodoLocal, setApodoLocal] = useState(apodoActual);
  const [archivoParaRecortar, setArchivoParaRecortar] = useState<File | null>(
    null
  );
  const [retratoLocalUrl, setRetratoLocalUrl] = useState<string | null>(null);

  const selectorRetrato = useRef<HTMLInputElement>(null);
  const selectorFicha = useRef<HTMLInputElement>(null);
  const selectorPdfExtra = useRef<HTMLInputElement>(null);
  const onArchivosCambioRef = useRef(onArchivosCambio);
  onArchivosCambioRef.current = onArchivosCambio;

  useEffect(() => {
    if (personaje !== undefined) {
      const siguiente = personaje ?? PERSONAJE_VACIO;
      setPjLocal(siguiente);
      setNotasLocal(siguiente.notas ?? "");
    }
  }, [personaje]);

  useEffect(() => {
    setApodoLocal(apodoActual);
  }, [apodoActual]);

  useEffect(() => {
    if (archivosDisponibles !== undefined) {
      setArchivos(archivosDisponibles);
    }
  }, [archivosDisponibles]);

  useEffect(() => {
    if (archivosDisponibles !== undefined) return;
    let activo = true;
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    archivosApi
      .listar(mesaId)
      .then(lista => {
        if (!activo) return;
        setArchivos(lista);
        onArchivosCambioRef.current?.(lista);
      })
      .catch(fallo => {
        if (!activo || esPreview) return;
        setError(describeError(fallo));
      });

    return () => {
      activo = false;
    };
  }, [mesaId, archivosDisponibles]);

  useEffect(() => {
    return () => {
      if (retratoLocalUrl) {
        URL.revokeObjectURL(retratoLocalUrl);
      }
    };
  }, [retratoLocalUrl]);

  const refrescarArchivos = useCallback(async () => {
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";
    try {
      const lista = await archivosApi.listar(mesaId);
      setArchivos(lista);
      onArchivosCambioRef.current?.(lista);
    } catch (fallo) {
      if (!esPreview) {
        setError(describeError(fallo));
      }
    }
  }, [mesaId]);

  async function guardarPersonaje(datos: ActualizacionPersonaje): Promise<void> {
    setPjLocal(prev => ({
      ...prev,
      ...datos,
      pdfs: datos.pdfs ?? prev.pdfs,
      notas: datos.notas ?? prev.notas
    }));
    if (!onActualizarPersonaje) return;
    setGuardandoPj(true);
    setError(null);
    try {
      await onActualizarPersonaje(datos);
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setGuardandoPj(false);
    }
  }

  async function guardarApodoSiCambio(): Promise<void> {
    if (!onActualizarApodo) return;
    const limpio = apodoLocal.trim().slice(0, 24);
    const anterior = apodoActual.trim().slice(0, 24);
    if (limpio === anterior) return;
    setGuardandoApodo(true);
    setError(null);
    try {
      await onActualizarApodo(limpio);
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setGuardandoApodo(false);
    }
  }

  function alEnviarApodo(evento: FormEvent): void {
    evento.preventDefault();
    void guardarApodoSiCambio();
  }

  function abrirArchivoPj(archivoId: string, nombreFallback?: string | null): void {
    const encontrado = archivos.find(a => a.id === archivoId);
    if (encontrado) {
      setVisor(encontrado);
      return;
    }
    const nombre = nombreFallback ?? "Documento";
    setVisor({
      id: archivoId,
      nombre,
      vista: inferirVistaPorNombre(nombre)
    });
  }

  function alElegirRetrato(evento: ChangeEvent<HTMLInputElement>): void {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    setArchivoParaRecortar(archivo);
  }

  async function alConfirmarRecorteRetrato(
    archivoRecortado: File
  ): Promise<void> {
    setArchivoParaRecortar(null);
    setSubiendo(true);
    setError(null);
    const esPreview =
      new URLSearchParams(window.location.search).get("preview") === "1";

    try {
      const subido = await archivosApi.subir(archivoRecortado, mesaId);
      setRetratoLocalUrl(null);
      await refrescarArchivos();
      await guardarPersonaje({ retratoArchivoId: subido.id });
    } catch (fallo) {
      if (esPreview) {
        const localUrl = URL.createObjectURL(archivoRecortado);
        setRetratoLocalUrl(localUrl);
        await guardarPersonaje({ retratoArchivoId: null });
      } else {
        setError(describeError(fallo));
      }
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarRetrato(): Promise<void> {
    setRetratoLocalUrl(null);
    await guardarPersonaje({ retratoArchivoId: null });
  }

  async function alSubirFichaPrincipal(
    evento: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    try {
      const subido = await archivosApi.subir(archivo, mesaId);
      await refrescarArchivos();
      await guardarPersonaje({
        fichaArchivoId: subido.id,
        fichaNombre: subido.nombre
      });
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  async function alSeleccionarFicha(archivoId: string): Promise<void> {
    if (!archivoId) {
      await guardarPersonaje({ fichaArchivoId: null, fichaNombre: null });
      return;
    }
    const elegido = archivos.find(a => a.id === archivoId);
    await guardarPersonaje({
      fichaArchivoId: archivoId,
      fichaNombre: elegido?.nombre ?? "Ficha de personaje"
    });
  }

  async function alAgregarPdfExtra(archivoId: string): Promise<void> {
    if (!archivoId) return;
    if (pjLocal.pdfs.some(p => p.archivoId === archivoId)) return;
    const elegido = archivos.find(a => a.id === archivoId);
    const siguientes = [
      ...pjLocal.pdfs,
      { archivoId, nombre: elegido?.nombre ?? "Documento.pdf" }
    ];
    await guardarPersonaje({ pdfs: siguientes });
  }

  async function alSubirPdfExtra(
    evento: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    try {
      const subido = await archivosApi.subir(archivo, mesaId);
      await refrescarArchivos();
      const siguientes = [
        ...pjLocal.pdfs,
        { archivoId: subido.id, nombre: subido.nombre }
      ];
      await guardarPersonaje({ pdfs: siguientes });
    } catch (fallo) {
      setError(describeError(fallo));
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarPdfExtra(archivoId: string): Promise<void> {
    const siguientes = pjLocal.pdfs.filter(p => p.archivoId !== archivoId);
    await guardarPersonaje({ pdfs: siguientes });
  }

  async function guardarNotasSiCambiaron(): Promise<void> {
    if (notasLocal === pjLocal.notas) return;
    await guardarPersonaje({ notas: notasLocal });
  }

  const archivoFicha = pjLocal.fichaArchivoId
    ? archivos.find(a => a.id === pjLocal.fichaArchivoId)
    : undefined;
  const vistaFicha =
    archivoFicha?.vista ?? inferirVistaPorNombre(pjLocal.fichaNombre ?? "");
  const formatoFicha = infoFormatoArchivo(vistaFicha);
  const fichaParaVisor: ArchivoParaVisor | null = pjLocal.fichaArchivoId
    ? archivoFicha ?? {
        id: pjLocal.fichaArchivoId,
        nombre: pjLocal.fichaNombre ?? "Ficha de personaje",
        vista: vistaFicha
      }
    : null;
  const pdfsDisponibles = archivos.filter(
    a =>
      a.vista !== "imagen" &&
      !pjLocal.pdfs.some(p => p.archivoId === a.id)
  );
  const retratoSrc =
    retratoLocalUrl ??
    (pjLocal.retratoArchivoId
      ? archivosApi.url(pjLocal.retratoArchivoId)
      : null);
  const apodoModificado =
    apodoLocal.trim().slice(0, 24) !== apodoActual.trim().slice(0, 24);

  return (
    <div className="archivador-page">
      <div className="archivador-fondo" aria-hidden="true" />

      <header className="archivador-barra">
        <button type="button" className="archivador-btn" onClick={onVolver}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver</span>
        </button>

        <h1 className="archivador-titulo">
          {colorJugador && (
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: colorJugador,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.28)"
              }}
            />
          )}
          <span>Personaje (PJ)</span>
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {(guardandoPj || guardandoApodo) && (
            <span className="archivador-pj-estado">Guardando…</span>
          )}
        </div>
      </header>

      <div className="archivador-contenido pj-contenido">
        {error && <p className="archivador-error">{error}</p>}

        <div className="pj-split-layout">
          <section
            className="archivador-seccion archivador-pj-seccion pj-col-izq"
            aria-label="Personaje (PJ)"
          >
          <div className="archivador-seccion-cabecera">
            <h2>{nombreJugador ? `Personaje de ${nombreJugador}` : "Ficha privada de personaje"}</h2>
          </div>

          <form
            onSubmit={alEnviarApodo}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: "8px",
              marginBottom: "14px"
            }}
          >
            <label
              className="archivador-pj-etiqueta"
              style={{ flex: "1 1 220px", margin: 0 }}
            >
              Nombre del personaje (Apodo)
              <input
                type="text"
                className="archivador-pj-select"
                maxLength={24}
                value={apodoLocal}
                placeholder="Nombre de personaje (opcional)…"
                onChange={evento => setApodoLocal(evento.target.value)}
                onBlur={() => void guardarApodoSiCambio()}
                disabled={!onActualizarApodo || guardandoApodo}
                style={{ width: "100%", marginTop: "6px" }}
              />
            </label>
            {onActualizarApodo && (
              <button
                type="submit"
                className="archivador-pj-notas-btn"
                disabled={guardandoApodo || !apodoModificado}
              >
                {guardandoApodo ? "Guardando…" : "Guardar nombre"}
              </button>
            )}
          </form>

          <input
            ref={selectorRetrato}
            type="file"
            accept={ACEPTADOS_IMAGEN}
            className="archivador-input"
            onChange={alElegirRetrato}
          />
          <input
            ref={selectorFicha}
            type="file"
            accept={ACEPTADOS}
            className="archivador-input"
            onChange={alSubirFichaPrincipal}
          />
          <input
            ref={selectorPdfExtra}
            type="file"
            accept=".pdf,application/pdf"
            className="archivador-input"
            onChange={alSubirPdfExtra}
          />

          <div className="archivador-pj-cuerpo">
            <div className="archivador-pj-retrato-bloque">
              <div className="archivador-pj-retrato-marco">
                {retratoSrc ? (
                  <img
                    src={retratoSrc}
                    alt="Retrato del personaje"
                    className="archivador-pj-retrato-img"
                  />
                ) : (
                  <div className="archivador-pj-retrato-vacio">
                    <User size={28} aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="archivador-pj-retrato-acciones">
                <button
                  type="button"
                  className="archivador-pj-retrato-btn"
                  onClick={() => selectorRetrato.current?.click()}
                  disabled={subiendo}
                >
                  <Upload size={12} aria-hidden="true" />
                  <span>{retratoSrc ? "Cambiar retrato" : "Subir retrato"}</span>
                </button>
                {retratoSrc && (
                  <button
                    type="button"
                    className="archivador-pj-retrato-quitar"
                    onClick={() => void quitarRetrato()}
                    title="Quitar retrato"
                    aria-label="Quitar retrato"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div className="archivador-pj-ficha-bloque">
              <span className="archivador-pj-etiqueta">
                Ficha principal (privada)
              </span>

              {pjLocal.fichaArchivoId ? (
                <div className="archivador-pj-ficha-fila">
                  <button
                    type="button"
                    className="archivador-pj-ficha-card"
                    onClick={() =>
                      abrirArchivoPj(
                        pjLocal.fichaArchivoId!,
                        pjLocal.fichaNombre
                      )
                    }
                    title="Abrir ficha de personaje"
                  >
                    <span
                      className={`ficha-doc-hoja mini ${formatoFicha.clase}`}
                      style={{ "--doc-color": formatoFicha.color } as CSSProperties}
                    >
                      {formatoFicha.codigo}
                    </span>
                    <span className="archivador-pj-ficha-info">
                      <span className="archivador-pj-ficha-nombre">
                        {pjLocal.fichaNombre ??
                          archivoFicha?.nombre ??
                          "Ficha de personaje"}
                      </span>
                      <span className="archivador-pj-ficha-sub">
                        Vista previa activa a la derecha (clic para modal)
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="archivador-pj-ficha-quitar"
                    onClick={() => void alSeleccionarFicha("")}
                    title="Quitar ficha principal"
                    aria-label="Quitar ficha principal"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="archivador-pj-ficha-selector">
                  <select
                    className="archivador-pj-select"
                    value=""
                    aria-label="Seleccionar ficha principal de mis archivos"
                    onChange={evento =>
                      void alSeleccionarFicha(evento.target.value)
                    }
                  >
                    <option value="">Elegir de mis archivos…</option>
                    {archivos.map(archivo => (
                      <option key={archivo.id} value={archivo.id}>
                        {archivo.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="archivador-pj-subir-btn"
                    onClick={() => selectorFicha.current?.click()}
                    disabled={subiendo}
                  >
                    <Plus size={12} aria-hidden="true" />
                    <span>Subir ficha</span>
                  </button>
                </div>
              )}

              <div className="archivador-pj-pdfs-bloque">
                <span className="archivador-pj-etiqueta">
                  PDFs adicionales (privados)
                </span>
                <div className="archivador-pj-pdfs-fila">
                  {pjLocal.pdfs.map(pdf => (
                    <div key={pdf.archivoId} className="archivador-pj-pdf-item">
                      <button
                        type="button"
                        className="archivador-pj-pdf-chip"
                        onClick={() =>
                          abrirArchivoPj(pdf.archivoId, pdf.nombre)
                        }
                        title={`Abrir ${pdf.nombre}`}
                      >
                        <FileText size={13} aria-hidden="true" />
                        <span>{pdf.nombre}</span>
                      </button>
                      <button
                        type="button"
                        className="archivador-pj-pdf-quitar"
                        onClick={() => void quitarPdfExtra(pdf.archivoId)}
                        title={`Desvincular ${pdf.nombre}`}
                        aria-label={`Desvincular ${pdf.nombre}`}
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </div>
                  ))}

                  <select
                    className="archivador-pj-pdf-agregar"
                    value=""
                    aria-label="Adjuntar PDF adicional"
                    onChange={evento =>
                      void alAgregarPdfExtra(evento.target.value)
                    }
                  >
                    <option value="">+ PDF de archivos…</option>
                    {pdfsDisponibles.map(archivo => (
                      <option key={archivo.id} value={archivo.id}>
                        {archivo.nombre}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="archivador-pj-pdf-subir"
                    onClick={() => selectorPdfExtra.current?.click()}
                    disabled={subiendo}
                    title="Subir nuevo PDF"
                    aria-label="Subir nuevo PDF"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="archivador-pj-notas-bloque">
            <label className="archivador-pj-etiqueta">
              Notas del personaje (privadas)
              <textarea
                className="archivador-pj-notas"
                rows={3}
                value={notasLocal}
                placeholder="Rasgos, objetivos, recordatorios privados…"
                onChange={evento => setNotasLocal(evento.target.value)}
                onBlur={() => void guardarNotasSiCambiaron()}
              />
            </label>
            {notasLocal !== pjLocal.notas && (
              <button
                type="button"
                className="archivador-pj-notas-btn"
                onClick={() => void guardarNotasSiCambiaron()}
                disabled={guardandoPj}
              >
                Guardar notas
              </button>
            )}
          </div>
          </section>

          <div className="pj-col-der">
            <div className="pj-visor-contenedor">
              {fichaParaVisor ? (
                <VisorArchivo
                  embebido
                  archivo={fichaParaVisor}
                  onCerrar={() => {}}
                  onGuardado={() => void refrescarArchivos()}
                />
              ) : (
                <div className="pj-visor-vacio">
                  <FileText size={42} aria-hidden="true" />
                  <p>
                    Selecciona o sube tu ficha principal (PDF o Word) para verla
                    aquí en grande
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {visor && (
        <DocumentoVisorModal
          archivo={visor}
          onCerrar={() => setVisor(null)}
        />
      )}
      {archivoParaRecortar && (
        <RecorteRetratoModal
          archivo={archivoParaRecortar}
          onCancelar={() => setArchivoParaRecortar(null)}
          onConfirmar={archivoRecortado =>
            void alConfirmarRecorteRetrato(archivoRecortado)
          }
        />
      )}
    </div>
  );
}
