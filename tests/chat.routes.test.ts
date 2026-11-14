import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { WebSocket } from "ws";
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
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { ChatService } from "../src/services/chat.service.js";
import { UserService } from "../src/services/user.service.js";
import { MesasBroadcaster } from "../src/realtime/mesas-broadcaster.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";

function abrirWs(port: number, cookie: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Cookie: cookie }
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function esperarEvento(
  ws: WebSocket,
  tipo: string,
  timeoutMs = 1500
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error(`Timeout esperando evento ${tipo}`));
    }, timeoutMs);

    function onMsg(data: WebSocket.RawData) {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if (parsed.type === tipo) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(parsed);
      }
    }

    ws.on("message", onMsg);
  });
}

describe("chat en vivo y tiradas de dados en /api/mesas/:id", () => {
  let server: http.Server;
  let broadcaster: MesasBroadcaster;
  let port: number;
  let app: ReturnType<typeof createApp>;

  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();
  const store = createSessionStore();

  async function aprobar(email: string, nickname?: string) {
    const user = createUser({
      email,
      passwordHash: await hasher.hash(PASSWORD),
      status: "ACTIVE",
      nickname: nickname ?? null
    });
    await users.save(user);
    return user;
  }

  async function sesionDe(email: string): Promise<string> {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return String(login.headers["set-cookie"]![0]).split(";")[0];
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
      chatService: new ChatService(mesas, users),
      archivoService: new ArchivoService(
        new MemoryArchivoRepository(),
        new MemoryAlmacen(),
        logger,
        config.archivos.maxBytes
      ),
      mesasNotifier: broadcaster
    };

    app = createApp(context, store);
    server = http.createServer(app);
    broadcaster.attach(server);

    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await broadcaster.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("permite chat público, susurros privados @, D20 público y dados negros secretos del Máster", async () => {
    const master = await aprobar("master@chat.test", "Master");
    const aria = await aprobar("aria@chat.test", "Aria");
    const borin = await aprobar("borin@chat.test", "Borin");
    await aprobar("intruso@chat.test", "Intruso");

    const cookieMaster = await sesionDe(master.email);
    const cookieAria = await sesionDe(aria.email);
    const cookieBorin = await sesionDe(borin.email);
    const cookieIntruso = await sesionDe(intrusoEmail("intruso@chat.test"));

    function intrusoEmail(e: string) {
      return e;
    }

    const crear = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster);
    expect(crear.status).toBe(201);
    const mesaId = crear.body.id as string;

    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieAria).expect(200);
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieBorin).expect(200);

    // Intruso no puede leer ni escribir
    await request(app).get(`/api/mesas/${mesaId}/chat`).set("Cookie", cookieIntruso).expect(403);
    await request(app)
      .post(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieIntruso)
      .send({ texto: "Hola" })
      .expect(403);

    const wsMaster = await abrirWs(port, cookieMaster);
    const wsAria = await abrirWs(port, cookieAria);
    const wsBorin = await abrirWs(port, cookieBorin);

    // 1. Mensaje público
    const evPubAria = esperarEvento(wsAria, "chat:message");
    const evPubBorin = esperarEvento(wsBorin, "chat:message");

    const resPub = await request(app)
      .post(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieMaster)
      .send({ texto: "Bienvenidos a la posada" })
      .expect(201);

    expect(resPub.body.texto).toBe("Bienvenidos a la posada");
    expect(resPub.body.destinatarioId).toBeNull();

    const msgAria = (await evPubAria).message as Record<string, unknown>;
    const msgBorin = (await evPubBorin).message as Record<string, unknown>;
    expect(msgAria.texto).toBe("Bienvenidos a la posada");
    expect(msgBorin.texto).toBe("Bienvenidos a la posada");

    // 2. Mensaje privado @ (Master -> Aria): Borin NO lo recibe por WS ni en historial
    const evPrivAria = esperarEvento(wsAria, "chat:message");
    let borinRecibioPrivado = false;
    const onBorinMsg = (raw: WebSocket.RawData) => {
      const p = JSON.parse(String(raw)) as { type?: string };
      if (p.type === "chat:message") borinRecibioPrivado = true;
    };
    wsBorin.on("message", onBorinMsg);

    const resPriv = await request(app)
      .post(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieMaster)
      .send({ texto: "Ves una trampa oculta", destinatarioId: aria.id })
      .expect(201);

    expect(resPriv.body.destinatarioId).toBe(aria.id);
    expect(resPriv.body.destinatarioNombre).toBe("Aria");

    const privAria = (await evPrivAria).message as Record<string, unknown>;
    expect(privAria.texto).toBe("Ves una trampa oculta");
    expect(privAria.destinatarioId).toBe(aria.id);

    await new Promise(r => setTimeout(r, 80));
    wsBorin.off("message", onBorinMsg);
    expect(borinRecibioPrivado).toBe(false);

    // Historial de Borin solo tiene el mensaje público; el de Aria tiene ambos
    const histBorin = await request(app)
      .get(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieBorin)
      .expect(200);
    expect(histBorin.body).toHaveLength(1);

    const histAria = await request(app)
      .get(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieAria)
      .expect(200);
    expect(histAria.body).toHaveLength(2);

    // 3. Tirada pública de Aria con 20 natural -> se difunde dice:roll con especial: "critico"
    const evRollMaster = esperarEvento(wsMaster, "dice:roll");
    const evRollBorin = esperarEvento(wsBorin, "dice:roll");

    await request(app)
      .post(`/api/mesas/${mesaId}/tiradas`)
      .set("Cookie", cookieAria)
      .send({
        total: 23,
        formula: "1d20 + 3",
        dados: [20],
        bonificador: 3,
        caras: 20,
        secreta: false
      })
      .expect(201);

    const rollMaster = (await evRollMaster).roll as Record<string, unknown>;
    const rollBorin = (await evRollBorin).roll as Record<string, unknown>;
    expect(rollMaster.total).toBe(23);
    expect(rollMaster.jugadorId).toBe(aria.id);
    expect(rollMaster.especial).toBe("critico");
    expect(rollBorin.total).toBe(23);
    expect(rollBorin.especial).toBe("critico");

    // 3b. Pifia (1 natural en d20) -> se difunde con especial: "pifia"
    const evPifiaMaster = esperarEvento(wsMaster, "dice:roll");
    await request(app)
      .post(`/api/mesas/${mesaId}/tiradas`)
      .set("Cookie", cookieBorin)
      .send({
        total: 4,
        formula: "1d20 + 3",
        dados: [1],
        bonificador: 3,
        caras: 20,
        secreta: false
      })
      .expect(201);
    const pifiaMaster = (await evPifiaMaster).roll as Record<string, unknown>;
    expect(pifiaMaster.especial).toBe("pifia");

    // 4. Dados negros secretos: jugador normal no puede (403); Máster sí (204) y nadie recibe nada
    await request(app)
      .post(`/api/mesas/${mesaId}/tiradas`)
      .set("Cookie", cookieAria)
      .send({ total: 12, formula: "1d20", dados: [12], bonificador: 0, secreta: true })
      .expect(403);

    let alguienRecibioSecreta = false;
    const marcarSiRecibe = (raw: WebSocket.RawData) => {
      const p = JSON.parse(String(raw)) as { type?: string };
      if (p.type === "dice:roll" || p.type === "chat:message") {
        alguienRecibioSecreta = true;
      }
    };
    wsAria.on("message", marcarSiRecibe);
    wsBorin.on("message", marcarSiRecibe);

    await request(app)
      .post(`/api/mesas/${mesaId}/tiradas`)
      .set("Cookie", cookieMaster)
      .send({ total: 20, formula: "1d20", dados: [20], bonificador: 0, secreta: true })
      .expect(204);

    await new Promise(r => setTimeout(r, 80));
    expect(alguienRecibioSecreta).toBe(false);

    wsMaster.close();
    wsAria.close();
    wsBorin.close();
  });
});
