export type UserRole = "USER" | "ADMIN";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  emailConfirmed: boolean;
  deleted: boolean;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  list(): Promise<User[]>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

export class MemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  async findByEmail(email: string) {
    return [...this.users.values()].find(
      user => user.email.toLowerCase() === email.toLowerCase()
    );
  }

  async findById(id: string) {
    return this.users.get(id);
  }

  async list() {
    return [...this.users.values()];
  }

  async save(user: User) {
    this.users.set(user.id, { ...user });
  }

  async delete(id: string) {
    const user = this.users.get(id);
    if (user) {
      this.users.set(id, { ...user, deleted: true });
    }
  }
}
