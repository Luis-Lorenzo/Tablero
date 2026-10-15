import { AwsClient } from "aws4fetch";
import type { R2Config } from "./config.js";

/**
 * Almacén de objetos (Cloudflare R2, compatible con S3). Guarda los bytes de
 * cada archivo bajo una clave única; los metadatos viven en la base de datos.
 */
export interface AlmacenArchivos {
  guardar(clave: string, datos: Uint8Array, tipo: string): Promise<void>;
  leer(clave: string): Promise<Uint8Array | undefined>;
  borrar(clave: string): Promise<void>;
}

/** Implementación en memoria: solo para desarrollo y pruebas. */
export class MemoryAlmacen implements AlmacenArchivos {
  private readonly objetos = new Map<string, Uint8Array>();

  async guardar(clave: string, datos: Uint8Array): Promise<void> {
    this.objetos.set(clave, Uint8Array.from(datos));
  }

  async leer(clave: string): Promise<Uint8Array | undefined> {
    const datos = this.objetos.get(clave);
    return datos ? Uint8Array.from(datos) : undefined;
  }

  async borrar(clave: string): Promise<void> {
    this.objetos.delete(clave);
  }
}

/** Implementación real contra un bucket de Cloudflare R2. */
export class R2Almacen implements AlmacenArchivos {
  private readonly cliente: AwsClient;
  private readonly base: string;

  constructor(private readonly config: R2Config) {
    this.cliente = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto"
    });

    this.base = `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}`;
  }

  private url(clave: string): string {
    return `${this.base}/${clave}`;
  }

  async guardar(clave: string, datos: Uint8Array, tipo: string): Promise<void> {
    const respuesta = await this.cliente.fetch(this.url(clave), {
      method: "PUT",
      body: aBuffer(datos),
      headers: { "content-type": tipo }
    });

    if (!respuesta.ok) {
      throw new Error(`R2_PUT_${respuesta.status}`);
    }
  }

  async leer(clave: string): Promise<Uint8Array | undefined> {
    const respuesta = await this.cliente.fetch(this.url(clave), {
      method: "GET"
    });

    if (respuesta.status === 404) {
      return undefined;
    }

    if (!respuesta.ok) {
      throw new Error(`R2_GET_${respuesta.status}`);
    }

    return new Uint8Array(await respuesta.arrayBuffer());
  }

  async borrar(clave: string): Promise<void> {
    const respuesta = await this.cliente.fetch(this.url(clave), {
      method: "DELETE"
    });

    if (!respuesta.ok && respuesta.status !== 404) {
      throw new Error(`R2_DELETE_${respuesta.status}`);
    }
  }
}

/**
 * Copia los bytes a un `ArrayBuffer` propio. Evita que el cuerpo de `fetch`
 * arrastre un `SharedArrayBuffer` (que no es válido como `BodyInit`).
 */
function aBuffer(datos: Uint8Array): ArrayBuffer {
  const copia = new ArrayBuffer(datos.byteLength);
  new Uint8Array(copia).set(datos);
  return copia;
}
