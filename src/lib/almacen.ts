import { AwsClient } from "aws4fetch";
import type { R2Config } from "./config.js";

export interface StreamLectura {
  stream: ReadableStream<Uint8Array>;
  status?: number;
  contentRange?: string;
  contentLength?: number;
}

/**
 * Almacén de objetos (Cloudflare R2, compatible con S3). Guarda los bytes de
 * cada archivo bajo una clave única; los metadatos viven en la base de datos.
 */
export interface AlmacenArchivos {
  guardar(clave: string, datos: Uint8Array, tipo: string): Promise<void>;
  leer(clave: string): Promise<Uint8Array | undefined>;
  leerStream?(clave: string, range?: string): Promise<StreamLectura | null>;
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

  async leerStream(clave: string, range?: string): Promise<StreamLectura | null> {
    const datos = this.objetos.get(clave);
    if (!datos) return null;

    const total = datos.byteLength;
    const match = range?.trim().match(/^bytes=(\d+)-(\d*)$/);
    if (match && total > 0) {
      const start = Number(match[1]);
      const rawEnd = match[2] ? Number(match[2]) : total - 1;
      const end = Math.min(rawEnd, total - 1);
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < total) {
        const slice = datos.slice(start, end + 1);
        return {
          stream: streamDeBytes(slice),
          status: 206,
          contentRange: `bytes ${start}-${end}/${total}`,
          contentLength: slice.byteLength
        };
      }
    }

    return {
      stream: streamDeBytes(Uint8Array.from(datos)),
      status: 200,
      contentLength: total
    };
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

  async leerStream(clave: string, range?: string): Promise<StreamLectura | null> {
    const headers: Record<string, string> = {};
    if (range) {
      headers.Range = range;
    }

    const respuesta = await this.cliente.fetch(this.url(clave), {
      method: "GET",
      ...(range ? { headers } : {})
    });

    if (respuesta.status === 404) {
      return null;
    }

    if (!respuesta.ok) {
      throw new Error(`R2_GET_${respuesta.status}`);
    }

    if (!respuesta.body) {
      return null;
    }

    const contentRange = respuesta.headers.get("content-range") ?? undefined;
    const rawLength = respuesta.headers.get("content-length");
    const parsedLength = rawLength !== null ? Number(rawLength) : NaN;
    const contentLength = Number.isFinite(parsedLength) ? parsedLength : undefined;

    return {
      stream: respuesta.body,
      status: respuesta.status,
      ...(contentRange ? { contentRange } : {}),
      ...(contentLength !== undefined ? { contentLength } : {})
    };
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

function streamDeBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.byteLength > 0) {
        controller.enqueue(bytes);
      }
      controller.close();
    }
  });
}
