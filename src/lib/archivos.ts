/**
 * Reglas compartidas por el servicio de archivos: qué tipos se aceptan, cómo
 * se generan las claves en el almacén y cómo se limpian los nombres.
 */

/** Tipos MIME aceptados y la extensión con la que se guardan. */
const TIPOS_PERMITIDOS = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["text/plain", ".txt"]
]);

/** Normaliza variantes no estándar que envían algunos navegadores. */
export function normalizarTipo(tipo: string): string {
  const base = tipo.split(";")[0].trim().toLowerCase();

  if (base === "image/jpg" || base === "image/pjpeg") {
    return "image/jpeg";
  }

  return base;
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

/** ¿Es un tipo que el navegador puede mostrar dentro de la página? */
export function tipoVisible(tipo: string): boolean {
  const base = normalizarTipo(tipo);
  return base === "application/pdf" || base.startsWith("image/");
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
