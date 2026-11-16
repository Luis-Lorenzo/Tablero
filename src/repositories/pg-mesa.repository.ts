import type { Pool } from "pg";
import type { EstadoMesa, Mesa, MesaRepository } from "./mesa.repository.js";

interface MesaRow {
  id: string;
  host_id: string;
  players: string[] | null;
  expulsados: string[] | null;
  pending_host_id: string | null;
  estado: string;
  imagen_escena_id: string | null;
  imagen_escena_titulo: string | null;
  imagen_proyectada_id: string | null;
  imagen_proyectada_titulo: string | null;
  divisa_nombre: string | null;
  created_at: Date;
}

interface MesaJugadorRow {
  user_id: string;
  color: string | null;
  apodo: string | null;
}

interface JugadoresMesaDatos {
  colores: Record<string, string>;
  apodos: Record<string, string>;
}

const SELECT_COLUMNS =
  "id, host_id, players, expulsados, pending_host_id, estado, imagen_escena_id, imagen_escena_titulo, imagen_proyectada_id, imagen_proyectada_titulo, divisa_nombre, created_at";

function toMesa(
  row: MesaRow,
  datos: JugadoresMesaDatos = { colores: {}, apodos: {} }
): Mesa {
  return {
    id: row.id,
    hostId: row.host_id,
    players: row.players ?? [],
    expulsados: row.expulsados ?? [],
    pendingHostId: row.pending_host_id,
    estado: (row.estado === "EN_CURSO" ? "EN_CURSO" : "ESPERA") as EstadoMesa,
    colores: datos.colores,
    apodos: datos.apodos,
    imagenEscena: row.imagen_escena_id
      ? { id: row.imagen_escena_id, titulo: row.imagen_escena_titulo }
      : null,
    imagenProyectada: row.imagen_proyectada_id
      ? { id: row.imagen_proyectada_id, titulo: row.imagen_proyectada_titulo }
      : null,
    divisaNombre: row.divisa_nombre?.trim() || "Divisa",
    createdAt: new Date(row.created_at)
  };
}

export class PgMesaRepository implements MesaRepository {
  constructor(private readonly pool: Pool) { }

  private async cargarJugadores(mesaIds: string[]): Promise<Map<string, JugadoresMesaDatos>> {
    const mapa = new Map<string, JugadoresMesaDatos>();
    if (mesaIds.length === 0) return mapa;

    const { rows } = await this.pool.query<MesaJugadorRow & { mesa_id: string }>(
      `SELECT mesa_id, user_id, color, apodo FROM mesa_jugadores WHERE mesa_id = ANY($1)`,
      [mesaIds]
    );

    for (const id of mesaIds) {
      mapa.set(id, { colores: {}, apodos: {} });
    }

    for (const row of rows) {
      const datos = mapa.get(row.mesa_id) ?? { colores: {}, apodos: {} };
      if (row.color) {
        datos.colores[row.user_id] = row.color;
      }
      if (row.apodo) {
        datos.apodos[row.user_id] = row.apodo;
      }
      mapa.set(row.mesa_id, datos);
    }

    return mapa;
  }

  async findById(id: string) {
    const { rows } = await this.pool.query<MesaRow>(
      `SELECT ${SELECT_COLUMNS} FROM mesas WHERE id = $1`,
      [id]
    );
    if (rows[0]) {
      const datos = await this.cargarJugadores([id]);
      return toMesa(rows[0], datos.get(id));
    }
    return undefined;
  }

  async list(limite?: number) {
    if (limite === undefined) {
      const { rows } = await this.pool.query<MesaRow>(
        `SELECT ${SELECT_COLUMNS} FROM mesas ORDER BY created_at ASC, id ASC`
      );
      const datos = await this.cargarJugadores(rows.map(r => r.id));
      return rows.map(row => toMesa(row, datos.get(row.id)));
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
    const datos = await this.cargarJugadores(rows.map(r => r.id));
    return rows.map(row => toMesa(row, datos.get(row.id)));
  }

  async save(mesa: Mesa) {
    await this.pool.query(
      `INSERT INTO mesas(id, host_id, players, expulsados, pending_host_id, estado, imagen_escena_id, imagen_escena_titulo, imagen_proyectada_id, imagen_proyectada_titulo, divisa_nombre, created_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT(id) DO UPDATE SET
         host_id = EXCLUDED.host_id,
      players = EXCLUDED.players,
      expulsados = EXCLUDED.expulsados,
      pending_host_id = EXCLUDED.pending_host_id,
         estado = EXCLUDED.estado,
         imagen_escena_id = EXCLUDED.imagen_escena_id,
         imagen_escena_titulo = EXCLUDED.imagen_escena_titulo,
         imagen_proyectada_id = EXCLUDED.imagen_proyectada_id,
         imagen_proyectada_titulo = EXCLUDED.imagen_proyectada_titulo,
         divisa_nombre = EXCLUDED.divisa_nombre`,
      [
        mesa.id,
        mesa.hostId,
        mesa.players,
        mesa.expulsados,
        mesa.pendingHostId,
        mesa.estado,
        mesa.imagenEscena?.id ?? null,
        mesa.imagenEscena?.titulo ?? null,
        mesa.imagenProyectada?.id ?? null,
        mesa.imagenProyectada?.titulo ?? null,
        mesa.divisaNombre?.trim() || "Divisa",
        mesa.createdAt
      ]
    );

    if (mesa.colores || mesa.apodos) {
      const userIds = new Set<string>();
      for (const [userId, color] of Object.entries(mesa.colores ?? {})) {
        if (color) userIds.add(userId);
      }
      for (const [userId, apodo] of Object.entries(mesa.apodos ?? {})) {
        if (apodo) userIds.add(userId);
      }
      await this.pool.query(`DELETE FROM mesa_jugadores WHERE mesa_id = $1`, [mesa.id]);
      for (const userId of userIds) {
        const color = mesa.colores?.[userId] || null;
        const apodo = mesa.apodos?.[userId] || null;
        await this.pool.query(
          `INSERT INTO mesa_jugadores (mesa_id, user_id, color, apodo)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (mesa_id, user_id) DO UPDATE SET
             color = EXCLUDED.color,
             apodo = EXCLUDED.apodo`,
          [mesa.id, userId, color, apodo]
        );
      }
    }
  }

  async delete(id: string) {
    await this.pool.query(`DELETE FROM mesas WHERE id = $1`, [id]);
  }
}
