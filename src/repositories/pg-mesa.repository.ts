import type { Pool } from "pg";
import type { Mesa, MesaRepository } from "./mesa.repository.js";

interface MesaRow {
  id: string;
  host_id: string;
  players: string[] | null;
  created_at: Date;
}

const SELECT_COLUMNS = "id, host_id, players, created_at";

function toMesa(row: MesaRow): Mesa {
  return {
    id: row.id,
    hostId: row.host_id,
    players: row.players ?? [],
    createdAt: new Date(row.created_at)
  };
}

export class PgMesaRepository implements MesaRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string) {
    const { rows } = await this.pool.query<MesaRow>(
      `SELECT ${SELECT_COLUMNS} FROM mesas WHERE id = $1`,
      [id]
    );
    return rows[0] ? toMesa(rows[0]) : undefined;
  }

  async list() {
    const { rows } = await this.pool.query<MesaRow>(
      `SELECT ${SELECT_COLUMNS} FROM mesas ORDER BY created_at ASC`
    );
    return rows.map(toMesa);
  }

  async save(mesa: Mesa) {
    await this.pool.query(
      `INSERT INTO mesas (id, host_id, players, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         host_id = EXCLUDED.host_id,
         players = EXCLUDED.players`,
      [mesa.id, mesa.hostId, mesa.players, mesa.createdAt]
    );
  }

  async delete(id: string) {
    await this.pool.query(`DELETE FROM mesas WHERE id = $1`, [id]);
  }
}
