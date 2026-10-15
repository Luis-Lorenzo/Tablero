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
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { UserService } from "../src/services/user.service.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";

/** Espía del canal en vivo: guarda cuántas veces se ha avisado. */
function notificadorEspia() {
  const avisos: number[] = [];
  return {
    notificarCambio: () => {
      avisos.push(avisos.length + 1);
    },
    avisos
  };
}

/** Monta la aplicación real con repositorios en memoria y usuarios aprobados. */
function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();
  const notifier = notificadorEspia();

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    mesaRepository: mesas,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger),
    archivoService: new ArchivoService(
      new MemoryArchivoRepository(),
      new MemoryAlmacen(),
      logger,
      config.archivos.maxBytes
    ),
    mesasNotifier: notifier
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

  return { app, aprobar, sesionDe, notifier };
}

describe("rutas de /api/mesas", () => {
  let app: ReturnType<typeof montar>["app"];
  let aprobar: ReturnType<typeof montar>["aprobar"];
  let sesionDe: ReturnType<typeof montar>["sesionDe"];
  let notifier: ReturnType<typeof montar>["notifier"];

  beforeEach(async () => {
    const contexto = montar();
    app = contexto.app;
    aprobar = contexto.aprobar;
    sesionDe = contexto.sesionDe;
    notifier = contexto.notifier;
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

    const respuestaForbidden = await request(app)
      .delete(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieInvitada);
    expect(creada.status).toBe(201);
    expect(respuestaForbidden.status).toBe(403);
    expect(respuestaForbidden.body.error).toBe("FORBIDDEN");
  });

  it("avisa por el canal en vivo al crear, unirse y cerrar", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    expect(notifier.avisos.length).toBe(0);

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);
    expect(creada.status).toBe(201);
    expect(notifier.avisos.length).toBe(1);

    const unida = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);
    expect(unida.status).toBe(200);
    expect(notifier.avisos.length).toBe(2);

    const cerrada = await request(app)
      .delete(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieAnfitrion);
    expect(cerrada.status).toBe(204);
    expect(notifier.avisos.length).toBe(3);
  });

  it("no avisa al reutilizar una mesa ya creada (crear sin crear)", async () => {
    const cookie = await sesionDe("anfitrion@pocket.test");

    const primera = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookie);
    expect(primera.status).toBe(201);
    expect(notifier.avisos.length).toBe(1);

    const repetida = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookie);
    expect(repetida.status).toBe(200);
    expect(repetida.body.id).toBe(primera.body.id);
    expect(notifier.avisos.length).toBe(1);
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

  it("un jugador abandona la mesa y el anfitrión no puede abandonar", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);
    await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);

    const abandonada = await request(app)
      .post(`/api/mesas/${creada.body.id}/abandonar`)
      .set("Cookie", cookieInvitada);
    expect(abandonada.status).toBe(204);

    const mesa = await request(app)
      .get(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieAnfitrion);
    expect(mesa.body.players).toHaveLength(0);

    const anfitrionAbandona = await request(app)
      .post(`/api/mesas/${creada.body.id}/abandonar`)
      .set("Cookie", cookieAnfitrion);
    expect(anfitrionAbandona.status).toBe(403);
    expect(anfitrionAbandona.body.error).toBe("MESA_FORBIDDEN");
  });

  it("expulsar bloquea el reingreso del jugador", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);
    const unida = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);
    const playerId = unida.body.players[0].id;

    const expulsada = await request(app)
      .post(`/api/mesas/${creada.body.id}/expulsar`)
      .set("Cookie", cookieAnfitrion)
      .send({ playerId });
    expect(expulsada.status).toBe(204);

    const reingreso = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);
    expect(reingreso.status).toBe(403);
    expect(reingreso.body.error).toBe("MESA_BANNED");
  });

  it("ceder el mando exige la aceptación del nuevo anfitrión", async () => {
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);
    const unida = await request(app)
      .post(`/api/mesas/${creada.body.id}/unirse`)
      .set("Cookie", cookieInvitada);
    const playerId = unida.body.players[0].id;

    const oferta = await request(app)
      .post(`/api/mesas/${creada.body.id}/ceder`)
      .set("Cookie", cookieAnfitrion)
      .send({ playerId });
    expect(oferta.status).toBe(204);

    const pendiente = await request(app)
      .get(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieInvitada);
    expect(pendiente.body.pendingHostId).toBe(playerId);

    const aceptada = await request(app)
      .post(`/api/mesas/${creada.body.id}/ceder/aceptar`)
      .set("Cookie", cookieInvitada);
    expect(aceptada.status).toBe(204);

    const despues = await request(app)
      .get(`/api/mesas/${creada.body.id}`)
      .set("Cookie", cookieInvitada);
    expect(despues.body.hostId).toBe(playerId);
    expect(despues.body.pendingHostId).toBeNull();
    expect(despues.body.players).toHaveLength(1);
  });
});
