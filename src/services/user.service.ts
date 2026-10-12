import { errors } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { type User, type UserRepository } from "../repositories/user.repository.js";

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
    return Boolean(user && !user.deleted);
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

  private requireAdmin(actor: User): void {
    if (actor.role !== "ADMIN") {
      throw errors.forbidden();
    }
  }
}
