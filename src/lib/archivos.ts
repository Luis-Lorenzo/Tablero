/**
 * Reglas compartidas por el servicio de archivos: qué tipos se aceptan, cómo
 * se generan las claves en el almacén y cómo se limpian los nombres.
 */

/** Tipo MIME del Word moderno (.docx). */
export const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Tipos MIME aceptados y la extensión con la que se guardan. */
const TIPOS_PERMITIDOS = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  [TIPO_DOCX, ".docx"],
  ["text/plain", ".txt"],
  ["text/markdown", ".md"],
  ["application/json", ".json"],
  ["text/csv", ".csv"],
  ["audio/mpeg", ".mp3"],
  ["audio/ogg", ".ogg"],
  ["audio/wav", ".wav"],
  ["audio/webm", ".webm"],
  ["audio/mp4", ".mp4"]
]);

/** Normaliza variantes no estándar que envían algunos navegadores. */
export function normalizarTipo(tipo: string): string {
  const base = tipo.split(";")[0].trim().toLowerCase();

  if (base === "image/jpg" || base === "image/pjpeg") {
    return "image/jpeg";
  }

  if (base === "audio/mp3" || base === "audio/x-mp3") {
    return "audio/mpeg";
  }

  if (base === "audio/x-wav") {
    return "audio/wav";
  }

  if (base === "text/x-markdown") {
    return "text/markdown";
  }

  if (base === "application/csv" || base === "text/comma-separated-values") {
    return "text/csv";
  }

  if (base === "text/json") {
    return "application/json";
  }

  return base;
}

const EXTENSIONES_A_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".docx": TIPO_DOCX,
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv"
};

/**
 * Normaliza el tipo MIME recibido y, si llega genérico (`application/octet-stream`
 * o vacío, habitual en navegadores para `.md`/`.json`/`.csv`), lo deduce por extensión.
 */
export function resolverTipoArchivo(tipo: string, nombre?: string): string {
  const normalizado = normalizarTipo(tipo);
  if (
    normalizado &&
    normalizado !== "application/octet-stream" &&
    normalizado !== "application/vnd.ms-excel"
  ) {
    return normalizado;
  }

  if (nombre) {
    const lower = nombre.trim().toLowerCase();
    const punto = lower.lastIndexOf(".");
    if (punto !== -1) {
      const inferido = EXTENSIONES_A_MIME[lower.slice(punto)];
      if (inferido) return inferido;
    }
  }

  return normalizado;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comprueba el formato de un identificador antes de tocar la base de datos. */
export function esUuid(valor: string): boolean {
  return UUID.test(valor);
}

export function tipoPermitido(tipo: string): boolean {
  return TIPOS_PERMITIDOS.has(normalizarTipo(tipo));
}

export function extensionDe(tipo: string): string {
  return TIPOS_PERMITIDOS.get(normalizarTipo(tipo)) ?? "";
}

/**
 * Cómo puede mostrarse un archivo dentro de la página:
 *  - `pdf`     → dentro de un marco.
 *  - `imagen`  → como imagen.
 *  - `docx`    → Word moderno, convertido en el navegador.
 *  - `texto`   → texto plano.
 *  - `audio`   → pista de audio reproducible en el navegador.
 *  - `ninguna` → solo se puede descargar.
 */
export type VistaArchivo = "pdf" | "imagen" | "docx" | "texto" | "audio" | "ninguna";

export function vistaDe(tipo: string): VistaArchivo {
  const base = normalizarTipo(tipo);

  if (base === "application/pdf") return "pdf";
  if (base.startsWith("image/")) return "imagen";
  if (base === TIPO_DOCX) return "docx";
  if (
    base === "text/plain" ||
    base === "text/markdown" ||
    base === "application/json" ||
    base === "text/csv"
  ) {
    return "texto";
  }
  if (base.startsWith("audio/")) return "audio";
  return "ninguna";
}

/**
 * Deja el nombre en algo seguro para guardar y volver a mostrar: sin rutas,
 * sin caracteres de control y con una longitud razonable.
 */
export function limpiarNombre(nombre: string): string {
  const base = nombre.split(/[/\\]/).pop() ?? "";
  const limpio = base
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/["<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (limpio.length === 0) {
    return "archivo";
  }

  return limpio.slice(0, 180);
}
