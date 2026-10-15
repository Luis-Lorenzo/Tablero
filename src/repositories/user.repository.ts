export type UserRole = "USER" | "ADMIN";

/**
 * Estado de aprobación de la cuenta. Los registros nuevos quedan `PENDING`
 * hasta que un administrador los aprueba (por ejemplo, desde la propia base
 * de datos) poniéndolos en `ACTIVE`.
 */
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED";

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  deleted: boolean;
  createdAt: Date;
  /** Fallos de inicio de sesión recientes (los más nuevos al final). */
  failedLoginAt: Date[];
  /**
   * Marca de bloqueo por intentos fallidos. Es el indicador que se puede
   * consultar o cambiar a mano desde la base de datos.
   */
  blocked: boolean;
  /** Fecha en la que el bloqueo caduca solo (null = sin caducidad). */
  lockedUntil: Date | null;
  /** Nombre visible opcional. Único entre usuarios activos cuando está definido. */
  nickname: string | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  /** Busca un usuario no borrado por su nombre visible (sin distinguir mayúsculas). */
  findByNickname(nickname: string): Promise<User | undefined>;
  /**
   * Devuelve los usuarios cuyo id está en la lista, en una sola consulta.
   * Evita el N+1 al componer varias mesas (anfitrión + jugadores de cada una).
   * Con una lista vacía devuelve un array vacío sin tocar la base de datos.
   */
  findManyByIds(ids: readonly string[]): Promise<User[]>;
  list(): Promise<User[]>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createUser(input: {
  email: string;
  passwordHash: string | null;
  role?: UserRole;
  status?: UserStatus;
  nickname?: string | null;
}): User {
  return {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    passwordHash: input.passwordHash,
    role: input.role ?? "USER",
    status: input.status ?? "PENDING",
    deleted: false,
    createdAt: new Date(),
    failedLoginAt: [],
    blocked: false,
    lockedUntil: null,
    nickname: input.nickname ?? null
  };
}

/**
 * Una cuenta está activa cuando no ha sido borrada y su registro ha sido
 * aprobado. Es la condición que se exige para iniciar sesión.
 */
export function isActiveUser(user: User): boolean {
  return !user.deleted && user.status === "ACTIVE";
}

/**
 * Nombre con el que se muestra un usuario: su nombre visible (nickname) si lo
 * tiene, o la parte del correo anterior a la @ en caso contrario.
 */
export function nombreDeUsuario(user: Pick<User, "email" | "nickname">): string {
  const nickname = user.nickname?.trim();
  if (nickname) {
    return nickname;
  }

  const corte = user.email.indexOf("@");
  return corte === -1 ? user.email : user.email.slice(0, corte);
}

/**
 * Indica si la cuenta está bloqueada en este instante por acumular intentos de
 * inicio de sesión fallidos.
 *
 * El indicador es `blocked`; `lockedUntil` es la fecha en la que el bloqueo
 * caduca solo. Una cuenta con `blocked` en true y sin fecha queda bloqueada
 * hasta que se cambie a mano desde la base de datos, y una con la fecha ya
 * pasada se considera desbloqueada.
 */
export function isUserLocked(user: User, now: Date): boolean {
  if (!user.blocked) {
    return false;
  }

  return !user.lockedUntil || user.lockedUntil.getTime() > now.getTime();
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

  async findByNickname(nickname: string) {
    const normalized = nickname.trim().toLowerCase();
    return [...this.users.values()].find(
      user => !user.deleted && user.nickname?.trim().toLowerCase() === normalized
    );
  }

  async findManyByIds(ids: readonly string[]) {
    const buscados = new Set(ids);
    return [...this.users.values()].filter(user => buscados.has(user.id));
  }

  async list() {
    return [...this.users.values()];
  }

  async save(user: User) {
    this.users.set(user.id, {
      ...user,
      failedLoginAt: [...user.failedLoginAt]
    });
  }

  async delete(id: string) {
    const user = this.users.get(id);
    if (user) {
      this.users.set(id, { ...user, deleted: true });
    }
  }
}
