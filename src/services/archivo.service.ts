import { randomUUID } from "node:crypto";
import type { AlmacenArchivos } from "../lib/almacen.js";
import {
  esUuid,
  extensionDe,
  limpiarNombre,
  normalizarTipo,
  tipoPermitido
} from "../lib/archivos.js";
import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type {
  Archivo,
  ArchivoRepository
} from "../repositories/archivo.repository.js";
import type { User } from "../repositories/user.repository.js";

export interface EntradaArchivo {
  nombre: string;
  tipo: string;
  datos: Uint8Array;
}

export interface ArchivoConDatos {
  archivo: Archivo;
  datos: Uint8Array;
}

/**
 * Archivos personales de cada usuario: se suben al almacén de objetos y sus
 * metadatos se guardan en la base de datos. Cada usuario solo ve los suyos
 * (un administrador puede ver y borrar los de cualquiera).
 */
export class ArchivoService {
  constructor(
    private readonly archivos: ArchivoRepository,
    private readonly almacen: AlmacenArchivos,
    private readonly logger: Logger,
    private readonly maxBytes: number
  ) {}

  async subir(actor: User, entrada: EntradaArchivo): Promise<Archivo> {
    if (!tipoPermitido(entrada.tipo)) {
      throw errors.archivoTipoInvalido();
    }

    if (entrada.datos.length === 0) {
      throw errors.archivoVacio();
    }

    if (entrada.datos.length > this.maxBytes) {
      throw errors.archivoDemasiadoGrande();
    }

    const id = randomUUID();
    const tipo = normalizarTipo(entrada.tipo);
    const nombre = limpiarNombre(entrada.nombre);
    const clave = `archivos/${actor.id}/${id}${extensionDe(tipo)}`;

    await this.almacen.guardar(clave, entrada.datos, tipo);

    const archivo: Archivo = {
      id,
      ownerId: actor.id,
      nombre,
      clave,
      tipo,
      tamano: entrada.datos.length,
      createdAt: new Date()
    };

    await this.archivos.save(archivo);

    this.logger.info("Archivo subido", {
      id,
      ownerId: actor.id,
      tipo,
      tamano: archivo.tamano
    });

    return archivo;
  }

  async listar(actor: User): Promise<Archivo[]> {
    return this.archivos.listByOwner(actor.id);
  }

  async obtener(actor: User, id: string): Promise<ArchivoConDatos> {
    const archivo = await this.autorizado(actor, id);
    const datos = await this.almacen.leer(archivo.clave);

    if (!datos) {
      throw errors.archivoNotFound();
    }

    return { archivo, datos };
  }

  async borrar(actor: User, id: string): Promise<void> {
    const archivo = await this.autorizado(actor, id);

    await this.almacen.borrar(archivo.clave);
    await this.archivos.delete(id);

    this.logger.info("Archivo borrado", { id, ownerId: actor.id });
  }

  private async autorizado(actor: User, id: string): Promise<Archivo> {
    if (!esUuid(id)) {
      throw errors.archivoNotFound();
    }

    const archivo = await this.archivos.findById(id);

    if (!archivo) {
      throw errors.archivoNotFound();
    }

    if (archivo.ownerId !== actor.id && actor.role !== "ADMIN") {
      throw errors.forbidden();
    }

    return archivo;
  }
}
