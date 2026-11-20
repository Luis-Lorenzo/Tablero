# Arquitectura de POCKET ROL

> Verificado el 18/11/2026 (rama `fallos-en-vivo`, commit `bb26771`).

## 1. Vista general

POCKET ROL es una aplicación **monolítica modular**: un único proceso Node.js
sirve la API REST, el frontend compilado y el canal WebSocket. No hay
microservicios ni un servidor separado para el cliente.

```
Navegador
  │  HTTPS (cookie connect.sid)
  ▼
┌──────────────────────────────────────────────────────────────┐
│ Proceso Node.js (Render)                                     │
│                                                              │
│  Express 5 ──► rutas /api/* ──► servicios ──► repositorios   │
│      │                                      │        │       │
│      │                                      │        ├──► PostgreSQL (Neon)
│      │                                      │        └──► Cloudflare R2
│      │                                      │
│      ├── estáticos client/dist (React)      └──► Brevo (correo)
│      │
│      └── servidor HTTP compartido ──► WebSocket /ws
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Decisiones clave:

- **Un solo origen** para frontend y API: evita CORS y simplifica cookies.
- **REST es la fuente de verdad**; el WebSocket solo invalida o empuja eventos.
- **PostgreSQL** guarda usuarios, mesas, estado y sesiones; **R2** guarda los
  bytes de los archivos.
- Si faltan `DATABASE_URL` o las credenciales de R2/Brevo, el arranque usa
  implementaciones en memoria para desarrollar y probar.

## 2. Capas del backend

```
src/
├── api/            Rutas HTTP, contexto y serializadores públicos
├── services/       Reglas de negocio (auth, mesas, mapa, chat, archivos…)
├── repositories/   Contratos + implementaciones Memoria y PostgreSQL
├── middleware/     Autenticación, errores y log de peticiones
├── realtime/       WebSocket y notificador de mesas
├── lib/            Config, BD, sesión, almacén, correo, errores, utilidades
├── container.ts    Composición de dependencias (sin framework de DI)
├── app.ts          Montaje de Express
└── server.ts       Servidor HTTP + WebSocket + apagado ordenado
```

Regla de dependencia: `api → services → repositories → lib`. Las rutas no
hablan con `pg` ni con R2 directamente; los servicios no conocen Express.

### Repositorios duales

Cada repositorio tiene dos implementaciones:

- `Memory*`: datos en memoria, usada en pruebas y cuando no hay `DATABASE_URL`.
- `Pg*`: PostgreSQL real, usada en producción y en pruebas de integración
  opcionales.

Esto permite probar reglas de negocio sin base de datos y mantiene explícita la
capa de persistencia. El precio es duplicar cada cambio de contrato en dos
sitios.

## 3. Capas del frontend

```
client/src/
├── App.tsx               Navegación por estado (`view`) y música global
├── api/                  Cliente HTTP, tipos públicos y errores
├── presentation/
│   ├── pages/            Recepción, cuenta, moderación, gestión, sala real
│   ├── components/       Piezas reutilizables
│   └── preview/          Prototipo/datos compartidos con la sala
└── styles/               CSS global
```

- **No hay router**: `App.tsx` mantiene `view` con valores `recepcion`,
  `cuenta`, `moderar`, `gestion` y `sala`.
- **No hay Tailwind ni CSS modules**: el estilo es CSS global.
- La sala real reutiliza componentes y datos de `preview`; romper esa
  reutilización afecta al prototipo y a la sala.
- Los tipos públicos están duplicados a mano en `client/src/api/types.ts` y
  `src/api/serializers.ts`. Si cambia uno, hay que cambiar el otro.

## 4. Arranque y composición

`src/server.ts`:

1. `createContainer()` lee la configuración.
2. Si hay `DATABASE_URL`, crea el pool, aplica `db/schema.sql` (idempotente) y
   usa repositorios PostgreSQL.
3. Si R2 está configurado, usa `R2Almacen`; si no, `MemoryAlmacen`.
4. Si Brevo está configurado, usa `BrevoEmailSender`; si no, un emisor en
   memoria que registra el correo en el log.
5. Crea servicios, el almacén de sesiones compartido y el `MesasBroadcaster`.
6. Crea el administrador inicial con `ensureAdmin` si hay `ADMIN_EMAIL` y
   `ADMIN_PASSWORD`.
7. Devuelve la app Express y el broadcaster.
8. `server.ts` crea un único servidor HTTP, engancha `/ws` y escucha en
   `0.0.0.0:PORT` (8080 por defecto).
9. Ante `SIGTERM`/`SIGINT`, cierra el servidor y el pool.

## 5. Flujo de una petición HTTP

```
Petición
  → express.json()
  → log de petición
  → middleware de sesión (cookie connect.sid → store PostgreSQL)
  → requireAuth (carga el usuario y exige status ACTIVE)
  → router /api/*
  → servicio (reglas y errores de dominio)
  → repositorio (PostgreSQL o memoria)
  → serializador (tipo público)
  → respuesta JSON
```

Los errores de dominio son `AppError` con `code` y `status`. El middleware de
errores responde `{ "error": "CODIGO" }`; las rutas de API inexistentes añaden
`path`. El cliente usa `describeError` y `ApiError.code` para traducir el código
a un mensaje.

## 6. Tiempo real

- Ruta: `GET /ws` (upgrade sobre el mismo servidor HTTP).
- Autenticación: reutiliza **el mismo** middleware de sesión y el **mismo**
  almacén que Express. Un usuario debe estar `ACTIVE` y no borrado.
- El servidor mantiene un mapa `usuario → sockets` y un latido cada 30 s.
- `notificarCambio()` emite `{ type: "mesas:changed" }` a todos: es una señal
  de invalidación, no un payload de datos.
- `enviarAUsuarios()` y `notificarUsuario()` emiten eventos dirigidos:
  - `chat:message`
  - `dice:roll`
  - `mesa:divisa`
  - `mesa:musica-actualizada`
  - `mesa:ping`
  - `mesa:compartir-todos`
  - `transferencia:recibida` / `transferencia:resuelta`
  - `pizarra:actualizada`
  - `mesa:mapa-actualizado`
- El cliente, al recibir un evento, vuelve a pedir por REST lo que necesite.
  Esto evita mantener dos representaciones del estado.

## 7. Persistencia y almacenamiento

- **PostgreSQL** (Neon en producción): usuarios, sesiones, mesas, archivos
  (metadatos), estado por jugador, chat, transferencias, pizarra, mapa y macros.
- **Cloudflare R2**: bytes de los archivos, bajo claves
  `archivos/{ownerId}/...`. La base de datos solo guarda metadatos y la clave.
- **Memoria**: fallback de desarrollo; los datos y archivos se pierden al
  reiniciar.
- El esquema se aplica al arrancar y es idempotente (`CREATE TABLE IF NOT
  EXISTS`, `ADD COLUMN IF NOT EXISTS`, índices `IF NOT EXISTS`).

Detalle completo en [modelo-datos.md](modelo-datos.md).

## 8. Autenticación y sesión

- Registro con email + contraseña; contraseña mínimo 8 caracteres, hash con
  bcrypt.
- Toda cuenta nueva nace `PENDING` y sin verificar. El registro envía un enlace
  con token aleatorio; en la base solo se guarda su hash SHA-256.
- El enlace caduca a los **30 minutos**; se puede reenviar como máximo cada
  **60 segundos**.
- Al verificar, la cuenta pasa a `ACTIVE` y puede iniciar sesión.
- Estados posibles: `PENDING`, `ACTIVE`, `REJECTED`. También existen `deleted`,
  `blocked` y `locked_until`.
- Bloqueo por fuerza bruta: 5 fallos dentro de una ventana de 15 minutos
  bloquean la cuenta 15 minutos desde el último fallo.
- Sesión: cookie `connect.sid` `httpOnly`, `sameSite=lax`, `secure` en
  producción, duración una semana y `rolling: true`.
- El WebSocket exige la misma cookie de sesión.

## 9. API HTTP

Prefijo general: `/api`. Todas las rutas salvo salud, registro, verificación,
reenvío y login requieren sesión activa.

### Salud y autenticación

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/health` | Estado del servicio. |
| POST | `/api/auth/register` | Registro; envía verificación. |
| POST | `/api/auth/verify-email` | Confirma el correo y activa la cuenta. |
| POST | `/api/auth/resend-verification` | Reenvía el correo (con espera). |
| POST | `/api/auth/login` | Inicia sesión. |
| POST | `/api/auth/logout` | Cierra sesión. |
| GET | `/api/auth/me` | Usuario actual. |

### Usuarios

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/users` | Lista de usuarios (solo administrador). |
| PATCH | `/api/users/me/nickname` | Cambia el nombre visible. |
| GET | `/api/users/:id/active` | Consulta si un usuario está activo (admin). |
| DELETE | `/api/users/:id` | Borra la cuenta propia o cualquiera (admin). |
| GET | `/api/users/me/macros` | Macros de tirada del usuario. |
| PATCH | `/api/users/me/macros` | Guarda macros de tirada. |

### Mesas y recepción

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/mesas/inicio` | Cuadrícula de 4 huecos de la recepción. |
| GET | `/api/mesas?q=` | Lista/busca mesas por nombre de anfitrión. |
| POST | `/api/mesas` | Crea la mesa del usuario (una por anfitrión). |
| GET | `/api/mesas/mia` | Mesa actual del usuario. |
| GET | `/api/mesas/pendiente` | Mesa con cesión de mando pendiente. |
| GET | `/api/mesas/:id` | Detalle de una mesa. |
| POST | `/api/mesas/:id/unirse` | Unirse como jugador. |
| POST | `/api/mesas/:id/abandonar` | Salir de la mesa. |
| POST | `/api/mesas/:id/iniciar` | Empezar la partida (máster). |
| POST | `/api/mesas/:id/terminar` | Volver a espera (máster). |
| DELETE | `/api/mesas/:id` | Cerrar la mesa (máster o admin). |
| POST | `/api/mesas/:id/color` | Color personal en la mesa. |
| PATCH | `/api/mesas/:id/apodo` | Apodo personal en la mesa. |
| POST | `/api/mesas/:id/escena` | Fijar imagen de escena (máster). |
| POST | `/api/mesas/:id/proyeccion` | Proyectar imagen (máster). |
| POST | `/api/mesas/:id/expulsar` | Expulsar y vetar a un jugador. |
| POST | `/api/mesas/:id/ceder` | Ofrecer el mando. |
| POST | `/api/mesas/:id/ceder/aceptar` | Aceptar el mando. |
| POST | `/api/mesas/:id/ceder/rechazar` | Rechazar el mando. |

### Sala: chat, tiradas, estado y economía

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/mesas/:id/chat` | Historial visible de chat. |
| POST | `/api/mesas/:id/chat` | Mensaje público o susurro. |
| POST | `/api/mesas/:id/tiradas` | Registrar una tirada. |
| GET | `/api/mesas/:id/master-resumen` | Resumen de jugadores (máster). |
| GET | `/api/mesas/:id/estado` | Estado personal en la mesa. |
| PATCH | `/api/mesas/:id/estado` | Guarda elementos y mochila. |
| PATCH | `/api/mesas/:id/divisa` | Ajusta una divisa propia. |
| POST | `/api/mesas/:id/divisa/transferir` | Transfiere divisas a otro miembro. |
| PATCH | `/api/mesas/:id/divisa-nombre` | Renombra la divisa principal (máster). |
| PUT | `/api/mesas/:id/divisas` | Guarda la configuración de divisas. |
| PUT | `/api/mesas/:id/musica` | Guarda la música de ambiente. |
| POST | `/api/mesas/:id/ping` | Señal visual compartida. |

### Compartir entre jugadores

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/mesas/:id/compartir/pendientes` | Transferencias recibidas. |
| POST | `/api/mesas/:id/compartir` | Enviar posit, archivo u objeto. |
| POST | `/api/mesas/:id/compartir/:transferenciaId/aceptar` | Aceptar. |
| POST | `/api/mesas/:id/compartir/:transferenciaId/rechazar` | Rechazar. |
| POST | `/api/mesas/:id/compartir-todos` | Enviar a todos los demás. |

### Pizarra y mapa

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/mesas/:id/pizarra` | Estado compartido de pizarra/escena. |
| PATCH | `/api/mesas/:id/pizarra` | Guarda el estado de pizarra. |
| GET | `/api/mesas/:id/mapa` | Estado del mapa táctico. |
| PUT | `/api/mesas/:id/mapa/fondo` | Fondo y rejilla (máster). |
| PUT | `/api/mesas/:id/mapa/iniciativa` | Guarda iniciativa (máster). |
| POST | `/api/mesas/:id/mapa/iniciativa/siguiente` | Avanza turno. |
| POST | `/api/mesas/:id/mapa/tokens` | Crea token. |
| PATCH | `/api/mesas/:id/mapa/tokens/:tokenId` | Mueve/edita token. |
| DELETE | `/api/mesas/:id/mapa/tokens/:tokenId` | Borra token. |
| PATCH | `/api/mesas/:id/mapa/plantillas/:plantillaId` | Edita plantilla. |
| DELETE | `/api/mesas/:id/mapa/plantillas/:plantillaId` | Borra plantilla. |
| POST | `/api/mesas/:id/mapa/trazos` | Añade un trazo. |
| DELETE | `/api/mesas/:id/mapa/trazos/:trazoId` | Borra un trazo. |
| DELETE | `/api/mesas/:id/mapa/trazos` | Borra todos los trazos. |
| PUT | `/api/mesas/:id/mapa/congelar` | Congela/descongela el dibujo. |
| POST | `/api/mesas/:id/mapa/areas` | Crea un área. |
| PATCH | `/api/mesas/:id/mapa/areas/:areaId` | Edita un área. |
| DELETE | `/api/mesas/:id/mapa/areas/:areaId` | Borra un área. |

### Archivos

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/archivos?mesaId=` | Lista archivos propios. |
| POST | `/api/archivos?nombre=&mesaId=` | Sube un archivo binario. |
| GET | `/api/archivos/:id` | Descarga/visualiza (soporta `Range`). |
| DELETE | `/api/archivos/:id` | Borra un archivo propio o cualquiera (admin). |

## 10. Configuración

Variables principales (`src/lib/config.ts`):

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `PORT` | Puerto HTTP | `8080` |
| `NODE_ENV` | Entorno | `development` |
| `DATABASE_URL` | PostgreSQL | vacío → memoria |
| `SESSION_SECRET` | Firma de cookie | secreto inseguro de desarrollo |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Administrador inicial | vacío |
| `APP_URL` / `APP_BASE_URL` | Base de los enlaces de correo | `http://localhost:5173` |
| `ARCHIVO_MAX_BYTES` | Tamaño máximo por archivo | `30 MiB` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | Cloudflare R2 | vacío → memoria |
| `BREVO_API_KEY` (o `EMAIL_API_KEY`), `BREVO_TEMPLATE_ID`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Correo transaccional | plantilla 5, remitente interno |

## 11. Estructura del repositorio

```
Tablero/
├── .github/workflows/ci.yml   CI: lint, test y build en main
├── client/                    Frontend React + Vite + oxlint
├── db/schema.sql              Esquema idempotente
├── docs/                      Esta documentación
├── src/                       Backend TypeScript ESM
├── tests/                     Vitest + supertest
├── docker-compose.yml         PostgreSQL local
├── render.yaml                Blueprint de Render
├── package.json               Scripts y dependencias
└── vitest.config.ts           Configuración de pruebas
```

## 12. Despliegue

- **Render** (plan free, región Frankfurt) ejecuta `npm ci && npm run build` y
  `npm start`; el health check es `/api/health`.
- **Neon** proporciona PostgreSQL; la cadena se define a mano en el dashboard
  (`DATABASE_URL`).
- El despliegue es automático al actualizar la rama conectada.
- `render.yaml` documenta por qué no se usa el PostgreSQL de Render: su capa
  gratuita caduca a los 30 días.
- CI (`.github/workflows/ci.yml`) se dispara en `push` y `pull_request` contra
  `main`: instala, pasa `oxlint`, ejecuta `npm test` y compila.

## 13. Deuda y límites conocidos

- No hay paginación en listados de mesas, usuarios o chat; se asume un volumen
  pequeño.
- El estado de pizarra y mapa se guarda como un único JSONB por mesa: cada
  cambio reescribe el documento completo.
- Los tipos públicos están duplicados a mano entre backend y frontend.
- El mapa considera “máster” al anfitrión **o a cualquier administrador**,
  mientras que otras acciones de mesa solo permiten al administrador “libre”
  (ver [decisiones-arquitectura.md](decisiones-arquitectura.md)).
- No hay pruebas E2E de navegador; la cobertura es de API y servicios.
- El frontend no usa router ni gestión de estado externa.
