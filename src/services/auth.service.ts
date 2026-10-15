import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
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

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly logger: Logger
  ) {}

  async register(email: string, password: string): Promise<User> {
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

    const user = createUser({
      email: normalizedEmail,
      passwordHash: await this.hasher.hash(password),
      // Toda cuenta nueva queda pendiente de aprobación.
      status: "PENDING"
    });

    await this.users.save(user);

    this.logger.info("Usuario registrado", {
      userId: user.id,
      email: user.email
    });

    return user;
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
