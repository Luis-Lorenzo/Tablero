export type UserRole = "USER" | "ADMIN";

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  deleted: boolean;
  createdAt: Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  list(): Promise<User[]>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createUser(input: {
  email: string;
  passwordHash: string | null;
  role?: UserRole;
}): User {
  return {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    role: input.role ?? "USER",
    deleted: false,
    createdAt: new Date()
  };
}

export class MemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  async findByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return [...this.users.values()].find(
      user => user.email.toLowerCase() === normalized
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
