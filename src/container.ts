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
import { MesasBroadcaster } from "./realtime/mesas-broadcaster.js";
import { AuthService } from "./services/auth.service.js";
import { BloqueoService } from "./services/bloqueo.service.js";
import { MesaService } from "./services/mesa.service.js";
import { ensureAdmin } from "./services/seed.service.js";
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

  if (config.databaseUrl) {
    pool = createPool(config.databaseUrl);
    await ensureSchema(pool);
    userRepository = new PgUserRepository(pool);
    mesaRepository = new PgMesaRepository(pool);
    logger.info("Persistencia habilitada en PostgreSQL");
  } else {
    userRepository = new MemoryUserRepository();
    mesaRepository = new MemoryMesaRepository();
    logger.warn(
      "DATABASE_URL no definido: usando repositorio en memoria (solo desarrollo)"
    );
  }

  const hasher = new BcryptPasswordHasher();

  const authService = new AuthService(userRepository, hasher, logger);
  const userService = new UserService(userRepository, logger);
  const bloqueoService = new BloqueoService(logger);
  const mesaService = new MesaService(mesaRepository, userRepository, logger);

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
    authService,
    userService,
    bloqueoService,
    mesaService,
    mesasNotifier
  };

  return { app: createApp(context, sessionStore), pool, notifier: mesasNotifier };
}
