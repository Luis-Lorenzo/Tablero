import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Pool } from "pg";

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

export function createSessionMiddleware(
  secret: string,
  isProduction: boolean,
  pool?: Pool
) {
  const store = pool
    ? new (connectPgSimple(session))({ pool, createTableIfMissing: true })
    : undefined;

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
