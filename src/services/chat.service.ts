import { errors } from "../lib/errors.js";
import {
  MemoryChatRepository,
  type ChatRepository,
  type MensajeChat
} from "../repositories/chat.repository.js";
import type { Mesa, MesaRepository } from "../repositories/mesa.repository.js";
import {
  nombreDeUsuario,
  type User,
  type UserRepository
} from "../repositories/user.repository.js";

export type { MensajeChat };

const MAX_HISTORIAL_POR_MESA = 100;
const MAX_LONGITUD_MENSAJE = 500;

export type TipoEspecialTirada = "critico" | "pifia" | null;

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
  especial: TipoEspecialTirada;
  createdAt: string;
}

export interface DatosTirada {
  total: number;
  formula: string;
  dados: number[];
  bonificador: number;
  caras?: number;
  especial?: TipoEspecialTirada;
  secreta?: boolean;
}

function resolverEspecial(datos: DatosTirada): TipoEspecialTirada {
  if (datos.caras === 20) {
    if (datos.dados.includes(20)) return "critico";
    if (datos.dados.includes(1)) return "pifia";
    return null;
  }
  if (datos.especial === "critico" || datos.especial === "pifia") {
    return datos.especial;
  }
  return null;
}

function esMiembro(mesa: Mesa, userId: string): boolean {
  return mesa.hostId === userId || mesa.players.includes(userId);
}

function miembrosDe(mesa: Mesa): string[] {
  return [mesa.hostId, ...mesa.players];
}

export class ChatService {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly users: UserRepository,
    private readonly chatRepo: ChatRepository = new MemoryChatRepository()
  ) {}

  async listar(actor: User, mesaId: string): Promise<MensajeChat[]> {
    const mesa = await this.obtenerMesaComoMiembro(actor, mesaId);
    const mensajes = await this.chatRepo.listByMesa(mesa.id, MAX_HISTORIAL_POR_MESA);

    return mensajes.filter(
      msg =>
        msg.destinatarioId === null ||
        msg.autorId === actor.id ||
        msg.destinatarioId === actor.id
    );
  }

  async enviar(
    actor: User,
    mesaId: string,
    textoBruto: unknown,
    destinatarioIdBruto?: unknown
  ): Promise<{ mensaje: MensajeChat; destinatarios: string[] }> {
    const mesa = await this.obtenerMesaComoMiembro(actor, mesaId);

    if (typeof textoBruto !== "string") {
      throw errors.invalidRequest();
    }

    const texto = textoBruto.trim();
    if (!texto || texto.length > MAX_LONGITUD_MENSAJE) {
      throw errors.invalidRequest();
    }

    let destinatarioId: string | null = null;
    let destinatarioNombre: string | null = null;

    if (destinatarioIdBruto !== undefined && destinatarioIdBruto !== null && destinatarioIdBruto !== "") {
      if (typeof destinatarioIdBruto !== "string" || !esMiembro(mesa, destinatarioIdBruto)) {
        throw errors.invalidRequest();
      }
      const receptor = await this.users.findById(destinatarioIdBruto);
      if (!receptor) {
        throw errors.userNotFound();
      }
      destinatarioId = receptor.id;
      destinatarioNombre = nombreDeUsuario(receptor);
    }

    const mensaje: MensajeChat = {
      id: crypto.randomUUID(),
      mesaId: mesa.id,
      autorId: actor.id,
      autorNombre: nombreDeUsuario(actor),
      texto,
      destinatarioId,
      destinatarioNombre,
      createdAt: new Date().toISOString()
    };

    await this.chatRepo.save(mensaje, MAX_HISTORIAL_POR_MESA);

    const destinatarios =
      destinatarioId === null
        ? miembrosDe(mesa)
        : Array.from(new Set([actor.id, destinatarioId]));

    return { mensaje, destinatarios };
  }

  async registrarTirada(
    actor: User,
    mesaId: string,
    datos: DatosTirada
  ): Promise<{ tirada: EventoTirada; destinatarios: string[] } | null> {
    const mesa = await this.obtenerMesaComoMiembro(actor, mesaId);

    if (datos.secreta) {
      if (actor.id !== mesa.hostId) {
        throw errors.mesaForbidden();
      }
      // Secreto total: las tiradas con dados negros del Máster no se difunden ni se registran.
      return null;
    }

    if (
      typeof datos.total !== "number" ||
      !Number.isFinite(datos.total) ||
      typeof datos.bonificador !== "number" ||
      !Number.isFinite(datos.bonificador) ||
      typeof datos.formula !== "string" ||
      !datos.formula.trim() ||
      !Array.isArray(datos.dados) ||
      datos.dados.some(d => typeof d !== "number" || !Number.isFinite(d))
    ) {
      throw errors.invalidRequest();
    }

    const tirada: EventoTirada = {
      id: crypto.randomUUID(),
      mesaId: mesa.id,
      jugadorId: actor.id,
      jugadorNombre: nombreDeUsuario(actor),
      total: datos.total,
      formula: datos.formula.trim().slice(0, 64),
      dados: datos.dados.slice(0, 50),
      bonificador: datos.bonificador,
      ...(typeof datos.caras === "number" && Number.isFinite(datos.caras)
        ? { caras: datos.caras }
        : {}),
      especial: resolverEspecial(datos),
      createdAt: new Date().toISOString()
    };

    return { tirada, destinatarios: miembrosDe(mesa) };
  }

  private async obtenerMesaComoMiembro(actor: User, mesaId: string): Promise<Mesa> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) {
      throw errors.mesaNotFound();
    }
    if (!esMiembro(mesa, actor.id)) {
      throw errors.mesaForbidden();
    }
    return mesa;
  }
}
