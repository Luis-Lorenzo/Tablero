import { beforeEach, describe, expect, it } from "vitest";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { MemoryUserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";

describe("AuthService", () => {
  let service: AuthService;
  let repository: MemoryUserRepository;

  beforeEach(() => {
    repository = new MemoryUserRepository();
    service = new AuthService(repository, new FakePasswordHasher(), logger);
  });

  it("registra un usuario con email normalizado y contraseña con hash", async () => {
    const user = await service.register("  Nuevo@Example.com ", "secreto123");

    expect(user.email).toBe("nuevo@example.com");
    expect(user.role).toBe("USER");
    expect(user.status).toBe("PENDING");
    expect(user.deleted).toBe(false);
    expect(user.passwordHash).not.toBe("secreto123");
    expect(user.passwordHash).toContain("secreto123");
  });

  it("impide iniciar sesión mientras la cuenta está pendiente de aprobación", async () => {
    await service.register("nuevo@example.com", "secreto123");

    await expect(
      service.login("nuevo@example.com", "secreto123")
    ).rejects.toThrow("ACCOUNT_PENDING");
  });

  it("permite iniciar sesión cuando un administrador aprueba la cuenta", async () => {
    await service.register("nuevo@example.com", "secreto123");

    const stored = await repository.findByEmail("nuevo@example.com");
    await repository.save({ ...stored!, status: "ACTIVE" });

    const user = await service.login("nuevo@example.com", "secreto123");
    expect(user.email).toBe("nuevo@example.com");
  });

  it("rechaza iniciar sesión de una cuenta rechazada", async () => {
    await service.register("rechazado@example.com", "secreto123");

    const stored = await repository.findByEmail("rechazado@example.com");
    await repository.save({ ...stored!, status: "REJECTED" });

    await expect(
      service.login("rechazado@example.com", "secreto123")
    ).rejects.toThrow("ACCOUNT_REJECTED");
  });

  it("no revela el estado de la cuenta si la contraseña es incorrecta", async () => {
    await service.register("pendiente@example.com", "secreto123");

    await expect(
      service.login("pendiente@example.com", "incorrecta")
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("rechaza un email inválido", async () => {
    await expect(
      service.register("esto-no-es-un-email", "secreto123")
    ).rejects.toThrow("INVALID_EMAIL");
  });

  it("rechaza una contraseña demasiado corta", async () => {
    await expect(
      service.register("corta@example.com", "123")
    ).rejects.toThrow("WEAK_PASSWORD");
  });

  it("rechaza registrar un email ya existente", async () => {
    await service.register("repe@example.com", "secreto123");

    await expect(
      service.register("REPE@example.com", "secreto123")
    ).rejects.toThrow("EMAIL_EXISTS");
  });

  it("rechaza iniciar sesión con contraseña incorrecta", async () => {
    await service.register("clave@example.com", "secreto123");

    await expect(
      service.login("clave@example.com", "incorrecta")
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("un usuario eliminado no puede volver a iniciar sesión", async () => {
    await service.register("borrado@example.com", "secreto123");

    const stored = await repository.findByEmail("borrado@example.com");
    await repository.delete(stored!.id);

    await expect(
      service.login("borrado@example.com", "secreto123")
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });
});
