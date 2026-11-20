import { ApiError, http } from "./client";
import type { PublicArchivo } from "./types";

/**
 * Sube un archivo en binario: el cuerpo de la petición son los propios bytes y
 * el nombre viaja en `?nombre=`. No se usa `http.post` porque este envía JSON.
 */
async function subir(archivo: File, mesaId?: string): Promise<PublicArchivo> {
  let response: Response;
  const query = new URLSearchParams({ nombre: archivo.name });
  if (mesaId) {
    query.set("mesaId", mesaId);
  }

  try {
    response = await fetch(`/api/archivos?${query.toString()}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": archivo.type || "application/octet-stream"
      },
      body: archivo
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }

  if (response.status === 204) {
    return undefined as never;
  }

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : "UNKNOWN_ERROR";
    throw new ApiError(code, response.status);
  }

  return data as PublicArchivo;
}

async function actualizar(
  id: string,
  datos: Blob | Uint8Array | string,
  tipo = "application/octet-stream"
): Promise<PublicArchivo> {
  const cuerpo =
    datos instanceof Uint8Array
      ? new Blob([new Uint8Array(datos)], { type: tipo })
      : datos;

  let response: Response;
  try {
    response = await fetch(`/api/archivos/${encodeURIComponent(id)}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "content-type": tipo
      },
      body: cuerpo
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : "UNKNOWN_ERROR";
    throw new ApiError(code, response.status);
  }

  return data as PublicArchivo;
}

export const archivosApi = {
  /**
   * Archivos del usuario actual, los más recientes primero.
   * Sin `mesaId` devuelve solo los archivos personales (recepción); con `mesaId`
   * incluye además los subidos dentro de esa mesa.
   */
  listar: (mesaId?: string) =>
    http.get<PublicArchivo[]>(
      mesaId ? `/api/archivos?mesaId=${encodeURIComponent(mesaId)}` : "/api/archivos"
    ),

  subir,

  actualizar,

  borrar: (id: string) =>
    http.delete<void>(`/api/archivos/${encodeURIComponent(id)}`),

  /** URL para mostrar o descargar el archivo (requiere sesión). */
  url: (id: string, descarga = false, version?: string) => {
    const query = new URLSearchParams();
    if (descarga) query.set("descarga", "1");
    if (version) query.set("v", version);
    const qs = query.toString();
    return `/api/archivos/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  }
};
