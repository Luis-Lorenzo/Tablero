import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryUserRepository,
  type User
} from "../src/repositories/user.repository.js";
import { UserService } from "../src/services/user.service.js";

describe("UserService", () => {
  let service: UserService;
  let admin: User;
  let normalUser: User;

  beforeEach(async () => {
    const repository = new MemoryUserRepository();
    service = new UserService(repository);

    admin = {
      id: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      emailConfirmed: true,
      deleted: false
    };

    normalUser = {
      id: "user-1",
      email: "user@example.com",
      role: "USER",
      emailConfirmed: false,
      deleted: false
    };

    await repository.save(admin);
    await repository.save(normalUser);
  });

  it("registra un usuario con email normalizado", async () => {
    const user = await service.register("  Nuevo@Example.com ");

    expect(user.email).toBe("nuevo@example.com");
    expect(user.role).toBe("USER");
    expect(user.emailConfirmed).toBe(false);
  });

  it("rechaza un email que ya existe", async () => {
    await expect(
      service.register("USER@example.com")
    ).rejects.toThrow("EMAIL_EXISTS");
  });

  it("rechaza un email inválido", async () => {
    await expect(
      service.register("esto-no-es-un-email")
    ).rejects.toThrow("INVALID_EMAIL");
  });

  it("impide a un usuario normal listar usuarios", async () => {
    await expect(
      service.listUsers(normalUser)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("impide a un usuario borrar a otro", async () => {
    await expect(
      service.deleteUser(normalUser, admin.id)
    ).rejects.toThrow("FORBIDDEN");
  });

  it("permite al administrador listar usuarios no eliminados", async () => {
    const users = await service.listUsers(admin);

    expect(users).toHaveLength(2);
  });

  it("un usuario sin confirmar no está activo", async () => {
    expect(await service.isActive(admin, normalUser.id)).toBe(false);
  });
});
