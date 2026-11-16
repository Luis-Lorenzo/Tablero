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
