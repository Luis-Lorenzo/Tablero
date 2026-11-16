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
import { ChatService } from "../src/services/chat.service.js";
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
    notificarUsuario: () => {},
    enviarAUsuarios: () => {},
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
    chatService: new ChatService(mesas, users),
    archivoService: new ArchivoService(
      new MemoryArchivoRepository(),
      new MemoryAlmacen(),
      logger,
      config.archivos.maxBytes,
      mesas
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

  it("solo el anfitrión fija la escena o proyecta imágenes y los jugadores de su mesa pueden verlas", async () => {
    await aprobar("ajena@pocket.test");
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieInvitada = await sesionDe("invitada@pocket.test");
    const cookieAjena = await sesionDe("ajena@pocket.test");

    const creada = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieAnfitrion);
    const mesaId = creada.body.id;

    await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieInvitada);

    const pngFake = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const subida = await request(app)
      .post("/api/archivos?nombre=taberna.png")
      .set("Cookie", cookieAnfitrion)
      .set("Content-Type", "image/png")
      .send(pngFake);
    expect(subida.status).toBe(201);
    const archivoId = subida.body.id;

    const avisosAntes = notifier.avisos.length;

    const escenaInvitada = await request(app)
      .post(`/api/mesas/${mesaId}/escena`)
      .set("Cookie", cookieInvitada)
      .send({ archivoId, titulo: "Intento indebido" });
    expect(escenaInvitada.status).toBe(403);
    expect(escenaInvitada.body.error).toBe("FORBIDDEN");

    const proyeccionInvitada = await request(app)
      .post(`/api/mesas/${mesaId}/proyeccion`)
      .set("Cookie", cookieInvitada)
      .send({ archivoId, titulo: "Intento indebido" });
    expect(proyeccionInvitada.status).toBe(403);
    expect(proyeccionInvitada.body.error).toBe("FORBIDDEN");

    const escenaMaster = await request(app)
      .post(`/api/mesas/${mesaId}/escena`)
      .set("Cookie", cookieAnfitrion)
      .send({ archivoId, titulo: "La taberna del dragón" });
    expect(escenaMaster.status).toBe(200);
    expect(escenaMaster.body.imagenEscena).toEqual({
      id: archivoId,
      titulo: "La taberna del dragón"
    });
    expect(notifier.avisos.length).toBe(avisosAntes + 1);

    const proyeccionMaster = await request(app)
      .post(`/api/mesas/${mesaId}/proyeccion`)
      .set("Cookie", cookieAnfitrion)
      .send({ archivoId, titulo: "Un dragón despierta" });
    expect(proyeccionMaster.status).toBe(200);
    expect(proyeccionMaster.body.imagenProyectada).toEqual({
      id: archivoId,
      titulo: "Un dragón despierta"
    });
    expect(notifier.avisos.length).toBe(avisosAntes + 2);

    const vistaInvitada = await request(app)
      .get(`/api/mesas/${mesaId}`)
      .set("Cookie", cookieInvitada);
    expect(vistaInvitada.status).toBe(200);
    expect(vistaInvitada.body.imagenEscena.id).toBe(archivoId);
    expect(vistaInvitada.body.imagenProyectada.id).toBe(archivoId);

    const verArchivoInvitada = await request(app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", cookieInvitada);
    expect(verArchivoInvitada.status).toBe(200);
    expect(Buffer.from(verArchivoInvitada.body)).toEqual(pngFake);

    const verArchivoAjena = await request(app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", cookieAjena);
    expect(verArchivoAjena.status).toBe(403);
    expect(verArchivoAjena.body.error).toBe("FORBIDDEN");

    const retirarProyeccion = await request(app)
      .post(`/api/mesas/${mesaId}/proyeccion`)
      .set("Cookie", cookieAnfitrion)
      .send({ archivoId: null });
    expect(retirarProyeccion.status).toBe(200);
    expect(retirarProyeccion.body.imagenProyectada).toBeNull();
  });

  it("persiste elementos en mesa por usuario y sanea contenidoLocal", async () => {
    await aprobar("ajena-estado@pocket.test");
    const cookieAnfitrion = await sesionDe("anfitrion@pocket.test");
    const cookieAjena = await sesionDe("ajena-estado@pocket.test");

    const creada = await request(app).post("/api/mesas").set("Cookie", cookieAnfitrion);
    const mesaId = creada.body.id as string;

    const guardar = await request(app)
      .patch(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieAnfitrion)
      .send({
        elementos: [
          {
            id: "el-1",
            tipo: "archivo",
            archivoId: "abc",
            nombre: "mapa.png",
            contenidoLocal: "data:image/png;base64,SECRET"
          }
        ]
      });
    expect(guardar.status).toBe(204);

    const obtener = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieAnfitrion);
    expect(obtener.status).toBe(200);
    expect(obtener.body.elementos).toEqual([
      { id: "el-1", tipo: "archivo", archivoId: "abc", nombre: "mapa.png" }
    ]);

    const ajena = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieAjena);
    expect(ajena.status).toBe(403);
  });

  it("persiste y sincroniza pizarra y vista escena y respeta congelada del máster", async () => {
    await aprobar("jugadora-piz@pocket.test");
    const cookieMaster = await sesionDe("anfitrion@pocket.test");
    const cookieJugadora = await sesionDe("jugadora-piz@pocket.test");

    const creada = await request(app).post("/api/mesas").set("Cookie", cookieMaster);
    const mesaId = creada.body.id as string;

    const unirse = await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJugadora);
    expect(unirse.status).toBe(200);

    const guardar = await request(app)
      .patch(`/api/mesas/${mesaId}/pizarra`)
      .set("Cookie", cookieMaster)
      .send({
        posits: [{ id: "p1", texto: "Pista", color: "#fff", x: 10, y: 20, giro: 0 }],
        trazos: [],
        documentos: [{ id: "d1", nombre: "nota.txt", url: "blob:secret" }],
        trazosEscena: [{ id: "t1", color: "#f4f7ff", grosor: 4, puntos: [] }],
        positsEscena: [],
        docsEscena: [],
        tamanoImagenesEscena: { d1: { w: 40, h: 30 } },
        congelada: true
      });
    expect(guardar.status).toBe(204);

    const obtener = await request(app)
      .get(`/api/mesas/${mesaId}/pizarra`)
      .set("Cookie", cookieJugadora);
    expect(obtener.status).toBe(200);
    expect(obtener.body.congelada).toBe(true);
    expect(obtener.body.documentos).toEqual([{ id: "d1", nombre: "nota.txt" }]);
    expect(obtener.body.trazosEscena).toHaveLength(1);
    expect(obtener.body.tamanoImagenesEscena).toEqual({ d1: { w: 40, h: 30 } });

    const edicionBloqueada = await request(app)
      .patch(`/api/mesas/${mesaId}/pizarra`)
      .set("Cookie", cookieJugadora)
      .send({
        posits: [],
        trazos: [],
        documentos: [],
        trazosEscena: [],
        positsEscena: [],
        docsEscena: [],
        tamanoImagenesEscena: {},
        congelada: false
      });
    expect(edicionBloqueada.status).toBe(403);
  });

  it("persiste divisa, nombre de divisa (solo máster), mochila y transferencia de objetos", async () => {
    const { app, aprobar, sesionDe } = montar();
    await aprobar("host-dm@pocket.test");
    await aprobar("jug-inv@pocket.test");

    const cookieMaster = await sesionDe("host-dm@pocket.test");
    const cookieJugadora = await sesionDe("jug-inv@pocket.test");

    const crear = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster)
      .send();
    const mesaId = crear.body.id as string;
    const jugadoraId = (
      await request(app)
        .post(`/api/mesas/${mesaId}/unirse`)
        .set("Cookie", cookieJugadora)
        .send()
    ).body.players[0].id as string;

    // Nombre de divisa: solo el máster puede cambiarlo
    await request(app)
      .patch(`/api/mesas/${mesaId}/divisa-nombre`)
      .set("Cookie", cookieJugadora)
      .send({ nombre: "Créditos" })
      .expect(403);

    const ren = await request(app)
      .patch(`/api/mesas/${mesaId}/divisa-nombre`)
      .set("Cookie", cookieMaster)
      .send({ nombre: "Oro" })
      .expect(200);
    expect(ren.body.divisaNombre).toBe("Oro");

    // Divisa del jugador
    const divRes = await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJugadora)
      .send({ divisa: 250, delta: 250 })
      .expect(200);
    expect(divRes.body.divisa).toBe(250);

    // Mochila en estado
    await request(app)
      .patch(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJugadora)
      .send({
        mochila: [
          {
            id: "obj-1",
            nombre: "Poción curativa",
            descripcion: "Recupera 2d4+2 PG",
            cantidad: 3,
            emoji: "🧪"
          }
        ]
      })
      .expect(204);

    const estado = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJugadora)
      .expect(200);
    expect(estado.body.divisa).toBe(250);
    expect(estado.body.mochila).toEqual([
      {
        id: "obj-1",
        nombre: "Poción curativa",
        descripcion: "Recupera 2d4+2 PG",
        cantidad: 3,
        emoji: "🧪"
      }
    ]);

    // Transferencia de objeto entre miembros
    const comp = await request(app)
      .post(`/api/mesas/${mesaId}/compartir`)
      .set("Cookie", cookieJugadora)
      .send({
        receptorId: crear.body.hostId,
        tipo: "objeto",
        objeto: {
          idOrigen: "obj-1",
          nombre: "Poción curativa",
          descripcion: "Recupera 2d4+2 PG",
          cantidad: 1,
          emoji: "🧪"
        }
      })
      .expect(201);
    expect(comp.body.tipo).toBe("objeto");
    expect(jugadoraId).toBeTruthy();

    const aceptada = await request(app)
      .post(`/api/mesas/${mesaId}/compartir/${comp.body.id}/aceptar`)
      .set("Cookie", cookieMaster)
      .expect(200);
    expect(aceptada.body.tipo).toBe("objeto");
    expect(aceptada.body.objeto.nombre).toBe("Poción curativa");
  });
});
