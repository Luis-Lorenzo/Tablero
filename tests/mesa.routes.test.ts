import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import {
  createUser,
  MemoryUserRepository
} from "../src/repositories/user.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { UserService } from "../src/services/user.service.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";

/** Monta la aplicación real con repositorios en memoria y usuarios aprobados. */
function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    mesaRepository: mesas,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger)
  };

  const app = createApp(context);

  async function aprobar(email: string) {
    const user = createUser({
      email,
      passwordHash: await hasher.hash(PASSWORD),
      status: "ACTIVE"
    });
    await users.save(user);
    return user;
  }

  /** Devuelve la cookie de sesión que entrega el login real. */
  async function sesionDe(email: string) {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });

    expect(login.status).toBe(200);
    return login.headers["set-cookie"][0].split(";")[0];
  }

  return { app, aprobar, sesionDe };
}

describe("rutas de /api/mesas", () => {
  let app: ReturnType<typeof montar>["app"];
  let aprobar: ReturnType<typeof montar>["aprobar"];
  let sesionDe: ReturnType<typeof montar>["sesionDe"];

  beforeEach(async () => {
    const contexto = montar();
    app = contexto.app;
    aprobar = contexto.aprobar;
    sesionDe = contexto.sesionDe;
    await aprobar("anfitrion@pocket.test");
    await aprobar("invitada@pocket.test");
  });

  it("exige sesión para consultar la recepción", async () => {
    const response = await request(app).get("/api/mesas/inicio");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHENTICATED");
  });

  it("entrega 4 huecos vacíos cuando nadie ha creado sala", async () => {
    const cookie = await sesionDe("anfitrion@pocket.test");
    const response = await request(app)
      .get("/api/mesas/inicio")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect(response.body.every((mesa: unknown) => mesa === null)).toBe(true);
  });

  it("crea la sala con el nombre del anfitrión y la deja en el último hueco", async () => {
    const cookie = await sesionDe("anfitrion@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookie);
    expect(creada.status).toBe(201);
    expect(creada.body.hostName).toBe("anfitrion");

    const cuadricula = await request(app)
      .get("/api/mesas/inicio")
      .set("Cookie", cookie);

    expect(cuadricula.body.slice(0, 3).every((mesa: unknown) => mesa === null)).toBe(true);
    expect(cuadricula.body[3].id).toBe(creada.body.id);
  });

  it("permite unirse a la mesa desde otra cuenta", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);

    const respuesta = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.players).toHaveLength(1);
    expect(respuesta.body.players[0].name).toBe("invitada");
    expect(respuesta.body.hostName).toBe("anfitrion");
  });

  it("rechaza unirse cuando la mesa está llena", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);

    // 6 jugadores es el máximo: el anfitrión no ocupa plaza.
    for (let i = 0; i < 6; i += 1) {
      const email = `jugadora${i}@pocket.test`;
      await aprobar(email);
      const cookie = await sesionDe(email);
      const respuesta = await request(app)
        .post(`/api/mesas/${creada.body.id}/unirse`)
        .set("Cookie", cookie);
      expect(respuesta.status).toBe(200);
    }

    await aprobar("sobra@pocket.test");
    const cookieSobra = await sesionDe("sobra@pocket.test");
    const respuesta = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieSobra);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe("MESA_FULL");
  });

  it("solo deja cerrar la mesa a su anfitrión", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);

    const denegada = await request(app)
      .delete(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieInvitada);
    expect(denegada.status).toBe(403);
    expect(denegada.body.error).toBe("FORBIDDEN");

    const cerrada = await request(app)
      .delete(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieAnfitrion);
    expect(cerrada.status).toBe(204);

    const cuadricula = await request(app)
      .get("/api/mesas/inicio")
      .set("Cookie", cookieAnfitrion);
    expect(cuadricula.body.every((mesa: unknown) => mesa === null)).toBe(true);
  });

  it("busca por el nombre del anfitrión y devuelve 404 si la mesa ya no existe", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);

    const encontrada = await request(app)
      .get("/api/mesas?q=anfitri")
      .set("Cookie", cookieInvitada);
    expect(encontrada.body).toHaveLength(1);
    expect(encontrada.body[0].hostName).toBe("anfitrion");

    const sinResultados = await request(app)
      .get("/api/mesas?q=otracosa")
      .set("Cookie", cookieInvitada);
    expect(sinResultados.body).toHaveLength(0);

    await request(app)
      .delete(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieAnfitrion);

    const inexistente = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error).toBe("MESA_NOT_FOUND");
  });
});
