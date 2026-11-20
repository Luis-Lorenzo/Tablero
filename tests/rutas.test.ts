import { describe, expect, it } from "vitest";
import {
  construirRuta,
  esRutaPermitidaParaUsuario,
  parsearRuta
} from "../client/src/presentation/routing/rutas.js";

describe("rutas SPA (History API)", () => {
  describe("parsearRuta", () => {
    it("reconoce las rutas principales y normaliza barras finales", () => {
      expect(parsearRuta("/")).toEqual({ view: "recepcion" });
      expect(parsearRuta("")).toEqual({ view: "recepcion" });
      expect(parsearRuta("///")).toEqual({ view: "recepcion" });
      expect(parsearRuta("/cuenta")).toEqual({ view: "cuenta" });
      expect(parsearRuta("/cuenta/")).toEqual({ view: "cuenta" });
      expect(parsearRuta("/admin")).toEqual({ view: "moderar" });
      expect(parsearRuta("/admin/")).toEqual({ view: "moderar" });
      expect(parsearRuta("/verificar-correo")).toEqual({ view: "verificar-correo" });
      expect(parsearRuta("/verificar-correo/")).toEqual({ view: "verificar-correo" });
    });

    it("reconoce gestión de mesa y todas las subvistas de sala", () => {
      expect(parsearRuta("/mesa/mesa-1")).toEqual({
        view: "gestion",
        mesaId: "mesa-1"
      });
      expect(parsearRuta("/mesa/mesa-1/")).toEqual({
        view: "gestion",
        mesaId: "mesa-1"
      });
      expect(parsearRuta("/mesa/mesa-1/sala")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "sala"
      });
      expect(parsearRuta("/mesa/mesa-1/sala/")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "sala"
      });
      expect(parsearRuta("/mesa/mesa-1/sala/pizarra")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "pizarra",
        vistaPizarra: "pizarra"
      });
      expect(parsearRuta("/mesa/mesa-1/sala/escena")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "pizarra",
        vistaPizarra: "escena"
      });
      expect(parsearRuta("/mesa/mesa-1/sala/mapa")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "mapa"
      });
      expect(parsearRuta("/mesa/mesa-1/sala/archivador")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "archivador"
      });
      expect(parsearRuta("/mesa/mesa-1/sala/pj")).toEqual({
        view: "sala",
        mesaId: "mesa-1",
        fase: "personaje"
      });
    });

    it("acepta /personaje como alias de /pj y lo canonicaliza al construir", () => {
      const parsed = parsearRuta("/mesa/abc-42/sala/personaje");
      expect(parsed).toEqual({
        view: "sala",
        mesaId: "abc-42",
        fase: "personaje"
      });
      if (parsed.view !== "desconocida") {
        expect(construirRuta(parsed)).toBe("/mesa/abc-42/sala/pj");
      }
    });

    it("decodifica ids codificados en URL y rechaza rutas desconocidas o malformadas", () => {
      expect(parsearRuta("/mesa/id%20con%20espacio/sala")).toEqual({
        view: "sala",
        mesaId: "id con espacio",
        fase: "sala"
      });

      const desconocidas = [
        "/no-existe",
        "/ADMIN",
        "/admin/usuarios",
        "/cuenta/perfil",
        "/mesa",
        "/mesa/",
        "/mesa//sala",
        "/mesa/abc/desconocida",
        "/mesa/abc/sala/desconocida",
        "/mesa/abc/sala/mapa/extra",
        "/mesa/%E0%A4%A/sala",
        "/mesa/a%2Fb/sala"
      ];
      for (const path of desconocidas) {
        expect(parsearRuta(path)).toEqual({ view: "desconocida" });
      }
    });
  });

  describe("construirRuta", () => {
    it("genera rutas limpias para todas las vistas y subvistas", () => {
      expect(construirRuta({ view: "recepcion" })).toBe("/");
      expect(construirRuta({ view: "cuenta" })).toBe("/cuenta");
      expect(construirRuta({ view: "moderar" })).toBe("/admin");
      expect(construirRuta({ view: "verificar-correo" })).toBe("/verificar-correo");
      expect(construirRuta({ view: "gestion", mesaId: "m-9" })).toBe("/mesa/m-9");
      expect(construirRuta({ view: "sala", mesaId: "m-9", fase: "sala" })).toBe(
        "/mesa/m-9/sala"
      );
      expect(construirRuta({ view: "sala", mesaId: "m-9", fase: "pizarra" })).toBe(
        "/mesa/m-9/sala/pizarra"
      );
      expect(
        construirRuta({
          view: "sala",
          mesaId: "m-9",
          fase: "pizarra",
          vistaPizarra: "pizarra"
        })
      ).toBe("/mesa/m-9/sala/pizarra");
      expect(
        construirRuta({
          view: "sala",
          mesaId: "m-9",
          fase: "pizarra",
          vistaPizarra: "escena"
        })
      ).toBe("/mesa/m-9/sala/escena");
      expect(construirRuta({ view: "sala", mesaId: "m-9", fase: "mapa" })).toBe(
        "/mesa/m-9/sala/mapa"
      );
      expect(construirRuta({ view: "sala", mesaId: "m-9", fase: "archivador" })).toBe(
        "/mesa/m-9/sala/archivador"
      );
      expect(construirRuta({ view: "sala", mesaId: "m-9", fase: "personaje" })).toBe(
        "/mesa/m-9/sala/pj"
      );
    });

    it("preserva ?ajuste=1 y elimina otros parámetros de consulta obsoletos", () => {
      expect(
        construirRuta(
          { view: "sala", mesaId: "m-1", fase: "sala" },
          "?ajuste=1"
        )
      ).toBe("/mesa/m-1/sala?ajuste=1");
      expect(
        construirRuta(
          { view: "sala", mesaId: "m-1", fase: "pizarra", vistaPizarra: "escena" },
          "?token=viejo&ajuste=1&foo=bar"
        )
      ).toBe("/mesa/m-1/sala/escena?ajuste=1");
      expect(construirRuta({ view: "recepcion" }, "?ajuste=1")).toBe("/?ajuste=1");
      expect(construirRuta({ view: "recepcion" }, "?token=viejo&foo=bar")).toBe("/");
      expect(construirRuta({ view: "cuenta" }, "?ajuste=0")).toBe("/cuenta");
      expect(
        construirRuta({ view: "sala", mesaId: "m-1", fase: "personaje" }, "?foo=1")
      ).toBe("/mesa/m-1/sala/pj");
    });
  });

  describe("esRutaPermitidaParaUsuario", () => {
    it("bloquea /admin a cualquier usuario sin rol ADMIN", () => {
      const rutaAdmin = parsearRuta("/admin");
      expect(rutaAdmin).toEqual({ view: "moderar" });
      expect(esRutaPermitidaParaUsuario(rutaAdmin, "ADMIN")).toBe(true);
      expect(esRutaPermitidaParaUsuario(rutaAdmin, "USER")).toBe(false);
      expect(esRutaPermitidaParaUsuario(rutaAdmin, null)).toBe(false);
      expect(esRutaPermitidaParaUsuario(rutaAdmin, undefined)).toBe(false);
      expect(esRutaPermitidaParaUsuario(rutaAdmin, "")).toBe(false);
      expect(esRutaPermitidaParaUsuario(rutaAdmin, "admin")).toBe(false);
    });

    it("rechaza rutas desconocidas y permite el resto de rutas válidas", () => {
      expect(esRutaPermitidaParaUsuario({ view: "desconocida" }, "ADMIN")).toBe(false);
      expect(esRutaPermitidaParaUsuario({ view: "desconocida" }, "USER")).toBe(false);
      expect(esRutaPermitidaParaUsuario({ view: "recepcion" }, "USER")).toBe(true);
      expect(esRutaPermitidaParaUsuario({ view: "cuenta" }, "USER")).toBe(true);
      expect(esRutaPermitidaParaUsuario({ view: "verificar-correo" }, null)).toBe(true);
      expect(
        esRutaPermitidaParaUsuario({ view: "gestion", mesaId: "m-1" }, "USER")
      ).toBe(true);
      expect(
        esRutaPermitidaParaUsuario(
          { view: "sala", mesaId: "m-1", fase: "mapa" },
          "USER"
        )
      ).toBe(true);
    });
  });
});
