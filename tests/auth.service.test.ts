import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/lib/config.js";
import type { EmailSender } from "../src/lib/email.js";
import { logger } from "../src/lib/logger.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { MemoryUserRepository } from "../src/repositories/user.repository.js";
import { AuthService } from "../src/services/auth.service.js";

class RecordingEmailSender implements EmailSender {
  lastConfirmation?: { to: string; url: string };

  async sendConfirmation(to: string, url: string): Promise<void> {
    this.lastConfirmation = { to, url };
  }

  tokenFromLastEmail(): string {
    const url = new URL(this.lastConfirmation!.url);
    return url.searchParams.get("token") ?? "";
  }
}

describe("AuthService", () => {
  let service: AuthService;
  let repository: MemoryUserRepository;
  let emails: RecordingEmailSender;

  beforeEach(() => {
    repository = new MemoryUserRepository();
    emails = new RecordingEmailSender();
    service = new AuthService(
      repository,
      new FakePasswordHasher(),
      emails,
      config,
      logger
    );
  });

  it("registra un usuario con email normalizado y contraseña con hash", async () => {
    const user = await service.register("  Nuevo@Example.com ", "secreto123");

    expect(user.email).toBe("nuevo@example.com");
    expect(user.role).toBe("USER");
    expect(user.emailConfirmed).toBe(false);
    expect(user.passwordHash).not.toBe("secreto123");
    expect(user.passwordHash).toContain("secreto123");
    expect(emails.lastConfirmation?.to).toBe("nuevo@example.com");
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

  it("impide iniciar sesión con una cuenta sin confirmar", async () => {
    await service.register("pendiente@example.com", "secreto123");

    await expect(
      service.login("pendiente@example.com", "secreto123")
    ).rejects.toThrow("EMAIL_NOT_CONFIRMED");
  });

  it("confirmar el correo habilita el inicio de sesión", async () => {
    await service.register("confirma@example.com", "secreto123");

    const confirmed = await service.confirmEmail(emails.tokenFromLastEmail());
    expect(confirmed.emailConfirmed).toBe(true);

    const user = await service.login("confirma@example.com", "secreto123");
    expect(user.email).toBe("confirma@example.com");
  });

  it("rechaza un token de confirmación inválido", async () => {
    await expect(service.confirmEmail("token-inexistente")).rejects.toThrow(
      "INVALID_TOKEN"
    );
  });

  it("rechaza iniciar sesión con contraseña incorrecta", async () => {
    await service.register("clave@example.com", "secreto123");
    await service.confirmEmail(emails.tokenFromLastEmail());

    await expect(
      service.login("clave@example.com", "incorrecta")
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("crea una cuenta confirmada al iniciar sesión con OAuth", async () => {
    const user = await service.loginWithOAuth({
      email: "google@example.com",
      emailConfirmed: true
    });

    expect(user.provider).toBe("GOOGLE");
    expect(user.emailConfirmed).toBe(true);
    expect(user.passwordHash).toBeNull();
  });

  it("un usuario eliminado no puede volver a iniciar sesión", async () => {
    await service.register("borrado@example.com", "secreto123");
    await service.confirmEmail(emails.tokenFromLastEmail());

    const stored = await repository.findByEmail("borrado@example.com");
    await repository.delete(stored!.id);

    await expect(
      service.login("borrado@example.com", "secreto123")
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });
});
