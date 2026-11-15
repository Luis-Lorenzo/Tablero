import type { Pool } from "pg";
import type { AppContext } from "./api/context.js";
import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { createPool, ensureSchema } from "./lib/db.js";
import { logger } from "./lib/logger.js";
import { BcryptPasswordHasher } from "./lib/password.js";
import { createSessionStore } from "./lib/session.js";
import { PgUserRepository } from "./repositories/pg-user.repository.js";
import { PgMesaRepository } from "./repositories/pg-mesa.repository.js";
import { MemoryMesaRepository } from "./repositories/mesa.repository.js";
import {
  MemoryUserRepository,
  type UserRepository
} from "./repositories/user.repository.js";
import {
  MemoryArchivoRepository,
  type ArchivoRepository
} from "./repositories/archivo.repository.js";
import { PgArchivoRepository } from "./repositories/pg-archivo.repository.js";
import {
  MemoryMesaEstadoRepository,
  type MesaEstadoRepository
} from "./repositories/mesa-estado.repository.js";
import { PgMesaEstadoRepository } from "./repositories/pg-mesa-estado.repository.js";
import {
  MemoryPizarraEstadoRepository,
  type PizarraEstadoRepository
} from "./repositories/pizarra-estado.repository.js";
import { PgPizarraEstadoRepository } from "./repositories/pg-pizarra-estado.repository.js";
import {
  MemoryChatRepository,
  type ChatRepository
} from "./repositories/chat.repository.js";
import { PgChatRepository } from "./repositories/pg-chat.repository.js";
import {
  MemoryTransferenciaRepository,
  type TransferenciaRepository
} from "./repositories/transferencia.repository.js";
import { PgTransferenciaRepository } from "./repositories/pg-transferencia.repository.js";
import { MemoryAlmacen, R2Almacen, type AlmacenArchivos } from "./lib/almacen.js";
import { r2Configurado } from "./lib/config.js";
import { ArchivoService } from "./services/archivo.service.js";
import { MesasBroadcaster } from "./realtime/mesas-broadcaster.js";
import { AuthService } from "./services/auth.service.js";
import { BloqueoService } from "./services/bloqueo.service.js";
import { MesaService } from "./services/mesa.service.js";
import { ChatService } from "./services/chat.service.js";
import { ensureAdmin } from "./services/seed.service.js";
import { TransferenciaService } from "./services/transferencia.service.js";
import { UserService } from "./services/user.service.js";

export interface Container {
  app: ReturnType<typeof createApp>;
  pool?: Pool;
  notifier: MesasBroadcaster;
}

export async function createContainer(): Promise<Container> {
  let pool: Pool | undefined;
  let userRepository: UserRepository;
  let mesaRepository: MemoryMesaRepository | PgMesaRepository;
  let archivoRepository: ArchivoRepository;
  let mesaEstadoRepository: MesaEstadoRepository;
  let pizarraEstadoRepository: PizarraEstadoRepository;
  let chatRepository: ChatRepository;
  let transferenciaRepository: TransferenciaRepository;

  if (config.databaseUrl) {
    pool = createPool(config.databaseUrl);
    await ensureSchema(pool);
    userRepository = new PgUserRepository(pool);
    mesaRepository = new PgMesaRepository(pool);
    archivoRepository = new PgArchivoRepository(pool);
    mesaEstadoRepository = new PgMesaEstadoRepository(pool);
    pizarraEstadoRepository = new PgPizarraEstadoRepository(pool);
    chatRepository = new PgChatRepository(pool);
    transferenciaRepository = new PgTransferenciaRepository(pool);
    logger.info("Persistencia habilitada en PostgreSQL");
  } else {
    userRepository = new MemoryUserRepository();
    mesaRepository = new MemoryMesaRepository();
    archivoRepository = new MemoryArchivoRepository();
    mesaEstadoRepository = new MemoryMesaEstadoRepository();
    pizarraEstadoRepository = new MemoryPizarraEstadoRepository();
    chatRepository = new MemoryChatRepository();
    transferenciaRepository = new MemoryTransferenciaRepository();
    logger.warn(
      "DATABASE_URL no definido: usando repositorio en memoria (solo desarrollo)"
    );
  }

  let almacen: AlmacenArchivos;

  if (r2Configurado(config.r2)) {
    almacen = new R2Almacen(config.r2);
    logger.info("Almacén de archivos: Cloudflare R2");
  } else {
    almacen = new MemoryAlmacen();
    const mensaje =
      "R2 sin configurar: los archivos se guardan en memoria y se pierden al reiniciar. " +
      "Define R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME y R2_ENDPOINT " +
      "(y R2_ACCOUNT_ID) en el entorno.";

    if (config.isProduction) {
      logger.error(mensaje);
    } else {
      logger.warn(mensaje);
    }
  }

  const hasher = new BcryptPasswordHasher();

  const authService = new AuthService(userRepository, hasher, logger);
  const userService = new UserService(userRepository, logger);
  const bloqueoService = new BloqueoService(logger);
  const mesaService = new MesaService(mesaRepository, userRepository, logger);
  const chatService = new ChatService(mesaRepository, userRepository, chatRepository);
  const archivoService = new ArchivoService(
    archivoRepository,
    almacen,
    logger,
    config.archivos.maxBytes,
    mesaRepository
  );
  const transferenciaService = new TransferenciaService(
    mesaRepository,
    archivoService,
    logger,
    transferenciaRepository
  );

  // Un único almacén de sesiones para Express y para el canal en vivo.
  const sessionStore = createSessionStore(pool);
  const mesasNotifier = new MesasBroadcaster({
    config,
    logger,
    sessionStore,
    userRepository
  });

  await ensureAdmin(userRepository, hasher, config, logger);

  const context: AppContext = {
    config,
    logger,
    userRepository,
    mesaRepository,
    mesaEstadoRepository,
    pizarraEstadoRepository,
    authService,
    userService,
    bloqueoService,
    mesaService,
    chatService,
    archivoService,
    transferenciaService,
    mesasNotifier
  };

  return { app: createApp(context, sessionStore), pool, notifier: mesasNotifier };
}
