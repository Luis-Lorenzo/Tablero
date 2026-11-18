# Modelo de datos

> Verificado el 18/11/2026. Fuente: `db/schema.sql` y los repositorios
> PostgreSQL. El esquema se aplica al arrancar y es idempotente.

## 1. Visión general

```
users ──────────────┬──► user_macros
  │                 │
  │ host_id         │ owner_id
  ▼                 ▼
mesas ───────────► archivos
  │  │  │  │  │
  │  │  │  │  └──► mesa_jugador_estado   (estado personal por mesa)
  │  │  │  └─────► chat_mensajes
  │  │  └────────► transferencias
  │  └───────────► mesa_pizarra_estado
  └──────────────► mesa_mapa_estado
```

- `users` y `mesas` son las entidades centrales.
- Las tablas de estado de sala (`mesa_pizarra_estado`, `mesa_mapa_estado`,
  `mesa_jugador_estado`) guardan **JSONB** y se borran en cascada con la mesa.
- `archivos` guarda solo metadatos; los bytes están en R2.
- `mesa_jugadores` guarda color y apodo por jugador; la pertenencia real está en
  `mesas.players`.

## 2. `users`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK | Generado por la aplicación. |
| `email` | `TEXT` | Único sin distinguir mayúsculas (`lower(email)`). |
| `password_hash` | `TEXT` | bcrypt. Puede ser `NULL` en cuentas creadas por seed. |
| `role` | `TEXT` | `USER` o `ADMIN`; por defecto `USER`. |
| `status` | `TEXT` | `PENDING`, `ACTIVE` o `REJECTED`; por defecto `PENDING`. |
| `deleted` | `BOOLEAN` | Borrado lógico; por defecto `FALSE`. |
| `created_at` | `TIMESTAMPTZ` | Alta. |
| `failed_login_at` | `TIMESTAMPTZ[]` | Hasta 5 fallos recientes. |
| `blocked` | `BOOLEAN` | Indicador manual de bloqueo. |
| `locked_until` | `TIMESTAMPTZ` | Caducidad automática del bloqueo. |
| `nickname` | `TEXT` | Nombre visible opcional. |
| `email_verified` | `BOOLEAN` | Verificación de correo. |
| `verification_token_hash` | `TEXT` | SHA-256 del token; nunca el token en claro. |
| `verification_expires_at` | `TIMESTAMPTZ` | Caducidad del enlace. |
| `verification_sent_at` | `TIMESTAMPTZ` | Para limitar reenvíos. |

Índices:

- `users_email_unique` sobre `lower(email)`.
- `users_nickname_unique` sobre `lower(nickname)` donde `nickname IS NOT NULL
  AND deleted = FALSE`.
- `users_verification_token_hash_idx` parcial sobre el hash no nulo.

Reglas:

- Una cuenta `PENDING` no puede iniciar sesión aunque la contraseña sea correcta.
- `REJECTED` bloquea el login.
- `deleted = TRUE` impide autenticarse y libera el nickname, pero mantiene el
  registro y la unicidad del email.
- La migración marca `email_verified = TRUE` para cuentas `ACTIVE` anteriores a
  la verificación, para no bloquear a usuarios existentes.

## 3. `mesas`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK | |
| `host_id` | `UUID` | Anfitrión/máster. |
| `players` | `UUID[]` | Jugadores; máximo 6. |
| `created_at` | `TIMESTAMPTZ` | Orden de la recepción. |
| `expulsados` | `UUID[]` | Vetados; no pueden volver a unirse. |
| `pending_host_id` | `UUID` | Cesión de mando pendiente de aceptar. |
| `estado` | `TEXT` | `ESPERA` o `EN_CURSO`. |
| `imagen_escena_id` / `imagen_escena_titulo` | `UUID` / `TEXT` | Imagen de la pizarra de pared. |
| `imagen_proyectada_id` / `imagen_proyectada_titulo` | `UUID` / `TEXT` | Imagen en primer plano. |
| `divisa_nombre` | `TEXT` | Nombre de la divisa principal; por defecto `Divisa`. |
| `divisas_config` | `JSONB` | Hasta 12 divisas `{ id, nombre, color }`. |
| `musica_ambiente` | `JSONB` | Playlist y estado del reproductor. |

Índices:

- `mesas_created_at_idx`, `mesas_host_idx`.
- `mesas_pending_host_idx` parcial.
- `mesas_players_gin_idx` GIN sobre `players`.

Reglas:

- Un usuario solo puede ser anfitrión de una mesa (se comprueba en el servicio).
- La pertenencia como jugador está en `players`; la tabla `mesa_jugadores` no
  guarda la lista, solo los atributos por jugador.
- Al cerrar la mesa se borran en cascada sus estados, chat y transferencias, y
  se limpian sus archivos.

## 4. `mesa_jugadores`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `mesa_id` | `UUID` | FK a `mesas(id)` con `ON DELETE CASCADE`. |
| `user_id` | `UUID` | |
| `color` | `TEXT` | Color personal en la mesa. |
| `apodo` | `TEXT` | Apodo personal (máx. 24). |

Clave primaria compuesta `(mesa_id, user_id)`. El repositorio PostgreSQL
reconstruye los mapas `colores` y `apodos` desde aquí al leer una mesa.

## 5. `archivos`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK | |
| `owner_id` | `UUID` | Propietario. |
| `mesa_id` | `UUID` | Mesa asociada, opcional; `ON DELETE SET NULL`. |
| `nombre` | `TEXT` | Nombre limpio para mostrar. |
| `clave` | `TEXT` | Clave del objeto en R2. |
| `tipo` | `TEXT` | MIME normalizado. |
| `tamano` | `BIGINT` | Bytes. |
| `created_at` | `TIMESTAMPTZ` | |

Índices: `archivos_owner_idx (owner_id, created_at DESC)`,
`archivos_clave_idx (clave)`, `archivos_mesa_idx` parcial.

Reglas:

- Los bytes no están en la base de datos.
- Varios registros pueden compartir la misma `clave` (archivo compartido por
  referencia). El objeto de R2 se borra solo cuando no queda ninguna referencia.
- La lectura se autoriza por propietario, administrador o pertenencia a una mesa
  relacionada (ver RNF-03).

## 6. `mesa_jugador_estado`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `mesa_id` | `UUID` | FK con `ON DELETE CASCADE`. |
| `user_id` | `UUID` | |
| `elementos` | `JSONB` | Elementos colocados/archivados por el jugador. |
| `divisa` | `BIGINT` | Saldo de la divisa principal. |
| `divisas_saldos` | `JSONB` | `{ [divisaId]: número }`. |
| `mochila` | `JSONB` | Array de objetos. |
| `updated_at` | `TIMESTAMPTZ` | |

Clave primaria `(mesa_id, user_id)`. Aísla el estado personal por mesa.

Forma de un objeto de mochila:

```json
{
  "id": "uuid",
  "nombre": "Antorcha",
  "descripcion": "Dura una hora",
  "cantidad": 1,
  "emoji": "🔥",
  "archivoId": "uuid-opcional",
  "archivoNombre": "antorcha.png"
}
```

## 7. `chat_mensajes`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK | |
| `mesa_id` | `UUID` | FK con `ON DELETE CASCADE`. |
| `autor_id` | `UUID` | |
| `autor_nombre` | `TEXT` | Nombre visible congelado en el momento del envío. |
| `texto` | `TEXT` | Máximo 500 caracteres. |
| `destinatario_id` | `UUID` | `NULL` = público; si no, susurro. |
| `destinatario_nombre` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | |

Índice `chat_mensajes_mesa_created_idx (mesa_id, created_at DESC)`. Se
conservan los 100 mensajes más recientes por mesa.

## 8. `transferencias`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK | |
| `mesa_id` | `UUID` | FK con `ON DELETE CASCADE`. |
| `emisor_id` | `UUID` | |
| `emisor_nombre` | `TEXT` | |
| `receptor_id` | `UUID` | |
| `tipo` | `TEXT` | `posit`, `archivo` u `objeto`. |
| `payload` | `JSONB` | Contenido según el tipo. |
| `created_at` | `TIMESTAMPTZ` | |

Índice `transferencias_mesa_receptor_idx (mesa_id, receptor_id, created_at
ASC)`.

Formas de `payload`:

```json
{ "texto": "...", "color": "#f7ffae", "giro": 0 }
{ "archivo": { "id": "...", "nombre": "...", "tipo": "...", "vista": "...", "tamano": 123 } }
{ "objeto": { "idOrigen": "...", "nombre": "...", "descripcion": "...", "cantidad": 1 } }
```

Las transferencias son **pendientes**: se borran al aceptar o rechazar.

## 9. `mesa_pizarra_estado`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `mesa_id` | `UUID` PK | FK con `ON DELETE CASCADE`. |
| `datos` | `JSONB` | Estado completo. |
| `updated_at` | `TIMESTAMPTZ` | |

Forma de `datos`:

```json
{
  "posits": [],
  "trazos": [],
  "documentos": [],
  "trazosEscena": [],
  "positsEscena": [],
  "docsEscena": [],
  "tamanoImagenesEscena": { "archivoId": { "w": 1920, "h": 1080 } },
  "congelada": false,
  "objetos": []
}
```

`posits` y `objetos` son arrays de objetos con forma libre saneada por el
servidor. `congelada` solo lo puede cambiar el anfitrión.

## 10. `mesa_mapa_estado`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `mesa_id` | `UUID` PK | FK con `ON DELETE CASCADE`. |
| `datos` | `JSONB` | Estado completo. |
| `updated_at` | `TIMESTAMPTZ` | |

Forma de `datos`:

```json
{
  "fondo": { "archivoId": "...", "url": "...", "titulo": "...", "anchoNatural": 0, "altoNatural": 0 },
  "rejilla": {
    "visible": true, "columnas": 24, "filas": 16, "filasAuto": true,
    "offsetX": 0, "offsetY": 0, "color": "#e8c56a", "opacidad": 0.35,
    "imanActivo": true
  },
  "tokens": [],
  "plantillas": [],
  "iniciativa": {
    "activa": false, "ronda": 1, "turnoIndice": 0, "entradas": []
  },
  "trazos": [],
  "areas": [],
  "dibujoCongelado": false
}
```

Entidades internas:

- **Token:** id, nombre, archivo/imagen, posición `x`/`y`, tamaño en celdas,
  escala, autor, color y `esMonstruo`/`enLimbo`.
- **Plantilla:** igual que un token, más `categoria`.
- **Iniciativa:** `activa`, `ronda`, `turnoIndice` y entradas con nombre, valor,
  color, `esMonstruo`, `jugadorId` y `tokenId`.
- **Trazo:** color, grosor, puntos y autor.
- **Área:** tipo `circulo` o `cono`, posición, celdas, ángulo, color y autor.

## 11. `user_macros`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `user_id` | `UUID` PK | FK a `users(id)` con `ON DELETE CASCADE`. |
| `macros` | `JSONB` | Array saneado de macros personales. |
| `updated_at` | `TIMESTAMPTZ` | |

## 12. Sesiones

La tabla de sesiones **no** se define en `db/schema.sql`: la crea
`connect-pg-simple` con `createTableIfMissing: true`. Express y el WebSocket
comparten el mismo almacén.

## 13. Reglas de evolución del esquema

1. Añadir columnas con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
2. Mantener el esquema idempotente: debe poder aplicarse sobre una base vacía y
   sobre una base antigua.
3. Actualizar las dos implementaciones de repositorio (memoria y PostgreSQL).
4. Actualizar este documento y las pruebas.
5. Los cambios de forma en JSONB no requieren migración de columnas, pero sí
   saneamiento compatible con documentos antiguos.
6. No borrar columnas a la ligera: una base existente puede necesitarlas.
