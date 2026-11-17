import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import {
  createUser,
  MemoryUserRepository
} from "../src/repositories/user.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import { AuthService } from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { ChatService } from "../src/services/chat.service.js";
import { UserService } from "../src/services/user.service.js";
import { NoopMesasNotifier } from "../src/realtime/mesas-notifier.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";
const PDF = Buffer.from("%PDF-1.4 contenido de prueba");

function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();
  const archivoService = new ArchivoService(
    new MemoryArchivoRepository(),
    new MemoryAlmacen(),
    logger,
    config.archivos.maxBytes,
    mesas
  );

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    mesaRepository: mesas,
    authService: new AuthService(users, hasher, logger),
    userService: new UserService(users, logger),
    bloqueoService: new BloqueoService(logger),
    mesaService: new MesaService(mesas, users, logger, archivoService),
    chatService: new ChatService(mesas, users),
    archivoService,
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
    return String(login.headers["set-cookie"][0]).split(";")[0];
  }

  return { app, aprobar, sesionDe };
}

describe("rutas de /api/archivos", () => {
  let montado: ReturnType<typeof montar>;
  let cookie: string;

  beforeEach(async () => {
    montado = montar();
    await montado.aprobar("jugadora@pocket.test");
    await montado.aprobar("otra@pocket.test");
    cookie = await montado.sesionDe("jugadora@pocket.test");
  });

  function subir(cabecera = cookie, nombre = "reglas.pdf", tipo = "application/pdf") {
    return request(montado.app)
      .post(`/api/archivos?nombre=${encodeURIComponent(nombre)}`)
      .set("Cookie", cabecera)
      .set("Content-Type", tipo)
      .send(PDF);
  }

  it("exige sesión", async () => {
    const response = await request(montado.app)
      .post("/api/archivos?nombre=x.pdf")
      .set("Content-Type", "application/pdf")
      .send(PDF);
    expect(response.status).toBe(401);
  });

  it("sube, lista, sirve y borra un archivo", async () => {
    const subida = await subir();
    expect(subida.status).toBe(201);
    expect(subida.body.nombre).toBe("reglas.pdf");
    expect(subida.body.tipo).toBe("application/pdf");
    expect(subida.body.vista).toBe("pdf");
    expect(subida.body.tamano).toBe(PDF.length);

    const listado = await request(montado.app)
      .get("/api/archivos")
      .set("Cookie", cookie);
    expect(listado.status).toBe(200);
    expect(listado.body).toHaveLength(1);
    expect(listado.body[0].id).toBe(subida.body.id);

    const descarga = await request(montado.app)
      .get(`/api/archivos/${subida.body.id}`)
      .set("Cookie", cookie);
    expect(descarga.status).toBe(200);
    expect(descarga.headers["content-type"]).toContain("application/pdf");
    expect(descarga.headers["content-disposition"]).toContain("inline");
    expect(descarga.body).toEqual(PDF);

    const borrado = await request(montado.app)
      .delete(`/api/archivos/${subida.body.id}`)
      .set("Cookie", cookie);
    expect(borrado.status).toBe(204);

    const listadoFinal = await request(montado.app)
      .get("/api/archivos")
      .set("Cookie", cookie);
    expect(listadoFinal.body).toHaveLength(0);
  });

  it("no deja ver ni borrar archivos de otra persona", async () => {
    const subida = await subir();
    const otra = await montado.sesionDe("otra@pocket.test");

    const ver = await request(montado.app)
      .get(`/api/archivos/${subida.body.id}`)
      .set("Cookie", otra);
    expect(ver.status).toBe(403);

    const borrar = await request(montado.app)
      .delete(`/api/archivos/${subida.body.id}`)
      .set("Cookie", otra);
    expect(borrar.status).toBe(403);
  });

  it("rechaza tipos no permitidos y cuerpos vacíos", async () => {
    const tipoRaro = await subir(cookie, "virus.exe", "application/x-msdownload");
    expect(tipoRaro.status).toBe(400);
    expect(tipoRaro.body.error).toBe("ARCHIVO_TIPO_INVALIDO");

    const vacio = await request(montado.app)
      .post("/api/archivos?nombre=vacio.pdf")
      .set("Cookie", cookie)
      .set("Content-Type", "application/pdf")
      .send(Buffer.alloc(0));
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toBe("ARCHIVO_VACIO");
  });

  it("devuelve 404 para un id con formato inválido", async () => {
    const response = await request(montado.app)
      .get("/api/archivos/no-es-un-uuid")
      .set("Cookie", cookie);
    expect(response.status).toBe(404);
  });

  it("separa archivos de recepción y de mesa, y al cerrar la mesa borra solo los de la mesa", async () => {
    const personal = await subir(cookie, "personal.pdf");
    expect(personal.status).toBe(201);

    const mesaCreada = await request(montado.app)
      .post("/api/mesas")
      .set("Cookie", cookie);
    expect(mesaCreada.status).toBe(201);
    const mesaId = mesaCreada.body.id as string;

    const deMesa = await request(montado.app)
      .post(`/api/archivos?nombre=escena.pdf&mesaId=${encodeURIComponent(mesaId)}`)
      .set("Cookie", cookie)
      .set("Content-Type", "application/pdf")
      .send(PDF);
    expect(deMesa.status).toBe(201);

    const enRecepcion = await request(montado.app)
      .get("/api/archivos")
      .set("Cookie", cookie);
    expect(enRecepcion.status).toBe(200);
    expect(enRecepcion.body.map((a: { id: string }) => a.id)).toEqual([personal.body.id]);

    const enMesa = await request(montado.app)
      .get(`/api/archivos?mesaId=${encodeURIComponent(mesaId)}`)
      .set("Cookie", cookie);
    expect(enMesa.status).toBe(200);
    expect(enMesa.body.map((a: { id: string }) => a.id)).toContain(personal.body.id);
    expect(enMesa.body.map((a: { id: string }) => a.id)).toContain(deMesa.body.id);

    const cerrar = await request(montado.app)
      .delete(`/api/mesas/${mesaId}`)
      .set("Cookie", cookie);
    expect(cerrar.status).toBe(204);

    const archivoMesaTrasCierre = await request(montado.app)
      .get(`/api/archivos/${deMesa.body.id}`)
      .set("Cookie", cookie);
    expect(archivoMesaTrasCierre.status).toBe(404);

    const archivoPersonalTrasCierre = await request(montado.app)
      .get(`/api/archivos/${personal.body.id}`)
      .set("Cookie", cookie);
    expect(archivoPersonalTrasCierre.status).toBe(200);
    expect(archivoPersonalTrasCierre.body).toEqual(PDF);
  });
});
