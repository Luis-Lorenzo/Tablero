# Decisiones de arquitectura (ADR)

> Verificado el 18/11/2026. Los ADR describen decisiones vigentes; si una se
> revierte, se añade uno nuevo y se marca el anterior como sustituido.

Formato: **contexto → decisión → consecuencias**. Las decisiones están
ordenadas por tema, no por fecha.

---

## ADR-001 · Monolito modular con un solo origen

**Contexto.** El proyecto es pequeño y lo mantiene un equipo reducido. Separar
frontend, API y tiempo real en servicios distintos añadiría CORS, cookies
cruzadas, despliegues coordinados y coste operativo.

**Decisión.** Un único proceso Node.js sirve la API REST, el frontend compilado
(`client/dist`) y el WebSocket `/ws` en el mismo puerto. El backend es un
monolito dividido en capas (`api`, `services`, `repositories`, `lib`).

**Consecuencias.**

- Una sola cookie de sesión funciona para REST y WebSocket.
- Un solo despliegue y un solo health check.
- El frontend y el backend se despliegan juntos; no se puede escalar uno sin el
  otro.
- El proceso es un único punto de fallo.

**Alternativas descartadas.** SPA en un CDN con API aparte; microservicios;
servidor WebSocket independiente.

---

## ADR-002 · TypeScript ESM, Express 5 y capas explícitas

**Contexto.** Se quiere tipado de extremo a extremo y una separación clara sin
depender de un framework pesado.

**Decisión.** TypeScript estricto (`strict: true`), módulos ESM (`NodeNext`),
Express 5 y composición manual en `src/container.ts`. Las rutas no acceden a
`pg` ni a R2: llaman a servicios; los servicios usan repositorios.

**Consecuencias.**

- El flujo de dependencias es fácil de seguir y de probar.
- `container.ts` crece con cada servicio nuevo.
- Hay que respetar las extensiones `.js` en los imports ESM.

**Alternativas descartadas.** NestJS, Fastify, un contenedor de inyección de
dependencias.

---

## ADR-003 · PostgreSQL con `pg`, sin ORM

**Contexto.** El modelo relacional es sencillo, pero incluye arrays, JSONB e
índices parciales. Un ORM añadiría una capa de traducción y ocultaría el SQL.

**Decisión.** Usar `pg` directamente. El esquema vive en `db/schema.sql`, escrito
a mano, idempotente y aplicado al arrancar con `ensureSchema`.

**Consecuencias.**

- Control total del SQL y de los tipos.
- Las migraciones son manuales: hay que mantener `schema.sql` y el código
  sincronizados.
- Cada columna nueva se añade con `ADD COLUMN IF NOT EXISTS` para no romper
  bases existentes.
- Las consultas se escriben dos veces si se mantiene también la versión en
  memoria.

**Alternativas descartadas.** Prisma, TypeORM, Drizzle, Knex.

---

## ADR-004 · Repositorios duales: memoria y PostgreSQL

**Contexto.** Las pruebas deben ser rápidas y deterministas, pero producción
necesita persistencia real.

**Decisión.** Cada repositorio define una interfaz y dos implementaciones:
`Memory*` y `Pg*`. El contenedor elige según `DATABASE_URL`. Las pruebas usan
memoria por defecto; las de integración pueden usar PostgreSQL.

**Consecuencias.**

- Pruebas rápidas sin infraestructura.
- El mismo contrato se valida en dos implementaciones; es fácil que se
  desincronicen.
- La memoria no reproduce restricciones, concurrencia ni transacciones de
  PostgreSQL.

**Alternativas descartadas.** Solo PostgreSQL con contenedores en cada prueba;
solo mocks de repositorio.

---

## ADR-005 · Sesiones en PostgreSQL compartidas con el WebSocket

**Contexto.** El WebSocket no pasa por los middlewares de Express, pero necesita
reconocer al usuario de la cookie `connect.sid`.

**Decisión.** Usar `express-session` + `connect-pg-simple` con un único almacén,
creado una vez en el contenedor y compartido por Express y por
`MesasBroadcaster`. El broadcaster ejecuta el mismo middleware de sesión sobre
la petición de `upgrade`.

**Consecuencias.**

- El login REST autentica también el WebSocket.
- Las sesiones sobreviven a reinicios del proceso.
- El almacén es un punto compartido: no se debe crear otro store “para el
  WebSocket”.
- En desarrollo sin PostgreSQL se usa `MemoryStore`, que no es apto para
  producción.

**Alternativas descartadas.** Un store separado para WebSocket; tokens JWT en
query string; autenticación por mensaje.

---

## ADR-006 · WebSocket como canal de eventos; REST como fuente de verdad

**Contexto.** Sincronizar estado completo por WebSocket obliga a mantener dos
representaciones y a resolver reconexiones y desfases.

**Decisión.** El WebSocket emite eventos pequeños (`mesas:changed`, `chat:message`,
`dice:roll`, `pizarra:actualizada`, `mesa:mapa-actualizado`, etc.). Ante un
evento, el cliente vuelve a pedir por REST lo que necesita. `mesas:changed` es
solo una señal de invalidación.

**Consecuencias.**

- Una sola representación autoritativa: la base de datos y la API.
- Reconectar es trivial: se vuelve a cargar por REST.
- Hay más peticiones HTTP y algo más de latencia que enviando el estado entero.
- Los eventos dirigidos reducen el ruido, pero el cliente debe saber
  interpretarlos.

**Alternativas descartadas.** Estado completo por WebSocket; CRDT; polling puro.

---

## ADR-007 · Binarios en Cloudflare R2, metadatos en PostgreSQL

**Contexto.** Guardar archivos en PostgreSQL o en el disco del contenedor no es
viable en un plan gratuito y efímero.

**Decisión.** Los bytes van a R2 mediante `aws4fetch`; la tabla `archivos` guarda
id, propietario, mesa, nombre, clave, tipo, tamaño y fecha. Si R2 no está
configurado, se usa `MemoryAlmacen` solo para desarrollo.

**Consecuencias.**

- La base de datos se mantiene ligera.
- Hay que gestionar dos sistemas y limpiar R2 al borrar archivos o mesas.
- Sin R2 configurado, los archivos se pierden al reiniciar (se avisa en el log).

**Alternativas descartadas.** Guardar `bytea` en PostgreSQL; disco local;
servicio de archivos propio.

---

## ADR-008 · Verificación de correo con token hasheado y Brevo

**Contexto.** El registro debe demostrar que el correo existe y evitar cuentas
falsas, sin exigir aprobación manual.

**Decisión.** Al registrarse se genera un token aleatorio; en la base solo se
guarda su hash SHA-256, su caducidad (30 min) y la fecha de envío. El enlace se
envía con Brevo. Al confirmarlo, la cuenta pasa a `ACTIVE`. El reenvío tiene un
límite de 60 segundos.

**Consecuencias.**

- Una filtración de la base no revela tokens utilizables.
- El registro depende de Brevo; sin credenciales se usa un emisor en memoria
  que solo registra el correo en el log.
- Los enlaces caducan y hay que reenviarlos.
- `REJECTED` existe en el modelo, pero hoy no hay flujo de API para rechazar
  cuentas manualmente.

**Alternativas descartadas.** Aprobación manual por SQL; enlaces sin caducidad;
token en claro.

---

## ADR-009 · Navegación del cliente por estado, sin router

**Contexto.** La aplicación tiene pocas vistas y comparte mucho estado entre
recepción, gestión y sala.

**Decisión.** `App.tsx` mantiene `view` (`recepcion`, `cuenta`, `moderar`,
`gestion`, `sala`) y cambia de pantalla con `setView`. No se usa React Router
ni el historial del navegador.

**Consecuencias.**

- Menos dependencias y menos conceptos.
- No hay URLs profundas ni botón “atrás” del navegador por vista.
- El estado global vive en `App.tsx` y puede crecer.

**Alternativas descartadas.** React Router; TanStack Router; rutas por hash.

---

## ADR-010 · CSS global, sin Tailwind ni CSS modules

**Contexto.** La interfaz tiene un lenguaje visual propio y muy específico
(texturas, madera, pergamino, escena).

**Decisión.** CSS global en `client/src/styles`, con clases semánticas. No hay
Tailwind, CSS modules ni CSS-in-JS.

**Consecuencias.**

- Control total del aspecto y de las animaciones.
- Riesgo de colisiones de nombres y de estilos muertos.
- No hay utilidades de composición como las de Tailwind.

**Alternativas descartadas.** Tailwind; styled-components; CSS modules.

---

## ADR-011 · Tipos públicos duplicados a mano

**Contexto.** El backend y el frontend son paquetes separados; compartir tipos
requeriría un paquete común o generación de código.

**Decisión.** Mantener a mano los tipos públicos en `client/src/api/types.ts` y
en `src/api/serializers.ts`. Los serializadores convierten entidades internas a
esos tipos.

**Consecuencias.**

- No hay acoplamiento de compilación entre paquetes.
- Un cambio de contrato exige tocar ambos lados; el compilador no avisa.
- Es una fuente conocida de desincronización.

**Alternativas descartadas.** Paquete `shared`; generación desde OpenAPI;
tipos derivados del servidor.

---

## ADR-012 · Estado de sala en documentos JSONB por mesa

**Contexto.** La pizarra, el mapa y el estado de cada jugador cambian con
frecuencia y tienen formas muy variables (posits, tokens, trazos, áreas,
mochila).

**Decisión.** Guardar el estado compartido como JSONB:
`mesa_pizarra_estado.datos`, `mesa_mapa_estado.datos` y
`mesa_jugador_estado.elementos/divisas_saldos/mochila`. La validación y el
saneamiento se hacen en los servicios/repositorios.

**Consecuencias.**

- Evolucionar la forma del estado no exige migraciones de columnas.
- Cada cambio reescribe el documento completo; no hay actualizaciones parciales.
- La integridad depende del código, no de restricciones SQL.
- El tamaño del documento puede crecer con muchos elementos.

**Alternativas descartadas.** Una tabla por tipo de elemento; eventos
append-only; almacenamiento en el cliente.

---

## ADR-013 · Administrador omnipotente, con dos límites explícitos

**Contexto.** Los administradores deben poder moderar mesas ajenas, pero no
deben poder saltarse un veto ni conservar poderes de máster dentro de una mesa
en la que participan como jugadores.

**Decisión.**

- Un administrador puede gestionar (expulsar, ceder el mando, cambiar divisas o
  música, cerrar) una mesa ajena **mientras no sea jugador de ella**
  (`esAdminLibre`).
- Si un administrador es jugador de la mesa, pierde ese poder y solo cuenta
  como jugador; el anfitrión manda.
- La expulsión veta a **cualquier** usuario, incluido un administrador: si está
  en `expulsados`, `unirse` devuelve `MESA_BANNED` y la interfaz bloquea la
  entrada y la gestión.
- Cerrar una mesa sí lo puede hacer cualquier administrador, sea o no jugador.

**Consecuencias.**

- La moderación no se puede usar para saltarse una expulsión.
- Un administrador que se une a una mesa pierde privilegios dentro de ella.
- El mapa aplica una regla más amplia: `esMaster` incluye al anfitrión **o a
  cualquier administrador**, aunque sea jugador. Es una inconsistencia conocida
  y documentada; si se corrige, debe hacerse en `mapa-estado.service.ts`.

**Alternativas descartadas.** Administrador siempre omnipotente; administrador
sin poderes dentro de mesas ajenas.

---

## ADR-014 · La música de hoguera suena solo en el lobby y la moderación

**Contexto.** La música de ambiente del lobby (`/BucleLobby.wav`) reforzaba la
recepción, pero se reproducía también en la sala y en zonas donde no aporta.

**Decisión.** La hoguera suena en la recepción, en la preview/gestión de la mesa
y en moderación. **No** suena en la sala de juego, ni en “Mi cuenta”, ni en
login/registro/verificación. La música de ambiente de la partida es otra:
la controla el máster y se sincroniza por WebSocket.

**Consecuencias.**

- Cada zona tiene una experiencia sonora deliberada.
- La condición del cliente debe mantenerse en `App.tsx`
  (`enZonaConHoguera`); tocarla afecta a varias vistas.
- La música del máster no debe confundirse con la del lobby.

**Alternativas descartadas.** Una única pista global; música solo en la sala.

---

## ADR-015 · Pruebas de API y servicios con Vitest + supertest

**Contexto.** La mayor parte del riesgo está en las reglas de negocio y en los
contratos HTTP, no en la pintura de componentes.

**Decisión.** Probar con Vitest y supertest las rutas y los servicios, usando
repositorios en memoria. CI ejecuta `oxlint`, `npm test` y `npm run build` en
cada push/PR a `main`.

**Consecuencias.**

- Pruebas rápidas y legibles, sin navegador.
- No se cubren regresiones visuales ni flujos completos de usuario.
- Las pruebas de integración con PostgreSQL/R2 son opcionales y dependen de
  credenciales.

**Alternativas descartadas.** Solo pruebas E2E; solo pruebas unitarias; Cypress
como base.
