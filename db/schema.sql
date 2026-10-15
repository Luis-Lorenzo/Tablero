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
  -- Indicador de bloqueo por intentos fallidos. Se puede consultar o cambiar a
  -- mano (`blocked = FALSE`) para desbloquear una cuenta.
  blocked            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Fecha en la que el bloqueo caduca solo.
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
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email));

-- Mesas de la recepción. Una mesa la crea un usuario (anfitrión) y otros se
-- unen como jugadores. Solo se guardan ids; los nombres visibles se derivan
-- del correo electrónico.
CREATE TABLE IF NOT EXISTS mesas (
  id         UUID PRIMARY KEY,
  host_id    UUID NOT NULL,
  players    UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mesas_created_at_idx ON mesas (created_at);
