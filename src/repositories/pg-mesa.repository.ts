import type { Pool } from "pg";
import type { Mesa, MesaRepository } from "./mesa.repository.js";

interface MesaRow {
  id: string;
  host_id: string;
  players: string[] | null;
  expulsados: string[] | null;
  pending_host_id: string | null;
  created_at: Date;
}

const SELECT_COLUMNS =
  "id, host_id, players, expulsados, pending_host_id, created_at";

function toMesa(row: MesaRow): Mesa {
  return {
    id: row.id,
    hostId: row.host_id,
    players: row.players ?? [],
    expulsados: row.expulsados ?? [],
    pendingHostId: row.pending_host_id,
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

  async list(limite?: number) {
    if (limite === undefined) {
      const { rows } = await this.pool.query<MesaRow>(
        `SELECT ${SELECT_COLUMNS} FROM mesas ORDER BY created_at ASC, id ASC`
      );
      return rows.map(toMesa);
    }

    if (limite <= 0) {
      return [];
    }

    // Subconsulta: quedarse con las N más recientes (DESC LIMIT) y devolverlas
    // en orden ascendente, igual que la consulta sin límite.
    const { rows } = await this.pool.query<MesaRow>(
      `SELECT ${SELECT_COLUMNS} FROM (
         SELECT ${SELECT_COLUMNS} FROM mesas
         ORDER BY created_at DESC, id DESC
         LIMIT $1
       ) AS recientes
       ORDER BY created_at ASC, id ASC`,
      [limite]
    );
    return rows.map(toMesa);
  }

  async save(mesa: Mesa) {
    await this.pool.query(
      `INSERT INTO mesas (id, host_id, players, expulsados, pending_host_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         host_id = EXCLUDED.host_id,
         players = EXCLUDED.players,
         expulsados = EXCLUDED.expulsados,
         pending_host_id = EXCLUDED.pending_host_id`,
      [
        mesa.id,
        mesa.hostId,
        mesa.players,
        mesa.expulsados,
        mesa.pendingHostId,
        mesa.createdAt
      ]
    );
  }

  async delete(id: string) {
    await this.pool.query(`DELETE FROM mesas WHERE id = $1`, [id]);
  }
}
