-- Esquema de la base de datos del Tablero de rol.
-- Se aplica automáticamente al arrancar el servidor y es idempotente.
--
-- La tabla de sesiones la gestiona connect-pg-simple
-- (createTableIfMissing), por lo que no se define aquí.

CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY,
  email              TEXT NOT NULL,
  password_hash      TEXT,
  role               TEXT NOT NULL DEFAULT 'USER',
  email_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_token TEXT,
  deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email));

CREATE INDEX IF NOT EXISTS users_confirmation_token_idx
  ON users (confirmation_token);
