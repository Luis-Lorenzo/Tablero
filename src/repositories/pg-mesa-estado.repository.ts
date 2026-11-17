import type { Pool } from "pg";
import {
  sanitizarDivisa,
  sanitizarDivisaId,
  sanitizarDivisasSaldos,
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

  private toEstadoJugadorMesa(row?: {
    elementos: unknown;
    divisa: string | number | null;
    divisas_saldos: unknown;
    mochila: unknown;
  }): EstadoJugadorMesa {
    const divisa = sanitizarDivisa(row?.divisa);
    const divisasSaldos = sanitizarDivisasSaldos(row?.divisas_saldos);
    if (divisasSaldos.principal === undefined && divisa > 0) {
      divisasSaldos.principal = divisa;
    }

    return {
      elementos: sanitizarElementosMesa(row?.elementos),
      divisa,
      divisasSaldos,
      mochila: sanitizarMochila(row?.mochila)
    };
  }

  async getEstadoCompleto(mesaId: string, userId: string): Promise<EstadoJugadorMesa> {
    const { rows } = await this.pool.query<{
      elementos: unknown;
      divisa: string | number | null;
      divisas_saldos: unknown;
      mochila: unknown;
    }>(
      `SELECT elementos, divisa, divisas_saldos, mochila FROM mesa_jugador_estado
       WHERE mesa_id = $1 AND user_id = $2`,
      [mesaId, userId]
    );

    return this.toEstadoJugadorMesa(rows[0]);
  }

  async getEstadosPorMesa(
    mesaId: string,
    userIds: string[]
  ): Promise<Map<string, EstadoJugadorMesa>> {
    const mapa = new Map<string, EstadoJugadorMesa>();
    if (userIds.length === 0) return mapa;

    const { rows } = await this.pool.query<{
      user_id: string;
      elementos: unknown;
      divisa: string | number | null;
      divisas_saldos: unknown;
      mochila: unknown;
    }>(
      `SELECT user_id, elementos, divisa, divisas_saldos, mochila
       FROM mesa_jugador_estado
       WHERE mesa_id = $1 AND user_id = ANY($2)`,
      [mesaId, userIds]
    );

    const porUsuario = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      porUsuario.set(row.user_id, row);
    }

    for (const userId of userIds) {
      mapa.set(userId, this.toEstadoJugadorMesa(porUsuario.get(userId)));
    }

    return mapa;
  }

  async saveDivisa(mesaId: string, userId: string, divisa: number): Promise<number> {
    const limpia = sanitizarDivisa(divisa);
    await this.pool.query(
      `INSERT INTO mesa_jugador_estado (mesa_id, user_id, divisa, divisas_saldos, updated_at)
       VALUES ($1, $2, $3, jsonb_build_object('principal', $3::bigint), now())
       ON CONFLICT (mesa_id, user_id) DO UPDATE SET
         divisa = EXCLUDED.divisa,
         divisas_saldos = jsonb_set(
           COALESCE(mesa_jugador_estado.divisas_saldos, '{}'::jsonb),
           ARRAY['principal'],
           to_jsonb($3::bigint),
           true
         ),
         updated_at = now()`,
      [mesaId, userId, limpia]
    );
    return limpia;
  }

  async saveDivisaSaldo(
    mesaId: string,
    userId: string,
    divisaId: string,
    divisa: number
  ): Promise<{ divisa: number; divisasSaldos: Record<string, number> }> {
    const id = sanitizarDivisaId(divisaId);
    const limpia = sanitizarDivisa(divisa);
    const esPrincipal = id === "principal";

    const { rows } = await this.pool.query<{
      divisa: string | number | null;
      divisas_saldos: unknown;
    }>(
      `INSERT INTO mesa_jugador_estado (mesa_id, user_id, divisa, divisas_saldos, updated_at)
       VALUES ($1, $2, $5, jsonb_build_object($3::text, $4::bigint), now())
       ON CONFLICT (mesa_id, user_id) DO UPDATE SET
         divisa = CASE WHEN $6 THEN $4::bigint ELSE mesa_jugador_estado.divisa END,
         divisas_saldos = jsonb_set(
           COALESCE(mesa_jugador_estado.divisas_saldos, '{}'::jsonb),
           ARRAY[$3::text],
           to_jsonb($4::bigint),
           true
         ),
         updated_at = now()
       RETURNING divisa, divisas_saldos`,
      [mesaId, userId, id, limpia, esPrincipal ? limpia : 0, esPrincipal]
    );

    const divisaActual = sanitizarDivisa(rows[0]?.divisa);
    const saldos = sanitizarDivisasSaldos(rows[0]?.divisas_saldos);
    return {
      divisa: divisaActual,
      divisasSaldos: saldos
    };
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
