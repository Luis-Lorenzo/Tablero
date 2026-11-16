import type { Pool } from "pg";
import {
  sanitizarDivisasConfig,
  sanitizarMusicaAmbiente,
  type EstadoMesa,
  type Mesa,
  type MesaRepository
} from "./mesa.repository.js";

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
  divisas_config: unknown;
  musica_ambiente: unknown;
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
  "id, host_id, players, expulsados, pending_host_id, estado, imagen_escena_id, imagen_escena_titulo, imagen_proyectada_id, imagen_proyectada_titulo, divisa_nombre, divisas_config, musica_ambiente, created_at";

function toMesa(
  row: MesaRow,
  datos: JugadoresMesaDatos = { colores: {}, apodos: {} }
): Mesa {
  const divisasLimpias = sanitizarDivisasConfig(row.divisas_config);
  const musicaAmbiente = sanitizarMusicaAmbiente(row.musica_ambiente);
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
    ...(divisasLimpias.length > 0 ? { divisasConfig: divisasLimpias } : {}),
    musicaAmbiente,
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO mesas(id, host_id, players, expulsados, pending_host_id, estado, imagen_escena_id, imagen_escena_titulo, imagen_proyectada_id, imagen_proyectada_titulo, divisa_nombre, divisas_config, musica_ambiente, created_at)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)
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
           divisa_nombre = EXCLUDED.divisa_nombre,
           divisas_config = EXCLUDED.divisas_config,
           musica_ambiente = EXCLUDED.musica_ambiente`,
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
          mesa.divisasConfig ? JSON.stringify(mesa.divisasConfig) : null,
          mesa.musicaAmbiente ? JSON.stringify(mesa.musicaAmbiente) : null,
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
        await client.query(`DELETE FROM mesa_jugadores WHERE mesa_id = $1`, [mesa.id]);
        if (userIds.size > 0) {
          const ids: string[] = [];
          const colores: (string | null)[] = [];
          const apodos: (string | null)[] = [];
          for (const userId of userIds) {
            ids.push(userId);
            colores.push(mesa.colores?.[userId] || null);
            apodos.push(mesa.apodos?.[userId] || null);
          }
          await client.query(
            `INSERT INTO mesa_jugadores (mesa_id, user_id, color, apodo)
             SELECT $1, * FROM UNNEST($2::uuid[], $3::text[], $4::text[])`,
            [mesa.id, ids, colores, apodos]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string) {
    await this.pool.query(`DELETE FROM mesas WHERE id = $1`, [id]);
  }
}
