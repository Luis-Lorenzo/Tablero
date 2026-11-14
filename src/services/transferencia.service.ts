import { randomUUID } from "node:crypto";
import { vistaDe, type VistaArchivo } from "../lib/archivos.js";
import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { Archivo } from "../repositories/archivo.repository.js";
import type { Mesa, MesaRepository } from "../repositories/mesa.repository.js";
import { nombreDeUsuario, type User } from "../repositories/user.repository.js";
import type { ArchivoService } from "./archivo.service.js";

export interface PositTransferido {
  texto: string;
  color: string;
  giro: number;
}

export interface ArchivoTransferidoMeta {
  id: string;
  nombre: string;
  tipo: string;
  vista: VistaArchivo;
  tamano: number;
}

export type Transferencia =
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "posit";
      posit: PositTransferido;
      createdAt: Date;
    }
  | {
      id: string;
      mesaId: string;
      emisorId: string;
      emisorNombre: string;
      receptorId: string;
      tipo: "archivo";
      archivo: ArchivoTransferidoMeta;
      createdAt: Date;
    };

export type EntradaTransferencia =
  | {
      receptorId: string;
      tipo: "posit";
      posit: { texto: string; color: string; giro?: number };
    }
  | {
      receptorId: string;
      tipo: "archivo";
      archivoId: string;
    };

export type ResultadoAceptacion =
  | {
      transferencia: Transferencia;
      tipo: "posit";
      posit: PositTransferido;
    }
  | {
      transferencia: Transferencia;
      tipo: "archivo";
      archivo: Archivo;
    };

function esMiembroDeMesa(mesa: Mesa, userId: string): boolean {
  return mesa.hostId === userId || mesa.players.includes(userId);
}

/**
 * Gestiona las solicitudes en vivo para pasar posits o archivos entre
 * jugadores sentados en la misma mesa.
 */
export class TransferenciaService {
  private readonly pendientes = new Map<string, Transferencia>();

  constructor(
    private readonly mesas: MesaRepository,
    private readonly archivos: ArchivoService,
    private readonly logger: Logger
  ) {}

  async crear(
    emisor: User,
    mesaId: string,
    entrada: EntradaTransferencia
  ): Promise<Transferencia> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (!esMiembroDeMesa(mesa, emisor.id)) {
      throw errors.mesaForbidden();
    }

    if (!entrada.receptorId || entrada.receptorId === emisor.id) {
      throw errors.invalidRequest();
    }

    if (!esMiembroDeMesa(mesa, entrada.receptorId)) {
      throw errors.mesaForbidden();
    }

    const id = randomUUID();
    const emisorNombre = nombreDeUsuario(emisor);
    const createdAt = new Date();

    let transferencia: Transferencia;

    if (entrada.tipo === "posit") {
      const texto = String(entrada.posit?.texto ?? "").slice(0, 2000);
      const color = String(entrada.posit?.color ?? "#f7ffae").trim() || "#f7ffae";
      const giro =
        typeof entrada.posit?.giro === "number" && Number.isFinite(entrada.posit.giro)
          ? Math.max(-15, Math.min(15, entrada.posit.giro))
          : 0;

      transferencia = {
        id,
        mesaId,
        emisorId: emisor.id,
        emisorNombre,
        receptorId: entrada.receptorId,
        tipo: "posit",
        posit: { texto, color, giro },
        createdAt
      };
    } else if (entrada.tipo === "archivo") {
      if (!entrada.archivoId) throw errors.invalidRequest();
      const archivo = await this.archivos.obtenerMetadatos(emisor, entrada.archivoId);
      transferencia = {
        id,
        mesaId,
        emisorId: emisor.id,
        emisorNombre,
        receptorId: entrada.receptorId,
        tipo: "archivo",
        archivo: {
          id: archivo.id,
          nombre: archivo.nombre,
          tipo: archivo.tipo,
          vista: vistaDe(archivo.tipo),
          tamano: archivo.tamano
        },
        createdAt
      };
    } else {
      throw errors.invalidRequest();
    }

    this.pendientes.set(id, transferencia);
    this.logger.info("Transferencia solicitada", {
      transferenciaId: id,
      mesaId,
      emisorId: emisor.id,
      receptorId: entrada.receptorId,
      tipo: transferencia.tipo
    });

    return transferencia;
  }

  async listarPendientes(actor: User, mesaId: string): Promise<Transferencia[]> {
    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (!esMiembroDeMesa(mesa, actor.id)) {
      throw errors.mesaForbidden();
    }

    return Array.from(this.pendientes.values())
      .filter(t => t.mesaId === mesaId && t.receptorId === actor.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async aceptar(
    actor: User,
    mesaId: string,
    transferenciaId: string
  ): Promise<ResultadoAceptacion> {
    const transferencia = this.pendientes.get(transferenciaId);
    if (!transferencia || transferencia.mesaId !== mesaId) {
      throw errors.transferenciaNotFound();
    }

    if (transferencia.receptorId !== actor.id) {
      throw errors.mesaForbidden();
    }

    const mesa = await this.mesas.findById(mesaId);
    if (!mesa) throw errors.mesaNotFound();

    if (!esMiembroDeMesa(mesa, actor.id)) {
      throw errors.mesaForbidden();
    }

    if (transferencia.tipo === "archivo") {
      const archivo = await this.archivos.clonarPara(
        transferencia.emisorId,
        transferencia.archivo.id,
        actor
      );
      this.pendientes.delete(transferenciaId);
      this.logger.info("Transferencia de archivo aceptada", {
        transferenciaId,
        mesaId,
        receptorId: actor.id,
        archivoCopiaId: archivo.id
      });
      return { transferencia, tipo: "archivo", archivo };
    }

    this.pendientes.delete(transferenciaId);
    this.logger.info("Transferencia de posit aceptada", {
      transferenciaId,
      mesaId,
      receptorId: actor.id
    });
    return { transferencia, tipo: "posit", posit: transferencia.posit };
  }

  async rechazar(
    actor: User,
    mesaId: string,
    transferenciaId: string
  ): Promise<Transferencia> {
    const transferencia = this.pendientes.get(transferenciaId);
    if (!transferencia || transferencia.mesaId !== mesaId) {
      throw errors.transferenciaNotFound();
    }

    if (transferencia.receptorId !== actor.id) {
      throw errors.mesaForbidden();
    }

    this.pendientes.delete(transferenciaId);
    this.logger.info("Transferencia rechazada", {
      transferenciaId,
      mesaId,
      receptorId: actor.id
    });

    return transferencia;
  }
}
