import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { createSessionStore } from "../src/lib/session.js";
import {
  createUser,
  MemoryUserRepository
} from "../src/repositories/user.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { UserService } from "../src/services/user.service.js";
import { MesasBroadcaster } from "../src/realtime/mesas-broadcaster.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";

describe("canal en vivo /ws", () => {
  let server: http.Server;
  let broadcaster: MesasBroadcaster;
  let base: string;
  let port: number;
  let app: ReturnType<typeof createApp>;

  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();
  const store = createSessionStore();

  async function aprobar(email: string) {
    const user = createUser({
      email,
      passwordHash: await hasher.hash(PASSWORD),
      status: "ACTIVE"
    });
    await users.save(user);
    return user;
  }

  async function sesionDe(email: string): Promise<string> {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });

    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(Array.isArray(cookie)).toBe(true);
    return String(cookie![0]).split(";")[0];
  }

  beforeAll(async () => {
    broadcaster = new MesasBroadcaster({
      config,
      logger,
      sessionStore: store,
      userRepository: users
    });

    const context: AppContext = {
      config,
      logger,
      userRepository: users,
      mesaRepository: mesas,
      authService: new AuthService(users, hasher, logger),
      userService: new UserService(users, logger),
      bloqueoService: new BloqueoService(logger),
      mesaService: new MesaService(mesas, users, logger),
      mesasNotifier: broadcaster
    };

    app = createApp(context, store);
    server = http.createServer(app);
    broadcaster.attach(server);

    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    const addr = server.address() as AddressInfo;
    port = addr.port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await broadcaster.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("rechaza el upgrade sin sesión", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const status = await new Promise<number>(resolve => {
      ws.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
        res.destroy();
      });
      ws.on("error", () => resolve(-1));
      setTimeout(() => resolve(-2), 2000);
    });
    ws.terminate();
    expect(status).toBe(401);
  });

  it("avisa a las conexiones autenticadas cuando cambian las mesas", async () => {
    await aprobar("a@pocket.test");
    await aprobar("b@pocket.test");

    const cookieA = await sesionDe("a@pocket.test");

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Cookie: cookieA }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 2000);
    });

    const aviso = new Promise<string>(resolve => {
      ws.on("message", data => resolve(String(data)));
    });

    const resCrear = await fetch(`${base}/api/mesas`, {
      method: "POST",
      headers: { Cookie: cookieA }
    });
    expect(resCrear.status).toBe(201);

    const mensaje = await aviso;
    expect(JSON.parse(mensaje)).toEqual({ type: "mesas:changed" });

    ws.close();
  });
});
