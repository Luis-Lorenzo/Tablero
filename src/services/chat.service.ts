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
  soloMaster?: boolean;
  colorDado?: string;
  colorAristasDado?: string;
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
  soloMaster?: boolean;
  colorDado?: string;
  colorAristasDado?: string;
}

function sanitizarColorDado(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpio = valor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(limpio)) {
    return limpio.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(limpio)) {
    const [, r, g, b] = limpio;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return undefined;
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

function esAdminLibre(mesa: Mesa, actor: User): boolean {
  return actor.role === "ADMIN" && !mesa.players.includes(actor.id);
}

function esParticipanteOAdmin(mesa: Mesa, actor: User): boolean {
  return esMiembro(mesa, actor.id) || esAdminLibre(mesa, actor);
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

    return mensajes.filter(msg => {
      const esPublico =
        msg.destinatarioId === null &&
        (!msg.destinatarioIds || msg.destinatarioIds.length === 0);
      if (esPublico) return true;
      return (
        msg.autorId === actor.id ||
        msg.destinatarioId === actor.id ||
        Boolean(msg.destinatarioIds?.includes(actor.id))
      );
    });
  }

  async enviar(
    actor: User,
    mesaId: string,
    textoBruto: unknown,
    destinatarioIdBruto?: unknown,
    destinatarioIdsBruto?: unknown
  ): Promise<{ mensaje: MensajeChat; destinatarios: string[] }> {
    const mesa = await this.obtenerMesaComoMiembro(actor, mesaId);

    if (typeof textoBruto !== "string") {
      throw errors.invalidRequest();
    }

    const texto = textoBruto.trim();
    if (!texto || texto.length > MAX_LONGITUD_MENSAJE) {
      throw errors.invalidRequest();
    }

    const idsSolicitados: string[] = [];
    if (destinatarioIdsBruto !== undefined && destinatarioIdsBruto !== null) {
      if (!Array.isArray(destinatarioIdsBruto)) {
        throw errors.invalidRequest();
      }
      for (const item of destinatarioIdsBruto) {
        if (typeof item !== "string" || !item.trim()) {
          throw errors.invalidRequest();
        }
        const id = item.trim();
        if (!idsSolicitados.includes(id)) {
          idsSolicitados.push(id);
        }
      }
    }

    if (
      destinatarioIdBruto !== undefined &&
      destinatarioIdBruto !== null &&
      destinatarioIdBruto !== ""
    ) {
      if (typeof destinatarioIdBruto !== "string") {
        throw errors.invalidRequest();
      }
      const id = destinatarioIdBruto.trim();
      if (id && !idsSolicitados.includes(id)) {
        idsSolicitados.push(id);
      }
    }

    let destinatarioId: string | null = null;
    let destinatarioNombre: string | null = null;
    let destinatarioIds: string[] | undefined;
    let destinatarioNombres: string[] | undefined;

    if (idsSolicitados.length > 0) {
      const nombres: string[] = [];
      for (const id of idsSolicitados) {
        if (!esMiembro(mesa, id)) {
          throw errors.invalidRequest();
        }
        const receptor = await this.users.findById(id);
        if (!receptor) {
          throw errors.userNotFound();
        }
        nombres.push(nombreDeUsuario(receptor));
      }
      destinatarioId = idsSolicitados[0];
      destinatarioNombre = nombres.join(", ");
      destinatarioIds = idsSolicitados;
      destinatarioNombres = nombres;
    }

    const mensaje: MensajeChat = {
      id: crypto.randomUUID(),
      mesaId: mesa.id,
      autorId: actor.id,
      autorNombre: nombreDeUsuario(actor),
      texto,
      destinatarioId,
      destinatarioNombre,
      ...(destinatarioIds ? { destinatarioIds } : {}),
      ...(destinatarioNombres ? { destinatarioNombres } : {}),
      createdAt: new Date().toISOString()
    };

    await this.chatRepo.save(mensaje, MAX_HISTORIAL_POR_MESA);

    const destinatarios =
      destinatarioIds && destinatarioIds.length > 0
        ? Array.from(new Set([actor.id, ...destinatarioIds]))
        : miembrosDe(mesa);

    return { mensaje, destinatarios };
  }

  async registrarTirada(
    actor: User,
    mesaId: string,
    datos: DatosTirada
  ): Promise<{ tirada: EventoTirada; destinatarios: string[] } | null> {
    const mesa = await this.obtenerMesaComoMiembro(actor, mesaId);

    if (datos.secreta) {
      if (actor.id !== mesa.hostId && !esAdminLibre(mesa, actor)) {
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

    const colorDado = sanitizarColorDado(datos.colorDado);
    const colorAristasDado = sanitizarColorDado(datos.colorAristasDado);

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
      ...(datos.soloMaster ? { soloMaster: true } : {}),
      ...(colorDado ? { colorDado } : {}),
      ...(colorAristasDado ? { colorAristasDado } : {}),
      createdAt: new Date().toISOString()
    };

    const destinatarios = datos.soloMaster
      ? Array.from(new Set([actor.id, mesa.hostId]))
      : miembrosDe(mesa);

    return { tirada, destinatarios };
  }

  private async obtenerMesaComoMiembro(actor: User, mesaId: string): Promise<Mesa> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) {
      throw errors.mesaNotFound();
    }
    if (!esParticipanteOAdmin(mesa, actor)) {
      throw errors.mesaForbidden();
    }
    return mesa;
  }
}
