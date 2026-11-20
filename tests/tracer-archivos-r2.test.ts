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
const MP3_BYTES = Buffer.from([
  0x49, 0x44, 0x33, 0x03, // "ID3\x03"
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xfb,
  0x90, 0x64, 0x00, 0x00
]);

function montar() {
  const users = new MemoryUserRepository();
  const mesas = new MemoryMesaRepository();
  const hasher = new FakePasswordHasher();

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

describe("tracer: persistencia de archivos y streaming R2/Almacen", () => {
  let montado: ReturnType<typeof montar>;
  let hostCookie: string;
  let jugadorCookie: string;
  let externoCookie: string;

  beforeEach(async () => {
    montado = montar();
    await montado.aprobar("host@pocket.test");
    await montado.aprobar("jugador@pocket.test");
    await montado.aprobar("externo@pocket.test");
    hostCookie = await montado.sesionDe("host@pocket.test");
    jugadorCookie = await montado.sesionDe("jugador@pocket.test");
    externoCookie = await montado.sesionDe("externo@pocket.test");
  });

  it("sube .mp3 con audio/mpeg y alias audio/mp3 devolviendo 201 y vista 'audio'", async () => {
    const resMpeg = await request(montado.app)
      .post("/api/archivos?nombre=ambiente.mp3")
      .set("Cookie", hostCookie)
      .set("Content-Type", "audio/mpeg")
      .send(MP3_BYTES);

    expect(resMpeg.status).toBe(201);
    expect(resMpeg.body.vista).toBe("audio");
    expect(resMpeg.body.tipo).toBe("audio/mpeg");
    expect(resMpeg.body.tamano).toBe(MP3_BYTES.length);

    const resAlias = await request(montado.app)
      .post("/api/archivos?nombre=alias.mp3")
      .set("Cookie", hostCookie)
      .set("Content-Type", "audio/mp3")
      .send(MP3_BYTES);

    expect(resAlias.status).toBe(201);
    expect(resAlias.body.vista).toBe("audio");
    expect(resAlias.body.tipo).toBe("audio/mpeg");
    expect(resAlias.body.tamano).toBe(MP3_BYTES.length);
  });

  it("sirve ETag, Cache-Control, Accept-Ranges, soporta 304, Range 206 y permiso por musicaAmbiente.pistas", async () => {
    // 1. Subida .mp3
    const subida = await request(montado.app)
      .post("/api/archivos?nombre=taberna.mp3")
      .set("Cookie", hostCookie)
      .set("Content-Type", "audio/mpeg")
      .send(MP3_BYTES);

    expect(subida.status).toBe(201);
    expect(subida.body.vista).toBe("audio");
    const archivoId = String(subida.body.id);

    // 2. Descarga completa con cabeceras de caché y rangos
    const descarga = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", hostCookie);

    expect(descarga.status).toBe(200);
    expect(descarga.headers.etag).toBeTruthy();
    expect(descarga.headers["cache-control"]).toBe("private, no-cache");
    expect(descarga.headers["accept-ranges"]).toBe("bytes");
    expect(Buffer.from(descarga.body)).toEqual(MP3_BYTES);

    const etag = String(descarga.headers.etag);

    // 3. Revalidación con If-None-Match -> 304
    const revalidacion = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", hostCookie)
      .set("If-None-Match", etag);

    expect(revalidacion.status).toBe(304);

    // 3b. Con `Range` no se responde 304: algunos navegadores dejan de
    //     reproducir audio si una petición de rango recibe un 304.
    const revalidacionConRango = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", hostCookie)
      .set("If-None-Match", etag)
      .set("Range", "bytes=0-3")
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(revalidacionConRango.status).toBe(206);
    expect(revalidacionConRango.headers["content-range"]).toBe(
      `bytes 0-3/${MP3_BYTES.length}`
    );
    expect(Buffer.from(revalidacionConRango.body)).toEqual(
      MP3_BYTES.subarray(0, 4)
    );

    // 4. Petición Range: bytes=0-3 -> 206 Partial Content y esos 4 bytes exactos
    const parcial = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", hostCookie)
      .set("Range", "bytes=0-3")
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(parcial.status).toBe(206);
    expect(parcial.headers["content-range"]).toBe(
      `bytes 0-3/${MP3_BYTES.length}`
    );
    expect(Buffer.from(parcial.body)).toEqual(MP3_BYTES.subarray(0, 4));

    // 5. Permiso de lectura para un segundo jugador de la misma mesa via musicaAmbiente.pistas
    const antesDeUnirse = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", jugadorCookie);
    expect(antesDeUnirse.status).toBe(403);

    const mesaCreada = await request(montado.app)
      .post("/api/mesas")
      .set("Cookie", hostCookie);
    expect(mesaCreada.status).toBe(201);
    const mesaId = String(mesaCreada.body.id);

    const union = await request(montado.app)
      .post(`/api/mesas/${mesaId}/unirse`)
      .set("Cookie", jugadorCookie);
    expect(union.status).toBe(200);

    const actualizarMusica = await request(montado.app)
      .put(`/api/mesas/${mesaId}/musica`)
      .set("Cookie", hostCookie)
      .send({
        musica: {
          pistas: [{ archivoId, nombre: "Taberna" }],
          indiceActual: 0,
          reproduciendo: true,
          loop: true,
          aleatorio: false,
          volumenMaster: 0.7
        }
      });
    expect(actualizarMusica.status).toBe(200);
    expect(actualizarMusica.body.musica.pistas).toHaveLength(1);
    expect(actualizarMusica.body.musica.pistas[0].archivoId).toBe(archivoId);

    const lecturaJugador = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", jugadorCookie);
    expect(lecturaJugador.status).toBe(200);
    expect(Buffer.from(lecturaJugador.body)).toEqual(MP3_BYTES);

    const lecturaExterno = await request(montado.app)
      .get(`/api/archivos/${archivoId}`)
      .set("Cookie", externoCookie);
    expect(lecturaExterno.status).toBe(403);
  });
});
