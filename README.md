# Tablero de rol SaaS

Aplicación web en desarrollo para gestionar usuarios y, en futuras
iteraciones, crear espacios de juego de rol con cartas y pizarras.

## Tecnologías

- Node.js y TypeScript: backend tipado.
- Express: API HTTP y servidor del frontend.
- React y Vite: interfaz de usuario.
- Vitest: pruebas automatizadas de la lógica.
- GitHub Actions: integración continua.
- Google Cloud Run: despliegue de la aplicación.

## Requisitos

- Node.js LTS.
- npm.
- Git.

## Ejecutar en local

Instalar dependencias:

    npm install

Iniciar frontend y backend:

    npm run dev

Abrir la dirección que muestre Vite, normalmente
http://localhost:5173.

## Pruebas

Ejecutar todas las pruebas:

    npm test

## Compilación

    npm run build

## Variables de entorno

Consultar `.env.example`. En el hito 1 no se requiere una base de
datos ni credenciales externas.

## Arquitectura

- `client/src`: presentación y cliente HTTP.
- `src/api`: rutas de la API.
- `src/services`: lógica de negocio.
- `src/repositories`: acceso a datos.
- `tests`: pruebas automatizadas.

En el hito 1 los datos se almacenan en memoria y se perderán al
reiniciar el servidor. La persistencia se añadirá en el hito 3.

## Despliegue

La aplicación se desplegará en Google Cloud Run desde GitHub.
Los detalles de la URL pública se añadirán tras configurar el servicio.

## Administrador de revisión

Se documentará el mecanismo seguro de creación de la cuenta de
administrador cuando se implemente la autenticación.
