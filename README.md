# Tablero de rol SaaS

Aplicación web tipo SaaS para gestionar usuarios de un tablero de rol. Incluye
registro con confirmación por correo, inicio de sesión local y con Google,
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
- **Resend**: correo transaccional con capa gratuita mediante API key (los
  proveedores cloud suelen bloquear el SMTP directo).
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
  lib/            Configuración, base de datos, sesión, hash, correo, OAuth
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

## Pruebas

Un único comando, sin intervención manual:

```bash
npm test
```

Hay 19 pruebas unitarias de la capa de lógica (`AuthService` y `UserService`),
incluyendo casos de error: email inválido, contraseña débil, email duplicado,
cuenta sin confirmar, credenciales incorrectas, token inválido, permisos de rol
y borrado de usuarios.

## Variables de entorno

Solo se listan los nombres; el archivo `.env.example` sirve de plantilla. Nunca
se suben valores reales al repositorio.

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. Si falta, se usa memoria (solo desarrollo). |
| `SESSION_SECRET` | Cadena aleatoria para firmar la cookie de sesión. |
| `APP_BASE_URL` | URL pública de la app (callback de OAuth y enlaces de correo). |
| `GOOGLE_CLIENT_ID` | Identificador OAuth de Google. |
| `GOOGLE_CLIENT_SECRET` | Secreto OAuth de Google. |
| `EMAIL_API_KEY` | API key del proveedor de correo (Resend). Sin ella, los correos se registran en el log. |
| `EMAIL_FROM` | Remitente de los correos de confirmación. |
| `ADMIN_EMAIL` | Correo del primer administrador. |
| `ADMIN_PASSWORD` | Contraseña del primer administrador. |
| `PORT` | Puerto del servidor (lo define Render; por defecto 8080). |

## Acceso como administrador (revisión)

El primer administrador se crea automáticamente al arrancar el servidor a partir
de `ADMIN_EMAIL` y `ADMIN_PASSWORD` (si no existe). Si ya existe un usuario con
ese correo, se promociona a administrador y se marca como confirmado. Las
credenciales de prueba no se publican en el repositorio: se envían junto con la
entrega.

## Despliegue (Render) y CI/CD

- **CI**: GitHub Actions (`.github/workflows/ci.yml`) ejecuta lint, pruebas y
  compilación en cada `pull request` y en cada `push` a `main`.
- **CD**: Render despliega automáticamente cada cambio de `main`
  (`autoDeploy: true`). El despliegue no requiere intervención manual.

Puesta en marcha con Render:

1. Crea una cuenta en https://render.com y conecta tu repositorio de GitHub.
2. En **New → Blueprint**, selecciona el repositorio. Render leerá `render.yaml`
   y creará el servicio web y la base de datos PostgreSQL.
3. Rellena las variables marcadas como `sync: false` (`APP_BASE_URL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_API_KEY`, `EMAIL_FROM`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`) con los valores reales. `DATABASE_URL` y
   `SESSION_SECRET` se generan automáticamente.
4. Fija `APP_BASE_URL` con la URL pública del servicio
   (por ejemplo `https://tablero.onrender.com`).
5. Registra los callback de OAuth en Google Cloud Console, coincidiendo
   exactamente:
   - `http://localhost:8080/api/auth/google/callback` (desarrollo)
   - `https://TU-URL.onrender.com/api/auth/google/callback` (producción)

> Nota: la instancia gratuita de Render se suspende tras un periodo de
> inactividad y tarda unos segundos en volver a responder la primera petición.

## Flujo de trabajo (GitHub Flow)

Cada cambio se desarrolla en su propia rama, se ejecutan las pruebas en local
(`npm test`) y se integra en `main` mediante un pull request. El historial de
ramas, PRs y ejecuciones de CI es la evidencia del proceso.
