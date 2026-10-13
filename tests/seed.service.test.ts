import { beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import {
  createUser,
  MemoryUserRepository
} from "../src/repositories/user.repository.js";
import { ensureAdmin } from "../src/services/seed.service.js";

const adminConfig = {
  admin: {
    email: "admin@example.com",
    password: "admin12345"
  }
} as AppConfig;

describe("ensureAdmin", () => {
  let repository: MemoryUserRepository;

  beforeEach(() => {
    repository = new MemoryUserRepository();
  });

  it("crea el administrador ya aprobado", async () => {
    await ensureAdmin(repository, new FakePasswordHasher(), adminConfig, logger);

    const admin = await repository.findByEmail("admin@example.com");
    expect(admin?.role).toBe("ADMIN");
    expect(admin?.status).toBe("ACTIVE");
  });

  it("aprueba y promociona una cuenta ya registrada con ese correo", async () => {
    const user = createUser({
      email: "admin@example.com",
      passwordHash: "hash"
    });
    await repository.save(user);

    await ensureAdmin(repository, new FakePasswordHasher(), adminConfig, logger);

    const admin = await repository.findByEmail("admin@example.com");
    expect(admin?.role).toBe("ADMIN");
    expect(admin?.status).toBe("ACTIVE");
  });

  it("no crea nada si faltan las credenciales del administrador", async () => {
    const config = {
      admin: { email: "", password: "" }
    } as AppConfig;

    await ensureAdmin(repository, new FakePasswordHasher(), config, logger);

    expect(await repository.list()).toHaveLength(0);
  });
});
