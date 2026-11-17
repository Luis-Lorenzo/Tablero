import type { Pool } from "pg";
import {
  sanitizarMacros,
  type MacroTiradaPersistida,
  type UserMacrosRepository
} from "./user-macros.repository.js";

export class PgUserMacrosRepository implements UserMacrosRepository {
  constructor(private readonly pool: Pool) {}

  async getMacros(userId: string): Promise<MacroTiradaPersistida[]> {
    const { rows } = await this.pool.query<{ macros: unknown }>(
      `SELECT macros FROM user_macros WHERE user_id = $1`,
      [userId]
    );
    return sanitizarMacros(rows[0]?.macros);
  }

  async saveMacros(
    userId: string,
    macros: MacroTiradaPersistida[]
  ): Promise<void> {
    const limpias = sanitizarMacros(macros);
    await this.pool.query(
      `INSERT INTO user_macros (user_id, macros, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET
         macros = EXCLUDED.macros,
         updated_at = now()`,
      [userId, JSON.stringify(limpias)]
    );
  }
}
