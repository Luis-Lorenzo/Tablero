import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
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
import type { EstadoMapaCompartido } from "../src/repositories/mapa-estado.repository.js";
import { PgMapaEstadoRepository } from "../src/repositories/pg-mapa-estado.repository.js";

const PASSWORD = "secreto123";

function notificadorEspia() {
  const mapasDifundidos: Array<{
    userIds: readonly string[];
    mesaId: string;
    mapa: EstadoMapaCompartido;
  }> = [];
  const enviosDirectos: Array<{
    userIds: readonly string[];
    payload: unknown;
  }> = [];

  return {
    notificarCambio: () => {},
    notificarUsuario: () => {},
    enviarAUsuarios: (userIds: readonly string[], payload: unknown) => {
      enviosDirectos.push({ userIds, payload });
    },
    mapaActualizado: (
      userIds: readonly string[],
      mesaId: string,
      mapa: EstadoMapaCompartido
    ) => {
      mapasDifundidos.push({ userIds, mesaId, mapa });
    },
    mapasDifundidos,
    enviosDirectos
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

  return { app, aprobar, sesionDe, notifier };
}

describe("rutas de /api/mesas/:id/mapa", () => {
  it("el máster guarda el fondo y difunde el estado a todos los miembros; el jugador puede leerlo y ver el archivo", async () => {
    const { app, aprobar, sesionDe, notifier } = montar();
    const master = await aprobar("master-mapa@pocket.test");
    const jugador = await aprobar("jugador-mapa@pocket.test");

    const cookieMaster = await sesionDe("master-mapa@pocket.test");
    const cookieJugador = await sesionDe("jugador-mapa@pocket.test");

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

    // El máster sube una imagen de fondo
    const subida = await request(app)
      .post("/api/archivos?nombre=mazmorra.png")
      .set("Cookie", cookieMaster)
      .set("Content-Type", "image/png")
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      .expect(201);
    const archivoId = subida.body.id as string;

    // Un jugador no puede cambiar el fondo del mapa
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/fondo`)
      .set("Cookie", cookieJugador)
      .send({ fondo: { archivoId, titulo: "mazmorra.png" } })
      .expect(403);

    // El máster fija el fondo enviando archivoId sin url explícita
    const putRes = await request(app)
      .put(`/api/mesas/${mesaId}/mapa/fondo`)
      .set("Cookie", cookieMaster)
      .send({
        fondo: {
          archivoId,
          titulo: "mazmorra.png",
          anchoNatural: 1920.4,
          altoNatural: 1080.6
        },
        rejilla: {
          visible: true,
          columnas: 30,
          filas: 20,
          filasAuto: false,
          offsetX: 0,
          offsetY: 0,
          color: "#e8c56a",
          opacidad: 0.4,
          imanActivo: true
        }
      })
      .expect(200);

    expect(putRes.body.fondo).toEqual({
      archivoId,
      url: `/api/archivos/${archivoId}`,
      titulo: "mazmorra.png",
      anchoNatural: 1920,
      altoNatural: 1081
    });

    // Se difundió por WebSocket a máster y jugador
    expect(notifier.mapasDifundidos).toHaveLength(1);
    expect(notifier.mapasDifundidos[0]!.mesaId).toBe(mesaId);
    expect(notifier.mapasDifundidos[0]!.userIds).toEqual([master.id, jugador.id]);
    expect(notifier.mapasDifundidos[0]!.mapa.fondo?.url).toBe(
      `/api/archivos/${archivoId}`
    );

    // El jugador obtiene el mapa por REST y puede descargar la imagen del máster
    const getJugador = await request(app)
      .get(`/api/mesas/${mesaId}/mapa`)
      .set("Cookie", cookieJugador)
      .expect(200);
    expect(getJugador.body.fondo?.url).toBe(`/api/archivos/${archivoId}`);

    await request(app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", cookieJugador)
      .expect(200);

    // Crear token con archivoId resuelve imagenUrl a /api/archivos/:id
    const tokenRes = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieMaster)
      .send({ nombre: "Goblin", archivoId, esMonstruo: true })
      .expect(201);
    expect(tokenRes.body.tokens[0].imagenUrl).toBe(`/api/archivos/${archivoId}`);
  });

  it("solo el máster puede guardar la iniciativa del mapa y se difunde a todos los miembros", async () => {
    const { app, aprobar, sesionDe, notifier } = montar();
    const master = await aprobar("master-init@pocket.test");
    const jugador = await aprobar("jugador-init@pocket.test");

    const cookieMaster = await sesionDe("master-init@pocket.test");
    const cookieJugador = await sesionDe("jugador-init@pocket.test");

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

    const iniciativaPayload = {
      activa: true,
      ronda: 2,
      turnoIndice: 1,
      entradas: [
        {
          id: "init-1",
          nombre: "Lyra",
          valor: 18,
          color: "#96fbc7",
          jugadorId: jugador.id
        },
        {
          id: "init-2",
          nombre: "Goblin Jefe",
          valor: 14,
          esMonstruo: true
        }
      ]
    };

    // El jugador no puede modificar la iniciativa
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
      .set("Cookie", cookieJugador)
      .send({ iniciativa: iniciativaPayload })
      .expect(403);

    // Payload inválido devuelve 400
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
      .set("Cookie", cookieMaster)
      .send({})
      .expect(400);

    // El máster guarda la iniciativa
    const putRes = await request(app)
      .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
      .set("Cookie", cookieMaster)
      .send({ iniciativa: iniciativaPayload })
      .expect(200);

    expect(putRes.body.iniciativa).toMatchObject(iniciativaPayload);
    expect(typeof putRes.body.iniciativa.turnoIniciadoEn).toBe("number");
    expect(typeof putRes.body.servidorAhora).toBe("number");

    // Se difundió mesa:mapa-actualizado a todos los miembros
    expect(notifier.mapasDifundidos).toHaveLength(1);
    expect(notifier.mapasDifundidos[0]!.mesaId).toBe(mesaId);
    expect(notifier.mapasDifundidos[0]!.userIds).toEqual([master.id, jugador.id]);
    expect(notifier.mapasDifundidos[0]!.mapa.iniciativa).toMatchObject(iniciativaPayload);

    // El jugador ve la iniciativa al consultar GET /mapa
    const getJugador = await request(app)
      .get(`/api/mesas/${mesaId}/mapa`)
      .set("Cookie", cookieJugador)
      .expect(200);
    expect(getJugador.body.iniciativa).toMatchObject(iniciativaPayload);
    expect(typeof getJugador.body.servidorAhora).toBe("number");
  });

  it("el jugador con el turno activo puede avanzar el turno y otro jugador recibe 403", async () => {
    const { app, aprobar, sesionDe, notifier } = montar();
    const master = await aprobar("master-turno@pocket.test");
    const jugador1 = await aprobar("jugador1-turno@pocket.test");
    const jugador2 = await aprobar("jugador2-turno@pocket.test");

    const cookieMaster = await sesionDe("master-turno@pocket.test");
    const cookieJ1 = await sesionDe("jugador1-turno@pocket.test");
    const cookieJ2 = await sesionDe("jugador2-turno@pocket.test");

    const crear = await request(app)
      .post("/api/mesas")
      .set("Cookie", cookieMaster)
      .send()
      .expect(201);
    const mesaId = crear.body.id as string;

    await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJ1)
      .send()
      .expect(200);

    await request(app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", cookieJ2)
      .send()
      .expect(200);

    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
      .set("Cookie", cookieMaster)
      .send({
        iniciativa: {
          activa: true,
          ronda: 1,
          turnoIndice: 0,
          entradas: [
            {
              id: "e-1",
              nombre: "Lyra",
              valor: 18,
              color: "#96fbc7",
              jugadorId: jugador1.id
            },
            {
              id: "e-2",
              nombre: "Kael",
              valor: 12,
              color: "#7dd3fc",
              jugadorId: jugador2.id
            }
          ]
        }
      })
      .expect(200);

    // jugador2 no tiene el turno activo -> 403
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
      .set("Cookie", cookieJ2)
      .send()
      .expect(403);

    // jugador1 tiene el turno activo -> avanza a turnoIndice 1
    const resJ1 = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
      .set("Cookie", cookieJ1)
      .send()
      .expect(200);

    expect(resJ1.body.iniciativa.turnoIndice).toBe(1);
    expect(resJ1.body.iniciativa.ronda).toBe(1);
    expect(notifier.mapasDifundidos.at(-1)?.userIds).toEqual([
      master.id,
      jugador1.id,
      jugador2.id
    ]);
    expect(notifier.mapasDifundidos.at(-1)?.mapa.iniciativa?.turnoIndice).toBe(1);

    // Ahora jugador2 tiene el turno activo -> vuelve a 0 y sube ronda a 2
    const resJ2 = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
      .set("Cookie", cookieJ2)
      .send()
      .expect(200);

    expect(resJ2.body.iniciativa.turnoIndice).toBe(0);
    expect(resJ2.body.iniciativa.ronda).toBe(2);
  });

  it("eliminar un token lo retira de iniciativa.entradas, conserva su plantilla y PATCH plantilla actualiza categoria", async () => {
    const { app, aprobar, sesionDe, notifier } = montar();
    const master = await aprobar("master-plantilla@pocket.test");
    const jugador = await aprobar("jugador-plantilla@pocket.test");

    const cookieMaster = await sesionDe("master-plantilla@pocket.test");
    const cookieJugador = await sesionDe("jugador-plantilla@pocket.test");

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

    // 1. Crear token sin plantilla previa y añadirlo a iniciativa con tokenId
    const crearSinPlantilla = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieMaster)
      .send({
        nombre: "Orco",
        imagenUrl: "/assets/orco.png",
        esMonstruo: true,
        guardarPlantilla: false
      })
      .expect(201);

    const tokenOrcoId = crearSinPlantilla.body.tokens[0].id as string;
    expect(crearSinPlantilla.body.plantillas).toHaveLength(0);

    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
      .set("Cookie", cookieMaster)
      .send({
        iniciativa: {
          activa: true,
          ronda: 1,
          turnoIndice: 1,
          entradas: [
            { id: "init-a", nombre: "Lyra", valor: 18, jugadorId: jugador.id },
            { id: "init-b", nombre: "Orco", valor: 12, esMonstruo: true, tokenId: tokenOrcoId }
          ]
        }
      })
      .expect(200);

    // Al eliminar el token, se quita de iniciativa.entradas, turnoIndice se ajusta a 0 y se conserva la plantilla
    const delRes = await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/tokens/${tokenOrcoId}`)
      .set("Cookie", cookieMaster)
      .expect(200);

    expect(delRes.body.tokens).toHaveLength(0);
    expect(delRes.body.iniciativa.entradas).toHaveLength(1);
    expect(delRes.body.iniciativa.entradas[0].id).toBe("init-a");
    expect(delRes.body.iniciativa.turnoIndice).toBe(0);
    expect(delRes.body.plantillas).toHaveLength(1);
    expect(delRes.body.plantillas[0]).toMatchObject({
      nombre: "Orco",
      imagenUrl: "/assets/orco.png",
      autorId: master.id,
      esMonstruo: true
    });

    // 2. Crear token con guardarPlantilla + categoria y actualizar la plantilla via PATCH
    const crearConCategoria = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieMaster)
      .send({
        nombre: "Dragón Rojo",
        imagenUrl: "/assets/dragon.png",
        esMonstruo: true,
        guardarPlantilla: true,
        categoria: "  Jefes  "
      })
      .expect(201);

    const plantillaDragon = crearConCategoria.body.plantillas.find(
      (p: { nombre: string }) => p.nombre === "Dragón Rojo"
    );
    expect(plantillaDragon).toBeDefined();
    expect(plantillaDragon.categoria).toBe("Jefes");

    // Otro jugador no puede modificar una plantilla que no es suya
    await request(app)
      .patch(`/api/mesas/${mesaId}/mapa/plantillas/${plantillaDragon.id}`)
      .set("Cookie", cookieJugador)
      .send({ categoria: "Aliados" })
      .expect(403);

    // El autor/máster actualiza la categoría y el nombre, y se difunde por WS
    const patchRes = await request(app)
      .patch(`/api/mesas/${mesaId}/mapa/plantillas/${plantillaDragon.id}`)
      .set("Cookie", cookieMaster)
      .send({ categoria: "Dragones", nombre: "Dragón Anciano" })
      .expect(200);

    const plantillaActualizada = patchRes.body.plantillas.find(
      (p: { id: string }) => p.id === plantillaDragon.id
    );
    expect(plantillaActualizada.categoria).toBe("Dragones");
    expect(plantillaActualizada.nombre).toBe("Dragón Anciano");
    expect(notifier.mapasDifundidos.at(-1)?.mapa.plantillas).toEqual(
      patchRes.body.plantillas
    );
  });

  it("permite dibujar trazos, deshacer el propio, limpiar todo como máster y congelar el dibujo sin bloquear los tokens", async () => {
    const { app, aprobar, sesionDe, notifier } = montar();
    const master = await aprobar("master-dibujo@pocket.test");
    const jugador = await aprobar("jugador-dibujo@pocket.test");
    const ajeno = await aprobar("ajeno-dibujo@pocket.test");

    const cookieMaster = await sesionDe("master-dibujo@pocket.test");
    const cookieJugador = await sesionDe("jugador-dibujo@pocket.test");
    const cookieAjeno = await sesionDe("ajeno-dibujo@pocket.test");

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

    // Un usuario ajeno no puede dibujar
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieAjeno)
      .send({
        id: "trazo-ajeno",
        color: "#ff0000",
        grosor: 4,
        puntos: [{ x: 10, y: 10 }]
      })
      .expect(403);

    // El jugador dibuja un trazo (sanitiza puntos 0..100, grosor 1..24 y fuerza autorId)
    const trazoJugadorRes = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .send({
        id: "trazo-j1",
        color: "#38d9a9",
        grosor: 50,
        autorId: master.id,
        puntos: [
          { x: -10, y: 120 },
          { x: 45.5, y: 60 }
        ]
      })
      .expect(201);

    expect(trazoJugadorRes.body.trazos).toEqual([
      {
        id: "trazo-j1",
        color: "#38d9a9",
        grosor: 24,
        autorId: jugador.id,
        puntos: [
          { x: 0, y: 100 },
          { x: 45.5, y: 60 }
        ]
      }
    ]);
    expect(notifier.mapasDifundidos.at(-1)?.userIds).toEqual([master.id, jugador.id]);
    expect(notifier.mapasDifundidos.at(-1)?.mapa.trazos).toHaveLength(1);

    // El máster dibuja otro trazo
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieMaster)
      .send({
        id: "trazo-m1",
        color: "#e8c56a",
        grosor: 5,
        puntos: [
          { x: 20, y: 20 },
          { x: 30, y: 30 }
        ]
      })
      .expect(201);

    // El jugador NO puede deshacer el trazo del máster
    await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/trazos/trazo-m1`)
      .set("Cookie", cookieJugador)
      .expect(403);

    // El jugador SÍ puede deshacer su propio trazo
    const deshacerJugador = await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/trazos/trazo-j1`)
      .set("Cookie", cookieJugador)
      .expect(200);
    expect(deshacerJugador.body.trazos.map((t: { id: string }) => t.id)).toEqual([
      "trazo-m1"
    ]);

    // El jugador vuelve a dibujar un trazo para probar congelar y borrar todo
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .send({
        id: "trazo-j2",
        color: "#4dabf7",
        grosor: 3,
        puntos: [{ x: 50, y: 50 }]
      })
      .expect(201);

    // El jugador crea un token antes de congelar el dibujo
    const tokenRes = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieJugador)
      .send({
        nombre: "Explorador",
        imagenUrl: "/api/archivos/f1",
        x: 20,
        y: 25
      })
      .expect(201);
    const tokenId = tokenRes.body.tokens[0].id as string;

    // El jugador NO puede congelar el dibujo ni borrar todos los trazos
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/congelar`)
      .set("Cookie", cookieJugador)
      .send({ congelado: true })
      .expect(403);

    await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .expect(403);

    // El máster congela el dibujo
    const congelarRes = await request(app)
      .put(`/api/mesas/${mesaId}/mapa/congelar`)
      .set("Cookie", cookieMaster)
      .send({ congelado: true })
      .expect(200);
    expect(congelarRes.body.dibujoCongelado).toBe(true);

    // Con dibujoCongelado: el jugador NO puede dibujar ni deshacer su trazo
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .send({
        id: "trazo-j3",
        color: "#4dabf7",
        grosor: 3,
        puntos: [{ x: 10, y: 10 }]
      })
      .expect(403);

    await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/trazos/trazo-j2`)
      .set("Cookie", cookieJugador)
      .expect(403);

    // Con dibujoCongelado: el jugador SÍ puede mover su token
    const moverTokenRes = await request(app)
      .patch(`/api/mesas/${mesaId}/mapa/tokens/${tokenId}`)
      .set("Cookie", cookieJugador)
      .send({ x: 60, y: 70 })
      .expect(200);
    expect(moverTokenRes.body.tokens[0].x).toBe(60);
    expect(moverTokenRes.body.tokens[0].y).toBe(70);

    // Con dibujoCongelado: el máster SÍ puede dibujar y deshacer
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieMaster)
      .send({
        id: "trazo-m2",
        color: "#e8c56a",
        grosor: 6,
        puntos: [{ x: 80, y: 80 }]
      })
      .expect(201);

    await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/trazos/trazo-j2`)
      .set("Cookie", cookieMaster)
      .expect(200);

    // El máster borra todos los trazos
    const limpiarRes = await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieMaster)
      .expect(200);
    expect(limpiarRes.body.trazos).toEqual([]);
    expect(notifier.mapasDifundidos.at(-1)?.mapa.trazos).toEqual([]);

    // El máster descongela el dibujo y el jugador vuelve a poder dibujar
    const descongelarRes = await request(app)
      .put(`/api/mesas/${mesaId}/mapa/congelar`)
      .set("Cookie", cookieMaster)
      .send({ congelado: false })
      .expect(200);
    expect(descongelarRes.body.dibujoCongelado).toBe(false);

    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .send({
        id: "trazo-j4",
        color: "#4dabf7",
        grosor: 3,
        puntos: [{ x: 15, y: 15 }]
      })
      .expect(201);
  });

  it("modo Contrareloj avanza turnos de jugadores al expirar, respeta idempotencia y deja sin límite al Máster", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-19T18:00:00.000Z"));

      const { app, aprobar, sesionDe } = montar();
      const master = await aprobar("master-cr@pocket.test");
      const jugador = await aprobar("jugador-cr@pocket.test");
      const cookieMaster = await sesionDe("master-cr@pocket.test");
      const cookieJugador = await sesionDe("jugador-cr@pocket.test");

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

      const iniPayload = {
        activa: true,
        ronda: 1,
        turnoIndice: 0,
        turnoMaxSegundos: 10,
        entradas: [
          { id: "init-j", nombre: "Kael", valor: 18, jugadorId: jugador.id },
          { id: "init-m", nombre: "Orco", valor: 12, esMonstruo: true }
        ]
      };

      const guardada1 = await request(app)
        .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
        .set("Cookie", cookieMaster)
        .send({ iniciativa: iniPayload })
        .expect(200);
      const inicioOriginal = guardada1.body.iniciativa.turnoIniciadoEn as number;
      expect(guardada1.body.iniciativa.turnoMaxSegundos).toBe(10);

      // Avanzar 4s no debe cambiar el turno por tiempo; volver a guardar el mismo turno preserva turnoIniciadoEn
      vi.advanceTimersByTime(4000);
      const reGuardada = await request(app)
        .put(`/api/mesas/${mesaId}/mapa/iniciativa`)
        .set("Cookie", cookieMaster)
        .send({ iniciativa: iniPayload })
        .expect(200);
      expect(reGuardada.body.iniciativa.turnoIniciadoEn).toBe(inicioOriginal);

      const antesDeTiempo = await request(app)
        .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
        .set("Cookie", cookieJugador)
        .send({
          porTiempo: true,
          rondaEsperada: 1,
          turnoIndiceEsperado: 0,
          entradaIdEsperada: "init-j"
        })
        .expect(200);
      expect(antesDeTiempo.body.iniciativa.turnoIndice).toBe(0);

      // Al vencer los 10s, se avanza automáticamente al turno del monstruo/Máster
      vi.advanceTimersByTime(6100);
      const expirado = await request(app)
        .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
        .set("Cookie", cookieJugador)
        .send({
          porTiempo: true,
          rondaEsperada: 1,
          turnoIndiceEsperado: 0,
          entradaIdEsperada: "init-j"
        })
        .expect(200);
      expect(expirado.body.iniciativa.turnoIndice).toBe(1);
      expect(expirado.body.iniciativa.ronda).toBe(1);
      expect(expirado.body.iniciativa.turnoIniciadoEn).toBeGreaterThan(inicioOriginal);

      // Petición repetida con las referencias ya pasadas es idempotente
      const duplicado = await request(app)
        .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
        .set("Cookie", cookieMaster)
        .send({
          porTiempo: true,
          rondaEsperada: 1,
          turnoIndiceEsperado: 0,
          entradaIdEsperada: "init-j"
        })
        .expect(200);
      expect(duplicado.body.iniciativa.turnoIndice).toBe(1);

      // El turno del Máster/monstruo nunca expira por tiempo
      vi.advanceTimersByTime(60000);
      const turnoMasterSinLimite = await request(app)
        .post(`/api/mesas/${mesaId}/mapa/iniciativa/siguiente`)
        .set("Cookie", cookieJugador)
        .send({
          porTiempo: true,
          rondaEsperada: 1,
          turnoIndiceEsperado: 1,
          entradaIdEsperada: "init-m"
        })
        .expect(200);
      expect(turnoMasterSinLimite.body.iniciativa.turnoIndice).toBe(1);
      expect(turnoMasterSinLimite.body.iniciativa.ronda).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("goma en lote borra trazos propios, congela áreas pero permite tokens y regla compartida con seq", async () => {
    const { app, aprobar, sesionDe, notifier } = montar();
    const master = await aprobar("master-gc@pocket.test");
    const jugador = await aprobar("jugador-gc@pocket.test");
    const cookieMaster = await sesionDe("master-gc@pocket.test");
    const cookieJugador = await sesionDe("jugador-gc@pocket.test");

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

    // Token, trazos y área iniciales
    const tokRes = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/tokens`)
      .set("Cookie", cookieJugador)
      .send({ nombre: "Pícara", imagenUrl: "/api/archivos/t1", x: 10, y: 10 })
      .expect(201);
    const tokenId = tokRes.body.tokens[0].id as string;

    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .send({ id: "t-j1", color: "#38bdf8", grosor: 4, puntos: [{ x: 10, y: 10 }] })
      .expect(201);
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieJugador)
      .send({ id: "t-j2", color: "#38bdf8", grosor: 4, puntos: [{ x: 20, y: 20 }] })
      .expect(201);
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos`)
      .set("Cookie", cookieMaster)
      .send({ id: "t-m1", color: "#e8c56a", grosor: 4, puntos: [{ x: 30, y: 30 }] })
      .expect(201);

    const areaJugRes = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/areas`)
      .set("Cookie", cookieJugador)
      .send({ tipo: "circulo", x: 50, y: 50, celdas: 2, color: "#38bdf8" })
      .expect(201);
    const areaId = areaJugRes.body.areas[0].id as string;

    // Congelar mapa bloquea áreas y borrado en lote de trazos para jugadores, pero deja libres tokens y regla
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/congelar`)
      .set("Cookie", cookieMaster)
      .send({ congelado: true })
      .expect(200);

    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/areas`)
      .set("Cookie", cookieJugador)
      .send({ tipo: "cono", x: 40, y: 40, celdas: 3 })
      .expect(403);
    await request(app)
      .patch(`/api/mesas/${mesaId}/mapa/areas/${areaId}`)
      .set("Cookie", cookieJugador)
      .send({ x: 60 })
      .expect(403);
    await request(app)
      .delete(`/api/mesas/${mesaId}/mapa/areas/${areaId}`)
      .set("Cookie", cookieJugador)
      .expect(403);
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos/eliminar-lote`)
      .set("Cookie", cookieJugador)
      .send({ ids: ["t-j1", "t-j2"] })
      .expect(403);

    // El máster sí puede crear área congelado
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/areas`)
      .set("Cookie", cookieMaster)
      .send({ tipo: "cono", x: 40, y: 40, celdas: 3, color: "#ef4444" })
      .expect(201);

    // Tokens y regla compartida siguen funcionando con mapa congelado
    await request(app)
      .patch(`/api/mesas/${mesaId}/mapa/tokens/${tokenId}`)
      .set("Cookie", cookieJugador)
      .send({ x: 35, y: 45 })
      .expect(200);

    await request(app)
      .post(`/api/mesas/${mesaId}/regla`)
      .set("Cookie", cookieJugador)
      .send({
        activa: true,
        x1: 12,
        y1: 14,
        x2: 48,
        y2: 52,
        color: "#38bdf8",
        seq: 101
      })
      .expect(204);
    await request(app)
      .post(`/api/mesas/${mesaId}/regla`)
      .set("Cookie", cookieJugador)
      .send({ activa: false, seq: 102 })
      .expect(204);

    const ultimosRegla = notifier.enviosDirectos.slice(-2);
    expect(ultimosRegla[0]!.userIds).toEqual([master.id, jugador.id]);
    expect(ultimosRegla[0]!.payload).toMatchObject({
      type: "mesa:regla",
      mesaId,
      regla: { activa: true, color: "#38bdf8", seq: 101 }
    });
    expect(ultimosRegla[1]!.payload).toMatchObject({
      type: "mesa:regla",
      mesaId,
      regla: { activa: false, seq: 102 }
    });

    // Descongelar y probar borrado en lote con permisos
    await request(app)
      .put(`/api/mesas/${mesaId}/mapa/congelar`)
      .set("Cookie", cookieMaster)
      .send({ congelado: false })
      .expect(200);

    // El jugador no puede borrar un lote que incluya el trazo del máster
    await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos/eliminar-lote`)
      .set("Cookie", cookieJugador)
      .send({ ids: ["t-j1", "t-m1"] })
      .expect(403);

    // Sí puede borrar sus dos trazos juntos
    const loteJug = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos/eliminar-lote`)
      .set("Cookie", cookieJugador)
      .send({ ids: ["t-j1", "t-j2"] })
      .expect(200);
    expect(loteJug.body.trazos.map((t: { id: string }) => t.id)).toEqual(["t-m1"]);

    // El máster puede borrar cualquier lote
    const loteMaster = await request(app)
      .post(`/api/mesas/${mesaId}/mapa/trazos/eliminar-lote`)
      .set("Cookie", cookieMaster)
      .send({ ids: ["t-m1"] })
      .expect(200);
    expect(loteMaster.body.trazos).toEqual([]);
  });
});

describe("PgMapaEstadoRepository", () => {
  it("crea la tabla mesa_mapa_estado con mesa_id UUID compatible con mesas(id)", async () => {
    const consultas: string[] = [];
    const fakePool = {
      query: async (sql: string) => {
        consultas.push(sql);
        return { rows: [] };
      }
    } as unknown as Pool;

    const repo = new PgMapaEstadoRepository(fakePool);
    const estado = await repo.getEstado("00000000-0000-0000-0000-000000000001");

    expect(estado.fondo).toBeNull();
    expect(consultas[0]).toMatch(/mesa_id\s+UUID\s+PRIMARY KEY\s+REFERENCES\s+mesas\(id\)/i);
  });
});
