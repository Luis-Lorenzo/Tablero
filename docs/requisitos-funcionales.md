# Requisitos funcionales

> Verificado el 18/11/2026. Cada requisito describe comportamiento observable y
> verificable. Los identificadores son estables para referenciarlos desde
> pruebas, incidencias y PRs.

## Actores

| Actor | Descripción |
| --- | --- |
| **Visitante** | No tiene sesión. Solo puede registrarse, verificar correo o iniciar sesión. |
| **Usuario pendiente** | Registrado, con correo sin verificar. No puede iniciar sesión. |
| **Usuario activo** | Correo verificado. Puede usar recepción, mesas, archivos y cuenta. |
| **Administrador** | Usuario con rol `ADMIN`. Puede moderar usuarios y mesas. |
| **Máster / anfitrión** | Usuario que creó la mesa (`hostId`). Controla la partida. |
| **Jugador** | Usuario unido a una mesa como jugador. |
| **Expulsado** | Usuario vetado en una mesa concreta. No puede volver a entrar. |

Un usuario puede ser máster de su propia mesa y, a la vez, jugador de otra; la
mesa “actual” que devuelve `/mia` prioriza aquella en la que es anfitrión.

---

## RF-AUT · Cuentas y autenticación

### RF-AUT-01 · Registro

- El visitante se registra con email y contraseña.
- El email se normaliza y debe tener formato válido; si ya existe, responde
  `EMAIL_EXISTS` (409).
- La contraseña debe tener al menos 8 caracteres; si no, `WEAK_PASSWORD`.
- La cuenta nace con estado `PENDING`, `email_verified = false` y sin sesión.
- Se genera un token de verificación aleatorio; en la base solo se guarda su
  hash SHA-256, la caducidad y la fecha de envío.
- Se envía un correo con un enlace a `APP_URL/verificar-correo?token=...`.

### RF-AUT-02 · Verificación de correo

- `POST /api/auth/verify-email` recibe el token.
- Token vacío, corto o desconocido → `INVALID_VERIFICATION_TOKEN` (400).
- Token caducado (más de 30 minutos) → `EXPIRED_VERIFICATION_TOKEN` (410).
- Cuenta ya verificada o `ACTIVE` → `EMAIL_ALREADY_VERIFIED` (409).
- Cuenta `REJECTED` → `ACCOUNT_REJECTED` (403).
- Si es válido, la cuenta pasa a `ACTIVE`, se limpian los campos de verificación
  y ya puede iniciar sesión.
- Verificar no inicia sesión automáticamente.

### RF-AUT-03 · Reenvío de verificación

- `POST /api/auth/resend-verification` recibe un email.
- Solo aplica a cuentas `PENDING` no verificadas y no borradas.
- Si se reenvía antes de 60 segundos desde el anterior, responde
  `VERIFICATION_RATE_LIMITED` (429).
- Si el correo no corresponde a una cuenta pendiente, responde `{ ok: true }`
  sin revelar si existe.
- Genera un token nuevo y lo envía; el anterior deja de ser válido.

### RF-AUT-04 · Inicio de sesión

- `POST /api/auth/login` recibe email y contraseña.
- El bloqueo se comprueba **antes** de validar la contraseña.
- Credenciales incorrectas → `INVALID_CREDENTIALS` (401); el fallo se registra.
- Con contraseña correcta pero estado `PENDING` → `ACCOUNT_PENDING` (403).
- Con contraseña correcta pero estado `REJECTED` → `ACCOUNT_REJECTED` (403).
- Cuenta bloqueada → `ACCOUNT_LOCKED` (403) con `lockedUntil`.
- En éxito se guarda `req.session.userId`, se limpian fallos y bloqueo, y se
  devuelve el usuario público.

### RF-AUT-05 · Bloqueo por intentos fallidos

- Se conservan como máximo los 5 fallos más recientes.
- Si los 5 fallos caben en una ventana de 15 minutos, la cuenta se bloquea
  durante 15 minutos desde el último fallo.
- Al expirar, el bloqueo deja de aplicarse solo.
- Un administrador puede desbloquear a mano en la base de datos
  (`blocked = FALSE`).

### RF-AUT-06 · Sesión y cierre

- La sesión usa la cookie `connect.sid` (`httpOnly`, `sameSite=lax`, `secure` en
  producción) y dura una semana con renovación por actividad.
- `GET /api/auth/me` devuelve el usuario actual.
- `POST /api/auth/logout` destruye la sesión y borra la cookie.
- Las cuentas borradas, pendientes o rechazadas no pasan `requireAuth`.

### RF-AUT-07 · Contraseñas

- Se almacenan con bcrypt; nunca en claro.
- La contraseña mínima es de 8 caracteres.
- No hay flujo de “olvidé mi contraseña” en la API actual.

---

## RF-USR · Perfil y administración de usuarios

### RF-USR-01 · Nombre visible (nickname)

- `PATCH /api/users/me/nickname` cambia el nombre visible.
- Reglas: entre 3 y 20 caracteres; empieza por letra ASCII; termina en letra o
  número; el resto son letras, números o guion bajo. Sin espacios, acentos, `ñ`,
  emojis ni símbolos.
- Es único sin distinguir mayúsculas entre cuentas no borradas.
- Enviar `null` o vacío elimina el nickname.
- Si no hay nickname, se muestra la parte del email anterior a la `@`.
- Errores: `INVALID_NICKNAME` (400), `NICKNAME_TAKEN` (409).

### RF-USR-02 · Listado de usuarios

- `GET /api/users` es solo para administradores (`requireAdmin`).
- Devuelve usuarios no borrados con rol, estado, bloqueo, fecha y nickname.

### RF-USR-03 · Consulta de actividad

- `GET /api/users/:id/active` (solo admin) indica si un usuario está activo.

### RF-USR-04 · Borrado de cuenta

- `DELETE /api/users/:id` permite borrar la propia cuenta o, si es admin,
  cualquiera.
- El borrado es lógico (`deleted = true`), no físico.
- Si el usuario borra su propia cuenta, su sesión se destruye.
- El nickname de una cuenta borrada deja de ocupar el nombre.

### RF-USR-05 · Macros de tirada

- `GET /api/users/me/macros` devuelve las macros personales.
- `PATCH /api/users/me/macros` las guarda; el cuerpo debe incluir un array
  `macros`; se sanean antes de persistir.

---

## RF-MES · Recepción y gestión de mesas

### RF-MES-01 · Cuadrícula de recepción

- `GET /api/mesas/inicio` devuelve siempre **4 huecos**.
- Las mesas se ordenan por fecha de creación y se colocan al final; los huecos
  libres van al principio.
- La mesa más nueva queda abajo a la derecha.

### RF-MES-02 · Listado y búsqueda

- `GET /api/mesas` lista todas las mesas, de la más nueva a la más antigua.
- `?q=` filtra por el nombre visible del anfitrión (nickname o email).

### RF-MES-03 · Crear mesa

- `POST /api/mesas` crea una mesa cuyo anfitrión es el usuario.
- Un usuario solo puede ser anfitrión de **una** mesa. Si ya tiene una, la
  petición devuelve esa misma mesa con 200 en lugar de 201.
- La mesa nace en estado `ESPERA`, sin jugadores, sin imágenes y con la divisa
  “Divisa”.

### RF-MES-04 · Unirse a una mesa

- `POST /api/mesas/:id/unirse` añade al usuario como jugador.
- Si ya es anfitrión o jugador, devuelve la mesa sin cambios.
- Si está en la lista de expulsados → `MESA_BANNED` (403). **Aplica también a
  administradores.**
- Si ya hay 6 jugadores → `MESA_FULL` (409). El anfitrión no ocupa plaza.
- Al unirse, el usuario sale como jugador de cualquier otra mesa.
- No se puede unir a una mesa inexistente (`MESA_NOT_FOUND`, 404).

### RF-MES-05 · Abandonar una mesa

- `POST /api/mesas/:id/abandonar` quita al jugador.
- El anfitrión no puede abandonar su propia mesa: debe cerrarla
  (`MESA_FORBIDDEN`, 403).
- Si el jugador tenía una cesión de mando pendiente, se cancela.

### RF-MES-06 · Iniciar y terminar la partida

- `POST /api/mesas/:id/iniciar` pasa la mesa a `EN_CURSO`. Solo el anfitrión.
- No se exige un mínimo de jugadores; se puede iniciar en solitario para probar.
- `POST /api/mesas/:id/terminar` vuelve a `ESPERA`. Solo el anfitrión.
- Ambos son idempotentes.

### RF-MES-07 · Cerrar la mesa

- `DELETE /api/mesas/:id` la elimina. Puede hacerlo el anfitrión o **cualquier
  administrador**.
- Antes de borrar la mesa se borran sus archivos asociados (metadatos y objetos
  de R2 sin otras referencias).

### RF-MES-08 · Color y apodo personales

- `POST /api/mesas/:id/color` fija o elimina (`color: null`) el color del
  usuario en esa mesa.
- `PATCH /api/mesas/:id/apodo` fija o elimina un apodo de hasta 24 caracteres.
- Solo pueden hacerlo el anfitrión o un jugador de la mesa.

### RF-MES-09 · Imagen de escena y proyección

- `POST /api/mesas/:id/escena` fija la imagen de la pizarra de pared.
- `POST /api/mesas/:id/proyeccion` proyecta una imagen en primer plano.
- El cuerpo es `{ archivoId, titulo? }`; enviar `null` limpia la imagen.
- **Solo el anfitrión** puede cambiarlas (un administrador que no sea anfitrión
  no puede).

### RF-MES-10 · Expulsar y vetar

- `POST /api/mesas/:id/expulsar` recibe `{ playerId }`.
- Puede hacerlo el anfitrión o un administrador que **no sea jugador** de esa
  mesa.
- El objetivo debe estar en la lista de jugadores; si no, `INVALID_REQUEST`.
- Se elimina de jugadores, se añade a `expulsados` y se cancela cualquier cesión
  pendiente.
- El veto es permanente para esa mesa y se aplica en `unirse`.
- La interfaz bloquea la entrada y la gestión de mesas donde el usuario está
  vetado.

### RF-MES-11 · Cesión del mando

- `POST /api/mesas/:id/ceder` recibe `{ playerId }`. Lo solicita el anfitrión o
  un administrador libre.
- El jugador elegido ve la solicitud (`GET /api/mesas/pendiente`) y puede:
  - `POST /api/mesas/:id/ceder/aceptar`: pasa a ser anfitrión y el anterior
    anfitrión pasa a jugador.
  - `POST /api/mesas/:id/ceder/rechazar`: se cancela la solicitud.
- Solo el jugador elegido puede aceptar o rechazar.

### RF-MES-12 · Administrador dentro de una mesa

- Un administrador puede expulsar, ceder el mando, cambiar divisas o música y
  cerrar mesas ajenas mientras **no sea jugador** de ellas.
- Si se une como jugador, pierde esos poderes y solo cuenta como jugador.
- Iniciar, terminar, cambiar la imagen o renombrar la divisa principal siguen
  siendo exclusivos del anfitrión, aunque sea administrador.

### RF-MES-13 · Estado de la mesa

- `GET /api/mesas/mia` devuelve la mesa del usuario (prioriza la que
  anfitriona).
- `GET /api/mesas/:id` devuelve el detalle público.
- El cliente entra automáticamente en la sala cuando la mesa pasa a
  `EN_CURSO`.

---

## RF-SAL · Sala de juego

### RF-SAL-01 · Fases de la sala

La sala tiene cuatro fases: `sala`, `pizarra`, `mapa` y `archivador`. La
navegación es de cliente; el servidor guarda el estado compartido.

### RF-SAL-02 · Escena y proyección

- La escena muestra la imagen fijada por el máster.
- La proyección muestra una imagen en primer plano para todos.
- Ambas se sincronizan por la mesa (`imagenEscena`, `imagenProyectada`).

### RF-SAL-03 · Estado personal

- `GET /api/mesas/:id/estado` devuelve elementos, divisa principal, saldos por
  divisa y mochila del usuario.
- `PATCH /api/mesas/:id/estado` guarda `elementos` y/o `mochila`.
- El estado está aislado por `(mesa, usuario)`.
- Solo los miembros de la mesa pueden leerlo o escribirlo.

### RF-SAL-04 · Resumen del máster

- `GET /api/mesas/:id/master-resumen` es solo para el anfitrión.
- Devuelve, por jugador **conectado**, nombre, color, divisa, saldos, mochila y
  objetos de mesa, además de la configuración de divisas.
- “Conectado” significa que tiene al menos un WebSocket abierto.

### RF-SAL-05 · Color y apodo en la sala

- El color y el apodo elegidos en la mesa se usan en la sala, el chat, las
  tiradas y los avisos.

### RF-SAL-06 · Ping visual

- `POST /api/mesas/:id/ping` envía una señal a todos los miembros.
- Coordenadas `x` e `y` entre 0 y 100; vista `pizarra`, `escena` o `mapa`.
- El servidor genera el id y añade autor, nombre y color.

### RF-SAL-07 · Archivos en la sala

- El archivador lista los archivos personales del usuario.
- Se pueden subir, abrir, reproducir (audio), descargar y borrar.
- Los archivos pueden asociarse a una mesa (`mesaId`) para compartirlos con sus
  miembros.

### RF-SAL-08 · Música de ambiente

- El máster puede definir una lista de pistas de audio, el índice actual, si
  reproduce, bucle, aleatorio y volumen.
- Solo se aceptan archivos cuyo tipo sea audio.
- Los cambios se difunden a los miembros (`mesa:musica-actualizada`).
- El avance automático envía `indiceEsperado`; si otra pestaña ya cambió de
  pista, el aviso se ignora para no saltarse canciones.
- La música de hoguera del lobby es independiente (ver RF-UI-03).

---

## RF-CHA · Chat y tiradas

### RF-CHA-01 · Chat de mesa

- `GET /api/mesas/:id/chat` devuelve el historial visible.
- `POST /api/mesas/:id/chat` envía un mensaje de hasta **500 caracteres**.
- Sin `destinatarioId` es público (lo reciben todos los miembros).
- Con `destinatarioId` es un susurro: solo lo reciben emisor y destinatario.
- El destinatario debe ser miembro de la mesa.
- Se conservan los **100 mensajes** más recientes por mesa.
- Los susurros no los ve el máster salvo que sea emisor o destinatario.
- Los mensajes se difunden como `chat:message`.

### RF-CHA-02 · Tiradas

- `POST /api/mesas/:id/tiradas` registra una tirada con total, fórmula, dados,
  bonificador, caras, especial, secreta, soloMáster y colores.
- Se valida que total, bonificador, fórmula y dados sean coherentes.
- En d20, un 20 marca `critico` y un 1 marca `pifia`.
- Las tiradas normales se difunden a todos los miembros (`dice:roll`).
- Las tiradas `soloMaster` solo llegan al autor y al anfitrión.
- Las tiradas `secreta` (dados negros del máster) solo las puede hacer el
  anfitrión y **no se difunden ni se guardan**.

### RF-CHA-03 · Historial y visibilidad

- Un miembro solo ve mensajes públicos, los suyos y los que le tienen como
  destinatario.
- Un usuario ajeno a la mesa no puede leer ni escribir (`MESA_FORBIDDEN`).

---

## RF-ARC · Archivos personales

### RF-ARC-01 · Subida

- `POST /api/archivos?nombre=...&mesaId=...` sube el cuerpo binario.
- El `Content-Type` debe ser uno de los tipos permitidos:
  PDF, PNG, JPEG, GIF, WebP, DOCX, TXT, MP3, OGG, WAV, WebM y MP4 (audio).
- Tamaño máximo por defecto: **30 MiB** (`ARCHIVO_MAX_BYTES`).
- Un archivo vacío → `ARCHIVO_VACIO`; tipo no permitido →
  `ARCHIVO_TIPO_INVALIDO`; demasiado grande → `ARCHIVO_DEMASIADO_GRANDE`.
- Si se indica `mesaId`, el usuario debe ser miembro de esa mesa.
- El nombre se limpia y se guarda con la extensión correspondiente al tipo.

### RF-ARC-02 · Listado

- `GET /api/archivos` lista solo los archivos del usuario.
- `?mesaId=` filtra por mesa.

### RF-ARC-03 · Lectura y descarga

- `GET /api/archivos/:id` sirve el archivo con su `Content-Type`.
- Soporta `Range` para audio y vídeo, con respuestas 206.
- Envía `ETag`, `Cache-Control` privado, `Accept-Ranges` y
  `X-Content-Type-Options: nosniff`.
- Por defecto se muestra en línea; `?descarga=1` fuerza descarga.
- Puede leerlo el propietario, un administrador, o un miembro de una mesa en la
  que el propietario esté presente o el archivo se use como escena, proyección
  o música.

### RF-ARC-04 · Borrado

- `DELETE /api/archivos/:id` lo puede hacer el propietario o un administrador.
- Si la clave de R2 ya no la referencia ningún otro registro (por ejemplo, un
  archivo compartido por referencia), se borra también el objeto.

---

## RF-COM · Compartir entre jugadores

### RF-COM-01 · Enviar

- `POST /api/mesas/:id/compartir` recibe `receptorId` y `tipo`:
  - `posit`: texto, color y giro.
  - `archivo`: `archivoId`.
  - `objeto`: nombre, descripción, cantidad, emoji y archivo opcional.
- Emisor y receptor deben ser miembros de la mesa y distintos.
- El receptor recibe `transferencia:recibida`.

### RF-COM-02 · Aceptar o rechazar

- `GET /api/mesas/:id/compartir/pendientes` lista las recibidas.
- `POST .../aceptar` aplica el contenido:
  - El posit se añade al estado del receptor.
  - El archivo se clona como metadato del receptor (misma clave de R2, sin
    duplicar bytes).
  - El objeto se añade a la mochila/estado del receptor.
- `POST .../rechazar` descarta la transferencia.
- Solo el receptor puede resolverla; el emisor recibe el resultado.

### RF-COM-03 · Compartir con todos

- `POST /api/mesas/:id/compartir-todos` envía un posit, archivo u objeto a todos
  los demás miembros.
- Solo el anfitrión o un administrador libre pueden usarlo.
- Se difunde como `mesa:compartir-todos`.

---

## RF-PIZ · Pizarra y escena

### RF-PIZ-01 · Estado compartido

- `GET /api/mesas/:id/pizarra` devuelve el estado de pizarra/escena.
- `PATCH /api/mesas/:id/pizarra` lo guarda y difunde
  `pizarra:actualizada`.
- Solo los miembros pueden leer o escribir.

### RF-PIZ-02 · Congelar

- La pizarra puede estar congelada.
- Mientras está congelada, un jugador no puede modificarla.
- Solo el **anfitrión** puede cambiar el flag de congelación (un administrador
  que no sea anfitrión no puede).

### RF-PIZ-03 · Posits y objetos

- El estado incluye posits (texto, color, giro) y objetos.
- El saneamiento limita textos, colores y coordenadas antes de guardar.

---

## RF-MAP · Mapa táctico

### RF-MAP-01 · Estado y fondo

- `GET /api/mesas/:id/mapa` devuelve fondo, rejilla, tokens, plantillas, trazos,
  áreas e iniciativa.
- `PUT /api/mesas/:id/mapa/fondo` guarda fondo y rejilla. Solo máster
  (anfitrión o administrador).

### RF-MAP-02 · Iniciativa

- `PUT /api/mesas/:id/mapa/iniciativa` guarda la iniciativa. Solo máster.
- `POST /api/mesas/:id/mapa/iniciativa/siguiente` avanza el turno. Puede
  hacerlo el máster o el dueño del token actual si no es un monstruo.

### RF-MAP-03 · Tokens

- Cualquier miembro puede crear tokens.
- Solo el máster puede crear o marcar tokens como monstruo.
- El dueño del token o el máster pueden moverlo, editarlo o borrarlo.
- Las plantillas se pueden guardar, editar y borrar con la misma regla de
  propiedad o máster.

### RF-MAP-04 · Trazos y congelación

- Cualquier miembro puede añadir trazos mientras el dibujo no esté congelado.
- El dueño del trazo o el máster pueden borrarlo; solo el máster puede borrar
  todos.
- Solo el máster puede congelar o descongelar el dibujo.

### RF-MAP-05 · Áreas

- Cualquier miembro puede crear áreas.
- Solo el autor del área o el máster pueden editarla o borrarla.

### RF-MAP-06 · Sincronización

- Cada cambio se guarda y se difunde como `mesa:mapa-actualizado` a todos los
  miembros.

> **Nota:** en el mapa, “máster” incluye al anfitrión **y a cualquier
> administrador**, aunque sea jugador. Es una inconsistencia conocida con
> RF-MES-12.

---

## RF-MUS · Música

### RF-MUS-01 · Control del máster

- El máster puede añadir pistas de audio, elegir pista, reproducir/pausar,
  activar bucle o aleatorio y ajustar el volumen.
- Solo se aceptan archivos de tipo audio.
- El estado se guarda en la mesa y se difunde a los miembros.

### RF-MUS-02 · Sincronización entre pestañas

- El avance automático incluye `indiceEsperado`.
- Si el índice guardado ya no coincide, el servidor ignora el aviso y devuelve
  el estado actual, evitando saltos de canción.

---

## RF-MAC · Macros

- Cada usuario puede guardar sus macros de tirada.
- Son personales, no de mesa.
- Se sanean al guardar y se devuelven al consultarlas.

---

## RF-ADM · Moderación

### RF-ADM-01 · Acceso

- La vista de moderación solo está disponible para `ADMIN`.
- El backend refuerza el rol con `requireAdmin` en las rutas de usuarios.

### RF-ADM-02 · Gestión de usuarios

- Listar usuarios no borrados.
- Consultar si un usuario está activo.
- Borrar cualquier cuenta.
- No hay endpoint para aprobar o rechazar cuentas manualmente: la activación
  es por verificación de correo. El estado `REJECTED` existe en el modelo y
  bloquea el login si se fija en la base de datos.

### RF-ADM-03 · Gestión de mesas

- Cerrar cualquier mesa.
- Expulsar jugadores de mesas ajenas mientras el administrador no sea jugador.
- Ceder el mando en mesas ajenas en las mismas condiciones.
- Cambiar divisas y música de mesas ajenas en las mismas condiciones.
- La interfaz oculta o bloquea la gestión de mesas donde el administrador está
  vetado.

---

## RF-UI · Interfaz

### RF-UI-01 · Vistas

- `recepcion`: cuadrícula de mesas, búsqueda y creación.
- `cuenta`: datos del usuario, nickname y archivos personales.
- `moderar`: administración de usuarios y mesas (solo admin).
- `gestion`: preview y gestión de una mesa antes de empezar.
- `sala`: sala de juego.

### RF-UI-02 · Modo preview

- La aplicación puede abrirse con `?preview=1` para mostrar el prototipo sin
  depender de una partida real.

### RF-UI-03 · Música de hoguera

- `/BucleLobby.wav` suena en `recepcion`, en `gestion` (preview de mesa) y en
  `moderar`.
- No suena en `sala`, ni en `cuenta`, ni en login/registro/verificación.
- La música de ambiente de la partida es independiente y la controla el máster.

### RF-UI-04 · Errores

- Los errores de API se muestran con `describeError` y `ApiError.code`.
- Los códigos estables permiten mensajes específicos sin depender del texto del
  servidor.
