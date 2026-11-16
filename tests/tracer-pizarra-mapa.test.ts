import { describe, expect, it } from "vitest";
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
import {
  sanitizarFondo,
  sanitizarMapaEstado
} from "../src/repositories/mapa-estado.repository.js";

const PASSWORD = "secreto123";

function notificadorEspia() {
  return {
    notificarCambio: () => {},
    notificarUsuario: () => {},
    enviarAUsuarios: () => {},
    mapaActualizado: () => {}
  };
}

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

  async function sesionDe(email: string) {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.headers["set-cookie"]![0]!.split(";")[0]!;
  }

  return { app, aprobar, sesionDe };
}

describe("Bala trazadora: persistencia de Pizarra y Mapa", () => {
  it("Pizarra: persiste posits (con ancho/alto) y objetos, eliminando contenidoLocal y data:... en documentos y objetos", async () => {
    const { app, aprobar, sesionDe } = montar();
    await aprobar("master-pizarra@pocket.test");
    await aprobar("jugador-pizarra@pocket.test");

    const cookieMaster = await sesionDe("master-pizarra@pocket.test");
    const cookieJugador = await sesionDe("jugador-pizarra@pocket.test");

    const crear = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster)
      .send()
      .expect(201);
    const mesaId = crear.body.id as string;

    await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJugador)
      .send()
      .expect(200);

    const payloadPizarra = {
      posits: [
        {
          id: "posit-1",
          texto: "Nota de sesión",
          x: 120,
          y: 80,
          ancho: 260,
          alto: 180,
          color: "#fef08a"
        }
      ],
      trazos: [],
      documentos: [
        {
          id: "doc-1",
          nombre: "Mapa antiguo.png",
          archivoId: "arch-doc-1",
          contenidoLocal: "base64-pesado-que-no-debe-persistir",
          imagenLocal: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          url: "data:image/png;base64,AAAA"
        }
      ],
      trazosEscena: [],
      positsEscena: [],
      docsEscena: [
        {
          id: "doc-escena-1",
          nombre: "Pista.jpg",
          archivoId: "arch-escena-1",
          contenidoLocal: "contenido-local-escena",
          imagenLocal: "  DATA:image/jpeg;base64,/9j/4AAQ  "
        }
      ],
      tamanoImagenesEscena: { "doc-escena-1": { w: 400, h: 300 } },
      congelada: false,
      objetos: [
        {
          id: "obj-1",
          tipo: "imagen",
          x: 50,
          y: 60,
          ancho: 320,
          alto: 240,
          archivoId: "arch-obj-1",
          contenidoLocal: "contenido-local-objeto",
          imagenLocal: "data:image/webp;base64,UklGRh4AAABXRUJQ",
          url: "https://ejemplo.local/ignorar"
        }
      ]
    };

    await request(app)
      .patch(`/api/mesas/${mesaId}/pizarra`)
      .set("Cookie", cookieMaster)
      .send(payloadPizarra)
      .expect(204);

    const getRes = await request(app)
      .get(`/api/mesas/${mesaId}/pizarra`)
      .set("Cookie", cookieJugador)
      .expect(200);

    expect(getRes.body.posits).toHaveLength(1);
    expect(getRes.body.posits[0]).toMatchObject({
      id: "posit-1",
      ancho: 260,
      alto: 180
    });

    expect(getRes.body.objetos).toHaveLength(1);
    expect(getRes.body.objetos[0]).toMatchObject({
      id: "obj-1",
      tipo: "imagen",
      archivoId: "arch-obj-1",
      ancho: 320,
      alto: 240
    });
    expect(getRes.body.objetos[0]).not.toHaveProperty("contenidoLocal");
    expect(getRes.body.objetos[0]).not.toHaveProperty("imagenLocal");
    expect(getRes.body.objetos[0]).not.toHaveProperty("url");

    expect(getRes.body.documentos).toHaveLength(1);
    expect(getRes.body.documentos[0]).not.toHaveProperty("contenidoLocal");
    expect(getRes.body.documentos[0]).not.toHaveProperty("imagenLocal");
    expect(getRes.body.documentos[0]).not.toHaveProperty("url");

    expect(getRes.body.docsEscena).toHaveLength(1);
    expect(getRes.body.docsEscena[0]).not.toHaveProperty("contenidoLocal");
    expect(getRes.body.docsEscena[0]).not.toHaveProperty("imagenLocal");
  });

  it("Mapa: persiste fondo, tokens con escala y enLimbo: true, y bloquea/elimina URLs data:image/...", async () => {
    const { app, aprobar, sesionDe } = montar();
    const master = await aprobar("master-mapa-tracer@pocket.test");
    await aprobar("jugador-mapa-tracer@pocket.test");

    const cookieMaster = await sesionDe("master-mapa-tracer@pocket.test");
    const cookieJugador = await sesionDe("jugador-mapa-tracer@pocket.test");

    const crear = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster)
      .send()
      .expect(201);
    const mesaId = crear.body.id as string;

    await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJugador)
      .send()
      .expect(200);

    const subidaFondo = await request(app)
      .post("/api/archivos?nombre=taberna.png")
      .set("Cookie", cookieMaster)
      .set("Content-Type", "image/png")
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      .expect(201);
    const fondoArchivoId = subidaFondo.body.id as string;

    // PUT fondo con una URL data:image/... junto a archivoId: debe descartar data:... y resolver a /api/archivos/:id
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/fondo`)
      .set("Cookie", cookieMaster)
      .send({
        fondo: {
          archivoId: fondoArchivoId,
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          titulo: "taberna.png",
          anchoNatural: 1600,
          altoNatural: 900
        }
      })
      .expect(200);

    // Subida de imagen para token
    const subidaToken = await request(app)
      .post("/api/archivos?nombre=dragon.png")
      .set("Cookie", cookieMaster)
      .set("Content-Type", "image/png")
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      .expect(201);
    const tokenArchivoId = subidaToken.body.id as string;

    // Crear token válido
    const crearTokenRes = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieMaster)
      .send({
        nombre: "Dragón Rojo",
        archivoId: tokenArchivoId,
        x: 35,
        y: 45,
        esMonstruo: true,
        guardarPlantilla: true,
        categoria: "Jefes"
      })
      .expect(201);

    const tokenId = crearTokenRes.body.tokens[0].id as string;

    // Actualizar token con escala y enLimbo: true
    await request(app)
      .patch(`/api/mesas/${mesaId}/mapa/tokens/${tokenId}`)
      .set("Cookie", cookieMaster)
      .send({
        escala: 2.5,
        enLimbo: true
      })
      .expect(200);

    // Intentar crear token + plantilla con data:image/... sin archivoId: sanitizarToken y sanitizarPlantilla deben bloquearlos
    const intentoDataUri = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieMaster)
      .send({
        nombre: "IntrusoDataUri",
        imagenUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        guardarPlantilla: true
      })
      .expect(201);

    expect(intentoDataUri.body.tokens).toHaveLength(1);
    expect(intentoDataUri.body.plantillas).toHaveLength(1);

    // Leer estado final del mapa y comprobar persistencia completa
    const getMapa = await request(app)
      .get(`/api/mesas/${mesaId}/mapa`)
      .set("Cookie", cookieJugador)
      .expect(200);

    expect(getMapa.body.fondo).toEqual({
      archivoId: fondoArchivoId,
      url: `/api/archivos/${fondoArchivoId}`,
      titulo: "taberna.png",
      anchoNatural: 1600,
      altoNatural: 900
    });

    expect(getMapa.body.tokens).toHaveLength(1);
    expect(getMapa.body.tokens[0]).toMatchObject({
      id: tokenId,
      nombre: "Dragón Rojo",
      imagenUrl: `/api/archivos/${tokenArchivoId}`,
      escala: 2.5,
      enLimbo: true,
      esMonstruo: true
    });

    // Verificación directa de sanitizarFondo y sanitizarMapaEstado (sanitizarToken / sanitizarPlantilla)
    expect(
      sanitizarFondo({ url: "data:image/png;base64,AAAA", titulo: "Bloqueado" })
    ).toBeNull();
    expect(
      sanitizarFondo({
        archivoId: "arch-1",
        url: "DATA:image/webp;base64,BBBB"
      })?.url
    ).toBe("/api/archivos/arch-1");

    const estadoSanitizado = sanitizarMapaEstado({
      fondo: { url: "data:image/png;base64,CCCC" },
      tokens: [
        {
          id: "tok-data",
          nombre: "Bloqueado",
          imagenUrl: "data:image/png;base64,DDDD",
          autorId: master.id
        },
        {
          id: "tok-arch",
          nombre: "ConArchivo",
          archivoId: "arch-2",
          imagenUrl: "data:image/jpeg;base64,EEEE",
          autorId: master.id
        }
      ],
      plantillas: [
        {
          id: "pl-data",
          nombre: "Bloqueada",
          imagenUrl: "data:image/gif;base64,FFFF",
          autorId: master.id
        },
        {
          id: "pl-arch",
          nombre: "ConArchivo",
          archivoId: "arch-3",
          imagenUrl: "data:image/png;base64,GGGG",
          autorId: master.id
        }
      ]
    });

    expect(estadoSanitizado.fondo).toBeNull();
    expect(estadoSanitizado.tokens).toHaveLength(1);
    expect(estadoSanitizado.tokens[0]!.id).toBe("tok-arch");
    expect(estadoSanitizado.tokens[0]!.imagenUrl).toBe("/api/archivos/arch-2");
    expect(estadoSanitizado.plantillas).toHaveLength(1);
    expect(estadoSanitizado.plantillas[0]!.id).toBe("pl-arch");
    expect(estadoSanitizado.plantillas[0]!.imagenUrl).toBe("/api/archivos/arch-3");
  });
});
