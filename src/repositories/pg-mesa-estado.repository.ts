import type { Pool } from "pg";
import {
  sanitizarDivisa,
  sanitizarElementosMesa,
  sanitizarMochila,
  type ElementoMesaPersistido,
  type EstadoJugadorMesa,
  type MesaEstadoRepository,
  type ObjetoMochilaPersistido
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

  async getEstadoCompleto(mesaId: string, userId: string): Promise<EstadoJugadorMesa> {
    const { rows } = await this.pool.query<{
      elementos: unknown;
      divisa: string | number | null;
      mochila: unknown;
    }>(
      `SELECT elementos, divisa, mochila FROM mesa_jugador_estado
       WHERE mesa_id = $1 AND user_id = $2`,
      [mesaId, userId]
    );

    return {
      elementos: sanitizarElementosMesa(rows[0]?.elementos),
      divisa: sanitizarDivisa(rows[0]?.divisa),
      mochila: sanitizarMochila(rows[0]?.mochila)
    };
  }

  async saveDivisa(mesaId: string, userId: string, divisa: number): Promise<number> {
    const limpia = sanitizarDivisa(divisa);
    await this.pool.query(
      `INSERT INTO mesa_jugador_estado (mesa_id, user_id, divisa, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (mesa_id, user_id) DO UPDATE SET
         divisa = EXCLUDED.divisa,
         updated_at = now()`,
      [mesaId, userId, limpia]
    );
    return limpia;
  }

  async saveMochila(
    mesaId: string,
    userId: string,
    mochila: ObjetoMochilaPersistido[]
  ): Promise<void> {
    const limpia = sanitizarMochila(mochila);
    await this.pool.query(
      `INSERT INTO mesa_jugador_estado (mesa_id, user_id, mochila, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (mesa_id, user_id) DO UPDATE SET
         mochila = EXCLUDED.mochila,
         updated_at = now()`,
      [mesaId, userId, JSON.stringify(limpia)]
    );
  }
}
