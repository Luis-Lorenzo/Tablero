import crypto from "node:crypto";
import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { EmailSender } from "../lib/mailer.js";
import type { PasswordHasher } from "../lib/password.js";
import { registrarFallo } from "./bloqueo.service.js";
import {
  createUser,
  isUserLocked,
  type User,
  type UserRepository
} from "../repositories/user.repository.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
/** Caducidad del enlace de verificación: 30 minutos. */
export const VERIFICATION_TTL_MS = 30 * 60 * 1000;
/** Intervalo mínimo entre reenvíos de correo para una misma cuenta: 60 segundos. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly logger: Logger,
    private readonly mailer?: EmailSender,
    private readonly appUrl = "http://localhost:5173"
  ) {}

  async register(email: string, password: string, now = new Date()): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      throw errors.invalidEmail();
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      throw errors.weakPassword();
    }

    if (await this.users.findByEmail(normalizedEmail)) {
      throw errors.emailExists();
    }

    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);

    const user = createUser({
      email: normalizedEmail,
      passwordHash: await this.hasher.hash(password),
      // Toda cuenta nueva queda sin verificar (PENDING) hasta confirmar su correo.
      status: "PENDING",
      emailVerified: false,
      verificationTokenHash: tokenHash,
      verificationExpiresAt: expiresAt,
      verificationSentAt: now
    });

    await this.users.save(user);

    const verificationUrl = this.buildVerificationUrl(rawToken);
    if (this.mailer) {
      await this.mailer.sendVerificationEmail({
        toEmail: user.email,
        verificationUrl
      });
    }

    this.logger.info("Usuario registrado pendiente de verificacion por correo", {
      userId: user.id,
      email: user.email,
      expiresAt: expiresAt.toISOString()
    });

    return user;
  }

  async verifyEmail(rawToken: string, now = new Date()): Promise<User> {
    const cleanToken = rawToken.trim();
    if (!cleanToken || cleanToken.length < 16 || cleanToken.length > 256) {
      throw errors.invalidVerificationToken();
    }

    const tokenHash = hashVerificationToken(cleanToken);
    const user = await this.findByTokenHash(tokenHash);

    if (!user || user.deleted) {
      throw errors.invalidVerificationToken();
    }

    if (user.status === "REJECTED") {
      throw errors.accountRejected();
    }

    if (user.emailVerified || user.status === "ACTIVE") {
      user.verificationTokenHash = null;
      user.verificationExpiresAt = null;
      await this.users.save(user);
      throw errors.emailAlreadyVerified();
    }

    if (
      !user.verificationExpiresAt ||
      user.verificationExpiresAt.getTime() <= now.getTime()
    ) {
      throw errors.expiredVerificationToken();
    }

    let verified: User | undefined;
    if (this.users.consumeVerificationToken) {
      verified = await this.users.consumeVerificationToken(user.id, tokenHash);
    } else {
      const fresh = await this.users.findById(user.id);
      if (fresh && fresh.verificationTokenHash === tokenHash) {
        fresh.status = "ACTIVE";
        fresh.emailVerified = true;
        fresh.verificationTokenHash = null;
        fresh.verificationExpiresAt = null;
        await this.users.save(fresh);
        verified = fresh;
      }
    }

    if (!verified) {
      throw errors.invalidVerificationToken();
    }

    this.logger.info("Correo verificado correctamente", {
      userId: verified.id,
      email: verified.email
    });

    return verified;
  }

  async resendVerification(email: string, now = new Date()): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      throw errors.invalidEmail();
    }

    const user = await this.users.findByEmail(normalizedEmail);
    // No revelar si el correo existe o si ya está activo/rechazado.
    if (!user || user.deleted || user.status !== "PENDING" || user.emailVerified) {
      return;
    }

    if (
      user.verificationSentAt &&
      now.getTime() - user.verificationSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw errors.verificationRateLimited();
    }

    const rawToken = generateVerificationToken();
    user.verificationTokenHash = hashVerificationToken(rawToken);
    user.verificationExpiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
    user.verificationSentAt = now;

    await this.users.save(user);

    const verificationUrl = this.buildVerificationUrl(rawToken);
    if (this.mailer) {
      await this.mailer.sendVerificationEmail({
        toEmail: user.email,
        verificationUrl
      });
    }

    this.logger.info("Correo de verificacion reenviado", {
      userId: user.id,
      email: user.email,
      expiresAt: user.verificationExpiresAt.toISOString()
    });
  }

  private buildVerificationUrl(rawToken: string): string {
    const base = this.appUrl.replace(/\/+$/, "");
    return `${base}/verificar-correo?token=${encodeURIComponent(rawToken)}`;
  }

  private async findByTokenHash(tokenHash: string): Promise<User | undefined> {
    if (this.users.findByVerificationTokenHash) {
      return this.users.findByVerificationTokenHash(tokenHash);
    }
    const all = await this.users.list();
    return all.find(u => !u.deleted && u.verificationTokenHash === tokenHash);
  }

  async login(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email.trim());
    const now = new Date();

    if (!user || user.deleted || !user.passwordHash) {
      throw errors.invalidCredentials();
    }

    // Si la cuenta acumuló demasiados fallos recientes, está bloqueada hasta
    // que caduque `lockedUntil` (o hasta desbloquearla a mano en la base de
    // datos). El bloqueo se comprueba antes de validar la contraseña.
    if (isUserLocked(user, now)) {
      this.logger.warn("Intento de inicio de sesion en cuenta bloqueada", {
        userId: user.id,
        email: user.email,
        lockedUntil: user.lockedUntil?.toISOString()
      });
      throw errors.accountLocked();
    }

    const passwordMatches = await this.hasher.verify(password, user.passwordHash);
    if (!passwordMatches) {
      const locked = await this.recordFailedLogin(user, now);
      throw locked ? errors.accountLocked() : errors.invalidCredentials();
    }

    // La contraseña es correcta; solo entonces se informa del estado de la
    // cuenta, para no revelar si un correo existe sin autenticarse.
    if (user.status === "PENDING") {
      throw errors.accountPending();
    }

    if (user.status === "REJECTED") {
      throw errors.accountRejected();
    }

    // Un inicio de sesión correcto limpia el historial de fallos y cualquier
    // bloqueo (ya caducado o no: si estuviera vigente se habría salido antes).
    if (user.blocked || user.lockedUntil || user.failedLoginAt.length > 0) {
      user.blocked = false;
      user.lockedUntil = null;
      user.failedLoginAt = [];
      await this.users.save(user);
    }

    this.logger.info("Inicio de sesion local", {
      userId: user.id,
      email: user.email
    });

    return user;
  }

  /**
   * Registra un fallo de contraseña y aplica la regla de bloqueo. Devuelve
   * `true` si la cuenta ha quedado bloqueada con este fallo.
   */
  private async recordFailedLogin(user: User, now: Date): Promise<boolean> {
    const { fallos, bloqueado, hasta } = registrarFallo(user.failedLoginAt, now);

    user.failedLoginAt = fallos;
    user.blocked = bloqueado;
    user.lockedUntil = bloqueado ? hasta : null;

    await this.users.save(user);

    if (bloqueado) {
      this.logger.warn("Cuenta bloqueada por intentos fallidos", {
        userId: user.id,
        email: user.email,
        lockedUntil: hasta?.toISOString()
      });
    }

    return bloqueado;
  }
}
