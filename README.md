# Tablero de rol SaaS

Aplicación web tipo SaaS para gestionar usuarios de un tablero de rol. Incluye
registro e inicio de sesión local, aprobación de cuentas por un administrador,
sesiones persistentes, roles de usuario y administrador, y persistencia real en
PostgreSQL. El backend sirve al frontend desde el mismo origen.

## Tecnologías y justificación

- **Node.js + TypeScript**: un único lenguaje tipado para backend y frontend,
  lo que reduce errores y facilita la separación en capas.
- **Express**: framework HTTP minimalista y muy extendido para montar la API y
  servir el frontend estático.
- **React + Vite**: interfaz declarativa con recarga en caliente y compilación
  rápida.
- **PostgreSQL + `pg`**: base de datos relacional sólida y persistente; el
  driver `pg` evita ORMs pesados y deja explícita la capa de acceso a datos.
- **express-session + connect-pg-simple**: sesiones con cookie firmada
  almacenadas en PostgreSQL, de modo que sobreviven a reinicios.
- **bcryptjs**: hash de contraseñas con sal, pensado específicamente para
  contraseñas (nunca texto plano ni cifrado reversible).
- **Vitest**: pruebas automatizadas rápidas para la capa de lógica.
- **GitHub Actions + Render**: integración continua y despliegue continuo.

## Arquitectura

Separación cliente-servidor y arquitectura en capas (backend:

`src/api` → `src/services` → `src/repositories`; frontend: capa de presentación
`client/src/presentation` → capa de comunicación `client/src/api`).

```
src/
  api/            Capa API (rutas HTTP, serialización)
  services/       Capa de lógica de negocio (reglas, roles, sesión)
  repositories/   Capa de acceso a datos (PostgreSQL e implementación en memoria)
  middleware/     Autenticación, registro de peticiones, manejo de errores
  lib/            Configuración, base de datos, sesión y hash de contraseñas
client/src/
  api/            Capa de comunicación con el servidor (fetch)
  presentation/   Capa de presentación (componentes y páginas React)
tests/            Pruebas unitarias de la capa de lógica
```

La capa de lógica depende de la interfaz `UserRepository`, no de una
implementación concreta. Por eso las pruebas usan `MemoryUserRepository` y
producción usa `PgUserRepository` **sin cambiar la lógica**.

## Ejecutar en local

Requisitos: Node.js 22 LTS o superior, npm y Git.

Base de datos local con Docker (opcional pero recomendada):

```bash
docker compose up -d          # PostgreSQL en localhost:5432
```

El esquema está versionado en `db/schema.sql` y se aplica automáticamente al
arrancar el servidor (es idempotente). La tabla de sesiones la crea
`connect-pg-simple`.

Aplicación:

```bash
npm install
cp .env.example .env          # rellena las variables que necesites
npm run dev
```

Para usar la base de datos local, define en `.env`:

```
DATABASE_URL=postgres://tablero:tablero@localhost:5432/tablero
ADMIN_EMAIL=admin@tablero.local
ADMIN_PASSWORD=admin12345
```

`npm run dev` arranca el backend (puerto 8080) y Vite (puerto 5173 con proxy a
`/api`). Abre http://localhost:5173.

Sin `DATABASE_URL` la aplicación usa un repositorio en memoria (solo para
desarrollo). Con `DATABASE_URL` apuntando a un PostgreSQL, los datos son
persistentes y sobreviven a reinicios. Para detener la base de datos:
`docker compose down` (añade `-v` para borrar los datos).

Las cuentas que se registren desde la interfaz quedan pendientes de aprobación:
para poder entrar hay que aprobarlas como se explica en
[Aprobación de cuentas](#aprobación-de-cuentas).

## Pruebas

Un único comando, sin intervención manual:

```bash
npm test
```

Hay 38 pruebas unitarias de la capa de lógica (`AuthService`, `UserService`,
`ensureAdmin` y `BloqueoService`), incluyendo casos de error: email inválido,
contraseña débil, email duplicado, credenciales incorrectas, cuenta pendiente,
rechazada o bloqueada, permisos de rol, borrado de usuarios y fechas no válidas
en el cálculo de bloqueo.

## Variables de entorno

Solo se listan los nombres; el archivo `.env.example` sirve de plantilla. Nunca
se suben valores reales al repositorio.

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL (en producción, la de Neon). Si falta, se usa memoria (solo desarrollo). |
| `SESSION_SECRET` | Cadena aleatoria para firmar la cookie de sesión. |
| `ADMIN_EMAIL` | Correo del primer administrador. |
| `ADMIN_PASSWORD` | Contraseña del primer administrador. |
| `PORT` | Puerto del servidor (lo define Render; por defecto 8080). |

## Bloqueo por intentos fallidos

Una cuenta queda bloqueada cuando acumula 5 inicios de sesión fallidos
consecutivos dentro de una ventana de 15 minutos. Es un estado **persistido en
la base de datos**, no una comprobación en memoria: sobrevive a los reinicios
del servidor y se puede consultar o deshacer desde el panel de SQL.

Reglas (lógica pura, en `src/services/bloqueo.service.ts`):

- Se toman los 5 fallos más recientes (la lista puede venir desordenada).
- Con menos de 5 fallos no hay bloqueo.
- Si entre el primero y el último de esos 5 hay como mucho 15 minutos, la
  cuenta queda bloqueada hasta 15 minutos después del último fallo.
- Un inicio de sesión correcto limpia el historial de fallos.
- El bloqueo caduca solo; además puede desbloquearse a mano.

### En el inicio de sesión

`POST /api/auth/login` registra cada fallo de contraseña y aplica esa regla:

- Fallos 1 a 4 → `401 INVALID_CREDENTIALS`.
- Fallo 5 → `403 ACCOUNT_LOCKED`; la cuenta queda bloqueada hasta `lockedUntil`.
- Mientras esté bloqueada → `403 ACCOUNT_LOCKED`, **aunque la contraseña sea
  correcta**. La comprobación se hace antes de validar la contraseña.
- Si el bloqueo ya expiró, el login vuelve a funcionar y limpia el estado.

### Cómo desbloquear una cuenta desde Neon

Ver quién está bloqueado (el indicador está en la columna `blocked`):

```sql
SELECT lower(email), blocked, locked_until
FROM users
WHERE blocked = TRUE
ORDER BY locked_until;
```

Desbloquear (una sola sentencia, no hace falta más):

```sql
UPDATE users SET blocked = FALSE, locked_until = NULL, failed_login_at = '{}'
WHERE lower(email) = lower('persona@correo.com');
```

El sistema no vuelve a bloquear la cuenta hasta que se acumulen 5 fallos nuevos.

Columnas implicadas en `users` (añadidas con migración idempotente en
`db/schema.sql`):

| Columna | Descripción |
| --- | --- |
| `failed_login_at TIMESTAMPTZ[]` | Instantes de los fallos recientes (se conservan como mucho los 5 últimos). |
| `blocked BOOLEAN` | Indicador de bloqueo. Es la columna que se consulta o se cambia a mano. |
| `locked_until TIMESTAMPTZ` | Fecha en la que el bloqueo caduca solo. `NULL` = sin caducidad. |

La cuenta se considera bloqueada cuando `blocked` es `TRUE` y, además, o bien no
hay fecha (`locked_until IS NULL`), o bien la fecha todavía no ha pasado. Es
decir, `blocked = TRUE` con `locked_until` en el pasado es una cuenta ya
desbloqueada (se limpiará sola en el siguiente intento de inicio de sesión).

La API expone `blocked` (estado efectivo) y `lockedUntil` en el `PublicUser`, y
el panel de administración muestra una etiqueta de estado por usuario:
`Bloqueado`, `Activo`, `Pendiente` o `Rechazado`. El bloqueo se muestra por
encima del estado de aprobación, porque son cosas distintas: una cuenta
`PENDING` también puede estar `Bloqueado`.

La API expone `lockedUntil` en el `PublicUser`, y el frontend muestra un
mensaje propio para `ACCOUNT_LOCKED`.

### Endpoint de prueba

`POST /api/prueba/bloqueo` evalúa la misma regla sin tocar la base de datos ni
la sesión: es un endpoint de prueba que recibe el instante actual en el cuerpo
en lugar de consultar el reloj del sistema, de modo que se puede probar de forma
determinista.

- Cuerpo: `{ "fallos": [instantes ISO 8601], "ahora": instante ISO 8601 }`
- Respuesta 200: `{ "bloqueado": boolean, "hasta": instante ISO 8601 | null }`
- Una fecha no válida responde 400 (`INVALID_DATE`) y una lista de fallos mal
  formada responde 400 (`INVALID_REQUEST`).

Ejemplo: 5 fallos entre las 10:00 y las 10:04 con `"ahora": "2026-03-02T10:10:00Z"`
devuelve `{ "bloqueado": true, "hasta": "2026-03-02T10:19:00Z" }`.

## Acceso como administrador (revisión)

El primer administrador se crea automáticamente al arrancar el servidor a partir
de `ADMIN_EMAIL` y `ADMIN_PASSWORD` (si no existe) y queda aprobado, para poder
entrar sin depender de nadie. Si ya existe un usuario con ese correo, se
promociona a administrador y se aprueba. Las credenciales de prueba no se
publican en el repositorio: se envían junto con la entrega.

## Aprobación de cuentas

Las cuentas nuevas no pueden iniciar sesión hasta que un administrador las
aprueba. El registro crea el usuario con `status = 'PENDING'` y el inicio de
sesión responde `ACCOUNT_PENDING` mientras siga en ese estado.

| `status` | Significado |
| --- | --- |
| `PENDING` | Registrada y pendiente de aprobación (estado inicial). |
| `ACTIVE` | Aprobada; puede iniciar sesión. |
| `REJECTED` | Rechazada; no puede iniciar sesión. |

La aprobación se hace directamente en la base de datos (en Neon,
**SQL Editor**):

```sql
-- Aprobar una cuenta
UPDATE users SET status = 'ACTIVE'
WHERE lower(email) = lower('persona@correo.com');

-- Rechazarla
UPDATE users SET status = 'REJECTED'
WHERE lower(email) = lower('persona@correo.com');
```

También vale cualquier cliente de PostgreSQL. El panel de administración de la
aplicación expone el `status` de cada usuario, de modo que se ve quién está
pendiente antes de aprobarlo; añadir un botón de aprobación en la propia
interfaz sería el siguiente paso.

## Base de datos (Neon)

La base de datos es un PostgreSQL externo (Neon) y se conecta con
`DATABASE_URL`. No hace falta crear tablas ni ejecutar migraciones: la propia
aplicación las crea al arrancar y la operación es idempotente.

- La tabla `users` la crea `src/lib/db.ts` (`ensureSchema`) a partir de
  `db/schema.sql`.
- La tabla `session` la crea `connect-pg-simple` (opción `createTableIfMissing`).

`db/schema.sql` incluye además una migración idempotente que añade la columna
`status` a las bases de datos creadas antes de que existiera (los usuarios que
ya estaban en uso se dejan aprobados) y las columnas `failed_login_at`,
`blocked` y `locked_until`, del bloqueo por intentos fallidos.

Si al entrar en Neon no ves ninguna tabla, significa que la aplicación que está
en marcha no se conectó a esa base de datos: revisa `DATABASE_URL` en el
dashboard de Render y los logs de arranque, donde debe aparecer
`Persistencia habilitada en PostgreSQL` (si aparece un aviso sobre el
repositorio en memoria, `DATABASE_URL` no llegó a la aplicación).

## Despliegue (Render) y CI/CD

- **CI**: GitHub Actions (`.github/workflows/ci.yml`) ejecuta lint, pruebas y
  compilación en cada `pull request` y en cada `push` a `main`.
- **CD**: Render despliega automáticamente cada cambio de `main`
  (`autoDeploy: true`). El despliegue no requiere intervención manual.

Puesta en marcha con Neon y Render:

1. Crea un proyecto gratuito en https://neon.tech y copia su cadena de conexión
   (**Connection Details → Connection string**). Añade `?sslmode=require` si no
   la incluye.
2. Crea una cuenta en https://render.com y conecta tu repositorio de GitHub.
3. En **New → Blueprint**, selecciona el repositorio. Render leerá `render.yaml`
   y creará solo el servicio web; la base de datos es la de Neon.
4. Rellena las variables marcadas como `sync: false` con los valores reales:
   `DATABASE_URL` (la cadena de conexión de Neon), `ADMIN_EMAIL` y
   `ADMIN_PASSWORD`. `SESSION_SECRET` se genera automáticamente.
5. Al arrancar, la aplicación crea el esquema en Neon y, si no existe, la cuenta
   de administrador. Ábrelo en Neon → **Tables** para comprobar que aparecen
   `users` y `session`.

> Nota: la instancia gratuita de Render se suspende tras un periodo de
> inactividad y tarda unos segundos en volver a responder la primera petición.
> El cómputo de Neon también se suspende por inactividad y se reanuda en la
> primera conexión.

## Flujo de trabajo (GitHub Flow)

Cada cambio se desarrolla en su propia rama, se ejecutan las pruebas en local
(`npm test`) y se integra en `main` mediante un pull request. El historial de
ramas, PRs y ejecuciones de CI es la evidencia del proceso.
