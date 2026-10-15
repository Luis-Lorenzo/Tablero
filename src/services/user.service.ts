import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { normalizarNickname, validarNickname } from "../lib/nickname.js";
import {
  isActiveUser,
  type User,
  type UserRepository
} from "../repositories/user.repository.js";

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly logger: Logger
  ) {}

  async listUsers(actor: User): Promise<User[]> {
    this.requireAdmin(actor);
    return (await this.users.list()).filter(user => !user.deleted);
  }

  async isActive(actor: User, id: string): Promise<boolean> {
    this.requireAdmin(actor);

    const user = await this.users.findById(id);
    return Boolean(user && isActiveUser(user));
  }

  async deleteUser(actor: User, targetId: string): Promise<void> {
    const target = await this.users.findById(targetId);

    if (!target || target.deleted) {
      throw errors.userNotFound();
    }

    if (actor.role !== "ADMIN" && actor.id !== targetId) {
      throw errors.forbidden();
    }

    await this.users.delete(targetId);

    this.logger.info("Usuario eliminado", {
      actorId: actor.id,
      targetId
    });
  }

  /**
   * Cambia el nombre visible del propio usuario. `null` (o una cadena vacía)
   * lo borra y vuelve a mostrarse la parte del correo. El nombre no puede
   * repetirse con el de otra cuenta.
   */
  async setNickname(actor: User, rawNickname: string | null): Promise<User> {
    const limpio = rawNickname === null ? null : normalizarNickname(rawNickname);
    const nickname = limpio ? limpio : null;

    const user = await this.users.findById(actor.id);
    if (!user || user.deleted) {
      throw errors.userNotFound();
    }

    if (nickname !== null) {
      if (validarNickname(nickname)) {
        throw errors.invalidNickname();
      }

      const existente = await this.users.findByNickname(nickname);
      if (existente && existente.id !== actor.id) {
        throw errors.nicknameTaken();
      }
    }

    user.nickname = nickname;
    await this.users.save(user);

    this.logger.info("Nickname actualizado", {
      userId: actor.id,
      tieneNickname: nickname !== null
    });

    return user;
  }

  private requireAdmin(actor: User): void {
    if (actor.role !== "ADMIN") {
      throw errors.forbidden();
    }
  }
}
