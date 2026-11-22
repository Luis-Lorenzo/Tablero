import type { PublicArchivo } from "../api/types";
import type { ElementoMesa, SolicitudTransferencia } from "./tipos";

const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Posición en la esquina inferior derecha de la mesa (`x: 80–86%`, `y: 74–84%`)
 * con ligero escalonamiento si el jugador acepta varios elementos seguidos.
 */
export function calcularPosicionRecepcion(indice: number): { x: number; y: number } {
  const paso = Math.max(0, indice) % 5;
  return {
    x: Number((85 - paso * 1.2).toFixed(2)),
    y: Number((82 - paso * 1.8).toFixed(2))
  };
}

/** Etiqueta breve del tipo de archivo para el diálogo de confirmación. */
export function tipoCortoArchivo(mime: string, nombre = ""): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";

  if (base === "application/pdf" || ext === "pdf") return "pdf";
  if (base === "text/plain" || ext === "txt") return "txt";
  if (base === "text/markdown" || ext === "md") return "md";
  if (base === "application/json" || ext === "json") return "json";
  if (base === "text/csv" || ext === "csv") return "csv";
  if (base === TIPO_DOCX || ext === "docx" || ext === "doc") return "doc";
  if (base.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return "img";
  }
  return "archivo";
}

/** Texto exacto del diálogo de confirmación al recibir una transferencia. */
export function mensajeSolicitudTransferencia(
  solicitud: SolicitudTransferencia
): string {
  if (solicitud.tipo === "posit") {
    return `${solicitud.emisorNombre} quiere pasarte nota`;
  }

  if (solicitud.tipo === "objeto") {
    const obj = solicitud.objeto;
    const cant = obj && obj.cantidad > 1 ? ` x${obj.cantidad}` : "";
    return `${solicitud.emisorNombre} quiere pasarte ${obj?.nombre ?? "un objeto"}${cant}`;
  }

  const nombre = solicitud.nombreArchivo ?? "archivo";
  const corto = tipoCortoArchivo(solicitud.mimeArchivo ?? "", nombre);
  return `${solicitud.emisorNombre} quiere pasarte ${nombre} (${corto})`;
}

export function nuevoIdElemento(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `elem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Archivos de ejemplo para probar el flujo en `?preview=1` sin backend. */
export const ARCHIVOS_PREVIEW_INICIALES: Array<
  PublicArchivo & { contenidoLocal: string }
> = [
  {
    id: "preview-txt-1",
    nombre: "pista-posada.txt",
    tipo: "text/plain",
    vista: "texto",
    tamano: 96,
    createdAt: "2026-11-14T12:00:00.000Z",
    contenidoLocal:
      "El posadero guarda la llave de la cripta bajo el barril de hidromiel."
  },
  {
    id: "preview-img-1",
    nombre: "sello-runico.png",
    tipo: "image/png",
    vista: "imagen",
    tamano: 420,
    createdAt: "2026-11-14T12:05:00.000Z",
    contenidoLocal:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="18" fill="#1b1625"/><circle cx="90" cy="90" r="60" fill="none" stroke="#e8c56a" stroke-width="4"/><polygon points="90,34 138,120 42,120" fill="none" stroke="#96fbc7" stroke-width="3"/><circle cx="90" cy="90" r="14" fill="#e8c56a" opacity="0.85"/></svg>`
      )
  }
];

export function crearElementoDesdeArchivo(
  archivo: PublicArchivo & { contenidoLocal?: string },
  posicion: { x: number; y: number },
  remitente?: string
): ElementoMesa {
  return {
    id: nuevoIdElemento(),
    tipo: "archivo",
    archivoId: archivo.id,
    nombre: archivo.nombre,
    mime: archivo.tipo,
    vista: archivo.vista,
    tamano: archivo.tamano,
    x: posicion.x,
    y: posicion.y,
    remitente,
    contenidoLocal: archivo.contenidoLocal
  };
}

/**
 * Normaliza el texto introducido en el campo de cantidad de monedas a enviar.
 * Permite dejar el campo vacío mientras el usuario borra el valor inicial
 * para escribir cualquier cantidad (menor que 10 o que no empiece por "1").
 */
export function sanitizarEntradaCantidadMonedas(valor: string): string {
  const limpio = valor.trim();
  if (limpio === "") return "";
  if (/^\d+$/.test(limpio)) {
    return limpio.replace(/^0+(?=\d)/, "");
  }
  const parsed = Number(limpio);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return String(Math.trunc(parsed));
}

/** Convierte el texto del campo de envío de monedas a un entero positivo (0 si está vacío o es inválido). */
export function parsearCantidadMonedas(valor: string): number {
  const limpio = valor.trim();
  if (!limpio) return 0;
  const n = Math.trunc(Number(limpio));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Resuelve la cantidad real de monedas a transferir acotada al saldo disponible (0 si no se puede enviar). */
export function resolverCantidadEnvioMonedas(
  valor: string,
  saldoActual: number
): number {
  const saldo = Number.isFinite(saldoActual)
    ? Math.max(0, Math.trunc(saldoActual))
    : 0;
  if (saldo <= 0) return 0;
  const cantidad = parsearCantidadMonedas(valor);
  if (cantidad <= 0) return 0;
  return Math.min(saldo, cantidad);
}

/** Incrementa la cantidad escrita mediante los botones rápidos (+1, +5, +10), acotando al saldo. */
export function incrementarCantidadMonedas(
  valorActual: string,
  incremento: number,
  saldoActual: number
): string {
  const actual = parsearCantidadMonedas(valorActual);
  const max = Math.max(
    1,
    Number.isFinite(saldoActual) ? Math.trunc(saldoActual) : 1
  );
  const siguiente = Math.min(max, Math.max(1, actual + Math.trunc(incremento)));
  return String(siguiente);
}
