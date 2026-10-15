import { ApiError, http } from "./client";
import type { PublicArchivo } from "./types";

/**
 * Sube un archivo en binario: el cuerpo de la petición son los propios bytes y
 * el nombre viaja en `?nombre=`. No se usa `http.post` porque este envía JSON.
 */
async function subir(archivo: File): Promise<PublicArchivo> {
  let response: Response;

  try {
    response = await fetch(
      `/api/archivos?nombre=${encodeURIComponent(archivo.name)}`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": archivo.type || "application/octet-stream"
        },
        body: archivo
      }
    );
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
  /** Archivos del usuario actual, los más recientes primero. */
  listar: () => http.get<PublicArchivo[]>("/api/archivos"),

  subir,

  borrar: (id: string) =>
    http.delete<void>(`/api/archivos/${encodeURIComponent(id)}`),

  /** URL para mostrar o descargar el archivo (requiere sesión). */
  url: (id: string, descarga = false) =>
    `/api/archivos/${encodeURIComponent(id)}${descarga ? "?descarga=1" : ""}`
};
