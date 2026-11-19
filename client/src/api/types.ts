export interface PublicUser {
  id: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  blocked: boolean;
  createdAt: string;
  lockedUntil: string | null;
  nickname: string | null;
}

export interface ActiveStatus {
  id: string;
  active: boolean;
}

export interface MesaJugador {
  id: string;
  name: string;
  color?: string | null;
}

export interface ImagenMaster {
  id: string;
  titulo: string | null;
  url?: string;
}

export interface DivisaConfig {
  id: string;
  nombre: string;
  color: string;
}

export interface PistaMusicaMesa {
  archivoId: string;
  nombre: string;
}

export interface MusicaAmbienteMesa {
  pistas: PistaMusicaMesa[];
  indiceActual: number;
  reproduciendo: boolean;
  loop: boolean;
  aleatorio: boolean;
  volumenMaster: number;
}

export interface PublicMesa {
  id: string;
  hostId: string;
  hostName: string;
  players: MesaJugador[];
  expulsados?: string[];
  pendingHostId: string | null;
  /** Si el máster ya ha empezado la partida. */
  estado: "ESPERA" | "EN_CURSO";
  colores?: Record<string, string>;
  playerApodos?: Record<string, string>;
  imagenEscena?: ImagenMaster | null;
  imagenProyectada?: ImagenMaster | null;
  divisaNombre?: string;
  divisasConfig?: DivisaConfig[];
  musicaAmbiente?: MusicaAmbienteMesa | null;
  createdAt: string;
}

/** Archivo personal subido por el usuario (metadatos; los bytes los sirve la API). */
export interface PublicArchivo {
  id: string;
  nombre: string;
  tipo: string;
  /** El navegador puede mostrarlo dentro de la página (PDF, imagen, texto o .docx). */
  vista: string;
  tamano: number;
  createdAt: string;
  updatedAt?: string;
}

export interface PositTransferido {
  texto: string;
  color: string;
  giro: number;
}

export interface ArchivoTransferidoMeta {
  id: string;
  nombre: string;
  tipo: string;
  vista: string;
  tamano: number;
}

export interface ObjetoTransferidoDto {
  idOrigen?: string;
  nombre: string;
  descripcion: string;
  cantidad: number;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
}

export type PublicTransferencia =
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "posit";
      posit: PositTransferido;
      createdAt: string;
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "archivo";
      archivo: ArchivoTransferidoMeta;
      createdAt: string;
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "objeto";
      objeto: ObjetoTransferidoDto;
      createdAt: string;
    };

export type ResultadoAceptarTransferencia =
  | {
      tipo: "posit";
      posit: PositTransferido;
    }
  | {
      tipo: "archivo";
      archivo: PublicArchivo;
    }
  | {
      tipo: "objeto";
      objeto: ObjetoTransferidoDto;
    };

export interface MensajeChat {
  id: string;
  mesaId: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  destinatarioId: string | null;
  destinatarioNombre: string | null;
  createdAt: string;
}

export interface EventoTirada {
  id: string;
  mesaId: string;
  jugadorId: string;
  jugadorNombre: string;
  total: number;
  formula: string;
  dados: number[];
  bonificador: number;
  caras?: number;
  especial?: "critico" | "pifia" | null;
  soloMaster?: boolean;
  colorDado?: string;
  colorAristasDado?: string;
  createdAt: string;
}

export interface PublicObjetoResumen {
  id: string;
  nombre: string;
  descripcion: string;
  cantidad: number;
  emoji?: string;
  archivoId?: string;
  archivoNombre?: string;
}

export interface PublicJugadorResumenInventario {
  userId: string;
  nombre: string;
  color: string;
  divisa: number;
  divisasSaldos?: Record<string, number>;
  mochila: PublicObjetoResumen[];
  objetosMesa: PublicObjetoResumen[];
}

export interface MapaRejillaConfig {
  visible: boolean;
  columnas: number;
  filas: number;
  filasAuto: boolean;
  offsetX: number;
  offsetY: number;
  color: string;
  opacidad: number;
  imanActivo: boolean;
}

export interface MapaFondoConfig {
  archivoId?: string;
  url: string;
  titulo?: string;
  anchoNatural?: number;
  altoNatural?: number;
}

export interface TokenMapa {
  id: string;
  nombre: string;
  archivoId?: string;
  imagenUrl: string;
  x: number;
  y: number;
  celdasAncho: number;
  celdasAlto: number;
  escala: number;
  autorId: string;
  autorNombre: string;
  autorColor: string;
  esMonstruo?: boolean;
}

export interface PlantillaTokenMapa {
  id: string;
  nombre: string;
  archivoId?: string;
  imagenUrl: string;
  celdasAncho: number;
  celdasAlto: number;
  escala: number;
  autorId: string;
  esMonstruo?: boolean;
  categoria?: string;
}

export interface IniciativaEntrada {
  id: string;
  nombre: string;
  valor: number;
  color?: string;
  esMonstruo?: boolean;
  jugadorId?: string;
  tokenId?: string;
}

export interface MapaIniciativaEstado {
  activa: boolean;
  ronda: number;
  turnoIndice: number;
  entradas: IniciativaEntrada[];
}

export interface TrazoMapa {
  id: string;
  color: string;
  grosor: number;
  puntos: Array<{ x: number; y: number }>;
  autorId?: string;
}

export interface AreaMapa {
  id: string;
  tipo: "circulo" | "cono";
  x: number;
  y: number;
  celdas: number;
  angulo: number;
  color: string;
  autorId: string;
  autorNombre: string;
}

export interface CrearAreaMapaPayload {
  id?: string;
  tipo: "circulo" | "cono";
  x: number;
  y: number;
  celdas: number;
  angulo?: number;
  color?: string;
}

export interface ActualizarAreaMapaPayload {
  x?: number;
  y?: number;
  celdas?: number;
  angulo?: number;
  color?: string;
}

export interface EstadoMapaCompartido {
  fondo: MapaFondoConfig | null;
  rejilla: MapaRejillaConfig;
  tokens: TokenMapa[];
  plantillas: PlantillaTokenMapa[];
  iniciativa?: MapaIniciativaEstado;
  trazos?: TrazoMapa[];
  areas?: AreaMapa[];
  dibujoCongelado?: boolean;
}

export interface GuardarMapaFondoPayload {
  fondo?: MapaFondoConfig | null;
  rejilla?: MapaRejillaConfig;
}

export interface CrearTokenMapaPayload {
  nombre?: string;
  archivoId?: string;
  imagenUrl?: string;
  x?: number;
  y?: number;
  celdasAncho?: number;
  celdasAlto?: number;
  escala?: number;
  esMonstruo?: boolean;
  guardarPlantilla?: boolean;
  categoria?: string;
}

export interface ActualizarTokenMapaPayload {
  nombre?: string;
  x?: number;
  y?: number;
  celdasAncho?: number;
  celdasAlto?: number;
  escala?: number;
  esMonstruo?: boolean;
  enLimbo?: boolean;
}

export interface ActualizarPlantillaMapaPayload {
  categoria?: string;
  nombre?: string;
}
