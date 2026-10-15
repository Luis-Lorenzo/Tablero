import { describe, expect, test } from "vitest";
import { logger } from "../src/lib/logger.js";
import {
  BloqueoService,
  calcularBloqueo,
  registrarFallo
} from "../src/services/bloqueo.service.js";

/** Instantes ISO del 2026-03-02, en UTC, para que las pruebas sean legibles. */
function instante(hora: string): Date {
  return new Date(`2026-03-02T${hora}:00Z`);
}

describe("BloqueoService", () => {
  const service = new BloqueoService(logger);

  test("variante4: bloquea cuando los 5 fallos más recientes caben en 15 minutos", () => {
    const fallos = [
      instante("10:00"),
      instante("10:01"),
      instante("10:02"),
      instante("10:03"),
      instante("10:04")
    ];

    const resultado = calcularBloqueo(fallos, instante("10:10"));

    expect(resultado).toEqual({
      bloqueado: true,
      hasta: "2026-03-02T10:19:00Z"
    });
  });

  test("variante4: bloquea aunque la lista de fallos venga desordenada", () => {
    const fallos = [
      instante("10:04"),
      instante("10:00"),
      instante("10:03"),
      instante("10:01"),
      instante("10:02")
    ];

    const resultado = calcularBloqueo(fallos, instante("10:05"));

    expect(resultado).toEqual({
      bloqueado: true,
      hasta: "2026-03-02T10:19:00Z"
    });
  });

  test("variante4: solo cuenta los 5 fallos más recientes", () => {
    const fallos = [
      instante("08:00"),
      instante("08:05"),
      instante("10:00"),
      instante("10:01"),
      instante("10:02"),
      instante("10:03"),
      instante("10:04")
    ];

    const resultado = calcularBloqueo(fallos, instante("10:10"));

    expect(resultado).toEqual({
      bloqueado: true,
      hasta: "2026-03-02T10:19:00Z"
    });
  });

  test("variante4: no bloquea con menos de 5 fallos", () => {
    const fallos = [
      instante("10:00"),
      instante("10:01"),
      instante("10:02"),
      instante("10:03")
    ];

    const resultado = calcularBloqueo(fallos, instante("10:04"));

    expect(resultado).toEqual({ bloqueado: false, hasta: null });
  });

  test("variante4: no bloquea si entre el primero y el último pasan más de 15 minutos", () => {
    const fallos = [
      instante("10:00"),
      instante("10:01"),
      instante("10:02"),
      instante("10:03"),
      instante("10:16")
    ];

    const resultado = calcularBloqueo(fallos, instante("10:17"));

    expect(resultado).toEqual({ bloqueado: false, hasta: null });
  });

  test("variante4: no bloquea cuando el bloqueo ya ha expirado", () => {
    const fallos = [
      instante("10:00"),
      instante("10:01"),
      instante("10:02"),
      instante("10:03"),
      instante("10:04")
    ];

    const resultado = calcularBloqueo(fallos, instante("10:19"));

    expect(resultado).toEqual({ bloqueado: false, hasta: null });
  });

  test("variante4: rechaza una fecha no válida con INVALID_DATE", () => {
    expect(() =>
      service.evaluar(["2026-03-02T10:00:00Z", "no-es-una-fecha"], "2026-03-02T10:10:00Z")
    ).toThrow("INVALID_DATE");

    expect(() => service.evaluar([], "ayer")).toThrow("INVALID_DATE");
  });

  test("variante4: rechaza una petición sin lista de fallos con INVALID_REQUEST", () => {
    expect(() => service.evaluar("10:00", "2026-03-02T10:10:00Z")).toThrow(
      "INVALID_REQUEST"
    );

    expect(() => service.evaluar(undefined, "2026-03-02T10:10:00Z")).toThrow(
      "INVALID_REQUEST"
    );
  });

  test("variante4: registrarFallo conserva los 5 fallos más recientes y bloquea", () => {
    let fallos: Date[] = [];
    let bloqueado = false;
    let hasta: Date | null = null;

    for (const hora of ["10:00", "10:01", "10:02", "10:03", "10:04"]) {
      const paso = registrarFallo(fallos, instante(hora));
      fallos = paso.fallos;
      bloqueado = paso.bloqueado;
      hasta = paso.hasta;
    }

    expect(fallos).toHaveLength(5);
    expect(bloqueado).toBe(true);
    expect(hasta?.toISOString()).toBe("2026-03-02T10:19:00.000Z");
  });

  test("variante4: registrarFallo recorta la lista y descarta los fallos antiguos", () => {
    let fallos: Date[] = [];
    let bloqueado = false;

    // Fallos muy separados en el tiempo: nunca deberían bloquear.
    for (const hora of ["08:00", "09:00", "10:00", "11:00", "12:00"]) {
      const paso = registrarFallo(fallos, instante(hora));
      fallos = paso.fallos;
      bloqueado = paso.bloqueado;
    }

    expect(fallos).toHaveLength(5);
    expect(bloqueado).toBe(false);
  });
});
