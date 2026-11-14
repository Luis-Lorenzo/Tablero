import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { config } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import {
  createUser,
  MemoryUserRepository
} from "../src/repositories/user.repository.js";
import { NoopMesasNotifier } from "../src/realtime/mesas-notifier.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { TransferenciaService } from "../src/services/transferencia.service.js";
import { UserService } from "../src/services/user.service.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";
const PDF = Buffer.from("%PDF-1.4 mapa secreto");

function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const archivosRepo = new MemoryArchivoRepository();
  const almacen = new MemoryAlmacen();
  const hasher = new FakePasswordHasher();
  const eventosUsuario: Array<{ userId: string; evento: unknown }> = [];

  const notifier = {
    ...new NoopMesasNotifier(),
    notificarCambio: () => {},
    notificarUsuario: (userId: string, evento: unknown) => {
      eventosUsuario.push({ userId, evento });
    }
  };

  const archivoService = new ArchivoService(
    archivosRepo,
    almacen,
    logger,
    config.archivos.maxBytes
  );
  const transferenciaService = new TransferenciaService(
    mesas,
    archivoService,
    logger
  );

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    mesaRepository: mesas,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger),
    archivoService,
    transferenciaService,
    mesasNotifier: notifier
  };

  const app = createApp(context);

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

  async function sesionDe(email: string) {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return String(login.headers["set-cookie"][0]).split(";")[0];
  }

  return { app, aprobar, sesionDe, eventosUsuario };
}

describe("rutas de /api/mesas/:id/compartir", () => {
  let montado: ReturnType<typeof montar>;
  let master: Awaited<ReturnType<ReturnType<typeof montar>["aprobar"]>>;
  let jugadora: Awaited<ReturnType<ReturnType<typeof montar>["aprobar"]>>;
  let externo: Awaited<ReturnType<ReturnType<typeof montar>["aprobar"]>>;
  let cookieMaster: string;
  let cookieJugadora: string;
  let cookieExterno: string;
  let mesaId: string;

  beforeEach(async () => {
    montado = montar();
    master = await montado.aprobar("master@pocket.test", "Master");
    jugadora = await montado.aprobar("aria@pocket.test", "Aria");
    externo = await montado.aprobar("externo@pocket.test", "Externo");

    cookieMaster = await montado.sesionDe("master@pocket.test");
    cookieJugadora = await montado.sesionDe("aria@pocket.test");
    cookieExterno = await montado.sesionDe("externo@pocket.test");

    const crear = await request(montado.app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster);
    expect(crear.status).toBe(201);
    mesaId = crear.body.id;

    const unirse = await request(montado.app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJugadora);
    expect(unirse.status).toBe(200);
  });

  it("exige autenticación", async () => {
    const res = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .send({ receptorId: jugadora.id, tipo: "posit", posit: { texto: "hola", color: "#fff" } });
    expect(res.status).toBe(401);
  });

  it("impide compartir con usuarios fuera de la mesa o desde fuera de la mesa", async () => {
    const desdeFuera = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieExterno)
      .send({
        receptorId: jugadora.id,
        tipo: "posit",
        posit: { texto: "intruso", color: "#f7ffae" }
      });
    expect(desdeFuera.status).toBe(403);

    const haciaFuera = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieMaster)
      .send({
        receptorId: externo.id,
        tipo: "posit",
        posit: { texto: "secreto", color: "#f7ffae" }
      });
    expect(haciaFuera.status).toBe(403);

    const aSiMismo = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieMaster)
      .send({
        receptorId: master.id,
        tipo: "posit",
        posit: { texto: "yo", color: "#f7ffae" }
      });
    expect(aSiMismo.status).toBe(400);
  });

  it("envía un posit, notifica por WebSocket y permite aceptarlo", async () => {
    const envio = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieMaster)
      .send({
        receptorId: jugadora.id,
        tipo: "posit",
        posit: { texto: "Pista secreta", color: "#96fbc7", giro: -2 }
      });

    expect(envio.status).toBe(201);
    expect(envio.body.emisorNombre).toBe("Master");
    expect(envio.body.tipo).toBe("posit");
    expect(montado.eventosUsuario).toHaveLength(1);
    expect(montado.eventosUsuario[0].userId).toBe(jugadora.id);

    const pendientes = await request(montado.app)
      .get(`/api/mesas/${mesaId}/compartir/pendientes`)
      .set("Cookie", cookieJugadora);
    expect(pendientes.status).toBe(200);
    expect(pendientes.body).toHaveLength(1);

    const aceptar = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir/${envio.body.id}/aceptar`)
      .set("Cookie", cookieJugadora);
    expect(aceptar.status).toBe(200);
    expect(aceptar.body).toEqual({
      tipo: "posit",
      posit: { texto: "Pista secreta", color: "#96fbc7", giro: -2 }
    });

    const pendientesDespues = await request(montado.app)
      .get(`/api/mesas/${mesaId}/compartir/pendientes`)
      .set("Cookie", cookieJugadora);
    expect(pendientesDespues.body).toEqual([]);
  });

  it("clona el archivo al receptor cuando acepta la transferencia", async () => {
    const subida = await request(montado.app)
      .post("/api/archivos?nombre=mapa.pdf")
      .set("Cookie", cookieMaster)
      .set("Content-Type", "application/pdf")
      .send(PDF);
    expect(subida.status).toBe(201);

    const envio = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieMaster)
      .send({
        receptorId: jugadora.id,
        tipo: "archivo",
        archivoId: subida.body.id
      });
    expect(envio.status).toBe(201);
    expect(envio.body.archivo.nombre).toBe("mapa.pdf");
    expect(envio.body.archivo.vista).toBe("pdf");

    const aceptar = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir/${envio.body.id}/aceptar`)
      .set("Cookie", cookieJugadora);
    expect(aceptar.status).toBe(200);
    expect(aceptar.body.tipo).toBe("archivo");
    expect(aceptar.body.archivo.id).not.toBe(subida.body.id);
    expect(aceptar.body.archivo.nombre).toBe("mapa.pdf");

    const descargaReceptor = await request(montado.app)
      .get(`/api/archivos/${aceptar.body.archivo.id}`)
      .set("Cookie", cookieJugadora);
    expect(descargaReceptor.status).toBe(200);
    expect(descargaReceptor.body).toEqual(PDF);
  });

  it("permite rechazar una transferencia e impide que otro jugador la acepte", async () => {
    const envio = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieMaster)
      .send({
        receptorId: jugadora.id,
        tipo: "posit",
        posit: { texto: "Recházame", color: "#ffb3cb" }
      });
    expect(envio.status).toBe(201);

    const intentoOtro = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir/${envio.body.id}/aceptar`)
      .set("Cookie", cookieExterno);
    expect(intentoOtro.status).toBe(403);

    const rechazar = await request(montado.app)
      .post(`/api/mesas/${mesaId}/compartir/${envio.body.id}/rechazar`)
      .set("Cookie", cookieJugadora);
    expect(rechazar.status).toBe(204);

    const pendientes = await request(montado.app)
      .get(`/api/mesas/${mesaId}/compartir/pendientes`)
      .set("Cookie", cookieJugadora);
    expect(pendientes.body).toEqual([]);
  });
});
