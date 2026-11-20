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

-- Verificación de correo electrónico (token con hash SHA-256 y caducidad).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ;

-- Migrar de forma segura las cuentas que ya estaban activas antes de introducir
-- `email_verified`, para no bloquear a los usuarios existentes.
UPDATE users SET email_verified = TRUE WHERE status = 'ACTIVE' AND email_verified = FALSE;

CREATE INDEX IF NOT EXISTS users_verification_token_hash_idx
  ON users (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

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

-- Imágenes compartidas por el máster en la sala: imagen fijada en la pizarra
-- de la pared (escena) e imagen proyectada en primer plano a todos los jugadores.
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS imagen_escena_id UUID;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS imagen_escena_titulo TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS imagen_proyectada_id UUID;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS imagen_proyectada_titulo TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS divisa_nombre TEXT NOT NULL DEFAULT 'Divisa';
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS divisas_config JSONB;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS musica_ambiente JSONB;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS contrasena TEXT;

CREATE TABLE IF NOT EXISTS mesa_jugadores ( 
  mesa_id UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE, 
  user_id UUID NOT NULL, 
  color   TEXT, 
  apodo   TEXT,
  PRIMARY KEY (mesa_id, user_id) 
);

ALTER TABLE mesa_jugadores ADD COLUMN IF NOT EXISTS apodo TEXT;

CREATE INDEX IF NOT EXISTS mesas_created_at_idx ON mesas (created_at);
CREATE INDEX IF NOT EXISTS mesas_host_idx ON mesas (host_id);
CREATE INDEX IF NOT EXISTS mesas_pending_host_idx ON mesas (pending_host_id) WHERE pending_host_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mesas_players_gin_idx ON mesas USING GIN (players);

-- Archivos personales de cada usuario. Los bytes viven en el almacén de objetos
-- (Cloudflare R2) bajo `clave`; aquí solo se guardan los metadatos.
CREATE TABLE IF NOT EXISTS archivos (
  id         UUID PRIMARY KEY,
  owner_id   UUID NOT NULL,
  mesa_id    UUID REFERENCES mesas(id) ON DELETE SET NULL,
  nombre     TEXT NOT NULL,
  clave      TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  tamano     BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE archivos ADD COLUMN IF NOT EXISTS mesa_id UUID REFERENCES mesas(id) ON DELETE SET NULL;
ALTER TABLE archivos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS archivos_owner_idx
  ON archivos (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS archivos_clave_idx
  ON archivos (clave);

CREATE INDEX IF NOT EXISTS archivos_mesa_idx
  ON archivos (mesa_id)
  WHERE mesa_id IS NOT NULL;

-- Columnas de Personaje (PJ) por jugador en una mesa (tras crear `archivos`).
ALTER TABLE mesa_jugadores ADD COLUMN IF NOT EXISTS pj_retrato_archivo_id UUID REFERENCES archivos(id) ON DELETE SET NULL;
ALTER TABLE mesa_jugadores ADD COLUMN IF NOT EXISTS pj_ficha_archivo_id UUID REFERENCES archivos(id) ON DELETE SET NULL;
ALTER TABLE mesa_jugadores ADD COLUMN IF NOT EXISTS pj_ficha_nombre TEXT;
ALTER TABLE mesa_jugadores ADD COLUMN IF NOT EXISTS pj_pdfs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mesa_jugadores ADD COLUMN IF NOT EXISTS pj_notas TEXT NOT NULL DEFAULT '';

-- Estado personal en mesa de cada jugador (notas/archivos colocados o archivados),
-- aislado por (mesa_id, user_id). Los binarios viven en R2, aquí solo metadatos.
CREATE TABLE IF NOT EXISTS mesa_jugador_estado (
  mesa_id    UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  elementos  JSONB NOT NULL DEFAULT '[]'::jsonb,
  divisa         BIGINT NOT NULL DEFAULT 0,
  divisas_saldos JSONB NOT NULL DEFAULT '{}'::jsonb,
  mochila        JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mesa_id, user_id)
);

ALTER TABLE mesa_jugador_estado ADD COLUMN IF NOT EXISTS divisa BIGINT NOT NULL DEFAULT 0;
ALTER TABLE mesa_jugador_estado ADD COLUMN IF NOT EXISTS divisas_saldos JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mesa_jugador_estado ADD COLUMN IF NOT EXISTS mochila JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Historial de mensajes de chat por mesa (públicos o susurros).
CREATE TABLE IF NOT EXISTS chat_mensajes (
  id                   UUID PRIMARY KEY,
  mesa_id              UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  autor_id             UUID NOT NULL,
  autor_nombre         TEXT NOT NULL,
  texto                TEXT NOT NULL,
  destinatario_id      UUID,
  destinatario_nombre  TEXT,
  destinatario_ids     UUID[],
  destinatario_nombres TEXT[],
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS destinatario_ids UUID[];
ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS destinatario_nombres TEXT[];

CREATE INDEX IF NOT EXISTS chat_mensajes_mesa_created_idx
  ON chat_mensajes (mesa_id, created_at DESC);

-- Transferencias pendientes (posits o archivos compartidos) entre jugadores de una mesa.
CREATE TABLE IF NOT EXISTS transferencias (
  id            UUID PRIMARY KEY,
  mesa_id       UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  emisor_id     UUID NOT NULL,
  emisor_nombre TEXT NOT NULL,
  receptor_id   UUID NOT NULL,
  tipo          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transferencias_mesa_receptor_idx
  ON transferencias (mesa_id, receptor_id, created_at ASC);

-- Estado compartido de la Pizarra y vista Escena por mesa.
CREATE TABLE IF NOT EXISTS mesa_pizarra_estado (
  mesa_id    UUID PRIMARY KEY REFERENCES mesas(id) ON DELETE CASCADE,
  datos      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado compartido del Mapa táctico por mesa.
CREATE TABLE IF NOT EXISTS mesa_mapa_estado (
  mesa_id    UUID PRIMARY KEY REFERENCES mesas(id) ON DELETE CASCADE,
  datos      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Macros de tiradas personales de cada usuario.
CREATE TABLE IF NOT EXISTS user_macros (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  macros     JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
