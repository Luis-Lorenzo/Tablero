import type { Pool } from "pg";
import type { Archivo, ArchivoRepository } from "./archivo.repository.js";

interface ArchivoRow {
  id: string;
  owner_id: string;
  mesa_id: string | null;
  nombre: string;
  clave: string;
  tipo: string;
  tamano: string | number;
  created_at: Date;
  updated_at?: Date | null;
}

const SELECT_COLUMNS = `id, owner_id, mesa_id, nombre, clave, tipo, tamano, created_at, updated_at`;

function toArchivo(row: ArchivoRow): Archivo {
  const createdAt = new Date(row.created_at);
  return {
    id: row.id,
    ownerId: row.owner_id,
    mesaId: row.mesa_id,
    nombre: row.nombre,
    clave: row.clave,
    tipo: row.tipo,
    tamano: Number(row.tamano),
    createdAt,
    updatedAt: new Date(row.updated_at ?? row.created_at)
  };
}

export class PgArchivoRepository implements ArchivoRepository {
  constructor(private readonly pool: Pool) { }

  async listByOwner(ownerId: string, mesaId?: string): Promise<Archivo[]> {
    if (mesaId) {
      const { rows } = await this.pool.query<ArchivoRow>(
        `SELECT ${SELECT_COLUMNS} FROM archivos
         WHERE owner_id = $1 AND (mesa_id IS NULL OR mesa_id = $2)
         ORDER BY created_at DESC`,
        [ownerId, mesaId]
      );
      return rows.map(toArchivo);
    }

    const { rows } = await this.pool.query<ArchivoRow>(
      `SELECT ${SELECT_COLUMNS} FROM archivos
       WHERE owner_id = $1 AND mesa_id IS NULL
       ORDER BY created_at DESC`,
      [ownerId]
    );

    return rows.map(toArchivo);
  }

  async listByMesa(mesaId: string): Promise<Archivo[]> {
    const { rows } = await this.pool.query<ArchivoRow>(
      `SELECT ${SELECT_COLUMNS} FROM archivos WHERE mesa_id = $1`,
      [mesaId]
    );
    return rows.map(toArchivo);
  }

  async findById(id: string): Promise<Archivo | undefined> {
    const { rows } = await this.pool.query<ArchivoRow>(
      `SELECT ${SELECT_COLUMNS} FROM archivos WHERE id = $1`,
      [id]
    );

    return rows[0] ? toArchivo(rows[0]) : undefined;
  }

  async countByClave(clave: string): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM archivos WHERE clave = $1`,
      [clave]
    );

    return rows[0]?.total ?? 0;
  }

  async save(archivo: Archivo): Promise<void> {
    const updatedAt = archivo.updatedAt ?? archivo.createdAt;
    await this.pool.query(
      `INSERT INTO archivos (id, owner_id, mesa_id, nombre, clave, tipo, tamano, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         mesa_id = EXCLUDED.mesa_id,
         nombre = EXCLUDED.nombre,
         clave = EXCLUDED.clave,
         tipo = EXCLUDED.tipo,
         tamano = EXCLUDED.tamano,
         updated_at = EXCLUDED.updated_at`,
      [
        archivo.id,
        archivo.ownerId,
        archivo.mesaId ?? null,
        archivo.nombre,
        archivo.clave,
        archivo.tipo,
        archivo.tamano,
        archivo.createdAt,
        updatedAt
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM archivos WHERE id = $1`, [id]);
  }

  async deleteByMesa(mesaId: string): Promise<Archivo[]> {
    const { rows } = await this.pool.query<ArchivoRow>(
      `DELETE FROM archivos WHERE mesa_id = $1 RETURNING ${SELECT_COLUMNS}`,
      [mesaId]
    );
    return rows.map(toArchivo);
  }
}
