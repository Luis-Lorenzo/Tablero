import type { Pool } from "pg";
import {
  sanitizarPizarraEstado,
  type PizarraEstadoPersistido,
  type PizarraEstadoRepository
} from "./pizarra-estado.repository.js";

export class PgPizarraEstadoRepository implements PizarraEstadoRepository {
  constructor(private readonly pool: Pool) {}

  async getEstado(mesaId: string): Promise<PizarraEstadoPersistido> {
    const { rows } = await this.pool.query<{ datos: unknown }>(
      `SELECT datos FROM mesa_pizarra_estado WHERE mesa_id = $1`,
      [mesaId]
    );
    return sanitizarPizarraEstado(rows[0]?.datos);
  }

  async saveEstado(mesaId: string, estado: PizarraEstadoPersistido): Promise<void> {
    const limpio = sanitizarPizarraEstado(estado);
    await this.pool.query(
      `INSERT INTO mesa_pizarra_estado (mesa_id, datos, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (mesa_id) DO UPDATE SET
         datos = EXCLUDED.datos,
         updated_at = now()`,
      [mesaId, JSON.stringify(limpio)]
    );
  }
}
