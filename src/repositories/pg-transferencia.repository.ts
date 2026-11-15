import type { Pool } from "pg";
import type {
  ArchivoTransferidoMeta,
  PositTransferido,
  Transferencia,
  TransferenciaRepository
} from "./transferencia.repository.js";

interface TransferenciaRow {
  id: string;
  mesa_id: string;
  emisor_id: string;
  emisor_nombre: string;
  receptor_id: string;
  tipo: string;
  payload: unknown;
  created_at: Date | string;
}

function rowToTransferencia(row: TransferenciaRow): Transferencia {
  const createdAt =
    row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  const base = {
    id: row.id,
    mesaId: row.mesa_id,
    emisorId: row.emisor_id,
    emisorNombre: row.emisor_nombre,
    receptorId: row.receptor_id,
    createdAt
  };

  if (row.tipo === "archivo") {
    return {
      ...base,
      tipo: "archivo",
      archivo: row.payload as ArchivoTransferidoMeta
    };
  }

  return {
    ...base,
    tipo: "posit",
    posit: row.payload as PositTransferido
  };
}

export class PgTransferenciaRepository implements TransferenciaRepository {
  constructor(private readonly pool: Pool) {}

  async create(transferencia: Transferencia): Promise<void> {
    const payload =
      transferencia.tipo === "archivo" ? transferencia.archivo : transferencia.posit;

    await this.pool.query(
      `INSERT INTO transferencias (
         id, mesa_id, emisor_id, emisor_nombre, receptor_id, tipo, payload, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        transferencia.id,
        transferencia.mesaId,
        transferencia.emisorId,
        transferencia.emisorNombre,
        transferencia.receptorId,
        transferencia.tipo,
        JSON.stringify(payload),
        transferencia.createdAt
      ]
    );
  }

  async findById(id: string): Promise<Transferencia | undefined> {
    const { rows } = await this.pool.query<TransferenciaRow>(
      `SELECT id, mesa_id, emisor_id, emisor_nombre, receptor_id, tipo, payload, created_at
       FROM transferencias
       WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    return row ? rowToTransferencia(row) : undefined;
  }

  async listPendientes(mesaId: string, receptorId: string): Promise<Transferencia[]> {
    const { rows } = await this.pool.query<TransferenciaRow>(
      `SELECT id, mesa_id, emisor_id, emisor_nombre, receptor_id, tipo, payload, created_at
       FROM transferencias
       WHERE mesa_id = $1 AND receptor_id = $2
       ORDER BY created_at ASC`,
      [mesaId, receptorId]
    );
    return rows.map(rowToTransferencia);
  }

  async deleteById(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM transferencias WHERE id = $1`, [id]);
  }
}
