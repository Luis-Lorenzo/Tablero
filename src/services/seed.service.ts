import type { AppConfig } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import type { PasswordHasher } from "../lib/password.js";
import {
  createUser,
  type UserRepository
} from "../repositories/user.repository.js";

export async function ensureAdmin(
  users: UserRepository,
  hasher: PasswordHasher,
  config: AppConfig,
  logger: Logger
): Promise<void> {
  const email = config.admin.email.trim().toLowerCase();
  const password = config.admin.password;

  if (!email || !password) {
    logger.warn("ADMIN_EMAIL o ADMIN_PASSWORD sin definir: no se crea administrador");
    return;
  }

  const existing = await users.findByEmail(email);

  if (existing) {
    if (
      existing.role !== "ADMIN" ||
      existing.status !== "ACTIVE" ||
      existing.deleted
    ) {
      existing.role = "ADMIN";
      // El administrador nunca queda pendiente de aprobación: sería
      // imposible aprobarlo desde la propia aplicación.
      existing.status = "ACTIVE";
      existing.deleted = false;
      await users.save(existing);
      logger.info("Cuenta de administrador promovida", { email });
    }
    return;
  }

  const admin = createUser({
    email,
    passwordHash: await hasher.hash(password),
    role: "ADMIN",
    status: "ACTIVE"
  });

  await users.save(admin);
  logger.info("Cuenta de administrador creada", { email });
}
