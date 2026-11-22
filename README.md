# POCKET ROL
https://tablero-gb69.onrender.com/
Aplicación web tipo SaaS para gestionar usuarios de un tablero de rol. La
interfaz se llama **POCKET ROL**: al entrar se llega a la **recepción**, desde
la que se crean y se buscan mesas. Incluye registro e inicio de sesión local,
verificación del correo con Brevo y estados de aprobación de cuentas
(pendiente, activa, rechazada), sesiones persistentes, roles de usuario y
administrador, y persistencia real en PostgreSQL. El backend sirve al frontend
desde el mismo origen.

Cuando el máster empieza una partida, la mesa se abre en una **sala en vivo**
con sus fases de sala, pizarra, mapa y archivador, sincronizada entre todos los
participantes.

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
- **WebSocket (`ws`)**: canal en vivo para la recepción, el chat, la pizarra,
  el mapa y la música de la sala, sin recargar la página.
- **Cloudflare R2 con `aws4fetch`**: almacenamiento de archivos compatible con
  S3; en local, si no se configura, se usa un almacén en memoria.
- **Brevo**: correo transaccional para enviar el enlace de verificación de
  cuentas.
- **bcryptjs**: hash de contraseñas con sal, pensado específicamente para
  contraseñas (nunca texto plano ni cifrado reversible).
- **Vitest + supertest**: pruebas automatizadas rápidas para la capa de lógica y
  para la API HTTP (rutas, códigos de estado y sesión).
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
  realtime/       Canal WebSocket (recepción y sala en vivo)
  middleware/     Autenticación, registro de peticiones, manejo de errores
  lib/            Configuración, base de datos, sesión, correo y hash
client/src/
  api/            Capa de comunicación con el servidor (fetch)
  presentation/   Capa de presentación (componentes y páginas React)
  preview/        Sala de juego y sus fases (pizarra, mapa, archivador)
tests/            Pruebas de la capa de lógica y de la API (HTTP)
db/               Esquema SQL idempotente
docs/             Documentación adicional del proyecto
```

La capa de lógica depende de interfaces de repositorio (`UserRepository`,
`MesaRepository`, etc.), no de una implementación concreta. Por eso las pruebas
usan `MemoryUserRepository` y `MemoryMesaRepository` y producción usa
`PgUserRepository` y `PgMesaRepository` **sin cambiar la lógica**.

## Documentación

La documentación ampliada del proyecto está en [`docs/`](docs/); el índice
está en [`docs/index.md`](docs/index.md).

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

Las cuentas que se registren desde la interfaz quedan en `PENDING` hasta que se
verifique el correo electrónico; el enlace se envía con Brevo. El proceso
completo se explica en
[Verificación de cuentas por correo electrónico](#verificación-de-cuentas-por-correo-electrónico-brevo).

Los archivos (imágenes y documentos) se guardan en Cloudflare R2 si se
configuran las variables `R2_*`; sin ellas se usa un almacén en memoria que se
pierde al reiniciar.

## Pruebas

Un único comando, sin intervención manual:

```bash
npm test
```

Hay **119 pruebas en 17 archivos**: `AuthService`, la verificación de correo,
`UserService`, `ensureAdmin`, `BloqueoService`, `MesaService`, `SeedService` y
las rutas HTTP de mesas, usuarios, archivos, chat, compartición y mapa, además
de las pruebas `tracer-*` de integración (R2, Neon y pizarra/mapa). Se incluyen
casos de error: email inválido, contraseña débil,
email duplicado, credenciales incorrectas, cuenta pendiente, rechazada o
bloqueada, permisos de rol, borrado de usuarios, fechas no válidas en el
cálculo de bloqueo, mesas llenas o inexistentes y vetos por expulsión.

Las pruebas de las rutas montan la aplicación real con `supertest` y
repositorios en memoria: comprueban el contrato HTTP completo (códigos de
estado, sesión y serialización) sin tocar la base de datos.

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
| `APP_URL` | URL pública base de la aplicación para generar los enlaces `/verificar-correo?token=...` (por defecto `http://localhost:5173`). |
| `BREVO_API_KEY` | API Key transaccional de Brevo (`v3/smtp/email`). Si falta en desarrollo/tests, los envíos se registran en memoria. |
| `BREVO_TEMPLATE_ID` | ID numérico de la plantilla activa en Brevo (por defecto `5`). Recibe `params.verification_url`. |
| `BREVO_SENDER_EMAIL` | Dirección de correo remitente configurada en Brevo (`infoluisloxc@gmail.com`). |
| `BREVO_SENDER_NAME` | Nombre visible del remitente en los correos (`Pocket Rol`). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Credenciales de Cloudflare R2 para el almacenamiento de archivos. |
| `R2_BUCKET_NAME`, `R2_ENDPOINT` | Bucket y endpoint de R2. Sin estas variables los archivos se guardan en memoria (solo desarrollo). |
| `ARCHIVO_MAX_BYTES` | Tamaño máximo por archivo, en bytes (por defecto 30 MiB). |

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
`PENDING` también puede estar `Bloqueado`. El frontend muestra un mensaje propio
para `ACCOUNT_LOCKED`.

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

## Verificación de cuentas por correo electrónico (Brevo)

Al registrarse (`POST /api/auth/register`), la cuenta se crea con `status = 'PENDING'` y `email_verified = FALSE`:

1. Se genera un token aleatorio criptográficamente seguro (32 bytes en hexadecimal).
2. En la base de datos (`users`) se guarda **únicamente** su hash SHA-256 (`verification_token_hash`) junto con una caducidad de **30 minutos** (`verification_expires_at`).
3. Se envía automáticamente un correo transaccional mediante la API oficial de Brevo (`POST https://api.brevo.com/v3/smtp/email`) usando la plantilla `BREVO_TEMPLATE_ID` (`5`) y pasando el enlace `{{ params.verification_url }}` (`${APP_URL}/verificar-correo?token=TOKEN`).
4. Al abrir `/verificar-correo?token=...`, el frontend llama a `POST /api/auth/verify-email`. Si el token es válido y no ha caducado, el servidor activa atómicamente la cuenta (`status = 'ACTIVE'`, `email_verified = TRUE`) y limpia el hash y la fecha de caducidad para impedir su reutilización.
5. Si el enlace caduca, el usuario puede solicitar uno nuevo (`POST /api/auth/resend-verification`), lo que invalida el token anterior, genera uno nuevo por 30 minutos y aplica un límite de frecuencia (60 segundos por cuenta).

La verificación del correo es el paso que activa la cuenta: mientras siga en
`PENDING`, el inicio de sesión responde `ACCOUNT_PENDING` aunque la contraseña
sea correcta. El panel **Moderar** muestra el estado de cada cuenta y permite
filtrarlas y eliminarlas; el cambio de estado manual se hace desde SQL, como se
indica más abajo.

| `status` | Significado |
| --- | --- |
| `PENDING` | Registrada y pendiente de verificar su correo electrónico (estado inicial). |
| `ACTIVE` | Correo verificado y cuenta activa; puede iniciar sesión. |
| `REJECTED` | Rechazada; no puede iniciar sesión. |

Las cuentas que ya tenían `status = 'ACTIVE'` antes de introducir la verificación por correo se migran automáticamente a `email_verified = TRUE` mediante `db/schema.sql`. También se puede activar o rechazar manualmente desde SQL:

```sql
-- Activar manualmente una cuenta
UPDATE users SET status = 'ACTIVE', email_verified = TRUE, verification_token_hash = NULL, verification_expires_at = NULL
WHERE lower(email) = lower('persona@correo.com');

-- Rechazarla
UPDATE users SET status = 'REJECTED'
WHERE lower(email) = lower('persona@correo.com');
```

## Recepción (mesas)

Al iniciar sesión se entra en la **recepción**, la pantalla principal desde la
que se crean y se buscan mesas. Es la sala que ve el usuario autenticado.

### Cuadrícula

- Siempre hay **4 huecos** en rejilla 2x2. Los huecos sin mesa muestran la
  etiqueta `Mesa Vacía`.
- Cada mesa es un hexágono de **solo el perímetro** con una luna morada en el
  centro; cuando entra el primer jugador, la luna pasa a un sol con un rayo por
  jugador. Encima lleva una etiqueta cuadrada en amarillo pastel:
  `Mesa <nombre del anfitrión>`. El nombre es el correo sin `@` ni dominio (o
  el nickname, si lo tiene).
- Cada tarjeta indica si la mesa está **En espera** o con la **Partida en
  curso**.
- Las mesas se colocan **pegadas al final**: la más reciente queda en la última
  posición, abajo a la derecha.
- Con más de 4 mesas solo se muestran las 4 más recientes; las antiguas se
  alcanzan con el botón **Buscar**.
- En la tarjeta se listan el anfitrión y los jugadores, con el recuento `n/6`.

### Reglas

Lógica en `src/services/mesa.service.ts`:

- **Crear sala** crea al instante una mesa a nombre de quien la pide. Si ya tenía
  una, se le lleva a la suya en lugar de crear otra (la etiqueta sale con su
  nombre).
- Pulsar el hexágono de una mesa ajena **se une** a ella como jugador. Caben
  **6 jugadores**; el anfitrión no ocupa plaza. Una mesa llena responde
  `409 MESA_FULL`.
- Un usuario solo puede estar en una mesa como jugador: al unirse a otra se
  cambia y sale de la anterior.
- El anfitrión puede **gestionar** su mesa: preparar la sala, empezar la
  partida, ceder el mando, expulsar jugadores y cerrarla.
- **Cerrar mesa** la borra y deja a los jugadores sin sitio. Solo la ve el
  anfitrión en la tarjeta; un administrador también puede cerrarla desde
  Moderar. Cerrar la mesa de otro sin ser administrador responde
  `403 FORBIDDEN`.
- **Expulsar** a un jugador lo saca de la mesa y lo añade a la lista de vetados:
  no puede volver a entrar (`403 MESA_BANNED`). El veto se aplica a **todos,
  incluidos los administradores**; la interfaz les bloquea la entrada y la
  gestión de esa mesa. El anfitrión nunca puede quedar vetado en su propia mesa.
- Un **administrador** puede gestionar mesas ajenas (expulsar, ceder el mando o
  cerrar), pero **pierde el mando** en cuanto pasa a ser jugador de esa mesa.
- **Buscar** filtra por el nombre del anfitrión.

### API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/mesas/inicio` | Los 4 huecos de la cuadrícula (los vacíos, `null`). |
| `GET` | `/api/mesas?q=texto` | Mesas, de más nueva a más antigua; con `q` filtra por el anfitrión. |
| `GET` | `/api/mesas/mia` | La mesa en la que está el usuario, como anfitrión o jugador (`null` si no está en ninguna). |
| `GET` | `/api/mesas/pendiente` | La mesa cuya cesión de mando está pendiente de aceptar. |
| `POST` | `/api/mesas` | Crea la sala de quien hace la petición (201; 200 si ya tenía una). |
| `POST` | `/api/mesas/:id/unirse` | Se une como jugador (404 si no existe, 409 si está llena, 403 `MESA_BANNED` si está vetado). |
| `POST` | `/api/mesas/:id/abandonar` | Sale como jugador de la mesa. |
| `POST` | `/api/mesas/:id/iniciar` | El anfitrión empieza la partida (`EN_CURSO`). |
| `POST` | `/api/mesas/:id/terminar` | El anfitrión devuelve la mesa a espera. |
| `POST` | `/api/mesas/:id/expulsar` | Expulsa a un jugador y le veta el reingreso. |
| `POST` | `/api/mesas/:id/ceder` | Ofrece el mando a un jugador; se acepta o rechaza en `.../ceder/aceptar` y `.../ceder/rechazar`. |
| `DELETE` | `/api/mesas/:id` | Cierra la mesa (el anfitrión o un administrador; 403 en otro caso). |

Todas requieren sesión de usuario aprobado. La tabla `mesas` (con `host_id`,
`players UUID[]`, `expulsados`, `pending_host_id`, `estado` y `created_at`) la
crea `db/schema.sql` de forma idempotente, igual que el resto.

### Navegación

- El logotipo **POCKET ROL**, centrado arriba, vuelve a la recepción desde las
  pantallas que muestran la barra superior. Está dibujado con un arco de rótulo
  de casino (estilo Las Vegas / póker) y tipografía de fantasía, en mayúsculas.
- El **círculo de perfil** abre **Mi cuenta**, donde están los datos de la
  cuenta, el cambio de nickname, el botón de cerrar sesión y el borrado de la
  propia cuenta.
- El botón **Moderar**, en amarillo de aviso, solo aparece para el
  administrador; abre la pantalla de usuarios y salas, con filtros por estado y
  acciones de eliminación.
- La barra superior incluye el conmutador de **modo claro/oscuro**, el botón
  para **silenciar la hoguera** y el menú **Archivos** con los archivos
  personales.

## Sala de juego (SalaReal)

La sala se abre al pulsar **Empezar partida** (estado `EN_CURSO`): el máster y
todos los jugadores entran a la vez. El máster también puede usar **Preparar
sala** para entrar solo antes de empezar y montar la escena, la música o el
mapa sin que los jugadores entren.

La sala tiene cuatro fases:

- **Sala**: escena del máster, jugadores, chat público y susurros, tiradas de
  dados, inventario y divisas, pings y envío de objetos o archivos.
- **Pizarra**: posits de colores y objetos, dibujo y borrador, documentos e
  imágenes, escena y proyección, congelar y ping.
- **Mapa**: fondo y rejilla, tokens con imagen o color, rastreador de
  iniciativa, regla de medición y áreas, dibujo, zoom y desplazamiento,
  congelar.
- **Archivador**: archivos de la mesa, subida y descarga, fijar en la pizarra
  y proyectar.

La sala se sincroniza en vivo por WebSocket: los cambios de escena, pizarra,
mapa, chat, música o expulsión llegan al resto de participantes sin recargar.

### Música de ambiente

El máster sube pistas de audio y controla la reproducción (pista actual,
avance, pausa y volumen) desde la sala. El estado se guarda en la mesa y se
envía en vivo a todos los participantes.

La **música de hoguera** (`/BucleLobby.wav`) es independiente de la música de
la mesa:

- Suena en la **recepción**, en la **gestión/preparación de la mesa** y en
  **Moderar**.
- **No** suena en la **sala de juego** (allí manda la música del máster), ni en
  **Mi cuenta**, ni en **login, registro o verificación de correo**.
- Se puede silenciar con el botón de la barra superior; la preferencia se
  conserva.

### Veto por expulsión

Expulsar a un jugador lo saca de la mesa y lo guarda en `expulsados`. A partir
de ahí:

- `POST /api/mesas/:id/unirse` responde `403 MESA_BANNED` si intenta volver.
- La interfaz le muestra la tarjeta como vetada y bloquea tanto la entrada a la
  sala como la gestión de esa mesa.
- El veto se aplica **a todos, incluidos los administradores**. El anfitrión
  nunca puede quedar vetado en su propia mesa.
- El veto se mantiene mientras exista la mesa; al cerrarla desaparece con ella.

### Modo preview

`?preview=1` abre una **preview aislada** de la sala: no usa backend, ni login,
ni sesión, y trabaja con datos falsos guardados en el navegador. Se carga de
forma diferida y también está disponible en producción para enseñar la demo.

## Base de datos (Neon)

La base de datos es un PostgreSQL externo (Neon) y se conecta con
`DATABASE_URL`. No hace falta crear tablas ni ejecutar migraciones: la propia
aplicación las crea al arrancar y la operación es idempotente.

- La tabla `users` la crea `src/lib/db.ts` (`ensureSchema`) a partir de
  `db/schema.sql`.
- `db/schema.sql` crea el resto de tablas: `mesas`, `mesa_jugadores`,
  `mesa_jugador_estado`, `archivos`, `chat_mensajes`, `transferencias`,
  `mesa_pizarra_estado`, `mesa_mapa_estado` y `user_macros`.
- La tabla `session` la crea `connect-pg-simple` (opción `createTableIfMissing`).

`db/schema.sql` incluye además migraciones idempotentes que añaden columnas a
las bases de datos creadas antes de que existieran (por ejemplo, `status`,
`nickname`, `email_verified`, `failed_login_at`, `blocked`, `locked_until`,
`expulsados`, `estado`, `musica_ambiente` o las imágenes de escena y
proyección). Los usuarios que ya estaban en uso se dejan aprobados.

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
   de administrador. Ábrelo en Neon → **Tables** para comprobar que aparecen,
   entre otras, `users`, `mesas` y `session`.

> Nota: la instancia gratuita de Render se suspende tras un periodo de
> inactividad y tarda unos segundos en volver a responder la primera petición.
> El cómputo de Neon también se suspende por inactividad y se reanuda en la
> primera conexión.

## Flujo de trabajo (GitHub Flow)

Cada cambio se desarrolla en su propia rama, se ejecutan las pruebas en local
(`npm test`) y se integra en `main` mediante un pull request. El historial de
ramas, PRs y ejecuciones de CI es la evidencia del proceso.
