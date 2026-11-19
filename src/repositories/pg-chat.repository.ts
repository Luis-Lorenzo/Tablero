import type { Pool } from "pg";
import type { ChatRepository, MensajeChat } from "./chat.repository.js";

interface ChatRow {
  id: string;
  mesa_id: string;
  autor_id: string;
  autor_nombre: string;
  texto: string;
  destinatario_id: string | null;
  destinatario_nombre: string | null;
  destinatario_ids: string[] | null;
  destinatario_nombres: string[] | null;
  created_at: Date | string;
}

function rowToMensaje(row: ChatRow): MensajeChat {
  const destinatarioIds =
    Array.isArray(row.destinatario_ids) && row.destinatario_ids.length > 0
      ? row.destinatario_ids
      : undefined;
  const destinatarioNombres =
    Array.isArray(row.destinatario_nombres) && row.destinatario_nombres.length > 0
      ? row.destinatario_nombres
      : undefined;
  return {
    id: row.id,
    mesaId: row.mesa_id,
    autorId: row.autor_id,
    autorNombre: row.autor_nombre,
    texto: row.texto,
    destinatarioId: row.destinatario_id,
    destinatarioNombre: row.destinatario_nombre,
    ...(destinatarioIds ? { destinatarioIds } : {}),
    ...(destinatarioNombres ? { destinatarioNombres } : {}),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString()
  };
}

export class PgChatRepository implements ChatRepository {
  constructor(private readonly pool: Pool) {}

  async listByMesa(mesaId: string, limit: number): Promise<MensajeChat[]> {
    const { rows } = await this.pool.query<ChatRow>(
      `SELECT id, mesa_id, autor_id, autor_nombre, texto, destinatario_id, destinatario_nombre, destinatario_ids, destinatario_nombres, created_at
       FROM chat_mensajes
       WHERE mesa_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [mesaId, limit]
    );
    return rows.reverse().map(rowToMensaje);
  }

  async save(mensaje: MensajeChat, maxPorMesa: number): Promise<void> {
    const ids =
      Array.isArray(mensaje.destinatarioIds) && mensaje.destinatarioIds.length > 0
        ? mensaje.destinatarioIds
        : null;
    const nombres =
      Array.isArray(mensaje.destinatarioNombres) && mensaje.destinatarioNombres.length > 0
        ? mensaje.destinatarioNombres
        : null;

    await this.pool.query(
      `INSERT INTO chat_mensajes (
         id, mesa_id, autor_id, autor_nombre, texto, destinatario_id, destinatario_nombre, destinatario_ids, destinatario_nombres, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        mensaje.id,
        mensaje.mesaId,
        mensaje.autorId,
        mensaje.autorNombre,
        mensaje.texto,
        mensaje.destinatarioId,
        mensaje.destinatarioNombre,
        ids,
        nombres,
        mensaje.createdAt
      ]
    );

    await this.pool.query(
      `DELETE FROM chat_mensajes
       WHERE mesa_id = $1
         AND id NOT IN (
           SELECT id FROM chat_mensajes
           WHERE mesa_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         )`,
      [mensaje.mesaId, maxPorMesa]
    );
  }
}
