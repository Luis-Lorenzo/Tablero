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

  describe("bloqueo por intentos fallidos", () => {
    /** Registra la cuenta y la deja aprobada para poder iniciar sesión. */
    async function approvedUser(email: string, password = "secreto123") {
      await service.register(email, password);
      const stored = await repository.findByEmail(email);
      await repository.save({ ...stored!, status: "ACTIVE" });
      return stored!;
    }

    it("bloquea la cuenta tras 5 fallos seguidos y rechaza la contraseña correcta", async () => {
      await approvedUser("bloqueo@example.com");

      for (let intento = 0; intento < 5; intento += 1) {
        await expect(
          service.login("bloqueo@example.com", "incorrecta")
        ).rejects.toThrow();
      }

      await expect(
        service.login("bloqueo@example.com", "secreto123")
      ).rejects.toThrow("ACCOUNT_LOCKED");

      const stored = await repository.findByEmail("bloqueo@example.com");
      expect(stored?.blocked).toBe(true);
      expect(stored?.lockedUntil).toBeInstanceOf(Date);
      expect(stored!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it("una cuenta marcada como bloqueada a mano no puede iniciar sesión", async () => {
      await approvedUser("manual@example.com");

      const stored = await repository.findByEmail("manual@example.com");
      // Como haría un administrador desde la base de datos: sin fecha de
      // caducidad, el bloqueo es indefinido hasta que se cambie a mano.
      await repository.save({ ...stored!, blocked: true, lockedUntil: null });

      await expect(
        service.login("manual@example.com", "secreto123")
      ).rejects.toThrow("ACCOUNT_LOCKED");
    });

    it("no bloquea la cuenta antes de llegar a 5 fallos", async () => {
      await approvedUser("casi@example.com");

      for (let intento = 0; intento < 4; intento += 1) {
        await expect(
          service.login("casi@example.com", "incorrecta")
        ).rejects.toThrow("INVALID_CREDENTIALS");
      }

      const user = await service.login("casi@example.com", "secreto123");
      expect(user.email).toBe("casi@example.com");
    });

    it("un inicio de sesión correcto limpia el historial de fallos", async () => {
      await approvedUser("limpia@example.com");

      for (let intento = 0; intento < 4; intento += 1) {
        await expect(
          service.login("limpia@example.com", "incorrecta")
        ).rejects.toThrow("INVALID_CREDENTIALS");
      }

      await service.login("limpia@example.com", "secreto123");

      for (let intento = 0; intento < 4; intento += 1) {
        await expect(
          service.login("limpia@example.com", "incorrecta")
        ).rejects.toThrow("INVALID_CREDENTIALS");
      }

      await expect(
        service.login("limpia@example.com", "secreto123")
      ).resolves.toMatchObject({ email: "limpia@example.com" });
    });

    it("permite iniciar sesión cuando el bloqueo ya ha caducado", async () => {
      const user = await approvedUser("caduca@example.com");

      for (let intento = 0; intento < 5; intento += 1) {
        await expect(
          service.login("caduca@example.com", "incorrecta")
        ).rejects.toThrow();
      }

      // Retrocedemos el bloqueo en el tiempo como si hubiera caducado.
      const stored = await repository.findByEmail("caduca@example.com");
      await repository.save({
        ...stored!,
        lockedUntil: new Date(Date.now() - 1000)
      });

      await expect(
        service.login("caduca@example.com", "secreto123")
      ).resolves.toMatchObject({ id: user.id });

      const after = await repository.findByEmail("caduca@example.com");
      expect(after?.blocked).toBe(false);
      expect(after?.lockedUntil).toBeNull();
    });
  });
});
