import { createContainer } from "./container.js";
import { logger } from "./lib/logger.js";

const port = Number(process.env.PORT) || 8080;

const { app } = await createContainer();

app.listen(port, "0.0.0.0", () => {
  logger.info("Servidor iniciado", { port });
});
