import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { PasswordHasher } from "../lib/password.js";
import {
  createUser,
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
      passwordHash: await this.hasher.hash(password)
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

    if (!user || user.deleted || !user.passwordHash) {
      throw errors.invalidCredentials();
    }

    const passwordMatches = await this.hasher.verify(password, user.passwordHash);
    if (!passwordMatches) {
      throw errors.invalidCredentials();
    }

    this.logger.info("Inicio de sesion local", {
      userId: user.id,
      email: user.email
    });

    return user;
  }
}
