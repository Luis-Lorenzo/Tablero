import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Archivador, ProyeccionMasterModal } from "./Archivador";
import { HudSalaCompartido } from "./HudSalaCompartido";
import { Lobby } from "./Lobby";
import { Mapa } from "./Mapa";
import { Pizarra } from "./Pizarra";
import { Sala } from "./Sala";
import {
  cargarCalibracion,
  cargarDocumentosPizarra,
  cargarEscenaPreview,
  cargarJugadores,
  cargarPizarraCongelada,
  cargarPosits,
  cargarProyeccionPreview,
  cargarTrazosPizarra,
  guardarCalibracion,
  guardarDocumentosPizarra,
  guardarEscenaPreview,
  guardarJugadores,
  guardarPizarraCongelada,
  guardarPosits,
  guardarProyeccionPreview,
  guardarTrazosPizarra
} from "./calibracion";
import {
  ARCHIVOS_PREVIEW_INICIALES,
  calcularPosicionRecepcion,
  crearElementoDesdeArchivo,
  nuevoIdElemento
} from "./compartir";
import { reproducirSonidoNotificacion } from "./sonido";
import type {
  Calibracion,
  DivisaConfig,
  DocumentoMesa,
  ElementoMesa,
  EstadoMapaCompartido,
  FasePreview,
  ImagenEscenaPreview,
  JugadorPreview,
  MapaFondoConfig,
  MapaIniciativaEstado,
  MapaRejillaConfig,
  PlantillaTokenMapa,
  PositPreview,
  SolicitudTransferencia,
  TokenMapa,
  TrazoPizarra
} from "./tipos";
import "./preview.css";

/**
 * Preview aislada de la sala (Fase 0): sin backend, sin login, sin sonido y con
 * datos falsos. Se abre en desarrollo con `?preview=1`.
 */
const MAPA_PREVIEW_KEY = "tablero.preview.mapa.v1";
const OBJETOS_PIZARRA_KEY = "pocketrol.pizarra.objetos.v1";
type ObjetoPizarra = Extract<ElementoMesa, { tipo: "objeto" }>;

function cargarObjetosPizarraPreview(): ObjetoPizarra[] {
  try {
    const raw = window.localStorage.getItem(OBJETOS_PIZARRA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ObjetoPizarra[]) : [];
  } catch {
    return [];
  }
}

function elegirPosicionLibrePizarra(
  existentes: Array<{ x: number; y: number }>
): { x: number; y: number } {
  const min = 12;
  const max = 82;
  const minDist = 13;
  let mejor = {
    x: Number((min + Math.random() * (max - min)).toFixed(2)),
    y: Number((min + Math.random() * (max - min)).toFixed(2))
  };
  let mejorDist = -1;
  for (let intento = 0; intento < 32; intento += 1) {
    const x = Number((min + Math.random() * (max - min)).toFixed(2));
    const y = Number((min + Math.random() * (max - min)).toFixed(2));
    const distMin = existentes.reduce((acc, item) => {
      const d = Math.hypot(item.x - x, item.y - y);
      return Math.min(acc, d);
    }, Number.POSITIVE_INFINITY);
    if (distMin >= minDist) {
      return { x, y };
    }
    if (distMin > mejorDist) {
      mejorDist = distMin;
      mejor = { x, y };
    }
  }
  return mejor;
}

const ESTADO_MAPA_DEFECTO: EstadoMapaCompartido = {
  fondo: null,
  rejilla: {
    visible: true,
    columnas: 20,
    filas: 12,
    filasAuto: true,
    offsetX: 0,
    offsetY: 0,
    color: "#ffffff",
    opacidad: 0.35,
    imanActivo: true
  },
  tokens: [],
  plantillas: []
};

function cargarEstadoMapaPreview(): EstadoMapaCompartido {
  try {
    const raw = window.localStorage.getItem(MAPA_PREVIEW_KEY);
    if (!raw) return ESTADO_MAPA_DEFECTO;
    const parsed = JSON.parse(raw) as Partial<EstadoMapaCompartido>;
    return {
      fondo: parsed.fondo ?? null,
      rejilla: { ...ESTADO_MAPA_DEFECTO.rejilla, ...(parsed.rejilla ?? {}) },
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
      plantillas: Array.isArray(parsed.plantillas) ? parsed.plantillas : [],
      iniciativa: parsed.iniciativa,
      trazos: Array.isArray(parsed.trazos) ? parsed.trazos : [],
      dibujoCongelado: Boolean(parsed.dibujoCongelado)
    };
  } catch {
    return ESTADO_MAPA_DEFECTO;
  }
}

/** Permite abrir directamente una fase: `?preview=1&fase=sala`. */
function faseInicial(): FasePreview {
  const valor = new URLSearchParams(window.location.search).get("fase");
  return valor === "sala" ||
    valor === "pizarra" ||
    valor === "mapa" ||
    valor === "archivador"
    ? valor
    : "lobby";
}

export default function PreviewApp() {
  const [fase, setFase] = useState<FasePreview>(faseInicial);
  const [jugadores, setJugadores] = useState<JugadorPreview[]>(cargarJugadores);
  const [calibracion, setCalibracion] = useState<Calibracion>(cargarCalibracion);
  const [posits, setPosits] = useState<PositPreview[]>(cargarPosits);
  const [elementosMesa, setElementosMesa] = useState<ElementoMesa[]>(() => [
    {
      id: "preview-mesa-posit-1",
      tipo: "posit",
      texto: "Arrástrame hacia un jugador o ábreme.",
      color: "#f7ffae",
      giro: -1.8,
      x: 72,
      y: 78
    }
  ]);
  const [solicitudPendiente, setSolicitudPendiente] =
    useState<SolicitudTransferencia | null>(null);
  const [avisoPreview, setAvisoPreview] = useState<string | null>(null);
  const recepcionesRef = useRef(0);
  const simTurnoRef = useRef(0);
  const avisoTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (avisoTimerRef.current !== null) {
        window.clearTimeout(avisoTimerRef.current);
      }
    },
    []
  );

  const mostrarAvisoPreview = useCallback((texto: string) => {
    setAvisoPreview(texto);
    if (avisoTimerRef.current !== null) {
      window.clearTimeout(avisoTimerRef.current);
    }
    avisoTimerRef.current = window.setTimeout(() => setAvisoPreview(null), 3200);
  }, []);

  const simularRecepcion = useCallback(() => {
    const remitente =
      jugadores.find(j => j.activo && j.id !== "master")?.nombre ?? "Aria";
    const turno = simTurnoRef.current;
    simTurnoRef.current += 1;

    reproducirSonidoNotificacion();

    if (turno % 2 === 0) {
      const archivo =
        ARCHIVOS_PREVIEW_INICIALES[turno % ARCHIVOS_PREVIEW_INICIALES.length];
      setSolicitudPendiente({
        id: nuevoIdElemento(),
        emisorNombre: remitente,
        tipo: "archivo",
        nombreArchivo: archivo.nombre,
        mimeArchivo: archivo.tipo,
        vistaArchivo: archivo.vista
      });
      return;
    }

    setSolicitudPendiente({
      id: nuevoIdElemento(),
      emisorNombre: remitente,
      tipo: "posit",
      textoPosit: "Clave del cofre: luna menguante.",
      colorPosit: "#96fbc7",
      giroPosit: -1.5
    });
  }, [jugadores]);

  const aceptarSolicitudPreview = useCallback(
    (solicitud: SolicitudTransferencia) => {
      const pos = calcularPosicionRecepcion(recepcionesRef.current);
      recepcionesRef.current += 1;

      if (solicitud.tipo === "posit") {
        setElementosMesa(prev => [
          ...prev,
          {
            id: nuevoIdElemento(),
            tipo: "posit",
            texto: solicitud.textoPosit ?? "",
            color: solicitud.colorPosit ?? "#96fbc7",
            giro: solicitud.giroPosit ?? -1.5,
            x: pos.x,
            y: pos.y,
            remitente: solicitud.emisorNombre
          }
        ]);
      } else {
        const archivo =
          ARCHIVOS_PREVIEW_INICIALES.find(
            a => a.nombre === solicitud.nombreArchivo
          ) ?? ARCHIVOS_PREVIEW_INICIALES[0];
        setElementosMesa(prev => [
          ...prev,
          crearElementoDesdeArchivo(archivo, pos, solicitud.emisorNombre)
        ]);
      }

      setSolicitudPendiente(null);
    },
    []
  );
  const [trazosPizarra, setTrazosPizarra] =
    useState<TrazoPizarra[]>(cargarTrazosPizarra);
  const [documentosPizarra, setDocumentosPizarra] = useState<DocumentoMesa[]>(
    cargarDocumentosPizarra
  );
  const [objetosPizarra, setObjetosPizarra] = useState<ObjetoPizarra[]>(
    cargarObjetosPizarraPreview
  );
  const [divisasConfig, setDivisasConfig] = useState<DivisaConfig[]>([
    { id: "principal", nombre: "Divisa", color: "#e8c56a" }
  ]);
  const [divisasSaldos, setDivisasSaldos] = useState<Record<string, number>>({
    principal: 0
  });
  const [pizarraCongelada, setPizarraCongelada] = useState<boolean>(
    cargarPizarraCongelada
  );
  const [imagenEscena, setImagenEscena] = useState<ImagenEscenaPreview | null>(
    cargarEscenaPreview
  );
  const [imagenProyectada, setImagenProyectada] =
    useState<ImagenEscenaPreview | null>(cargarProyeccionPreview);
  const [proyeccionOcultadaId, setProyeccionOcultadaId] = useState<
    string | null
  >(null);
  const [estadoMapa, setEstadoMapa] = useState<EstadoMapaCompartido>(
    cargarEstadoMapaPreview
  );

  useEffect(() => {
    guardarJugadores(jugadores);
  }, [jugadores]);

  useEffect(() => {
    guardarCalibracion(calibracion);
  }, [calibracion]);

  useEffect(() => {
    guardarPosits(posits);
  }, [posits]);

  useEffect(() => {
    guardarTrazosPizarra(trazosPizarra);
  }, [trazosPizarra]);

  useEffect(() => {
    guardarDocumentosPizarra(documentosPizarra);
  }, [documentosPizarra]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        OBJETOS_PIZARRA_KEY,
        JSON.stringify(objetosPizarra)
      );
    } catch {
      // Sin espacio o bloqueado en navegador privado.
    }
  }, [objetosPizarra]);

  useEffect(() => {
    guardarPizarraCongelada(pizarraCongelada);
  }, [pizarraCongelada]);

  useEffect(() => {
    guardarEscenaPreview(imagenEscena);
  }, [imagenEscena]);

  useEffect(() => {
    guardarProyeccionPreview(imagenProyectada);
  }, [imagenProyectada]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MAPA_PREVIEW_KEY, JSON.stringify(estadoMapa));
    } catch {
      // Sin espacio o bloqueado en navegador privado.
    }
  }, [estadoMapa]);

  const cambiarFondoYRejillaPreview = useCallback(
    (fondo: MapaFondoConfig | null, rejilla: MapaRejillaConfig) => {
      setEstadoMapa(prev => ({ ...prev, fondo, rejilla }));
    },
    []
  );

  const crearTokenPreview = useCallback(
    (
      token: Omit<TokenMapa, "id" | "autorId" | "autorNombre" | "autorColor">,
      guardarPlantilla = false,
      categoria?: string
    ) => {
      const nuevoToken: TokenMapa = {
        ...token,
        id: nuevoIdElemento(),
        autorId: "master",
        autorNombre: "Máster",
        autorColor: "#e8c56a"
      };
      const categoriaLimpia =
        typeof categoria === "string" && categoria.trim()
          ? categoria.trim().slice(0, 40)
          : undefined;
      setEstadoMapa(prev => {
        const plantillas: PlantillaTokenMapa[] = guardarPlantilla
          ? [
              ...prev.plantillas,
              {
                id: nuevoIdElemento(),
                nombre: token.nombre,
                archivoId: token.archivoId,
                imagenUrl: token.imagenUrl,
                celdasAncho: token.celdasAncho,
                celdasAlto: token.celdasAlto,
                escala: token.escala,
                autorId: "master",
                esMonstruo: token.esMonstruo,
                ...(categoriaLimpia ? { categoria: categoriaLimpia } : {})
              } as PlantillaTokenMapa
            ]
          : prev.plantillas;
        return {
          ...prev,
          tokens: [...prev.tokens, nuevoToken],
          plantillas
        };
      });
    },
    []
  );

  const actualizarTokenPreview = useCallback(
    (
      tokenId: string,
      patch: Partial<
        Pick<TokenMapa, "x" | "y" | "celdasAncho" | "celdasAlto" | "escala" | "nombre" | "enLimbo">
      >
    ) => {
      setEstadoMapa(prev => ({
        ...prev,
        tokens: prev.tokens.map(t => (t.id === tokenId ? { ...t, ...patch } : t))
      }));
    },
    []
  );

  const eliminarTokenPreview = useCallback((tokenId: string) => {
    setEstadoMapa(prev => {
      const token = prev.tokens.find(t => t.id === tokenId);
      const tokens = prev.tokens.filter(t => t.id !== tokenId);

      let plantillas = prev.plantillas;
      if (
        token &&
        !prev.plantillas.some(
          p =>
            p.autorId === token.autorId &&
            p.nombre === token.nombre &&
            p.imagenUrl === token.imagenUrl
        )
      ) {
        plantillas = [
          ...prev.plantillas,
          {
            id: nuevoIdElemento(),
            nombre: token.nombre,
            ...(token.archivoId ? { archivoId: token.archivoId } : {}),
            imagenUrl: token.imagenUrl,
            celdasAncho: token.celdasAncho,
            celdasAlto: token.celdasAlto,
            escala: token.escala,
            autorId: token.autorId,
            ...(token.esMonstruo ? { esMonstruo: true } : {})
          }
        ];
      }

      let iniciativa = prev.iniciativa;
      if (iniciativa) {
        const nuevasEntradas = iniciativa.entradas.filter(
          e => (e as { tokenId?: string }).tokenId !== tokenId
        );
        if (nuevasEntradas.length !== iniciativa.entradas.length) {
          iniciativa = {
            ...iniciativa,
            entradas: nuevasEntradas,
            turnoIndice: Math.min(
              iniciativa.turnoIndice,
              Math.max(0, nuevasEntradas.length - 1)
            )
          };
        }
      }

      return {
        ...prev,
        tokens,
        plantillas,
        ...(iniciativa !== undefined ? { iniciativa } : {})
      };
    });
  }, []);

  const actualizarPlantillaPreview = useCallback(
    (plantillaId: string, patch: { categoria?: string; nombre?: string }) => {
      setEstadoMapa(prev => ({
        ...prev,
        plantillas: prev.plantillas.map(p => {
          if (p.id !== plantillaId) return p;
          const siguiente = { ...p } as PlantillaTokenMapa & { categoria?: string };
          if (patch.nombre !== undefined && patch.nombre.trim()) {
            siguiente.nombre = patch.nombre.trim().slice(0, 120);
          }
          if (patch.categoria !== undefined) {
            const cat = patch.categoria.trim().slice(0, 40);
            if (cat) {
              siguiente.categoria = cat;
            } else {
              delete siguiente.categoria;
            }
          }
          return siguiente;
        })
      }));
    },
    []
  );

  const eliminarPlantillaPreview = useCallback((plantillaId: string) => {
    setEstadoMapa(prev => ({
      ...prev,
      plantillas: prev.plantillas.filter(p => p.id !== plantillaId)
    }));
  }, []);

  const cambiarIniciativaPreview = useCallback(
    (iniciativa: MapaIniciativaEstado) => {
      setEstadoMapa(prev => ({ ...prev, iniciativa }));
    },
    []
  );

  const terminarTurnoIniciativaPreview = useCallback(() => {
    setEstadoMapa(prev => {
      const iniciativa = prev.iniciativa;
      if (!iniciativa?.activa || iniciativa.entradas.length === 0) {
        return prev;
      }
      const haySiguiente =
        iniciativa.turnoIndice + 1 < iniciativa.entradas.length;
      return {
        ...prev,
        iniciativa: {
          ...iniciativa,
          turnoIndice: haySiguiente ? iniciativa.turnoIndice + 1 : 0,
          ronda: haySiguiente ? iniciativa.ronda : iniciativa.ronda + 1
        }
      };
    });
  }, []);

  const agregarTrazoPreview = useCallback((trazo: TrazoPizarra) => {
    setEstadoMapa(prev => ({
      ...prev,
      trazos: [
        ...(prev.trazos ?? []),
        { ...trazo, autorId: trazo.autorId ?? "master" }
      ]
    }));
  }, []);

  const eliminarTrazoPreview = useCallback((trazoId: string) => {
    setEstadoMapa(prev => ({
      ...prev,
      trazos: (prev.trazos ?? []).filter(t => t.id !== trazoId)
    }));
  }, []);

  const borrarTrazosPreview = useCallback(() => {
    setEstadoMapa(prev => ({ ...prev, trazos: [] }));
  }, []);

  const cambiarDibujoCongeladoPreview = useCallback((congelado: boolean) => {
    setEstadoMapa(prev => ({ ...prev, dibujoCongelado: congelado }));
  }, []);

  const cambiarApodoPreview = useCallback((apodo: string) => {
    const limpio = apodo.trim().slice(0, 24);
    setJugadores(prev =>
      prev.map(j =>
        j.id === "master" ? { ...j, apodo: limpio || undefined } : j
      )
    );
  }, []);

  const subirImagenMapaPreview = useCallback(
    async (
      archivo: File,
      _categoria: "escena" | "token"
    ): Promise<{ archivoId?: string; url: string; titulo: string }> => {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(archivo);
      });
      return { url, titulo: archivo.name };
    },
    []
  );

  const guardarDivisasConfigPreview = useCallback((config: DivisaConfig[]) => {
    setDivisasConfig(config);
  }, []);

  const cambiarDivisaPreview = useCallback(
    (nuevo: number, _delta: number, divisaId?: string) => {
      const idDivisa = divisaId ?? divisasConfig[0]?.id ?? "principal";
      const limpia = Math.max(0, Math.trunc(nuevo));
      setDivisasSaldos(prev => ({ ...prev, [idDivisa]: limpia }));
    },
    [divisasConfig]
  );

  const compartirATodosPreview = useCallback(
    (elemento: ElementoMesa) => {
      if (elemento.tipo === "macro") return;
      const etiqueta = elemento.tipo === "posit" ? "nota" : elemento.nombre;
      mostrarAvisoPreview(`Compartido (${etiqueta}) con toda la mesa (modo preview).`);
    },
    [mostrarAvisoPreview]
  );

  const enviarAPizarraPreview = useCallback(
    (elemento: ElementoMesa) => {
      if (elemento.tipo === "macro") return;
      const existentes = [
        ...posits.map(p => ({ x: p.x, y: p.y })),
        ...documentosPizarra.map(d => ({ x: d.x, y: d.y })),
        ...objetosPizarra.map(o => ({ x: o.x, y: o.y }))
      ];
      const pos = elegirPosicionLibrePizarra(existentes);
      setElementosMesa(prev => prev.filter(el => el.id !== elemento.id));
      if (elemento.tipo === "posit") {
        setPosits(prev => [
          ...prev,
          {
            id: elemento.id,
            texto: elemento.texto,
            color: elemento.color,
            giro: elemento.giro,
            x: pos.x,
            y: pos.y,
            ...(elemento.autorNombre ? { autorNombre: elemento.autorNombre } : {}),
            ...(elemento.autorColor ? { autorColor: elemento.autorColor } : {}),
            ...(elemento.esMaster !== undefined ? { esMaster: elemento.esMaster } : {})
          }
        ]);
      } else if (elemento.tipo === "archivo") {
        setDocumentosPizarra(prev => [
          ...prev,
          {
            id: elemento.id,
            nombre: elemento.nombre,
            tipo: elemento.mime,
            vista: elemento.vista,
            tamano: elemento.tamano,
            x: pos.x,
            y: pos.y,
            ...(elemento.contenidoLocal ? { url: elemento.contenidoLocal } : {})
          }
        ]);
      } else if (elemento.tipo === "objeto") {
        setObjetosPizarra(prev => [
          ...prev,
          {
            ...elemento,
            x: pos.x,
            y: pos.y
          }
        ]);
      }
      mostrarAvisoPreview("Enviado a la pizarra.");
    },
    [posits, documentosPizarra, objetosPizarra, mostrarAvisoPreview]
  );

  const sacarDePizarraAMesaPreview = useCallback(
    (elemento: ElementoMesa) => {
      const tipo = (elemento as { tipo?: string }).tipo ?? "objeto";
      if (tipo === "objeto") {
        setObjetosPizarra(prev => prev.filter(o => o.id !== elemento.id));
      } else if (tipo === "posit") {
        setPosits(prev => prev.filter(p => p.id !== elemento.id));
      } else if (tipo === "archivo") {
        setDocumentosPizarra(prev => prev.filter(d => d.id !== elemento.id));
      }
      const pos = calcularPosicionRecepcion(recepcionesRef.current);
      recepcionesRef.current += 1;
      const paraMesa: ElementoMesa =
        tipo === "objeto"
          ? {
              ...(elemento as ObjetoPizarra),
              tipo: "objeto",
              x: pos.x,
              y: pos.y
            }
          : { ...elemento, x: pos.x, y: pos.y };
      setElementosMesa(prev => [...prev, paraMesa]);
      mostrarAvisoPreview("Devuelto a tu mesa.");
    },
    [mostrarAvisoPreview]
  );

  const volverASala = useCallback(() => setFase("sala"), []);
  const proyectar = useCallback((imagen: ImagenEscenaPreview | null) => {
    setProyeccionOcultadaId(null);
    setImagenProyectada(imagen);
  }, []);

  const proyeccionOculta = Boolean(
    imagenProyectada && proyeccionOcultadaId === imagenProyectada.id
  );

  let contenido: ReactNode;
  if (fase === "lobby") {
      contenido = (
        <Lobby
          jugadores={jugadores}
          onJugadores={setJugadores}
          onEmpezar={() => setFase("sala")}
        />
      );
  } else if (fase === "pizarra") {
    contenido = (
      <Pizarra
        posits={posits}
        onPosits={setPosits}
        trazos={trazosPizarra}
        onTrazos={setTrazosPizarra}
        documentosPizarra={documentosPizarra}
        onDocumentosPizarra={setDocumentosPizarra}
        objetosPizarra={objetosPizarra}
        onObjetosPizarra={setObjetosPizarra}
        onSacarDePizarraAMesa={sacarDePizarraAMesaPreview}
        congelada={pizarraCongelada}
        onCongelada={setPizarraCongelada}
        onVolver={volverASala}
        esMaster
        colorJugador="#e8c56a"
        nombreJugador="Máster"
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={setImagenEscena}
        onProyectarImagen={proyectar}
      />
    );
  } else if (fase === "mapa") {
    contenido = (
      <>
        <Mapa
          onVolver={volverASala}
          esMaster
          miUsuarioId="master"
          colorJugador="#e8c56a"
          nombreJugador="Máster"
          jugadores={jugadores}
          estadoMapa={estadoMapa}
          onCambiarFondoYRejilla={cambiarFondoYRejillaPreview}
          onCrearToken={crearTokenPreview}
          onActualizarToken={actualizarTokenPreview}
          onEliminarToken={eliminarTokenPreview}
          onActualizarPlantilla={actualizarPlantillaPreview}
          onEliminarPlantilla={eliminarPlantillaPreview}
          onCambiarIniciativa={cambiarIniciativaPreview}
          onTerminarTurnoIniciativa={terminarTurnoIniciativaPreview}
          onAgregarTrazo={agregarTrazoPreview}
          onEliminarTrazo={eliminarTrazoPreview}
          onBorrarTrazos={borrarTrazosPreview}
          onCambiarDibujoCongelado={cambiarDibujoCongeladoPreview}
          archivosDisponibles={ARCHIVOS_PREVIEW_INICIALES}
          onSubirImagenMapa={subirImagenMapaPreview}
        />
        <HudSalaCompartido
          jugadores={jugadores}
          esMaster
          miUsuarioId="master"
          hostName="Máster"
          yoAsientoId="master"
          divisasConfig={divisasConfig}
          divisasSaldos={divisasSaldos}
          onGuardarDivisasConfig={guardarDivisasConfigPreview}
          onCambiarDivisa={cambiarDivisaPreview}
          onAviso={mostrarAvisoPreview}
          dibujoCongelado={Boolean(estadoMapa.dibujoCongelado)}
          elementosMesa={elementosMesa}
          onElementosMesa={setElementosMesa}
          archivosDisponibles={ARCHIVOS_PREVIEW_INICIALES}
          onEnviarElemento={(destino, elemento) => {
            const etiqueta =
              elemento.tipo === "posit" ? "nota" : elemento.nombre;
            mostrarAvisoPreview(`Enviado (${etiqueta}) a ${destino.nombre} (modo preview).`);
          }}
          onAbrirArchivador={() => setFase("archivador")}
          onCompartirATodos={compartirATodosPreview}
        />
      </>
    );
  } else if (fase === "archivador") {
    contenido = (
      <Archivador
        elementosMesa={elementosMesa}
        onElementosMesa={setElementosMesa}
        onVolver={volverASala}
        esMaster
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={setImagenEscena}
        onProyectarImagen={proyectar}
      />
    );
  } else {
    contenido = (
      <Sala
        jugadores={jugadores}
        calibracion={calibracion}
        onCalibracion={setCalibracion}
        onAbrirPizarra={() => setFase("pizarra")}
        onAbrirMapa={() => setFase("mapa")}
        onAbrirArchivador={() => setFase("archivador")}
        onVolver={() => setFase("lobby")}
        esMaster
        miUsuarioId="master"
        colorJugador="#e8c56a"
        nombreJugador="Máster"
        imagenEscena={imagenEscena}
        imagenProyectada={imagenProyectada}
        onCambiarEscena={setImagenEscena}
        onProyectarImagen={proyectar}
        proyeccionOculta={proyeccionOculta}
        onReabrirProyeccion={() => setProyeccionOcultadaId(null)}
        yoAsientoId="master"
        posits={posits}
        elementosMesa={elementosMesa}
        onElementosMesa={setElementosMesa}
        archivosDisponibles={ARCHIVOS_PREVIEW_INICIALES}
        onEnviarElemento={(destino, elemento) => {
          const etiqueta =
            elemento.tipo === "posit" ? "nota" : elemento.nombre;
          mostrarAvisoPreview(`Enviado (${etiqueta}) a ${destino.nombre} (modo preview).`);
        }}
        solicitudPendiente={solicitudPendiente}
        onAceptarSolicitud={aceptarSolicitudPreview}
        onRechazarSolicitud={() => setSolicitudPendiente(null)}
        onSimularRecepcion={simularRecepcion}
        divisasConfig={divisasConfig}
        divisasSaldos={divisasSaldos}
        onGuardarDivisasConfig={guardarDivisasConfigPreview}
        onCambiarDivisa={cambiarDivisaPreview}
        onCompartirATodos={compartirATodosPreview}
        onEnviarAPizarra={enviarAPizarraPreview}
        onCambiarApodo={cambiarApodoPreview}
      />
    );
  }

  return (
    <>
      {contenido}
      {imagenProyectada && !proyeccionOculta && (
        <ProyeccionMasterModal
          imagen={imagenProyectada}
          esMaster
          onCerrarLocal={() => setProyeccionOcultadaId(imagenProyectada.id)}
          onRetirarTodos={() => proyectar(null)}
        />
      )}
      {avisoPreview && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            padding: "10px 18px",
            borderRadius: "999px",
            border: "1px solid #96fbc7",
            background: "rgba(22, 18, 30, 0.94)",
            color: "#96fbc7",
            fontSize: "0.86rem"
          }}
        >
          {avisoPreview}
        </div>
      )}
    </>
  );
}
