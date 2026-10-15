import type { Pool } from "pg";
import type { Archivo, ArchivoRepository } from "./archivo.repository.js";

interface ArchivoRow {
  id: string;
  owner_id: string;
  nombre: string;
  clave: string;
  tipo: string;
  tamano: string | number;
  created_at: Date;
}

const SELECT_COLUMNS = `id, owner_id, nombre, clave, tipo, tamano, created_at`;

function toArchivo(row: ArchivoRow): Archivo {
  return {
    id: row.id,
    ownerId: row.owner_id,
    nombre: row.nombre,
    clave: row.clave,
    tipo: row.tipo,
    tamano: Number(row.tamano),
    createdAt: new Date(row.created_at)
  };
}

export class PgArchivoRepository implements ArchivoRepository {
  constructor(private readonly pool: Pool) {}

  async listByOwner(ownerId: string): Promise<Archivo[]> {
    const { rows } = await this.pool.query<ArchivoRow>(
      `SELECT ${SELECT_COLUMNS} FROM archivos
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [ownerId]
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

  async save(archivo: Archivo): Promise<void> {
    await this.pool.query(
      `INSERT INTO archivos (id, owner_id, nombre, clave, tipo, tamano, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         clave = EXCLUDED.clave,
         tipo = EXCLUDED.tipo,
         tamano = EXCLUDED.tamano`,
      [
        archivo.id,
        archivo.ownerId,
        archivo.nombre,
        archivo.clave,
        archivo.tipo,
        archivo.tamano,
        archivo.createdAt
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM archivos WHERE id = $1`, [id]);
  }
}
