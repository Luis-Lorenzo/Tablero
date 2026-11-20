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
import { NoopMesasNotifier, type MesasNotifier } from "../src/realtime/mesas-notifier.js";
import type { AppContext } from "../src/api/context.js";

const PASSWORD = "secreto123";
const PDF = Buffer.from("%PDF-1.4 contenido de prueba");

class SpyMesasNotifier extends NoopMesasNotifier implements MesasNotifier {
  readonly enviados: Array<{ userIds: readonly string[]; payload: unknown }> = [];

  override enviarAUsuarios(userIds: readonly string[], payload: unknown): void {
    this.enviados.push({ userIds, payload });
  }
}

function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const archivoRepo = new MemoryArchivoRepository();
  const almacen = new MemoryAlmacen();
  const hasher = new FakePasswordHasher();
  const archivoService = new ArchivoService(
    archivoRepo,
    almacen,
    logger,
    config.archivos.maxBytes,
    mesas
  );
  const notifier = new SpyMesasNotifier();

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
    mesasNotifier: notifier
  };

  const app = createApp(context);

  async function aprobar(email: string, role: "USER" | "ADMIN" = "USER") {
    const user = createUser({
      email,
      passwordHash: await hasher.hash(PASSWORD),
      role,
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

  return { app, aprobar, sesionDe, users, archivoService, notifier };
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

  it("PUT /api/archivos/:id sobrescribe en sitio, actualiza ETag y respeta permisos y límites", async () => {
    await montado.aprobar("admin@pocket.test", "ADMIN");
    const cookieAdmin = await montado.sesionDe("admin@pocket.test");
    const cookieOtra = await montado.sesionDe("otra@pocket.test");

    const subida = await request(montado.app)
      .post("/api/archivos?nombre=notas.txt")
      .set("Cookie", cookie)
      .set("Content-Type", "text/plain")
      .send(Buffer.from("versión 1", "utf8"));
    expect(subida.status).toBe(201);
    const id = String(subida.body.id);

    const getInicial = await request(montado.app)
      .get(`/api/archivos/${id}`)
      .set("Cookie", cookie);
    expect(getInicial.status).toBe(200);
    expect(getInicial.headers["cache-control"]).toBe("private, no-cache");
    const etagInicial = String(getInicial.headers.etag);

    // Sin sesión -> 401
    const sinSesion = await request(montado.app)
      .put(`/api/archivos/${id}`)
      .set("Content-Type", "text/plain")
      .send(Buffer.from("hack", "utf8"));
    expect(sinSesion.status).toBe(401);

    // Otro usuario -> 403
    const ajeno = await request(montado.app)
      .put(`/api/archivos/${id}`)
      .set("Cookie", cookieOtra)
      .set("Content-Type", "text/plain")
      .send(Buffer.from("ajeno", "utf8"));
    expect(ajeno.status).toBe(403);

    // Cuerpo vacío -> 400 ARCHIVO_VACIO
    const vacio = await request(montado.app)
      .put(`/api/archivos/${id}`)
      .set("Cookie", cookie)
      .set("Content-Type", "text/plain")
      .send(Buffer.alloc(0));
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toBe("ARCHIVO_VACIO");

    // Excede límite de bytes -> 413
    const demasiado = Buffer.alloc(config.archivos.maxBytes + 10, 65);
    const grande = await request(montado.app)
      .put(`/api/archivos/${id}`)
      .set("Cookie", cookie)
      .set("Content-Type", "text/plain")
      .send(demasiado);
    expect(grande.status).toBe(413);

    // Propietario actualiza -> 200 y nuevo ETag
    const nuevoTexto = Buffer.from("versión 2 actualizada!", "utf8");
    const actualizado = await request(montado.app)
      .put(`/api/archivos/${id}`)
      .set("Cookie", cookie)
      .set("Content-Type", "text/plain")
      .send(nuevoTexto);
    expect(actualizado.status).toBe(200);
    expect(actualizado.body.tamano).toBe(nuevoTexto.length);
    expect(actualizado.body.updatedAt).toBeTruthy();

    // El ETag antiguo ya NO devuelve 304, devuelve 200 con los bytes nuevos
    const trasCambioConEtagViejo = await request(montado.app)
      .get(`/api/archivos/${id}`)
      .set("Cookie", cookie)
      .set("If-None-Match", etagInicial);
    expect(trasCambioConEtagViejo.status).toBe(200);
    expect(trasCambioConEtagViejo.text).toBe("versión 2 actualizada!");

    const etagNuevo = String(trasCambioConEtagViejo.headers.etag);
    expect(etagNuevo).not.toBe(etagInicial);

    const revalidadoNuevo = await request(montado.app)
      .get(`/api/archivos/${id}`)
      .set("Cookie", cookie)
      .set("If-None-Match", etagNuevo);
    expect(revalidadoNuevo.status).toBe(304);

    // Admin también puede actualizar -> 200
    const adminEdit = await request(montado.app)
      .put(`/api/archivos/${id}`)
      .set("Cookie", cookieAdmin)
      .set("Content-Type", "text/plain")
      .send(Buffer.from("editado por admin", "utf8"));
    expect(adminEdit.status).toBe(200);
  });

  it("aplica copy-on-write al actualizar un archivo compartido por referencia y emite WS archivo:actualizado en mesa", async () => {
    const dueña = await montado.users.findByEmail("jugadora@pocket.test");
    const receptora = await montado.users.findByEmail("otra@pocket.test");
    expect(dueña && receptora).toBeTruthy();

    const mesaRes = await request(montado.app).post("/api/mesas").set("Cookie", cookie);
    expect(mesaRes.status).toBe(201);
    const mesaId = String(mesaRes.body.id);

    const originalPdf = Buffer.from("%PDF-1.4 ficha vacia");
    const subida = await request(montado.app)
      .post(`/api/archivos?nombre=ficha.pdf&mesaId=${encodeURIComponent(mesaId)}`)
      .set("Cookie", cookie)
      .set("Content-Type", "application/pdf")
      .send(originalPdf);
    expect(subida.status).toBe(201);

    const clon = await montado.archivoService.clonarPara(
      dueña!.id,
      String(subida.body.id),
      receptora!,
      mesaId
    );
    const cookieReceptora = await montado.sesionDe("otra@pocket.test");
    montado.notifier.enviados.length = 0;

    // La receptora guarda cambios en su copia -> copy-on-write, no pisa el original de la dueña
    const pdfRellenado = Buffer.from("%PDF-1.4 ficha rellenada por jugadora");
    const putClon = await request(montado.app)
      .put(`/api/archivos/${clon.id}`)
      .set("Cookie", cookieReceptora)
      .set("Content-Type", "application/pdf")
      .send(pdfRellenado);
    expect(putClon.status).toBe(200);

    const lecturaOriginal = await request(montado.app)
      .get(`/api/archivos/${subida.body.id}`)
      .set("Cookie", cookie);
    expect(Buffer.from(lecturaOriginal.body)).toEqual(originalPdf);

    const lecturaClon = await request(montado.app)
      .get(`/api/archivos/${clon.id}`)
      .set("Cookie", cookieReceptora);
    expect(Buffer.from(lecturaClon.body)).toEqual(pdfRellenado);

    // Se emitió evento WS archivo:actualizado a los miembros de la mesa
    expect(montado.notifier.enviados).toHaveLength(1);
    expect(montado.notifier.enviados[0].payload).toMatchObject({
      type: "archivo:actualizado",
      mesaId,
      archivoId: clon.id,
      autorId: receptora!.id,
      tamano: pdfRellenado.length
    });
  });

  it("permite subir y editar archivos .md, .json y .csv con vista 'texto'", async () => {
    for (const caso of [
      { nombre: "notas.md", tipo: "text/markdown", body: "# Título\nHola", next: "# Editado" },
      { nombre: "hoja.json", tipo: "application/json", body: "{\"hp\":10}", next: "{\"hp\":12}" },
      { nombre: "tabla.csv", tipo: "text/csv", body: "a,b\n1,2", next: "a,b\n3,4" }
    ]) {
      const resSubida = await request(montado.app)
        .post(`/api/archivos?nombre=${encodeURIComponent(caso.nombre)}`)
        .set("Cookie", cookie)
        .set("Content-Type", caso.tipo)
        .send(caso.body);
      expect(resSubida.status).toBe(201);
      expect(resSubida.body.vista).toBe("texto");

      const resPut = await request(montado.app)
        .put(`/api/archivos/${resSubida.body.id}`)
        .set("Cookie", cookie)
        .set("Content-Type", caso.tipo)
        .send(caso.next);
      expect(resPut.status).toBe(200);

      const resGet = await request(montado.app)
        .get(`/api/archivos/${resSubida.body.id}`)
        .set("Cookie", cookie);
      expect(resGet.text).toBe(caso.next);
    }
  });
});
