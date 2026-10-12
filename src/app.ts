import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryUserRepository } from "./repositories/user.repository.js";
import { UserService } from "./services/user.service.js";

const app = express();
app.use(express.json());

const repository = new MemoryUserRepository();
const userService = new UserService(repository);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/users", async (req, res, next) => {
  try {
    const user = await userService.register(req.body.email);
    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      emailConfirmed: user.emailConfirmed
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API_ROUTE_NOT_FOUND" });
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(currentDir, "../client/dist");

app.use(express.static(clientDist));

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use((
  error: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  const message = error instanceof Error ? error.message : "INTERNAL_ERROR";

  if (message === "EMAIL_EXISTS") {
    res.status(409).json({ error: message });
  } else if (message === "INVALID_EMAIL") {
    res.status(400).json({ error: message });
  } else if (message === "FORBIDDEN") {
    res.status(403).json({ error: message });
  } else {
    console.error("Request failed:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export { app };
