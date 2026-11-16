import type { Pool } from "pg";
import {
  sanitizarMapaEstado,
  type EstadoMapaCompartido,
  type MapaEstadoRepository
} from "./mapa-estado.repository.js";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mesa_mapa_estado (
  mesa_id TEXT PRIMARY KEY REFERENCES mesas(id) ON DELETE CASCADE,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

export class PgMapaEstadoRepository implements MapaEstadoRepository {
  private tableReady: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private ensureTable(): Promise<void> {
    if (!this.tableReady) {
      this.tableReady = this.pool
        .query(CREATE_TABLE_SQL)
        .then(() => undefined)
        .catch(error => {
          this.tableReady = null;
          throw error;
        });
    }
    return this.tableReady;
  }

  async getEstado(mesaId: string): Promise<EstadoMapaCompartido> {
    await this.ensureTable();
    const { rows } = await this.pool.query<{ datos: unknown }>(
      `SELECT datos FROM mesa_mapa_estado WHERE mesa_id = $1`,
      [mesaId]
    );
    return sanitizarMapaEstado(rows[0]?.datos);
  }

  async saveEstado(mesaId: string, estado: EstadoMapaCompartido): Promise<void> {
    await this.ensureTable();
    const limpio = sanitizarMapaEstado(estado);
    await this.pool.query(
      `INSERT INTO mesa_mapa_estado (mesa_id, datos, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (mesa_id) DO UPDATE SET
         datos = EXCLUDED.datos,
         updated_at = now()`,
      [mesaId, JSON.stringify(limpio)]
    );
  }
}
