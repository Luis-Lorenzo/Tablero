import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  incrementarCantidadMonedas,
  parsearCantidadMonedas,
  resolverCantidadEnvioMonedas,
  sanitizarEntradaCantidadMonedas
} from "../client/src/preview/compartir.js";
import { createApp } from "../src/app.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { config } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryMesaEstadoRepository } from "../src/repositories/mesa-estado.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import {
  createUser,
  MemoryUserRepository
} from "../src/repositories/user.repository.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { UserService } from "../src/services/user.service.js";
import type { AppContext } from "../src/api/context.js";

describe("campo de cantidad en Enviar monedas (PopoverPalomaEnviar)", () => {
  it("permite borrar el '1' inicial y escribir cantidades menores que 10 o que no empiecen por '1'", () => {
    // 1. Al borrar el valor inicial "1", el campo queda vacío en lugar de volver a "1"
    let texto = "1";
    texto = sanitizarEntradaCantidadMonedas("");
    expect(texto).toBe("");
    expect(resolverCantidadEnvioMonedas(texto, 100)).toBe(0);

    // 2. Escribir cantidades menores que 10 (2..9)
    for (const cantidad of [2, 3, 5, 7, 9]) {
      const entrada = sanitizarEntradaCantidadMonedas(String(cantidad));
      expect(entrada).toBe(String(cantidad));
      expect(resolverCantidadEnvioMonedas(entrada, 100)).toBe(cantidad);
    }

    // 3. Escribir cantidades cuyo primer dígito no es "1" (20, 35, 50, 84, 300)
    for (const cantidad of [20, 35, 50, 84, 300]) {
      let progreso = "";
      for (const digito of String(cantidad)) {
        progreso = sanitizarEntradaCantidadMonedas(progreso + digito);
      }
      expect(progreso).toBe(String(cantidad));
      expect(resolverCantidadEnvioMonedas(progreso, 500)).toBe(cantidad);
    }
  });

  it("normaliza ceros a la izquierda y rechaza vacíos, cero o negativos al resolver el envío", () => {
    expect(sanitizarEntradaCantidadMonedas("0")).toBe("0");
    expect(sanitizarEntradaCantidadMonedas("05")).toBe("5");
    expect(sanitizarEntradaCantidadMonedas("0025")).toBe("25");
    expect(sanitizarEntradaCantidadMonedas("-5")).toBe("");
    expect(sanitizarEntradaCantidadMonedas("abc")).toBe("");

    expect(parsearCantidadMonedas("")).toBe(0);
    expect(parsearCantidadMonedas("0")).toBe(0);
    expect(parsearCantidadMonedas("-3")).toBe(0);

    expect(resolverCantidadEnvioMonedas("", 50)).toBe(0);
    expect(resolverCantidadEnvioMonedas("0", 50)).toBe(0);
    expect(resolverCantidadEnvioMonedas("5", 0)).toBe(0);
    expect(resolverCantidadEnvioMonedas("80", 50)).toBe(50);
  });

  it("aplica correctamente los atajos +1, +5 y +10 tanto desde vacío como desde un número escrito", () => {
    expect(incrementarCantidadMonedas("", 1, 50)).toBe("1");
    expect(incrementarCantidadMonedas("", 5, 50)).toBe("5");
    expect(incrementarCantidadMonedas("", 10, 50)).toBe("10");
    expect(incrementarCantidadMonedas("5", 5, 50)).toBe("10");
    expect(incrementarCantidadMonedas("45", 10, 50)).toBe("50");
    expect(incrementarCantidadMonedas("1", 10, 3)).toBe("3");
  });
});

const PASSWORD = "secreto123";

function montarApp() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const mesaEstadoRepository = new MemoryMesaEstadoRepository();
  const hasher = new FakePasswordHasher();
  const envios: Array<{ userIds: readonly string[]; payload: unknown }> = [];

  const notifier = {
    notificarCambio: () => {},
    notificarUsuario: () => {},
    enviarAUsuarios: (userIds: readonly string[], payload: unknown) => {
      envios.push({ userIds, payload });
    },
    mapaActualizado: () => {}
  };

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    mesaRepository: mesas,
    mesaEstadoRepository,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger),
    archivoService: new ArchivoService(
      new MemoryArchivoRepository(),
      new MemoryAlmacen(),
      logger,
      config.archivos.maxBytes,
      mesas
    ),
    mesasNotifier: notifier
  };

  const app = createApp(context);

  async function aprobar(email: string, nickname: string) {
    const user = createUser({
      email,
      passwordHash: await hasher.hash(PASSWORD),
      status: "ACTIVE",
      nickname
    });
    await users.save(user);
    return user;
  }

  async function sesionDe(email: string) {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return String(login.headers["set-cookie"][0]).split(";")[0];
  }

  return { app, aprobar, sesionDe, mesaEstadoRepository, envios };
}

describe("POST /api/mesas/:id/divisa/transferir", () => {
  let montado: ReturnType<typeof montarApp>;
  let mesaId: string;
  let cookieEmisor: string;
  let receptorId: string;

  beforeEach(async () => {
    montado = montarApp();
    await montado.aprobar("master-monedas@pocket.test", "Master");
    await montado.aprobar("emisor@pocket.test", "Aria");
    const receptor = await montado.aprobar("receptor@pocket.test", "Borin");
    receptorId = receptor.id;

    const cookieMaster = await montado.sesionDe("master-monedas@pocket.test");
    cookieEmisor = await montado.sesionDe("emisor@pocket.test");
    const cookieReceptor = await montado.sesionDe("receptor@pocket.test");

    const crear = await request(montado.app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster);
    expect(crear.status).toBe(201);
    mesaId = crear.body.id as string;

    expect(
      (await request(montado.app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieEmisor))
        .status
    ).toBe(200);
    expect(
      (
        await request(montado.app)
          .post(`/api/mesas/${mesaId}/unirse`)
          .set("Cookie", cookieReceptor)
      ).status
    ).toBe(200);

    const saldoInicial = await request(montado.app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieEmisor)
      .send({ divisaId: "principal", divisa: 100, delta: 100 });
    expect(saldoInicial.status).toBe(200);
  });

  it("permite transferir cantidades menores que 10 y cantidades cuyo primer dígito no es 1", async () => {
    const envioMenor10 = await request(montado.app)
      .post(`/api/mesas/${mesaId}/divisa/transferir`)
      .set("Cookie", cookieEmisor)
      .send({ receptorId, divisaId: "principal", cantidad: 5 });

    expect(envioMenor10.status).toBe(200);
    expect(envioMenor10.body.divisa).toBe(95);

    const envioSinUnoInicial = await request(montado.app)
      .post(`/api/mesas/${mesaId}/divisa/transferir`)
      .set("Cookie", cookieEmisor)
      .send({ receptorId, divisaId: "principal", cantidad: 25 });

    expect(envioSinUnoInicial.status).toBe(200);
    expect(envioSinUnoInicial.body.divisa).toBe(70);

    const estadoReceptor = await montado.mesaEstadoRepository.getEstadoCompleto(
      mesaId,
      receptorId
    );
    expect(estadoReceptor.divisasSaldos?.principal).toBe(30);
  });

  it("rechaza cantidades no positivas o superiores al saldo disponible", async () => {
    const envioCero = await request(montado.app)
      .post(`/api/mesas/${mesaId}/divisa/transferir`)
      .set("Cookie", cookieEmisor)
      .send({ receptorId, divisaId: "principal", cantidad: 0 });
    expect(envioCero.status).toBe(400);

    const envioExcesivo = await request(montado.app)
      .post(`/api/mesas/${mesaId}/divisa/transferir`)
      .set("Cookie", cookieEmisor)
      .send({ receptorId, divisaId: "principal", cantidad: 250 });
    expect(envioExcesivo.status).toBe(400);
    expect(envioExcesivo.body.error.code).toBe("SALDO_INSUFICIENTE");
  });
});
