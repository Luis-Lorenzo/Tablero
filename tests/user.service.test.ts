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
      role: "ADMIN",
      status: "ACTIVE"
    });

    normalUser = createUser({
      email: "user@example.com",
      passwordHash: "hash",
      status: "ACTIVE"
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

  it("un usuario pendiente de aprobación no está activo", async () => {
    const pending = createUser({
      email: "pendiente@example.com",
      passwordHash: "hash"
    });
    await repository.save(pending);

    expect(await service.isActive(admin, pending.id)).toBe(false);
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

  it("guarda un nickname válido", async () => {
    const actualizado = await service.setNickname(normalUser, "Javi_92");
    expect(actualizado.nickname).toBe("Javi_92");

    const stored = await repository.findById(normalUser.id);
    expect(stored?.nickname).toBe("Javi_92");
  });

  it("borra el nickname con null o cadena vacía", async () => {
    await service.setNickname(normalUser, "Javi_92");
    const borrado = await service.setNickname(normalUser, null);
    expect(borrado.nickname).toBeNull();

    await service.setNickname(normalUser, "Otro_1");
    const vacio = await service.setNickname(normalUser, "   ");
    expect(vacio.nickname).toBeNull();
  });

  it("rechaza nicknames que no cumplen las reglas", async () => {
    for (const invalido of ["ab", "a".repeat(21), "1Javi", "Javi-92", "Javi 92", "Javi@"]) {
      await expect(service.setNickname(normalUser, invalido)).rejects.toThrow(
        "INVALID_NICKNAME"
      );
    }
  });

  it("rechaza un nickname ya usado por otro (sin distinguir mayúsculas)", async () => {
    await service.setNickname(admin, "Anfitrion");
    await expect(service.setNickname(normalUser, "anfitrion")).rejects.toThrow(
      "NICKNAME_TAKEN"
    );
  });

  it("permite conservar el propio nickname", async () => {
    await service.setNickname(normalUser, "Javi_92");
    const mismo = await service.setNickname(normalUser, "Javi_92");
    expect(mismo.nickname).toBe("Javi_92");
  });
});
