import { describe, expect, it } from "vitest";
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

  return {
    notificarCambio: () => {},
    notificarUsuario: () => {},
    enviarAUsuarios: () => {},
    mapaActualizado: (
      userIds: readonly string[],
      mesaId: string,
      mapa: EstadoMapaCompartido
    ) => {
      mapasDifundidos.push({ userIds, mesaId, mapa });
    },
    mapasDifundidos
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

    expect(putRes.body.iniciativa).toEqual(iniciativaPayload);

    // Se difundió mesa:mapa-actualizado a todos los miembros
    expect(notifier.mapasDifundidos).toHaveLength(1);
    expect(notifier.mapasDifundidos[0]!.mesaId).toBe(mesaId);
    expect(notifier.mapasDifundidos[0]!.userIds).toEqual([master.id, jugador.id]);
    expect(notifier.mapasDifundidos[0]!.mapa.iniciativa).toEqual(iniciativaPayload);

    // El jugador ve la iniciativa al consultar GET /mapa
    const getJugador = await request(app)
      .get(`/api/mesas/${mesaId}/mapa`)
      .set("Cookie", cookieJugador)
      .expect(200);
    expect(getJugador.body.iniciativa).toEqual(iniciativaPayload);
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
