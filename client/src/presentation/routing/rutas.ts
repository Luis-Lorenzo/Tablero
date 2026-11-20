export type FaseSala = "sala" | "pizarra" | "mapa" | "archivador" | "personaje";

export type VistaPizarra = "pizarra" | "escena";

export type RutaApp =
  | { view: "recepcion" }
  | { view: "cuenta" }
  | { view: "moderar" }
  | { view: "verificar-correo" }
  | { view: "gestion"; mesaId: string }
  | { view: "sala"; mesaId: string; fase: FaseSala; vistaPizarra?: VistaPizarra }
  | { view: "desconocida" };

export type RutaNavegable = Exclude<RutaApp, { view: "desconocida" }>;

function normalizarPathname(pathname: string): string {
  const sinQuery = pathname.split(/[?#]/, 1)[0] ?? "";
  const recortado = sinQuery.trim();
  if (!recortado || recortado === "/") return "/";
  const sinBarrasFinales = recortado.replace(/\/+$/, "");
  return sinBarrasFinales || "/";
}

function decodificarMesaId(segmento: string): string | null {
  if (!segmento) return null;
  try {
    const decodificado = decodeURIComponent(segmento).trim();
    if (!decodificado || decodificado.includes("/")) return null;
    return decodificado;
  } catch {
    return null;
  }
}

export function parsearRuta(pathname: string): RutaApp {
  const limpio = normalizarPathname(pathname);

  if (limpio === "/") return { view: "recepcion" };
  if (limpio === "/cuenta") return { view: "cuenta" };
  if (limpio === "/admin") return { view: "moderar" };
  if (limpio === "/verificar-correo") return { view: "verificar-correo" };

  if (!limpio.startsWith("/")) {
    return { view: "desconocida" };
  }

  const segmentos = limpio.slice(1).split("/");
  if (segmentos.some(segmento => segmento.length === 0)) {
    return { view: "desconocida" };
  }

  if (segmentos[0] === "mesa") {
    const mesaId = segmentos[1] ? decodificarMesaId(segmentos[1]) : null;
    if (!mesaId) return { view: "desconocida" };

    if (segmentos.length === 2) {
      return { view: "gestion", mesaId };
    }

    if (segmentos.length === 3 && segmentos[2] === "sala") {
      return { view: "sala", mesaId, fase: "sala" };
    }

    if (segmentos.length === 4 && segmentos[2] === "sala") {
      const subvista = segmentos[3];
      if (subvista === "pizarra") {
        return {
          view: "sala",
          mesaId,
          fase: "pizarra",
          vistaPizarra: "pizarra"
        };
      }
      if (subvista === "escena") {
        return {
          view: "sala",
          mesaId,
          fase: "pizarra",
          vistaPizarra: "escena"
        };
      }
      if (subvista === "mapa") {
        return { view: "sala", mesaId, fase: "mapa" };
      }
      if (subvista === "archivador") {
        return { view: "sala", mesaId, fase: "archivador" };
      }
      if (subvista === "pj" || subvista === "personaje") {
        return { view: "sala", mesaId, fase: "personaje" };
      }
    }
  }

  return { view: "desconocida" };
}

function queryConservada(search?: string): string {
  if (!search) return "";
  const params = new URLSearchParams(search);
  return params.get("ajuste") === "1" ? "?ajuste=1" : "";
}

export function construirRuta(ruta: RutaNavegable, search?: string): string {
  let pathname: string;

  switch (ruta.view) {
    case "recepcion":
      pathname = "/";
      break;
    case "cuenta":
      pathname = "/cuenta";
      break;
    case "moderar":
      pathname = "/admin";
      break;
    case "verificar-correo":
      pathname = "/verificar-correo";
      break;
    case "gestion":
      pathname = `/mesa/${encodeURIComponent(ruta.mesaId)}`;
      break;
    case "sala": {
      const base = `/mesa/${encodeURIComponent(ruta.mesaId)}/sala`;
      switch (ruta.fase) {
        case "sala":
          pathname = base;
          break;
        case "pizarra":
          pathname =
            ruta.vistaPizarra === "escena" ? `${base}/escena` : `${base}/pizarra`;
          break;
        case "mapa":
          pathname = `${base}/mapa`;
          break;
        case "archivador":
          pathname = `${base}/archivador`;
          break;
        case "personaje":
          pathname = `${base}/pj`;
          break;
      }
      break;
    }
  }

  return `${pathname}${queryConservada(search)}`;
}

export function esRutaPermitidaParaUsuario(
  ruta: RutaApp,
  role?: string | null
): boolean {
  if (ruta.view === "desconocida") return false;
  if (ruta.view === "moderar") return role === "ADMIN";
  return true;
}
