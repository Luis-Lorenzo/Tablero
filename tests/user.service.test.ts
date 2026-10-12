import { beforeEach, describe, expect, it } from "vitest";
import { logger } from "../src/lib/logger.js";
import {
  createUser,
  MemoryUserRepository,
  type User
} from "../src/repositories/user.repository.js";
import { UserService } from "../src/services/user.service.js";

describe("UserService", () => {
  let service: UserService;
  let repository: MemoryUserRepository;
  let admin: User;
  let normalUser: User;

  beforeEach(async () => {
    repository = new MemoryUserRepository();
    service = new UserService(repository, logger);

    admin = createUser({
      email: "admin@example.com",
      passwordHash: "hash",
      role: "ADMIN"
    });

    normalUser = createUser({
      email: "user@example.com",
      passwordHash: "hash"
    });

    await repository.save(admin);
    await repository.save(normalUser);
  });

  it("permite al administrador listar usuarios no eliminados", async () => {
    const users = await service.listUsers(admin);
    expect(users).toHaveLength(2);
  });

  it("impide a un usuario normal listar usuarios", async () => {
    await expect(service.listUsers(normalUser)).rejects.toThrow("FORBIDDEN");
  });

  it("un usuario no eliminado está activo", async () => {
    expect(await service.isActive(admin, normalUser.id)).toBe(true);
  });

  it("un usuario eliminado no está activo", async () => {
    await service.deleteUser(admin, normalUser.id);

    expect(await service.isActive(admin, normalUser.id)).toBe(false);
  });

  it("impide a un usuario normal listar el estado de actividad de otro", async () => {
    await expect(
      service.isActive(normalUser, admin.id)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("impide a un usuario normal borrar a otro usuario", async () => {
    await expect(
      service.deleteUser(normalUser, admin.id)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("permite a un usuario normal borrar su propia cuenta", async () => {
    await service.deleteUser(normalUser, normalUser.id);

    const stored = await repository.findById(normalUser.id);
    expect(stored?.deleted).toBe(true);
  });

  it("permite al administrador borrar a cualquier usuario", async () => {
    await service.deleteUser(admin, normalUser.id);

    const stored = await repository.findById(normalUser.id);
    expect(stored?.deleted).toBe(true);
  });

  it("rechaza borrar un usuario inexistente", async () => {
    await expect(
      service.deleteUser(admin, "id-inexistente")
    ).rejects.toThrow("USER_NOT_FOUND");
  });
});
