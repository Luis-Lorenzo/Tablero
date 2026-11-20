# Documentación de POCKET ROL

Documentación técnica y de producto del repositorio **Tablero**. Está pensada
para que cualquiera (persona o agente) pueda entender qué hace el sistema, por
qué se tomaron ciertas decisiones y qué se puede exigir de él sin tener que
leer todo el código.

> **Estado verificado:** 18/11/2026 · rama `fallos-en-vivo` · commit `bb26771` ·
> 119 pruebas en 17 archivos.

## La fuente de verdad es el repositorio

Este repositorio manda. Si un documento de esta carpeta no coincide con el
código, el código tiene razón y el documento debe corregirse. Lo mismo vale para
los textos externos del escritorio: son fotografías históricas del proyecto, no
especificaciones vigentes.

## Documentos de esta carpeta

| Documento | Qué contiene | Cuándo leerlo |
| --- | --- | --- |
| [arquitectura.md](arquitectura.md) | Vista general, capas, flujos, API HTTP, tiempo real, despliegue y estructura de carpetas. | Para orientarte antes de tocar código. |
| [decisiones-arquitectura.md](decisiones-arquitectura.md) | Decisiones de arquitectura (ADR) con contexto, decisión y consecuencias. | Para saber **por qué** algo está hecho así y qué se descartó. |
| [requisitos-funcionales.md](requisitos-funcionales.md) | Comportamiento observable: cuentas, mesas, sala, archivos, pizarra, mapa, chat, música y administración. | Para implementar, probar o validar una función. |
| [requisitos-no-funcionales.md](requisitos-no-funcionales.md) | Seguridad, rendimiento, límites, fiabilidad, mantenibilidad, CI/CD y privacidad. | Para revisar calidad, despliegue o riesgos. |
| [modelo-datos.md](modelo-datos.md) | Tablas, relaciones, campos JSONB y reglas de persistencia. | Para cambiar el esquema o entender el estado guardado. |

## Fuentes externas (leer aparte del proyecto)

Estos dos archivos **no forman parte del repositorio** y no se copian aquí. Se
conservan en el escritorio como documentación histórica y deben leerse por
separado, teniendo en cuenta su fecha:

- **`C:\Users\infol\Desktop\testamento.txt`**
  (`file:///C:/Users/infol/Desktop/testamento.txt`)
  Testamento del proyecto fechado el **2026-11-08** (rama `colores-y-jugadores`,
  commit `54b57a4`). Es el relevo más detallado: reglas de mesas, API, modelo de
  datos, tiempo real, R2, frontend y flujo de trabajo. Útil como contexto
  amplio, pero varias cifras y detalles ya están desfasados.

- **`C:\Users\infol\Desktop\contexto proyecto.txt`**
  (`file:///C:/Users/infol/Desktop/contexto%20proyecto.txt`)
  Contexto del proyecto fechado el **2026-10-16** (`main` en `8f02b3c`, PRs #1 a
  #23). Explica el origen, las tecnologías, el registro, la interfaz y el canal
  en vivo. Es el documento más antiguo de los dos.

### Qué ha cambiado respecto a esos textos

No copies sus cifras sin comprobarlas. Algunos ejemplos de desfase conocidos:

- El número de pruebas ya no es 53: son **119 pruebas en 17 archivos**.
- El límite de subida ya no es 15 MiB: por defecto es **30 MiB**
  (`ARCHIVO_MAX_BYTES`).
- La activación de cuentas ya no se hace “por SQL”: el registro envía un correo
  de verificación con Brevo y la cuenta pasa a `ACTIVE` al confirmarlo.
- La música de hoguera (`/BucleLobby.wav`) suena en la recepción, en la
  preview/gestión de mesa y en moderación; **no** en la sala de juego, ni en
  “Mi cuenta”, ni en login/registro/verificación.
- El veto por expulsión se aplica a **todos**, incluidos administradores.
- Existen la pizarra compartida, el mapa táctico, las divisas, las macros y las
  transferencias entre jugadores, que los textos antiguos no detallan.

## Resumen del sistema en una frase

POCKET ROL es una aplicación web tipo SaaS, con backend Express y frontend
React, que organiza partidas de rol de mesa: recepción de mesas, sala de juego
con escena/pizarra/mapa/archivador, chat y tiradas en tiempo real, archivos
personales en Cloudflare R2 y administración de usuarios y mesas.

## Cómo mantener esta documentación

1. Si cambia un comportamiento observable, actualiza el RF correspondiente.
2. Si cambia un límite, una garantía o el despliegue, actualiza el RNF.
3. Si se toma una decisión estructural nueva, añade un ADR; no reescribas los
   antiguos salvo que la decisión se revierta (márcalo como “Sustituido por”).
4. Si cambia el esquema, actualiza `modelo-datos.md` y `db/schema.sql` a la vez.
5. Los identificadores (`RF-xx`, `RNF-xx`, `ADR-xxx`) son estables: sirven para
   referenciarlos desde incidencias, PRs y pruebas.
