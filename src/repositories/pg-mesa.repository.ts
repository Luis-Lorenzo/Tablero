import type { Pool } from "pg";
import type { EstadoMesa, Mesa, MesaRepository } from "./mesa.repository.js";

interface MesaRow {
  id: string;
  host_id: string;
  players: string[] | null;
  expulsados: string[] | null;
  pending_host_id: string | null;
  estado: string;
  created_at: Date;
}

interface MesaColorRow {
  user_id: string;
  color: string | null;
}

const SELECT_COLUMNS =
  "id, host_id, players, expulsados, pending_host_id, estado, created_at";

function toMesa(row: MesaRow, colores: Record<string, string> = {}): Mesa {
  return {
    id: row.id,
    hostId: row.host_id,
    players: row.players ?? [],
    expulsados: row.expulsados ?? [],
    pendingHostId: row.pending_host_id,
    estado: (row.estado === "EN_CURSO" ? "EN_CURSO" : "ESPERA") as EstadoMesa,
    colores,
    createdAt: new Date(row.created_at)
  };
}

export class PgMesaRepository implements MesaRepository {
  constructor(private readonly pool: Pool) {}

  private async cargarColores(mesaIds: string[]): Promise<Map<string, Record<string, string>>> {
    const mapa = new Map<string, Record<string, string>>();
    if (mesaIds.length === 0) return mapa;

    const { rows } = await this.pool.query<MesaColorRow & { mesa_id: string }>(
      `SELECT mesa_id, user_id, color FROM mesa_jugadores WHERE mesa_id = ANY($1)`,
      [mesaIds]
    );

    for (const id of mesaIds) {
      mapa.set(id, {});
    }

    for (const row of rows) {
      const obj = mapa.get(row.mesa_id) ?? {};
      if (row.color) {
        obj[row.user_id] = row.color;
      }
      mapa.set(row.mesa_id, obj);
    }

    return mapa;
  }

  async findById(id: string) {
    const { rows } = await this.pool.query<MesaRow>(
      `SELECT ${SELECT_COLUMNS} FROM mesas WHERE id = $1`,
      [id]
    );
    if (rows[0]) {
      const colores = await this.cargarColores([id]);
      return toMesa(rows[0], colores.get(id));
    }
    return undefined;
  }

  async list(limite?: number) {
    if (limite === undefined) {
      const { rows } = await this.pool.query<MesaRow>(
        `SELECT ${SELECT_COLUMNS} FROM mesas ORDER BY created_at ASC, id ASC`
      );
      const colores = await this.cargarColores(rows.map(r => r.id));
      return rows.map(row => toMesa(row, colores.get(row.id)));
    }

    if (limite <= 0) {
      return [];
    }

    const { rows } = await this.pool.query<MesaRow>(
      `SELECT ${SELECT_COLUMNS} FROM (
         SELECT ${SELECT_COLUMNS} FROM mesas
         ORDER BY created_at DESC, id DESC
         LIMIT $1
       ) AS recientes
       ORDER BY created_at ASC, id ASC`,
      [limite]
    );
    const colores = await this.cargarColores(rows.map(r => r.id));
    return rows.map(row => toMesa(row, colores.get(row.id)));
  }

  async save(mesa: Mesa) {
    await this.pool.query(
      `INSERT INTO mesas (id, host_id, players, expulsados, pending_host_id, estado, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         host_id = EXCLUDED.host_id,
         players = EXCLUDED.players,
         expulsados = EXCLUDED.expulsados,
         pending_host_id = EXCLUDED.pending_host_id,
         estado = EXCLUDED.estado`,
      [
        mesa.id,
        mesa.hostId,
        mesa.players,
        mesa.expulsados,
        mesa.pendingHostId,
        mesa.estado,
        mesa.createdAt
      ]
    );

    if (mesa.colores) {
      const entries = Object.entries(mesa.colores).filter(([, color]) => Boolean(color));
      await this.pool.query(`DELETE FROM mesa_jugadores WHERE mesa_id = $1`, [mesa.id]);
      for (const [userId, color] of entries) {
        await this.pool.query(
          `INSERT INTO mesa_jugadores (mesa_id, user_id, color) VALUES ($1, $2, $3) ON CONFLICT (mesa_id, user_id) DO UPDATE SET color = EXCLUDED.color`,
          [mesa.id, userId, color]
        );
      }
    }
  }

  async delete(id: string) {
    await this.pool.query(`DELETE FROM mesas WHERE id = $1`, [id]);
  }
}
