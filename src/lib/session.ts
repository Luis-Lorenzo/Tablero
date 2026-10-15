import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Pool } from "pg";

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

/**
 * Almacén de sesiones. Se crea una sola vez y se comparte entre Express y el
 * canal en vivo: si cada uno tuviera el suyo, el WebSocket no reconocería la
 * sesión que abrió el login.
 */
export function createSessionStore(pool?: Pool): session.Store {
  return pool
    ? new (connectPgSimple(session))({ pool, createTableIfMissing: true })
    : new session.MemoryStore();
}

export function createSessionMiddleware(
  secret: string,
  isProduction: boolean,
  store: session.Store
) {
  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: ONE_WEEK
    }
  });
}
