# Requisitos no funcionales

> Verificado el 18/11/2026. Los requisitos marcados como **objetivo** son
> intenciones de diseño; los marcados como **verificado** se pueden comprobar
> en el código o en la configuración actual.

## RNF-01 · Plataforma y runtime

- **Verificado:** Node.js **>= 22** (`package.json`, CI y Render).
- **Verificado:** TypeScript estricto (`strict: true`), salida ES2022 y módulos
  ESM (`NodeNext`).
- **Verificado:** el backend corre en un único proceso; no requiere servicios
  auxiliares salvo PostgreSQL, R2 y Brevo.
- **Verificado:** el frontend se compila con Vite 8 y React 19.
- **Objetivo:** navegadores modernos de escritorio y móvil con soporte de
  WebSocket, `fetch`, audio y peticiones `Range`. No se soporta Internet
  Explorer.

## RNF-02 · Rendimiento y capacidad

No hay un SLA ni pruebas de carga formales. Los límites actuales acotan el
trabajo por petición:

| Límite | Valor | Efecto |
| --- | --- | --- |
| Jugadores por mesa | 6 (el anfitrión no cuenta) | Acota el fan-out de eventos. |
| Mesas en la cuadrícula | 4 | La recepción no pagina. |
| Mensajes conservados por mesa | 100 | Acota el historial de chat. |
| Longitud de mensaje | 500 caracteres | Acota el tamaño de cada mensaje. |
| Archivo máximo | 30 MiB por defecto | Acota memoria y subida. |
| Estado de pizarra/mapa | 1 documento JSONB por mesa | Se reescribe entero en cada cambio. |

- **Objetivo:** la recepción debe cargar en menos de 1 s con 4 mesas y una
  decena de usuarios en una conexión normal. No está medido.
- **Riesgo conocido:** listar mesas, usuarios y chat no pagina; con volúmenes
  grandes el tiempo de respuesta crece linealmente.
- **Riesgo conocido:** cada cambio de pizarra o mapa reescribe el documento
  JSONB completo y lo difunde a todos los miembros.

## RNF-03 · Seguridad

### Autenticación y sesión

- **Verificado:** contraseñas con bcrypt; nunca se devuelven ni se registran.
- **Verificado:** contraseña mínima de 8 caracteres.
- **Verificado:** cookie de sesión `httpOnly`, `sameSite=lax`, `secure` en
  producción, `maxAge` de una semana y `rolling`.
- **Verificado:** `SESSION_SECRET` tiene un valor por defecto inseguro para
  desarrollo; en producción debe definirse uno fuerte. El código no impide
  arrancar en producción con el valor por defecto: es una comprobación manual.
- **Verificado:** el bloqueo por fuerza bruta se evalúa antes de comprobar la
  contraseña.
- **Verificado:** los tokens de verificación se guardan como hash SHA-256, con
  caducidad de 30 minutos y reenvío limitado a uno por minuto.
- **Verificado:** el WebSocket rechaza conexiones sin sesión activa.

### Autorización

- **Verificado:** `requireAuth` exige usuario no borrado y `status = ACTIVE`.
- **Verificado:** `requireAdmin` protege el listado de usuarios y la consulta de
  actividad.
- **Verificado:** las reglas de mesa se comprueban en el servicio, no solo en la
  interfaz.
- **Verificado:** la expulsión veta también a administradores
  (`MESA_BANNED`).
- **Riesgo conocido:** en el mapa, cualquier administrador cuenta como máster
  aunque sea jugador (ver ADR-013).
- **Riesgo conocido:** un administrador puede leer y borrar cualquier archivo.

### Archivos

- **Verificado:** lista blanca de tipos MIME; no se acepta cualquier
  `Content-Type`.
- **Verificado:** límite de tamaño configurable (30 MiB por defecto).
- **Verificado:** nombre de archivo saneado y extensión derivada del tipo.
- **Verificado:** `X-Content-Type-Options: nosniff` y `Content-Disposition` con
  nombre ASCII + UTF-8.
- **Verificado:** `Cache-Control: private` y `ETag` por id.
- **Verificado:** solo el propietario o un administrador pueden borrar.
- **Riesgo conocido:** un miembro de una mesa puede leer archivos de otro
  miembro de esa misma mesa si conoce el id, aunque no se los haya compartido
  explícitamente. La lectura se autoriza por pertenencia a la mesa o por uso del
  archivo como escena/proyección/música.

### Superficie HTTP

- **Verificado:** las consultas SQL usan parámetros `$1`, `$2`…; la
  interpolación solo se usa para listas de columnas estáticas.
- **Verificado:** los errores no controlados responden `INTERNAL_ERROR` sin
  stack; el stack solo va al log.
- **Verificado:** el cuerpo JSON usa el límite por defecto de Express; las
  subidas binarias usan `maxBytes + 1024`.
- **Carencia conocida:** no hay `helmet` ni cabeceras de seguridad globales
  (CSP, HSTS, `X-Frame-Options`). Solo los archivos añaden `nosniff`.
- **Carencia conocida:** no hay límite de tasa general en login, registro ni
  API; solo el reenvío de verificación tiene espera.
- **Carencia conocida:** no hay CSRF token explícito; se confía en
  `sameSite=lax` y en que las mutaciones usan JSON o binario.

## RNF-04 · Privacidad y aislamiento de datos

- **Verificado:** el estado de juego por jugador está aislado por
  `(mesa_id, user_id)`.
- **Verificado:** los susurros de chat solo se entregan a emisor y destinatario;
  el historial filtra por autor o destinatario.
- **Verificado:** las tiradas secretas del máster no se guardan ni se difunden.
- **Verificado:** las cuentas se borran de forma lógica; el nickname queda
  libre, pero el registro de la cuenta permanece.
- **Verificado:** `.env` y `.env.*` están en `.gitignore` (salvo
  `.env.example`).
- **Riesgo conocido:** los archivos compartidos por referencia usan la misma
  clave de R2; el borrado se hace por conteo de referencias, no por copia.
- **Carencia conocida:** no hay política de privacidad, términos de uso ni
  mecanismo de exportación de datos en el repositorio.

## RNF-05 · Fiabilidad y disponibilidad

- **Verificado:** `/api/health` sirve como health check de Render.
- **Verificado:** cierre ordenado ante `SIGTERM`/`SIGINT`, cerrando HTTP y el
  pool.
- **Verificado:** el esquema es idempotente y se aplica al arrancar; no hay
  migraciones destructivas.
- **Verificado:** las sesiones se persisten en PostgreSQL en producción, así que
  sobreviven a reinicios.
- **Verificado:** si falta `DATABASE_URL`, el servidor arranca en memoria y
  avisa por log; en producción esto implica pérdida de datos.
- **Verificado:** si falta R2, los archivos se guardan en memoria y se pierden
  al reiniciar; en producción se registra como error.
- **Riesgo conocido:** el despliegue es de **una sola instancia**. El WebSocket
  guarda las conexiones en memoria del proceso; escalar horizontalmente exigiría
  sesiones sticky y un bus de eventos (por ejemplo, Redis pub/sub).
- **Riesgo conocido:** el plan free de Render puede tardar en despertar tras
  inactividad.
- **Objetivo:** recuperar el servicio tras un fallo reiniciando el proceso; la
  persistencia real está en Neon y R2.

## RNF-06 · Límites funcionales

| Elemento | Límite |
| --- | --- |
| Jugadores por mesa | 6 |
| Mesas visibles en recepción | 4 |
| Mensajes por mesa | 100 |
| Longitud de mensaje | 500 caracteres |
| Archivo | 30 MiB por defecto |
| Nickname | 3–20 caracteres |
| Apodo de mesa | 24 caracteres |
| Texto de posit | 2000 caracteres |
| Giro de posit | −15 a 15 |
| Nombre de objeto | 60 caracteres |
| Descripción de objeto | 1000 caracteres |
| Cantidad de objeto | 1–9999 |
| Emoji de objeto | 16 caracteres |
| Coordenadas de ping | 0–100 |
| Token en mapa | posición −10000 a 10000; escala 0.1–5; celdas 0.25–20 |

Estos límites se aplican en el servidor; la interfaz puede mostrar valores más
restrictivos.

## RNF-07 · Mantenibilidad

- **Verificado:** separación en capas y dependencias unidireccionales.
- **Verificado:** TypeScript estricto en backend; el cliente también compila con
  TypeScript antes de Vite.
- **Verificado:** lint del cliente con `oxlint`.
- **Verificado:** comentarios y nombres de dominio en español, coherentes con el
  resto del repositorio.
- **Verificado:** los ADR documentan el porqué de las decisiones estructurales.
- **Deuda conocida:** los tipos públicos están duplicados a mano entre backend
  y frontend.
- **Deuda conocida:** cada repositorio tiene dos implementaciones que deben
  mantenerse sincronizadas.
- **Deuda conocida:** no hay framework de migraciones; el esquema se modifica a
  mano con `ADD COLUMN IF NOT EXISTS`.
- **Deuda conocida:** `App.tsx` concentra navegación, sesión y música; puede
  crecer.

## RNF-08 · Pruebas y CI

- **Verificado:** **119 pruebas en 17 archivos** con Vitest.
- **Verificado:** las pruebas de API usan supertest y repositorios en memoria.
- **Verificado:** hay pruebas de autenticación, bloqueo, mesas, chat, archivos,
  mapa, compartición, usuarios y servicios.
- **Verificado:** CI ejecuta `npm ci`, `oxlint`, `npm test` y `npm run build`.
- **Limitación:** CI solo se dispara en `push`/`pull_request` contra `main`; una
  rama de trabajo como `fallos-en-vivo` no se valida hasta abrir PR o fusionar.
- **Limitación:** no hay pruebas E2E de navegador ni umbral de cobertura.
- **Limitación:** las pruebas de integración con PostgreSQL/R2 son opcionales y
  dependen de credenciales.

## RNF-09 · Despliegue y portabilidad

- **Verificado:** Render (Node, plan free, Frankfurt) con `render.yaml`.
- **Verificado:** PostgreSQL externo en Neon mediante `DATABASE_URL`.
- **Verificado:** `npm run build` compila el cliente y el backend; `npm start`
  ejecuta `dist/server.js`.
- **Verificado:** `docker-compose.yml` permite levantar PostgreSQL local.
- **Verificado:** todas las credenciales se leen de variables de entorno; no hay
  secretos en el repositorio.
- **Objetivo:** poder desplegar en cualquier plataforma que ejecute Node 22 y
  proporcione las variables de entorno.

## RNF-10 · Observabilidad

- **Verificado:** logs estructurados en JSON a stdout con `time`, `level`,
  `message` y metadatos.
- **Verificado:** log de peticiones HTTP y de eventos de dominio (registro,
  login, mesas, archivos, mapa).
- **Verificado:** los errores no controlados se registran con stack.
- **Carencia conocida:** no hay métricas, trazas distribuidas, alertas ni
  dashboards. La observabilidad depende de los logs de Render.
- **Carencia conocida:** no hay correlación por id de petición.

## RNF-11 · Accesibilidad y experiencia

- **Verificado:** la interfaz está en español y usa `:focus-visible` para el
  foco de teclado.
- **Verificado:** hay puntos de ruptura responsivos (640, 480 px) y tamaños
  fluidos con `clamp`.
- **Verificado:** los controles de audio tienen botones y etiquetas visibles.
- **Carencia conocida:** no hay auditoría WCAG ni pruebas con lector de
  pantalla.
- **Carencia conocida:** no se detecta `prefers-reduced-motion`; las
  animaciones no se desactivan automáticamente.
- **Carencia conocida:** no hay temas de alto contraste ni tamaño de fuente
  configurable.

## RNF-12 · Compatibilidad de archivos

- **Verificado:** PDF, PNG, JPEG, GIF, WebP, DOCX, TXT, MP3, OGG, WAV, WebM y MP4
  (audio).
- **Verificado:** los DOCX se previsualizan en el cliente con `docx-preview`.
- **Verificado:** el audio y el vídeo usan `Range` para reproducción y búsqueda.
- **Limitación:** no se aceptan otros formatos de audio (por ejemplo, AAC o
  FLAC) ni vídeo con imagen (MP4 se acepta como audio/mp4).

## RNF-13 · Coste

- **Verificado:** el diseño busca caber en capas gratuitas: Render free, Neon
  free, R2 y Brevo.
- **Riesgo conocido:** el plan free de Render duerme por inactividad y tiene
  recursos limitados; el plan free de Neon también tiene límites de
  almacenamiento y conexiones.
- **Riesgo conocido:** el tráfico de archivos y el almacenamiento en R2 crecen
  con el uso; no hay cuotas por usuario.

## RNF-14 · Cumplimiento y datos personales

- **Verificado:** se almacenan email, hash de contraseña, nickname, rol, estado,
  fechas de acceso fallido y metadatos de archivos.
- **Verificado:** no se almacenan tokens de verificación en claro.
- **Carencia conocida:** no hay política de retención, borrado definitivo
  programado, exportación de datos ni consentimiento explícito más allá del
  registro.
- **Objetivo:** antes de un uso público real, añadir aviso de privacidad,
  términos y un procedimiento de borrado definitivo.
