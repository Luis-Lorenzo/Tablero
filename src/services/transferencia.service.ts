import { randomUUID } from "node:crypto";
import { vistaDe } from "../lib/archivos.js";
import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { Archivo } from "../repositories/archivo.repository.js";
import type { Mesa, MesaRepository } from "../repositories/mesa.repository.js";
import {
  MemoryTransferenciaRepository,
  type ArchivoTransferidoMeta,
  type ObjetoTransferido,
  type PositTransferido,
  type Transferencia,
  type TransferenciaRepository
} from "../repositories/transferencia.repository.js";
import { nombreDeUsuario, type User } from "../repositories/user.repository.js";
import type { ArchivoService } from "./archivo.service.js";

export type {
  ArchivoTransferidoMeta,
  ObjetoTransferido,
  PositTransferido,
  Transferencia
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
  }
  | {
    receptorId: string;
    tipo: "objeto";
    objeto: ObjetoTransferido;
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
  }
  | {
    transferencia: Transferencia;
    tipo: "objeto";
    objeto: ObjetoTransferido;
  };

function esMiembroDeMesa(mesa: Mesa, userId: string): boolean {
  return mesa.hostId === userId || mesa.players.includes(userId);
}

/**
 * Gestiona las solicitudes en vivo para pasar posits o archivos entre
 * jugadores sentados en la misma mesa.
 */
export class TransferenciaService {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly archivos: ArchivoService,
    private readonly logger: Logger,
    private readonly transferencias: TransferenciaRepository = new MemoryTransferenciaRepository()
  ) { }

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
    } else if (entrada.tipo === "objeto") {
      const nombre = String(entrada.objeto?.nombre ?? "").trim().slice(0, 60);
      if (!nombre) throw errors.invalidRequest();
      const descripcion = String(entrada.objeto?.descripcion ?? "").slice(0, 1000);
      const cantidadBruta =
        typeof entrada.objeto?.cantidad === "number" && Number.isFinite(entrada.objeto.cantidad)
          ? Math.trunc(entrada.objeto.cantidad)
          : 1;
      const cantidad = Math.max(1, Math.min(9999, cantidadBruta));
      const emoji =
        typeof entrada.objeto?.emoji === "string" && entrada.objeto.emoji.trim()
          ? entrada.objeto.emoji.trim().slice(0, 16)
          : undefined;
      const idOrigen =
        typeof entrada.objeto?.idOrigen === "string" && entrada.objeto.idOrigen.trim()
          ? entrada.objeto.idOrigen.trim().slice(0, 80)
          : undefined;
      let archivoId: string | undefined;
      let archivoNombre: string | undefined;
      if (typeof entrada.objeto?.archivoId === "string" && entrada.objeto.archivoId.trim()) {
        const archivo = await this.archivos.obtenerMetadatos(emisor, entrada.objeto.archivoId);
        archivoId = archivo.id;
        archivoNombre = archivo.nombre;
      }
      transferencia = {
        id,
        mesaId,
        emisorId: emisor.id,
        emisorNombre,
        receptorId: entrada.receptorId,
        tipo: "objeto",
        objeto: {
          ...(idOrigen ? { idOrigen } : {}),
          nombre,
          descripcion,
          cantidad,
          ...(emoji ? { emoji } : {}),
          ...(archivoId ? { archivoId } : {}),
          ...(archivoNombre ? { archivoNombre } : {})
        },
        createdAt
      };
    } else {
      throw errors.invalidRequest();
    }

    await this.transferencias.create(transferencia);
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
      if (actor.role === "ADMIN") {
        return [];
      }
      throw errors.mesaForbidden();
    }

    return this.transferencias.listPendientes(mesaId, actor.id);
  }

  async aceptar(
    actor: User,
    mesaId: string,
    transferenciaId: string
  ): Promise<ResultadoAceptacion> {
    const transferencia = await this.transferencias.findById(transferenciaId);
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
        actor,
        mesaId
      );
      await this.transferencias.deleteById(transferenciaId);
      this.logger.info("Transferencia de archivo aceptada", {
        transferenciaId,
        mesaId,
        receptorId: actor.id,
        archivoCopiaId: archivo.id
      });
      return { transferencia, tipo: "archivo", archivo };
    }

    if (transferencia.tipo === "objeto") {
      let objetoFinal = { ...transferencia.objeto };
      if (transferencia.objeto.archivoId) {
        try {
          const archivo = await this.archivos.clonarPara(
            transferencia.emisorId,
            transferencia.objeto.archivoId,
            actor,
            mesaId
          );
          objetoFinal = {
            ...objetoFinal,
            archivoId: archivo.id,
            archivoNombre: archivo.nombre
          };
        } catch {
          // Si el archivo origen ya no existiera, conserva los datos básicos del objeto.
        }
      }
      await this.transferencias.deleteById(transferenciaId);
      this.logger.info("Transferencia de objeto aceptada", {
        transferenciaId,
        mesaId,
        receptorId: actor.id,
        nombre: objetoFinal.nombre
      });
      return { transferencia, tipo: "objeto", objeto: objetoFinal };
    }

    await this.transferencias.deleteById(transferenciaId);
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
    const transferencia = await this.transferencias.findById(transferenciaId);
    if (!transferencia || transferencia.mesaId !== mesaId) {
      throw errors.transferenciaNotFound();
    }

    if (transferencia.receptorId !== actor.id) {
      throw errors.mesaForbidden();
    }

    await this.transferencias.deleteById(transferenciaId);
    this.logger.info("Transferencia rechazada", {
      transferenciaId,
      mesaId,
      receptorId: actor.id
    });

    return transferencia;
  }
}
