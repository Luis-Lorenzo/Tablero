import {
  type User,
  type UserRepository
} from "../repositories/user.repository.js";

export class UserService {
  constructor(private readonly users: UserRepository) {}

  async register(email: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("INVALID_EMAIL");
    }

    if (await this.users.findByEmail(normalizedEmail)) {
      throw new Error("EMAIL_EXISTS");
    }

    const user: User = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      role: "USER",
      emailConfirmed: false,
      deleted: false
    };

    await this.users.save(user);
    return user;
  }

  async listUsers(actor: User): Promise<User[]> {
    this.requireAdmin(actor);
    return (await this.users.list()).filter(user => !user.deleted);
  }

  async isActive(actor: User, id: string): Promise<boolean> {
    this.requireAdmin(actor);

    const user = await this.users.findById(id);
    return Boolean(user && !user.deleted && user.emailConfirmed);
  }

  async deleteUser(actor: User, targetId: string): Promise<void> {
    const target = await this.users.findById(targetId);

    if (!target || target.deleted) {
      throw new Error("USER_NOT_FOUND");
    }

    if (actor.role !== "ADMIN" && actor.id !== targetId) {
      throw new Error("FORBIDDEN");
    }

    await this.users.delete(targetId);
  }

  private requireAdmin(actor: User) {
    if (actor.role !== "ADMIN") {
      throw new Error("FORBIDDEN");
    }
  }
}
