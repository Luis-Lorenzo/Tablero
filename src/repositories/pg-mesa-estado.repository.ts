import type { Pool } from "pg";
import {
  sanitizarElementosMesa,
  type ElementoMesaPersistido,
  type MesaEstadoRepository
} from "./mesa-estado.repository.js";

export class PgMesaEstadoRepository implements MesaEstadoRepository {
  constructor(private readonly pool: Pool) {}

  async getElementos(
    mesaId: string,
    userId: string
  ): Promise<ElementoMesaPersistido[]> {
    const { rows } = await this.pool.query<{ elementos: unknown }>(
      `SELECT elementos FROM mesa_jugador_estado
       WHERE mesa_id = $1 AND user_id = $2`,
      [mesaId, userId]
    );

    return sanitizarElementosMesa(rows[0]?.elementos);
  }

  async saveElementos(
    mesaId: string,
    userId: string,
    elementos: ElementoMesaPersistido[]
  ): Promise<void> {
    const limpios = sanitizarElementosMesa(elementos);
    await this.pool.query(
      `INSERT INTO mesa_jugador_estado (mesa_id, user_id, elementos, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (mesa_id, user_id) DO UPDATE SET
         elementos = EXCLUDED.elementos,
         updated_at = now()`,
      [mesaId, userId, JSON.stringify(limpios)]
    );
  }
}
