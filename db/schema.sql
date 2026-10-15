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
  -- PENDING:  registrada y pendiente de aprobación.
  -- ACTIVE:   aprobada; puede iniciar sesión.
  -- REJECTED: rechazada por un administrador.
  status             TEXT NOT NULL DEFAULT 'PENDING',
  deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Instantes (los más recientes) de los inicios de sesión fallidos. Se
  -- conservan como mucho los 5 últimos.
  failed_login_at    TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
  -- Si es futuro, la cuenta está bloqueada por intentos fallidos hasta ese
  -- momento. Se puede desbloquear a mano con `locked_until = NULL`.
  locked_until       TIMESTAMPTZ
);

-- `CREATE TABLE IF NOT EXISTS` no modifica tablas que ya existen, por lo que la
-- columna `status` se añade aparte para las bases de datos creadas antes de que
-- existiera. Se añade con valor por defecto 'ACTIVE' para no bloquear las
-- cuentas que ya estaban en uso; después el valor por defecto pasa a 'PENDING'
-- para que los registros nuevos queden pendientes de aprobación.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'PENDING';

-- Columnas del bloqueo por intentos fallidos (bases de datos creadas antes de
-- que existieran). Son idempotentes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_at TIMESTAMPTZ[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email));
