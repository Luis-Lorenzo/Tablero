import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { MemoryMesaEstadoRepository } from "../src/repositories/mesa-estado.repository.js";
import { MemoryUserMacrosRepository } from "../src/repositories/user-macros.repository.js";
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

function notificadorEspia() {
  const avisos: number[] = [];
  const envios: Array<{ userIds: readonly string[]; payload: unknown }> = [];
  return {
    notificarCambio: () => {
      avisos.push(avisos.length + 1);
    },
    notificarUsuario: () => {},
    enviarAUsuarios: (userIds: readonly string[], payload: unknown) => {
      envios.push({ userIds, payload });
    },
    mapaActualizado: () => {},
    avisos,
    envios
  };
}

function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const mesaEstadoRepository = new MemoryMesaEstadoRepository();
  const userMacrosRepository = new MemoryUserMacrosRepository();
  const hasher = new FakePasswordHasher();
  const notifier = notificadorEspia();

  const context: AppContext = {
    config,
    logger,
    userRepository: users,
    userMacrosRepository,
    mesaRepository: mesas,
    mesaEstadoRepository,
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
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });

    expect(login.status).toBe(200);
    return login.headers["set-cookie"][0].split(";")[0];
  }

  return { app, aprobar, sesionDe, mesaEstadoRepository, notifier };
}

describe("tracer-bullet: persistencia Mesa, Divisas, Macros y Música", () => {
  let app: ReturnType<typeof montar>["app"];
  let aprobar: ReturnType<typeof montar>["aprobar"];
  let sesionDe: ReturnType<typeof montar>["sesionDe"];
  let mesaEstadoRepository: ReturnType<typeof montar>["mesaEstadoRepository"];

  beforeEach(async () => {
    const ctx = montar();
    app = ctx.app;
    aprobar = ctx.aprobar;
    sesionDe = ctx.sesionDe;
    mesaEstadoRepository = ctx.mesaEstadoRepository;
  });

  it("verifica música de ambiente, divisas por lotes, macros con color hex y sanitización de estado", async () => {
    await aprobar("master@pocket.test");
    const jugador1 = await aprobar("jugador1@pocket.test");
    const jugador2 = await aprobar("jugador2@pocket.test");

    const cookieMaster = await sesionDe("master@pocket.test");
    const cookieJ1 = await sesionDe("jugador1@pocket.test");
    const cookieJ2 = await sesionDe("jugador2@pocket.test");

    // Crear mesa y unir dos jugadores
    const creada = await request(app).post("/api/mesas").set("Cookie", cookieMaster);
    expect(creada.status).toBe(201);
    const mesaId = creada.body.id as string;

    const unirse1 = await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJ1);
    expect(unirse1.status).toBe(200);

    const unirse2 = await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJ2);
    expect(unirse2.status).toBe(200);

    // 1. Música: subir MP3, 403 para jugador, guardar playlist por Máster y persistir en GET /api/mesas/inicio
    const mp3Fake = Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00");
    const subidaMp3 = await request(app)
      .post("/api/archivos?nombre=taberna.mp3")
      .set("Cookie", cookieMaster)
      .set("Content-Type", "audio/mpeg")
      .send(mp3Fake);
    expect(subidaMp3.status).toBe(201);
    const mp3Id = subidaMp3.body.id as string;

    const musicaPayload = {
      pistas: [{ archivoId: mp3Id, nombre: "Taberna del Dragón" }],
      indiceActual: 0,
      reproduciendo: true,
      loop: false,
      aleatorio: true,
      volumenMaster: 0.45
    };

    const musicaJugador = await request(app)
      .put(`/api/mesas/${mesaId}/musica`)
      .set("Cookie", cookieJ1)
      .send(musicaPayload);
    expect(musicaJugador.status).toBe(403);

    const musicaMaster = await request(app)
      .put(`/api/mesas/${mesaId}/musica`)
      .set("Cookie", cookieMaster)
      .send(musicaPayload);
    expect(musicaMaster.status).toBe(200);
    expect(musicaMaster.body.musica).toEqual({
      pistas: [{ archivoId: mp3Id, nombre: "Taberna del Dragón" }],
      indiceActual: 0,
      reproduciendo: true,
      loop: false,
      aleatorio: true,
      volumenMaster: 0.45
    });

    const inicioTrasRecarga = await request(app)
      .get("/api/mesas/inicio")
      .set("Cookie", cookieJ1);
    expect(inicioTrasRecarga.status).toBe(200);
    const mesaEnInicio = (inicioTrasRecarga.body as Array<{ id: string; musicaAmbiente?: unknown } | null>).find(
      m => m?.id === mesaId
    );
    expect(mesaEnInicio).toBeDefined();
    expect(mesaEnInicio?.musicaAmbiente).toEqual({
      pistas: [{ archivoId: mp3Id, nombre: "Taberna del Dragón" }],
      indiceActual: 0,
      reproduciendo: true,
      loop: false,
      aleatorio: true,
      volumenMaster: 0.45
    });

    // 1b. Avance automático con índice esperado: si dos pestañas del Máster
    // avisan a la vez, solo la primera mueve la pista y la segunda no se salta
    // una canción (recibe el estado que ya había).
    const dosPistas = [
      { archivoId: mp3Id, nombre: "Pista A" },
      { archivoId: mp3Id, nombre: "Pista B" }
    ];
    const avance = await request(app)
      .put(`/api/mesas/${mesaId}/musica`)
      .set("Cookie", cookieMaster)
      .send({
        musica: { ...musicaPayload, pistas: dosPistas, indiceActual: 1 },
        indiceEsperado: 0
      });
    expect(avance.status).toBe(200);
    expect(avance.body.musica.indiceActual).toBe(1);

    const avanceDuplicado = await request(app)
      .put(`/api/mesas/${mesaId}/musica`)
      .set("Cookie", cookieMaster)
      .send({
        musica: {
          ...musicaPayload,
          pistas: dosPistas,
          indiceActual: 1
        },
        indiceEsperado: 0
      });
    expect(avanceDuplicado.status).toBe(200);
    expect(avanceDuplicado.body.musica.indiceActual).toBe(1);

    // Un cambio manual (sin `indiceEsperado`) siempre se aplica.
    const cambioManual = await request(app)
      .put(`/api/mesas/${mesaId}/musica`)
      .set("Cookie", cookieMaster)
      .send({
        musica: { ...musicaPayload, pistas: dosPistas, indiceActual: 0 }
      });
    expect(cambioManual.status).toBe(200);
    expect(cambioManual.body.musica.indiceActual).toBe(0);

    // 2. Divisas: configurar divisas, actualizar saldos distintos para dos jugadores y verificar master-resumen con carga por lotes
    const configDivisas = await request(app)
      .put(`/api/mesas/${mesaId}/divisas`)
      .set("Cookie", cookieMaster)
      .send({
        divisas: [
          { id: "principal", nombre: "Oro", color: "#e8c56a" },
          { id: "plata", nombre: "Plata", color: "#cbd5e1" }
        ]
      });
    expect(configDivisas.status).toBe(200);

    const j1Oro = await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJ1)
      .send({ divisaId: "principal", divisa: 150, delta: 150 });
    expect(j1Oro.status).toBe(200);
    expect(j1Oro.body.divisasSaldos).toEqual({ principal: 150 });

    const j1Plata = await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJ1)
      .send({ divisaId: "plata", divisa: 40, delta: 40 });
    expect(j1Plata.status).toBe(200);
    expect(j1Plata.body.divisasSaldos).toEqual({ principal: 150, plata: 40 });

    const j2Oro = await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJ2)
      .send({ divisaId: "principal", divisa: 25, delta: 25 });
    expect(j2Oro.status).toBe(200);

    const j2Plata = await request(app)
      .patch(`/api/mesas/${mesaId}/divisa`)
      .set("Cookie", cookieJ2)
      .send({ divisaId: "plata", divisa: 90, delta: 90 });
    expect(j2Plata.status).toBe(200);
    expect(j2Plata.body.divisasSaldos).toEqual({ principal: 25, plata: 90 });

    const spyBatch = vi.spyOn(mesaEstadoRepository, "getEstadosPorMesa");
    const resumen = await request(app)
      .get(`/api/mesas/${mesaId}/master-resumen`)
      .set("Cookie", cookieMaster);
    expect(resumen.status).toBe(200);
    expect(spyBatch).toHaveBeenCalledTimes(1);
    expect(spyBatch).toHaveBeenCalledWith(mesaId, [jugador1.id, jugador2.id]);

    const jugadoresResumen = resumen.body.jugadores as Array<{
      userId: string;
      divisasSaldos: Record<string, number>;
    }>;
    expect(jugadoresResumen.find(j => j.userId === jugador1.id)?.divisasSaldos).toEqual({
      principal: 150,
      plata: 40
    });
    expect(jugadoresResumen.find(j => j.userId === jugador2.id)?.divisasSaldos).toEqual({
      principal: 25,
      plata: 90
    });

    // 3. Macros: PATCH /api/users/me/macros + GET /api/users/me/macros conserva color hex
    const macrosPayload = [
      {
        id: "macro-fuego",
        nombre: "Bola de Fuego",
        icono: "Flame",
        color: "#ff5500",
        grupos: [{ id: "g1", cantidad: 8, caras: 6 }],
        bonificador: 3
      }
    ];

    const patchMacros = await request(app)
      .patch("/api/users/me/macros")
      .set("Cookie", cookieJ1)
      .send({ macros: macrosPayload });
    expect(patchMacros.status).toBe(200);
    expect(patchMacros.body.macros).toEqual(macrosPayload);

    const getMacros = await request(app)
      .get("/api/users/me/macros")
      .set("Cookie", cookieJ1);
    expect(getMacros.status).toBe(200);
    expect(getMacros.body.macros).toEqual(macrosPayload);
    expect(getMacros.body.macros[0].color).toBe("#ff5500");

    // 4. Estado de mesa: sanitizarElementosMesa elimina contenidoLocal y data: en url/imagenUrl/imagenLocal
    const patchEstado = await request(app)
      .patch(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ1)
      .send({
        elementos: [
          {
            id: "el-1",
            tipo: "imagen",
            nombre: "Mapa efímero",
            contenidoLocal: "base64-pesado",
            url: "data:image/png;base64,AAAA",
            imagenUrl: "  DATA:image/webp;base64,BBBB",
            imagenLocal: "data:image/jpeg;base64,CCCC"
          },
          {
            id: "el-2",
            tipo: "imagen",
            nombre: "Mapa válido",
            url: "/api/archivos/123",
            contenidoLocal: "debe-eliminarse"
          }
        ]
      });
    expect(patchEstado.status).toBe(204);

    const getEstado = await request(app)
      .get(`/api/mesas/${mesaId}/estado`)
      .set("Cookie", cookieJ1);
    expect(getEstado.status).toBe(200);
    expect(getEstado.body.elementos).toEqual([
      {
        id: "el-1",
        tipo: "imagen",
        nombre: "Mapa efímero"
      },
      {
        id: "el-2",
        tipo: "imagen",
        nombre: "Mapa válido",
        url: "/api/archivos/123"
      }
    ]);
  });
});
