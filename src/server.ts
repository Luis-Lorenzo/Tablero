import { app } from "./app.js";

const port = Number(process.env.PORT) || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${port}`);
});
