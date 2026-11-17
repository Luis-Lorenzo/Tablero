import http from "node:http";
import { createContainer } from "./container.js";
import { logger } from "./lib/logger.js";

const port = Number(process.env.PORT) || 8080;

const { app, pool, notifier } = await createContainer();

// Express y el canal WebSocket comparten el mismo servidor HTTP (y el mismo
// puerto): REST y tiempo real conviven sin exponer nada nuevo.
const server = http.createServer(app);
notifier.attach(server);

server.listen(port, "0.0.0.0", () => {
  logger.info("Servidor iniciado", { port });
});

function cerrarServidor(signal: string): void {
  logger.info("Cerrando servidor", { signal });
  server.close(() => {
    void pool?.end().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => cerrarServidor("SIGTERM"));
process.on("SIGINT", () => cerrarServidor("SIGINT"));
