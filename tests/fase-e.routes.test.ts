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
import { MemoryMesaEstadoRepository } from "../src/repositories/mesa-estado.repository.js";
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { ChatService } from "../src/services/chat.service.js";
import { UserService } from "../src/services/user.service.js";
import { IntercambioService } from "../src/services/intercambio.service.js";
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

describe("FASE E: PJ, Intercambio, Susurros Grupales y Macros en Objetos", () => {
  let server: http.Server;
  let broadcaster: MesasBroadcaster;
  let port: number;
  let app: ReturnType<typeof createApp>;

  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const mesaEstado = new MemoryMesaEstadoRepository();
  const archivoRepo = new MemoryArchivoRepository();
  const almacen = new MemoryAlmacen();
  const hasher = new FakePasswordHasher();
  const store = createSessionStore();
  let archivoService: ArchivoService;

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

    archivoService = new ArchivoService(
      archivoRepo,
      almacen,
      logger,
      config.archivos.maxBytes,
      mesas
    );

    const context: AppContext = {
      config,
      logger,
      userRepository: users,
      mesaRepository: mesas,
      mesaEstadoRepository: mesaEstado,
      authService: new AuthService(users, hasher, logger),
      userService: new UserService(users, logger),
      bloqueoService: new BloqueoService(logger),
      mesaService: new MesaService(mesas, users, logger, archivoService),
      chatService: new ChatService(mesas, users, undefined),
      archivoService,
      intercambioService: new IntercambioService(
        mesas,
        users,
        mesaEstado,
        archivoService,
        logger
      ),
      mesasNotifier: broadcaster
    };

    app = createApp(context, store);
    server = http.createServer(app);
    broadcaster.attach(server);
    await new Promise<void>(resolve => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    broadcaster.close();
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  it("E.1: guarda PJ privado, expone solo retrato público y difunde mesa:personaje por WS", async () => {
    const master = await aprobar("e1-master@pocket.test", "MasterE1");
    const j1 = await aprobar("e1-j1@pocket.test", "JugadorUno");
    const j2 = await aprobar("e1-j2@pocket.test", "JugadorDos");

    const cookieM = await sesionDe(master.email);
    const cookieJ1 = await sesionDe(j1.email);
    const cookieJ2 = await sesionDe(j2.email);

    const crearRes = await request(app).post("/api/mesas").set("Cookie", cookieM);
    expect(crearRes.status).toBe(201);
    const mesaId = crearRes.body.id as string;

    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ1);
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ2);

    const wsJ2 = await abrirWs(port, cookieJ2);
    const promesaEvento = esperarEvento(wsJ2, "mesa:personaje");

    const retratoId = crypto.randomUUID();
    const fichaId = crypto.randomUUID();
    const pdfId = crypto.randomUUID();

    const patchRes = await request(app)
      .patch(`/api/mesas/${mesaId}/personaje`)
      .set("Cookie", cookieJ1)
      .send({
        retratoArchivoId: retratoId,
        fichaArchivoId: fichaId,
        fichaNombre: "Hoja de Elara.pdf",
        pdfs: [{ archivoId: pdfId, nombre: "Hechizos.pdf" }],
        notas: "Secreto del personaje"
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body).toEqual({
      retratoArchivoId: retratoId,
      fichaArchivoId: fichaId,
      fichaNombre: "Hoja de Elara.pdf",
      pdfs: [{ archivoId: pdfId, nombre: "Hechizos.pdf" }],
      notas: "Secreto del personaje"
    });

    const eventoWs = await promesaEvento;
    expect(eventoWs).toMatchObject({
      type: "mesa:personaje",
      mesaId,
      userId: j1.id,
      retratoArchivoId: retratoId
    });
    wsJ2.close();

    // Vista pública de la mesa incluye retrato, pero NUNCA ficha/pdfs/notas
    const mesaPublica = await request(app)
      .get(`/api/mesas/${mesaId}`)
      .set("Cookie", cookieJ2);
    expect(mesaPublica.status).toBe(200);
    expect(mesaPublica.body.retratosPorJugador?.[j1.id]).toBe(retratoId);
    const jugador1Publico = (mesaPublica.body.players as Array<{ id: string; retratoArchivoId?: string }>).find(
      p => p.id === j1.id
    );
    expect(jugador1Publico?.retratoArchivoId).toBe(retratoId);
    expect(JSON.stringify(mesaPublica.body)).not.toContain("Secreto del personaje");
    expect(JSON.stringify(mesaPublica.body)).not.toContain("Hoja de Elara.pdf");

    // Estado privado: J1 ve su PJ; J2 ve su propio PJ vacío
    const estadoJ1 = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ1);
    expect(estadoJ1.status).toBe(200);
    expect(estadoJ1.body.personaje).toEqual({
      retratoArchivoId: retratoId,
      fichaArchivoId: fichaId,
      fichaNombre: "Hoja de Elara.pdf",
      pdfs: [{ archivoId: pdfId, nombre: "Hechizos.pdf" }],
      notas: "Secreto del personaje"
    });

    const estadoJ2 = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ2);
    expect(estadoJ2.status).toBe(200);
    expect(estadoJ2.body.personaje).toEqual({
      retratoArchivoId: null,
      fichaArchivoId: null,
      fichaNombre: null,
      pdfs: [],
      notas: ""
    });
  });

  it("E.2: ejecuta intercambio bilateral atómico (monedas, objetos con macro, archivos y posits) y soporta cancelación", async () => {
    const master = await aprobar("e2-master@pocket.test", "MasterE2");
    const j1 = await aprobar("e2-j1@pocket.test", "Mercader1");
    const j2 = await aprobar("e2-j2@pocket.test", "Mercader2");

    const cookieM = await sesionDe(master.email);
    const cookieJ1 = await sesionDe(j1.email);
    const cookieJ2 = await sesionDe(j2.email);

    const crearRes = await request(app).post("/api/mesas").set("Cookie", cookieM);
    const mesaId = crearRes.body.id as string;
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ1);
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ2);

    // Preparar saldos, mochilas, posits y archivo de J1
    await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJ1)
      .send({ divisa: 100, divisaId: "principal" });
    await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJ2)
      .send({ divisa: 50, divisaId: "principal" });

    const macroEspada = {
      id: "m-espada",
      nombre: "Tajo",
      icono: "Swords",
      color: "#b91c1c",
      grupos: [{ caras: 8, cantidad: 1 }],
      bonificador: 3
    };

    await request(app)
      .patch(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ1)
      .send({
        elementos: [
          {
            id: "posit-j1",
            tipo: "posit",
            texto: "Mapa secreto",
            color: "#f7ffae",
            giro: 0,
            x: 10,
            y: 10
          }
        ],
        mochila: [
          {
            id: "obj-espada",
            nombre: "Espada Rúnica",
            descripcion: "Filo azul",
            cantidad: 2,
            emoji: "⚔️",
            macro: macroEspada
          }
        ]
      });

    const archivoJ1 = await archivoService.subir(j1, {
      nombre: "contrato.txt",
      tipo: "text/plain",
      tamano: 12,
      datos: Buffer.from("Acuerdo sellado"),
      mesaId
    });

    const wsJ1 = await abrirWs(port, cookieJ1);
    const wsJ2 = await abrirWs(port, cookieJ2);

    const iniciarRes = await request(app)
      .post(`/api/mesas/${mesaId}/intercambio/iniciar`)
      .set("Cookie", cookieJ1)
      .send({ conUsuarioId: j2.id });
    expect(iniciarRes.status).toBe(201);
    const intercambioId = iniciarRes.body.id as string;

    // Validar que rechaza oferta sin saldo suficiente
    const ofertaInvalida = await request(app)
      .patch(`/api/mesas/${mesaId}/intercambio/${intercambioId}/oferta`)
      .set("Cookie", cookieJ2)
      .send({ monedas: { principal: 999 } });
    expect(ofertaInvalida.status).toBe(400);

    // J1 marca listo antes, pero al cambiar J2 su oferta, listos se reinicia a false
    await request(app)
      .post(`/api/mesas/${mesaId}/intercambio/${intercambioId}/listo`)
      .set("Cookie", cookieJ1)
      .send({ listo: true });

    const ofertaJ2Res = await request(app)
      .patch(`/api/mesas/${mesaId}/intercambio/${intercambioId}/oferta`)
      .set("Cookie", cookieJ2)
      .send({ monedas: { principal: 30 } });
    expect(ofertaJ2Res.status).toBe(200);
    expect(ofertaJ2Res.body.listos[j1.id]).toBe(false);
    expect(ofertaJ2Res.body.listos[j2.id]).toBe(false);

    const ofertaJ1Res = await request(app)
      .patch(`/api/mesas/${mesaId}/intercambio/${intercambioId}/oferta`)
      .set("Cookie", cookieJ1)
      .send({
        monedas: { principal: 10 },
        objetos: [{ objetoId: "obj-espada", cantidad: 1 }],
        archivos: [{ archivoId: archivoJ1.id, nombre: archivoJ1.nombre, tipoMime: archivoJ1.tipo }],
        posits: [{ positId: "posit-j1", contenido: "Mapa secreto", color: "#f7ffae" }]
      });
    expect(ofertaJ1Res.status).toBe(200);

    const promCompletadoJ1 = esperarEvento(wsJ1, "intercambio:completado");
    const promCompletadoJ2 = esperarEvento(wsJ2, "intercambio:completado");

    await request(app)
      .post(`/api/mesas/${mesaId}/intercambio/${intercambioId}/listo`)
      .set("Cookie", cookieJ1)
      .send({ listo: true });

    const listoJ2Res = await request(app)
      .post(`/api/mesas/${mesaId}/intercambio/${intercambioId}/listo`)
      .set("Cookie", cookieJ2)
      .send({ listo: true });
    expect(listoJ2Res.status).toBe(200);
    expect(listoJ2Res.body.estado).toBe("completado");

    await Promise.all([promCompletadoJ1, promCompletadoJ2]);

    // Verificar saldos, mochilas (con macro preservado) y posits finales
    const estJ1 = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ1);
    const estJ2 = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ2);

    expect(estJ1.body.divisa).toBe(120); // 100 - 10 + 30
    expect(estJ2.body.divisa).toBe(30);  // 50 - 30 + 10

    expect(estJ1.body.mochila).toHaveLength(1);
    expect(estJ1.body.mochila[0].cantidad).toBe(1);
    expect(estJ2.body.mochila).toHaveLength(1);
    expect(estJ2.body.mochila[0]).toMatchObject({
      nombre: "Espada Rúnica",
      cantidad: 1,
      macro: {
        id: "m-espada",
        nombre: "Tajo",
        bonificador: 3
      }
    });

    expect(estJ1.body.elementos).toHaveLength(0);
    expect(estJ2.body.elementos).toHaveLength(1);
    expect(estJ2.body.elementos[0]).toMatchObject({
      tipo: "posit",
      texto: "Mapa secreto",
      archivado: true
    });

    // Verificar que J2 recibió copia del archivo
    const archivosJ2 = await archivoService.listar(j2, mesaId);
    expect(archivosJ2.some(a => a.nombre === "contrato.txt")).toBe(true);

    // Probar cancelación de una nueva sesión
    const iniciar2 = await request(app)
      .post(`/api/mesas/${mesaId}/intercambio/iniciar`)
      .set("Cookie", cookieJ1)
      .send({ conUsuarioId: j2.id });
    expect(iniciar2.status).toBe(201);
    const cancelRes = await request(app)
      .post(`/api/mesas/${mesaId}/intercambio/${iniciar2.body.id}/cancelar`)
      .set("Cookie", cookieJ2);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.estado).toBe("cancelado");

    wsJ1.close();
    wsJ2.close();
  });

  it("E.3: susurros grupales (@ multi-usuario) solo visibles y difundidos a autor y destinatarios", async () => {
    const master = await aprobar("e3-master@pocket.test", "MasterE3");
    const j1 = await aprobar("e3-j1@pocket.test", "Ana");
    const j2 = await aprobar("e3-j2@pocket.test", "Beto");
    const j3 = await aprobar("e3-j3@pocket.test", "Carlos");

    const cookieM = await sesionDe(master.email);
    const cookieJ1 = await sesionDe(j1.email);
    const cookieJ2 = await sesionDe(j2.email);
    const cookieJ3 = await sesionDe(j3.email);

    const crearRes = await request(app).post("/api/mesas").set("Cookie", cookieM);
    const mesaId = crearRes.body.id as string;
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ1);
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ2);
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ3);

    const wsJ1 = await abrirWs(port, cookieJ1);
    const wsJ2 = await abrirWs(port, cookieJ2);
    const wsJ3 = await abrirWs(port, cookieJ3);

    let j3RecibioSusurro = false;
    wsJ3.on("message", raw => {
      const ev = JSON.parse(String(raw)) as { type?: string };
      if (ev.type === "chat:message") {
        j3RecibioSusurro = true;
      }
    });

    const promJ1 = esperarEvento(wsJ1, "chat:message");
    const promJ2 = esperarEvento(wsJ2, "chat:message");

    const chatRes = await request(app)
      .post(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieM)
      .send({
        texto: "Plan secreto para Ana y Beto",
        destinatarioIds: [j1.id, j2.id]
      });

    expect(chatRes.status).toBe(201);
    expect(chatRes.body.destinatarioIds).toEqual([j1.id, j2.id]);
    expect(chatRes.body.destinatarioNombres).toEqual(["Ana", "Beto"]);

    await Promise.all([promJ1, promJ2]);
    await new Promise(r => setTimeout(r, 80));
    expect(j3RecibioSusurro).toBe(false);

    // Historial filtrado
    const histJ2 = await request(app)
      .get(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieJ2);
    expect(histJ2.status).toBe(200);
    expect(histJ2.body).toHaveLength(1);

    const histJ3 = await request(app)
      .get(`/api/mesas/${mesaId}/chat`)
      .set("Cookie", cookieJ3);
    expect(histJ3.status).toBe(200);
    expect(histJ3.body).toHaveLength(0);

    wsJ1.close();
    wsJ2.close();
    wsJ3.close();
  });

  it("E.5: preserva macro en objetos de mochila, mesa, compartir y master-resumen", async () => {
    const master = await aprobar("e5-master@pocket.test", "MasterE5");
    const j1 = await aprobar("e5-j1@pocket.test", "JugadorE5");

    const cookieM = await sesionDe(master.email);
    const cookieJ1 = await sesionDe(j1.email);

    const crearRes = await request(app).post("/api/mesas").set("Cookie", cookieM);
    const mesaId = crearRes.body.id as string;
    await request(app).post(`/api/mesas/${mesaId}/unirse`).set("Cookie", cookieJ1);
    const wsJ1 = await abrirWs(port, cookieJ1);

    const macroArco = {
      id: "m-arco",
      nombre: "Disparo",
      icono: "Target",
      color: "#1d4ed8",
      grupos: [{ caras: 20, cantidad: 1 }],
      bonificador: 5
    };

    const saveRes = await request(app)
      .patch(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ1)
      .send({
        elementos: [
          {
            id: "elem-arco",
            tipo: "objeto",
            nombre: "Arco Largo",
            descripcion: "Madera élfica",
            cantidad: 1,
            x: 20,
            y: 30,
            macro: macroArco
          }
        ],
        mochila: [
          {
            id: "moch-daga",
            nombre: "Daga",
            descripcion: "Oculta",
            cantidad: 1,
            macro: macroArco
          }
        ]
      });
    expect(saveRes.status).toBe(204);

    const resumenRes = await request(app)
      .get(`/api/mesas/${mesaId}/master-resumen`)
      .set("Cookie", cookieM);
    expect(resumenRes.status).toBe(200);
    expect(resumenRes.body.jugadores[0].mochila[0].macro).toMatchObject({
      id: "m-arco",
      nombre: "Disparo",
      bonificador: 5
    });
    expect(resumenRes.body.jugadores[0].objetosMesa[0].macro).toMatchObject({
      id: "m-arco",
      nombre: "Disparo",
      bonificador: 5
    });

    const compartirTodosRes = await request(app)
      .post(`/api/mesas/${mesaId}/compartir-todos`)
      .set("Cookie", cookieM)
      .send({
        tipo: "objeto",
        objeto: {
          nombre: "Poción",
          descripcion: "Cura 2d4+2",
          cantidad: 1,
          macro: macroArco
        }
      });
    expect(compartirTodosRes.status).toBe(200);
    expect(compartirTodosRes.body.elemento.objeto.macro).toMatchObject({
      id: "m-arco",
      nombre: "Disparo",
      bonificador: 5
    });
    wsJ1.close();
  });
});
