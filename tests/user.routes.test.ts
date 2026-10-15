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
    mesaRepository: mesas,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger),
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
