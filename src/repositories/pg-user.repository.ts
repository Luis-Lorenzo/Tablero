import type { Pool } from "pg";
import {
  type User,
  type UserRepository,
  type UserRole,
  type UserStatus
} from "./user.repository.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  status: UserStatus;
  deleted: boolean;
  created_at: Date;
  failed_login_at: Date[] | null;
  blocked: boolean;
  locked_until: Date | null;
  nickname: string | null;
}

const SELECT_COLUMNS = `
  id, email, password_hash, role, status, deleted, created_at,
  failed_login_at, blocked, locked_until, nickname
`;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    deleted: row.deleted,
    createdAt: new Date(row.created_at),
    failedLoginAt: (row.failed_login_at ?? []).map(fallo => new Date(fallo)),
    blocked: row.blocked,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    nickname: row.nickname
  };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email.trim()]
    );
    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  }

  async findByNickname(nickname: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users
       WHERE deleted = FALSE AND lower(nickname) = lower($1)
       LIMIT 1`,
      [nickname.trim()]
    );
    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  }

  async findManyByIds(ids: readonly string[]): Promise<User[]> {
    if (ids.length === 0) {
      return [];
    }

    const result = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return result.rows.map(toUser);
  }

  async list(): Promise<User[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users ORDER BY created_at ASC`
    );
    return result.rows.map(toUser);
  }

  async save(user: User): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO users (
          id, email, password_hash, role, status, deleted, created_at,
          failed_login_at, blocked, locked_until, nickname
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          deleted = EXCLUDED.deleted,
          failed_login_at = EXCLUDED.failed_login_at,
          blocked = EXCLUDED.blocked,
          locked_until = EXCLUDED.locked_until,
          nickname = EXCLUDED.nickname
      `,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.role,
        user.status,
        user.deleted,
        user.createdAt,
        user.failedLoginAt.map(fallo => fallo.toISOString()),
        user.blocked,
        user.lockedUntil ? user.lockedUntil.toISOString() : null,
        user.nickname
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`UPDATE users SET deleted = TRUE WHERE id = $1`, [id]);
  }
}
