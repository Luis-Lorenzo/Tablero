import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const SCHEMA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/schema.sql"
);

export function createPool(connectionString: string): pg.Pool {
  const isLocal = /(localhost|127\.0\.0\.1)/.test(connectionString);

  return new pg.Pool({
    connectionString,
    max: 5,
    ssl: isLocal ? undefined : { rejectUnauthorized: false }
  });
}

export async function ensureSchema(pool: pg.Pool): Promise<void> {
  const sql = await readFile(SCHEMA_PATH, "utf8");
  await pool.query(sql);
}
