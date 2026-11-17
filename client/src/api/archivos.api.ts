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

  borrar: (id: string) =>
    http.delete<void>(`/api/archivos/${encodeURIComponent(id)}`),

  /** URL para mostrar o descargar el archivo (requiere sesión). */
  url: (id: string, descarga = false) =>
    `/api/archivos/${encodeURIComponent(id)}${descarga ? "?descarga=1" : ""}`
};
