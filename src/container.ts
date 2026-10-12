import type { Pool } from "pg";
import type { AppContext } from "./api/context.js";
import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { createPool, ensureSchema } from "./lib/db.js";
import {
  ConsoleEmailSender,
  ResendEmailSender,
  type EmailSender
} from "./lib/email.js";
import { logger } from "./lib/logger.js";
import { BcryptPasswordHasher } from "./lib/password.js";
import { PgUserRepository } from "./repositories/pg-user.repository.js";
import {
  MemoryUserRepository,
  type UserRepository
} from "./repositories/user.repository.js";
import { AuthService } from "./services/auth.service.js";
import { ensureAdmin } from "./services/seed.service.js";
import { UserService } from "./services/user.service.js";

export interface Container {
  app: ReturnType<typeof createApp>;
  pool?: Pool;
}

export async function createContainer(): Promise<Container> {
  let pool: Pool | undefined;
  let userRepository: UserRepository;

  if (config.databaseUrl) {
    pool = createPool(config.databaseUrl);
    await ensureSchema(pool);
    userRepository = new PgUserRepository(pool);
    logger.info("Persistencia habilitada en PostgreSQL");
  } else {
    userRepository = new MemoryUserRepository();
    logger.warn(
      "DATABASE_URL no definido: usando repositorio en memoria (solo desarrollo)"
    );
  }

  const hasher = new BcryptPasswordHasher();
  const emailSender: EmailSender = config.email.apiKey
    ? new ResendEmailSender(config.email.apiKey, config.email.from, logger)
    : new ConsoleEmailSender(logger);

  const authService = new AuthService(
    userRepository,
    hasher,
    emailSender,
    config,
    logger
  );
  const userService = new UserService(userRepository, logger);

  await ensureAdmin(userRepository, hasher, config, logger);

  const context: AppContext = {
    config,
    logger,
    userRepository,
    authService,
    userService
  };

  return { app: createApp(context, pool), pool };
}
