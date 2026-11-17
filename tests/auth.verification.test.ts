import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AppContext } from "../src/api/context.js";
import { config } from "../src/lib/config.js";
import { logger } from "../src/lib/logger.js";
import { MemoryAlmacen } from "../src/lib/almacen.js";
import { BrevoEmailSender, MemoryEmailSender } from "../src/lib/mailer.js";
import { FakePasswordHasher } from "../src/lib/password.js";
import { NoopMesasNotifier } from "../src/realtime/mesas-notifier.js";
import { MemoryArchivoRepository } from "../src/repositories/archivo.repository.js";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import { MemoryUserRepository } from "../src/repositories/user.repository.js";
import { ArchivoService } from "../src/services/archivo.service.js";
import {
  AuthService,
  hashVerificationToken,
  RESEND_COOLDOWN_MS,
  VERIFICATION_TTL_MS
} from "../src/services/auth.service.js";
import { BloqueoService } from "../src/services/bloqueo.service.js";
import { ChatService } from "../src/services/chat.service.js";
import { MesaService } from "../src/services/mesa.service.js";
import { UserService } from "../src/services/user.service.js";

function extractTokenFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.searchParams.get("token") ?? "";
}

describe("Verificación de correo electrónico con Brevo", () => {
  let users: MemoryUserRepository;
  let mailer: MemoryEmailSender;
  let authService: AuthService;

  beforeEach(() => {
    users = new MemoryUserRepository();
    mailer = new MemoryEmailSender();
    authService = new AuthService(
      users,
      new FakePasswordHasher(),
      logger,
      mailer,
      "https://pocketrol.example.com"
    );
  });

  it("1 y 3. Registra usuario sin verificar, guarda solo el hash SHA-256 con caducidad de 30m y genera enlace dinámico", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const user = await authService.register("aventurero@example.com", "secreto123", now);

    expect(user.status).toBe("PENDING");
    expect(user.emailVerified).toBe(false);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].toEmail).toBe("aventurero@example.com");
    expect(mailer.sent[0].verificationUrl).toMatch(
      /^https:\/\/pocketrol\.example\.com\/verificar-correo\?token=[0-9a-f]{64}$/
    );

    const rawToken = extractTokenFromUrl(mailer.sent[0].verificationUrl);
    const stored = await users.findByEmail("aventurero@example.com");
    expect(stored?.verificationTokenHash).toBe(hashVerificationToken(rawToken));
    expect(stored?.verificationTokenHash).not.toBe(rawToken);
    expect(stored?.verificationExpiresAt?.getTime()).toBe(
      now.getTime() + VERIFICATION_TTL_MS
    );
  });

  it("2. Envía el correo mediante la API oficial de Brevo con templateId 5 y params.verification_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: "<msg-1>" })
    } as unknown as Response);

    const brevoSender = new BrevoEmailSender(
      {
        apiKey: "xkeysib-test-secret",
        templateId: 5,
        senderEmail: "infoluisloxc@gmail.com",
        senderName: "Pocket Rol"
      },
      logger,
      fetchMock as unknown as typeof fetch
    );

    await brevoSender.sendVerificationEmail({
      toEmail: "jugador@example.com",
      verificationUrl: "https://pocketrol.example.com/verificar-correo?token=abc123"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.method).toBe("POST");
    expect(options.headers["api-key"]).toBe("xkeysib-test-secret");
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      sender: {
        email: "infoluisloxc@gmail.com",
        name: "Pocket Rol"
      },
      to: [{ email: "jugador@example.com" }],
      templateId: 5,
      params: {
        verification_url: "https://pocketrol.example.com/verificar-correo?token=abc123"
      }
    });
  });

  it("4 y 7. Verifica correctamente el correo, limpia el hash e impide reutilizar el token", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    await authService.register("unica@example.com", "secreto123", now);
    const rawToken = extractTokenFromUrl(mailer.sent[0].verificationUrl);

    const verified = await authService.verifyEmail(
      rawToken,
      new Date(now.getTime() + 5 * 60 * 1000)
    );
    expect(verified.status).toBe("ACTIVE");
    expect(verified.emailVerified).toBe(true);

    const stored = await users.findByEmail("unica@example.com");
    expect(stored?.verificationTokenHash).toBeNull();
    expect(stored?.verificationExpiresAt).toBeNull();

    // Intento de reutilizar el mismo token -> rechazado
    await expect(
      authService.verifyEmail(rawToken, new Date(now.getTime() + 6 * 60 * 1000))
    ).rejects.toThrow("INVALID_VERIFICATION_TOKEN");
  });

  it("5 y 6. Rechaza tokens inválidos y tokens caducados (> 30 minutos)", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    await authService.register("caduca@example.com", "secreto123", now);
    const rawToken = extractTokenFromUrl(mailer.sent[0].verificationUrl);

    await expect(authService.verifyEmail("token-corto", now)).rejects.toThrow(
      "INVALID_VERIFICATION_TOKEN"
    );
    await expect(
      authService.verifyEmail("a".repeat(64), now)
    ).rejects.toThrow("INVALID_VERIFICATION_TOKEN");

    // Justo a los 30 minutos y 1 ms -> caducado
    await expect(
      authService.verifyEmail(
        rawToken,
        new Date(now.getTime() + VERIFICATION_TTL_MS + 1)
      )
    ).rejects.toThrow("EXPIRED_VERIFICATION_TOKEN");
  });

  it("8. Reenvía correo invalidando el token anterior, renovando 30m y aplicando rate-limit sin filtrar cuentas", async () => {
    const t0 = new Date("2026-11-17T12:00:00.000Z");
    await authService.register("reenvio@example.com", "secreto123", t0);
    const primerToken = extractTokenFromUrl(mailer.sent[0].verificationUrl);

    // Dentro de la ventana de enfriamiento -> 429 VERIFICATION_RATE_LIMITED
    await expect(
      authService.resendVerification(
        "reenvio@example.com",
        new Date(t0.getTime() + 15_000)
      )
    ).rejects.toThrow("VERIFICATION_RATE_LIMITED");

    // Pasado el cooldown -> genera nuevo token e invalida el anterior
    const t1 = new Date(t0.getTime() + RESEND_COOLDOWN_MS + 1000);
    await authService.resendVerification("reenvio@example.com", t1);
    expect(mailer.sent).toHaveLength(2);
    const segundoToken = extractTokenFromUrl(mailer.sent[1].verificationUrl);
    expect(segundoToken).not.toBe(primerToken);

    await expect(authService.verifyEmail(primerToken, t1)).rejects.toThrow(
      "INVALID_VERIFICATION_TOKEN"
    );

    const verified = await authService.verifyEmail(segundoToken, t1);
    expect(verified.status).toBe("ACTIVE");

    // Correo inexistente no lanza error ni envía email (no revela existencia)
    await expect(
      authService.resendVerification("noexiste@example.com", t1)
    ).resolves.toBeUndefined();
    expect(mailer.sent).toHaveLength(2);
  });

  it("9 y 10. Flujo HTTP completo: bloquea sin verificar y permite login y acceso tras verificar", async () => {
    const mesas = new MemoryMesaRepository();
    const archivoService = new ArchivoService(
      new MemoryArchivoRepository(),
      new MemoryAlmacen(),
      logger,
      config.archivos.maxBytes,
      mesas
    );
    const context: AppContext = {
      config,
      logger,
      userRepository: users,
      mesaRepository: mesas,
      authService,
      userService: new UserService(users, logger),
      bloqueoService: new BloqueoService(logger),
      mesaService: new MesaService(mesas, users, logger, archivoService),
      chatService: new ChatService(mesas, users),
      archivoService,
      mesasNotifier: new NoopMesasNotifier()
    };
    const app = createApp(context);

    // 1. Registro HTTP
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email: "httpuser@example.com", password: "password123" });
    expect(reg.status).toBe(201);
    expect(reg.body.status).toBe("PENDING");
    expect(mailer.sent).toHaveLength(1);

    // 2. Bloqueo de login antes de verificar
    const loginAntes = await request(app)
      .post("/api/auth/login")
      .send({ email: "httpuser@example.com", password: "password123" });
    expect(loginAntes.status).toBe(403);
    expect(loginAntes.body.error).toBe("ACCOUNT_PENDING");

    // 3. Bloqueo de rutas protegidas
    const mesasSinSesion = await request(app).get("/api/mesas/inicio");
    expect(mesasSinSesion.status).toBe(401);

    // 4. Verificación mediante POST /api/auth/verify-email
    const token = extractTokenFromUrl(mailer.sent[0].verificationUrl);
    const verif = await request(app)
      .post("/api/auth/verify-email")
      .send({ token });
    expect(verif.status).toBe(200);
    expect(verif.body.status).toBe("ACTIVE");

    // 5. Login y acceso a ruta protegida tras verificar
    const loginDespues = await request(app)
      .post("/api/auth/login")
      .send({ email: "httpuser@example.com", password: "password123" });
    expect(loginDespues.status).toBe(200);
    const cookie = loginDespues.headers["set-cookie"];

    const mesasConSesion = await request(app)
      .get("/api/mesas/inicio")
      .set("Cookie", cookie);
    expect(mesasConSesion.status).toBe(200);
  });
});
