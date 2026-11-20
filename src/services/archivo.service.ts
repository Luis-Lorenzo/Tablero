import { randomUUID } from "node:crypto";
import type { AlmacenArchivos } from "../lib/almacen.js";
import {
  esUuid,
  extensionDe,
  limpiarNombre,
  normalizarTipo,
  resolverTipoArchivo,
  tipoPermitido
} from "../lib/archivos.js";
import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type {
  Archivo,
  ArchivoRepository
} from "../repositories/archivo.repository.js";
import type { MesaRepository } from "../repositories/mesa.repository.js";
import type { User } from "../repositories/user.repository.js";

export interface EntradaArchivo {
  nombre: string;
  tipo: string;
  datos: Uint8Array;
  mesaId?: string;
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
    private readonly maxBytes: number,
    private readonly mesas?: MesaRepository
  ) { }

  async subir(actor: User, entrada: EntradaArchivo): Promise<Archivo> {
    const tipo = resolverTipoArchivo(entrada.tipo, entrada.nombre);
    if (!tipoPermitido(tipo)) {
      throw errors.archivoTipoInvalido();
    }

    if (entrada.datos.length === 0) {
      throw errors.archivoVacio();
    }

    if (entrada.datos.length > this.maxBytes) {
      throw errors.archivoDemasiadoGrande();
    }

    let mesaId: string | null = null;
    if (entrada.mesaId) {
      if (!esUuid(entrada.mesaId)) {
        throw errors.mesaNotFound();
      }
      if (this.mesas) {
        const mesa = await this.mesas.findById(entrada.mesaId);
        if (!mesa) throw errors.mesaNotFound();
        const esMiembro =
          mesa.hostId === actor.id ||
          mesa.players.includes(actor.id) ||
          actor.role === "ADMIN";
        if (!esMiembro) throw errors.mesaForbidden();
      }
      mesaId = entrada.mesaId;
    }

    const id = randomUUID();
    const nombre = limpiarNombre(entrada.nombre);
    const clave = mesaId
      ? `archivos/${actor.id}/mesas/${mesaId}/${id}${extensionDe(tipo)}`
      : `archivos/${actor.id}/${id}${extensionDe(tipo)}`;

    await this.almacen.guardar(clave, entrada.datos, tipo);

    const ahora = new Date();
    const archivo: Archivo = {
      id,
      ownerId: actor.id,
      mesaId,
      nombre,
      clave,
      tipo,
      tamano: entrada.datos.length,
      createdAt: ahora,
      updatedAt: ahora
    };

    await this.archivos.save(archivo);

    this.logger.info("Archivo subido", {
      id,
      ownerId: actor.id,
      mesaId,
      tipo,
      tamano: archivo.tamano
    });

    return archivo;
  }

  /**
   * Actualiza los bytes de un archivo existente (PDF editado, texto/markdown,
   * etc.). Si la clave en R2 está compartida por referencia entre varios
   * usuarios (`countByClave > 1`), aplica copy-on-write generando una clave nueva
   * para no sobrescribir las copias ajenas.
   */
  async actualizar(
    actor: User,
    id: string,
    entrada: { datos: Uint8Array; tipo?: string }
  ): Promise<Archivo> {
    const archivo = await this.autorizado(actor, id);

    if (entrada.datos.length === 0) {
      throw errors.archivoVacio();
    }

    if (entrada.datos.length > this.maxBytes) {
      throw errors.archivoDemasiadoGrande();
    }

    const tipoCrudo = entrada.tipo ? normalizarTipo(entrada.tipo) : "";
    let tipoFinal = archivo.tipo;
    if (
      tipoCrudo &&
      tipoCrudo !== "application/octet-stream" &&
      tipoCrudo !== "application/vnd.ms-excel"
    ) {
      if (!tipoPermitido(tipoCrudo)) {
        throw errors.archivoTipoInvalido();
      }
      tipoFinal = tipoCrudo;
    }

    const referencias = await this.archivos.countByClave(archivo.clave);
    const copyOnWrite = referencias > 1;
    const claveFinal = copyOnWrite
      ? archivo.mesaId
        ? `archivos/${archivo.ownerId}/mesas/${archivo.mesaId}/${archivo.id}-${randomUUID()}${extensionDe(tipoFinal)}`
        : `archivos/${archivo.ownerId}/${archivo.id}-${randomUUID()}${extensionDe(tipoFinal)}`
      : archivo.clave;

    await this.almacen.guardar(claveFinal, entrada.datos, tipoFinal);

    const actualizado: Archivo = {
      ...archivo,
      clave: claveFinal,
      tipo: tipoFinal,
      tamano: entrada.datos.length,
      updatedAt: new Date()
    };

    await this.archivos.save(actualizado);

    this.logger.info("Archivo actualizado", {
      id,
      ownerId: actor.id,
      mesaId: actualizado.mesaId ?? null,
      copyOnWrite,
      tamano: actualizado.tamano
    });

    return actualizado;
  }

  async listar(actor: User, mesaId?: string): Promise<Archivo[]> {
    const mesaFiltro = mesaId && esUuid(mesaId) ? mesaId : undefined;
    return this.archivos.listByOwner(actor.id, mesaFiltro);
  }

  async obtener(actor: User, id: string): Promise<ArchivoConDatos> {
    const archivo = await this.autorizadoLectura(actor, id);
    const datos = await this.almacen.leer(archivo.clave);

    if (!datos) {
      throw errors.archivoNotFound();
    }

    return { archivo, datos };
  }

  async obtenerStream(
    actor: User,
    id: string,
    range?: string
  ): Promise<
    | {
        archivo: Archivo;
        stream: ReadableStream<Uint8Array>;
        status?: number;
        contentRange?: string;
        contentLength?: number;
      }
    | { archivo: Archivo; datos: Uint8Array }
  > {
    const archivo = await this.autorizadoLectura(actor, id);

    if (this.almacen.leerStream) {
      const resultado = await this.almacen.leerStream(archivo.clave, range);
      if (!resultado) {
        throw errors.archivoNotFound();
      }
      return {
        archivo,
        stream: resultado.stream,
        ...(resultado.status !== undefined ? { status: resultado.status } : {}),
        ...(resultado.contentRange ? { contentRange: resultado.contentRange } : {}),
        ...(resultado.contentLength !== undefined
          ? { contentLength: resultado.contentLength }
          : {})
      };
    }

    const datos = await this.almacen.leer(archivo.clave);
    if (!datos) {
      throw errors.archivoNotFound();
    }
    return { archivo, datos };
  }

  async obtenerMetadatos(actor: User, id: string): Promise<Archivo> {
    return this.autorizado(actor, id);
  }

  /**
   * Comparte un archivo existente del emisor con el receptor creando una nueva
   * entrada de metadatos que apunta a la misma clave en R2 (sin duplicar bytes).
   */
  async clonarPara(
    emisorId: string,
    archivoId: string,
    receptor: User,
    mesaId?: string
  ): Promise<Archivo> {
    if (!esUuid(archivoId)) {
      throw errors.archivoNotFound();
    }

    const origen = await this.archivos.findById(archivoId);
    if (!origen || origen.ownerId !== emisorId) {
      throw errors.archivoNotFound();
    }

    const clon: Archivo = {
      id: randomUUID(),
      ownerId: receptor.id,
      mesaId: mesaId ?? null,
      nombre: origen.nombre,
      clave: origen.clave,
      tipo: origen.tipo,
      tamano: origen.tamano,
      createdAt: new Date()
    };

    await this.archivos.save(clon);

    this.logger.info("Archivo compartido por referencia", {
      origenId: origen.id,
      nuevoId: clon.id,
      ownerId: receptor.id,
      mesaId: clon.mesaId
    });

    return clon;
  }

  async borrar(actor: User, id: string): Promise<void> {
    const archivo = await this.autorizado(actor, id);

    await this.archivos.delete(id);
    const restantes = await this.archivos.countByClave(archivo.clave);
    if (restantes === 0) {
      await this.almacen.borrar(archivo.clave);
    }

    this.logger.info("Archivo borrado", {
      id,
      ownerId: actor.id,
      objetoBorrado: restantes === 0
    });
  }

  /**
   * Elimina todos los archivos vinculados a una mesa (sin tocar los archivos
   * personales de recepción de cada cuenta) y borra de Cloudflare R2 las claves
   * que ya no queden referenciadas por ningún otro registro.
   */
  async borrarPorMesa(mesaId: string): Promise<void> {
    const borrados = this.archivos.deleteByMesa
      ? await this.archivos.deleteByMesa(mesaId)
      : await (async () => {
          const lista = this.archivos.listByMesa
            ? await this.archivos.listByMesa(mesaId)
            : [];
          for (const item of lista) {
            await this.archivos.delete(item.id);
          }
          return lista;
        })();

    if (borrados.length === 0) return;

    const clavesUnicas = new Set(borrados.map(a => a.clave));
    let objetosR2Borrados = 0;

    for (const clave of clavesUnicas) {
      const restantes = await this.archivos.countByClave(clave);
      if (restantes === 0) {
        try {
          await this.almacen.borrar(clave);
          objetosR2Borrados += 1;
        } catch (error) {
          this.logger.warn("No se pudo borrar objeto R2 al cerrar mesa", {
            mesaId,
            clave,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    this.logger.info("Archivos de mesa limpiados", {
      mesaId,
      registrosBorrados: borrados.length,
      objetosR2Borrados
    });
  }

  private async autorizadoLectura(actor: User, id: string): Promise<Archivo> {
    if (!esUuid(id)) {
      throw errors.archivoNotFound();
    }

    const archivo = await this.archivos.findById(id);

    if (!archivo) {
      throw errors.archivoNotFound();
    }

    if (archivo.ownerId === actor.id || actor.role === "ADMIN") {
      return archivo;
    }

    if (this.mesas) {
      const lista = await this.mesas.list();
      const compartidoEnMesa = lista.some(mesa => {
        const actorEnMesa =
          mesa.hostId === actor.id || mesa.players.includes(actor.id);
        if (!actorEnMesa) return false;

        const duenoEnMesa =
          mesa.hostId === archivo.ownerId ||
          mesa.players.includes(archivo.ownerId);
        const usadoComoImagen =
          mesa.imagenEscena?.id === id || mesa.imagenProyectada?.id === id;
        const usadoComoMusica = Boolean(
          mesa.musicaAmbiente?.pistas.some(p => p.archivoId === id)
        );
        return duenoEnMesa || usadoComoImagen || usadoComoMusica;
      });

      if (compartidoEnMesa) {
        return archivo;
      }
    }

    throw errors.forbidden();
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
