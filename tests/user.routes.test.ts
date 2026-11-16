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
import { MemoryUserMacrosRepository } from "../src/repositories/user-macros.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { ChatService } from "../src/services/chat.service.js";
import { UserService } from "../src/services/user.service.js";
import { NoopMesasNotifier } from "../src/realtime/mesas-notifier.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";

function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    userMacrosRepository: new MemoryUserMacrosRepository(),
    mesaRepository: mesas,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger),
    chatService: new ChatService(mesas, users),
    archivoService: new ArchivoService(
      new MemoryArchivoRepository(),
      new MemoryAlmacen(),
      logger,
      config.archivos.maxBytes
    ),
    mesasNotifier: new NoopMesasNotifier()
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

  async function sesionDe(email: string) {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return login.headers["set-cookie"][0].split(";")[0];
  }

  return { app, aprobar, sesionDe };
}

describe("ruta PATCH /api/users/me/nickname", () => {
  let montado: ReturnType<typeof montar>;

  beforeEach(async () => {
    montado = montar();
    await montado.aprobar("jugadora@pocket.test");
    await montado.aprobar("otra@pocket.test");
  });

  it("exige sesión", async () => {
    const response = await request(montado.app)
      .patch("/api/users/me/nickname")
      .send({ nickname: "Javi_92" });
    expect(response.status).toBe(401);
  });

  it("guarda el nickname y lo devuelve", async () => {
    const cookie = await montado.sesionDe("jugadora@pocket.test");
    const response = await request(montado.app)
      .patch("/api/users/me/nickname")
      .set("Cookie", cookie)
      .send({ nickname: "Javi_92" });

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe("Javi_92");
  });

  it("rechaza un nickname inválido y uno repetido", async () => {
    const cookie = await montado.sesionDe("jugadora@pocket.test");
    const otra = await montado.sesionDe("otra@pocket.test");

    const invalido = await request(montado.app)
      .patch("/api/users/me/nickname")
      .set("Cookie", cookie)
      .send({ nickname: "1x" });
    expect(invalido.status).toBe(400);
    expect(invalido.body.error).toBe("INVALID_NICKNAME");

    await request(montado.app)
      .patch("/api/users/me/nickname")
      .set("Cookie", cookie)
      .send({ nickname: "Anfitriona" });

    const repetido = await request(montado.app)
      .patch("/api/users/me/nickname")
      .set("Cookie", otra)
      .send({ nickname: "anfitriona" });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error).toBe("NICKNAME_TAKEN");
  });

  it("borra el nickname al enviar null", async () => {
    const cookie = await montado.sesionDe("jugadora@pocket.test");
    await request(montado.app)
      .patch("/api/users/me/nickname")
      .set("Cookie", cookie)
      .send({ nickname: "Javi_92" });

    const response = await request(montado.app)
      .patch("/api/users/me/nickname")
      .set("Cookie", cookie)
      .send({ nickname: null });

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBeNull();
  });
});

describe("rutas GET/PATCH /api/users/me/macros", () => {
  let montado: ReturnType<typeof montar>;

  beforeEach(async () => {
    montado = montar();
    await montado.aprobar("jugadora@pocket.test");
  });

  it("exige sesión", async () => {
    const getRes = await request(montado.app).get("/api/users/me/macros");
    expect(getRes.status).toBe(401);

    const patchRes = await request(montado.app)
      .patch("/api/users/me/macros")
      .send({ macros: [] });
    expect(patchRes.status).toBe(401);
  });

  it("persiste y sanitiza las macros del usuario", async () => {
    const cookie = await montado.sesionDe("jugadora@pocket.test");

    const inicial = await request(montado.app)
      .get("/api/users/me/macros")
      .set("Cookie", cookie);
    expect(inicial.status).toBe(200);
    expect(inicial.body.macros).toEqual([]);

    const guardada = await request(montado.app)
      .patch("/api/users/me/macros")
      .set("Cookie", cookie)
      .send({
        macros: [
          {
            id: "m-1",
            nombre: "  Bola de fuego  ",
            icono: "flame",
            grupos: [{ caras: 6, cantidad: 8 }],
            bonificador: 2
          },
          {
            id: "",
            nombre: "Inválida",
            icono: "sword",
            grupos: [],
            bonificador: 0
          }
        ]
      });

    expect(guardada.status).toBe(200);
    expect(guardada.body.macros).toEqual([
      {
        id: "m-1",
        nombre: "Bola de fuego",
        icono: "flame",
        grupos: [{ id: "g-1", caras: 6, cantidad: 8 }],
        bonificador: 2
      }
    ]);

    const recargada = await request(montado.app)
      .get("/api/users/me/macros")
      .set("Cookie", cookie);
    expect(recargada.status).toBe(200);
    expect(recargada.body.macros).toHaveLength(1);
    expect(recargada.body.macros[0].nombre).toBe("Bola de fuego");
  });
});
