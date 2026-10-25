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

-- Nombre visible opcional (nickname). Se usa en las mesas en lugar de la parte
-- del correo cuando está definido. Es único sin distinguir mayúsculas entre las
-- cuentas no borradas; las cuentas borradas liberan su nombre.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique
  ON users (lower(nickname))
  WHERE nickname IS NOT NULL AND deleted = FALSE;

-- Mesas de la recepción. Una mesa la crea un usuario (anfitrión) y otros se
-- unen como jugadores. Solo se guardan ids; los nombres visibles se derivan
-- del correo electrónico.
CREATE TABLE IF NOT EXISTS mesas (
  id         UUID PRIMARY KEY,
  host_id    UUID NOT NULL,
  players    UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jugadores expulsados (no pueden volver a unirse) y cesión de mando pendiente
-- de aceptar. Idempotente para bases de datos creadas antes de que existieran.
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS expulsados UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS pending_host_id UUID;

-- Estado de la partida: 'ESPERA' mientras la mesa está en la recepción y
-- 'EN_CURSO' cuando el máster ya la ha empezado. Idempotente para bases de
-- datos creadas antes de que existiera.
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'ESPERA';

CREATE INDEX IF NOT EXISTS mesas_created_at_idx ON mesas (created_at);

-- Archivos personales de cada usuario. Los bytes viven en el almacén de objetos
-- (Cloudflare R2) bajo `clave`; aquí solo se guardan los metadatos.
CREATE TABLE IF NOT EXISTS archivos (
  id         UUID PRIMARY KEY,
  owner_id   UUID NOT NULL,
  nombre     TEXT NOT NULL,
  clave      TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  tamano     BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archivos_owner_idx
  ON archivos (owner_id, created_at DESC);
