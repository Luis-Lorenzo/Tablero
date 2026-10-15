import { describe, expect, test } from "vitest";
import { MemoryMesaRepository } from "../src/repositories/mesa.repository.js";
import { MemoryUserRepository } from "../src/repositories/user.repository.js";
import {
  colocarMesasDelInicio,
  MesaService,
  nombreVisible
} from "../src/services/mesa.service.js";

const logger = { info: () => {}, warn: () => {}, error: () => {} } as any;

function addUser(users: MemoryUserRepository, email: string) {
  const user: any = {
    id: crypto.randomUUID(),
    email,
    passwordHash: "hash",
    role: "USER",
    status: "ACTIVE",
    deleted: false,
    createdAt: new Date(),
    failedLoginAt: [],
    blocked: false,
    lockedUntil: null
  };
  (users as any).users.set(user.id, user);
  return user;
}

describe("mesa.service", () => {
  test("nombreVisible devuelve la parte anterior a la @", () => {
    expect(nombreVisible("javi@gmail.com")).toBe("javi");
    expect(nombreVisible("maria.perez@mail.es")).toBe("maria.perez");
    expect(nombreVisible("solo")).toBe("solo");
  });

  test("colocarMesasDelInicio deja las 4 huecos con las más nuevas al final", () => {
    const m0: any = { id: "1", hostId: "h", players: [], createdAt: new Date("2026-01-01T10:00:00Z") };
    const m1: any = { id: "2", hostId: "h", players: [], createdAt: new Date("2026-01-01T11:00:00Z") };
    const m2: any = { id: "3", hostId: "h", players: [], createdAt: new Date("2026-01-01T12:00:00Z") };
    const m3: any = { id: "4", hostId: "h", players: [], createdAt: new Date("2026-01-01T13:00:00Z") };

    const huecos = colocarMesasDelInicio([m0, m1, m2, m3]);
    expect(huecos.length).toBe(4);
    expect(huecos[0]).toBe(m0);
    expect(huecos[1]).toBe(m1);
    expect(huecos[2]).toBe(m2);
    expect(huecos[3]).toBe(m3);
  });

  test("colocarMesasDelInicio muestra las 4 más recientes y descarta las antiguas", () => {
    const m0: any = { id: "0", hostId: "h", players: [], createdAt: new Date("2026-01-01T00:00:00Z") };
    const m1: any = { id: "1", hostId: "h", players: [], createdAt: new Date("2026-01-01T01:00:00Z") };
    const m2: any = { id: "2", hostId: "h", players: [], createdAt: new Date("2026-01-01T02:00:00Z") };
    const m3: any = { id: "3", hostId: "h", players: [], createdAt: new Date("2026-01-01T03:00:00Z") };
    const m4: any = { id: "4", hostId: "h", players: [], createdAt: new Date("2026-01-01T04:00:00Z") };

    const huecos = colocarMesasDelInicio([m0, m1, m2, m3, m4]);
    expect(huecos.length).toBe(4);
    expect(huecos[0]).toBe(m1);
    expect(huecos[1]).toBe(m2);
    expect(huecos[2]).toBe(m3);
    expect(huecos[3]).toBe(m4);
  });

  test("crear mesa devuelve existente si ya tenía una", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const service = new MesaService(mesas, users, logger as any);
    const u1 = addUser(users, "javi@gmail.com");

    const r1 = await service.crear(u1 as any);
    expect(r1.creada).toBe(true);
    const r2 = await service.crear(u1 as any);
    expect(r2.creada).toBe(false);
    expect(r2.mesa.id).toBe(r1.mesa.id);
  });

  test("unirse añade jugador y llena hasta el máximo", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const service = new MesaService(mesas, users, logger as any);
    const host = addUser(users, "host@test.com");
    const r = await service.crear(host as any);
    const mesaId = r.mesa.id;

    const jugadores = [];
    for (let i = 0; i < 6; i++) {
      const j = addUser(users, `p${i}@test.com`);
      const v = await service.unirse(j as any, mesaId);
      expect(v.id).toBe(mesaId);
      jugadores.push(j);
    }

    const j7 = addUser(users, "p7@test.com");
    await expect(service.unirse(j7 as any, mesaId)).rejects.toThrow("MESA_FULL");
  });

  test("unirse mueve al jugador de otra mesa", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const service = new MesaService(mesas, users, logger as any);
    const h1 = addUser(users, "h1@test.com");
    const h2 = addUser(users, "h2@test.com");
    const p = addUser(users, "p@test.com");

    const m1 = (await service.crear(h1 as any)).mesa;
    const m2 = (await service.crear(h2 as any)).mesa;
    await service.unirse(p as any, m1.id);
    let v1 = await service.listar();
    const m1v = v1.find(x => x.id === m1.id);
    expect(m1v?.players.map(pl => pl.id)).toContain(p.id);

    await service.unirse(p as any, m2.id);
    v1 = await service.listar();
    const m1v2 = v1.find(x => x.id === m1.id);
    const m2v2 = v1.find(x => x.id === m2.id);
    expect(m1v2?.players.map(pl => pl.id)).not.toContain(p.id);
    expect(m2v2?.players.map(pl => pl.id)).toContain(p.id);
  });

  test("cerrar solo permite al anfitrión", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const service = new MesaService(mesas, users, logger as any);
    const h = addUser(users, "h@test.com");
    const otro = addUser(users, "otro@test.com");
    const m = (await service.crear(h as any)).mesa;
    await expect(service.cerrar(otro as any, m.id)).rejects.toThrow("FORBIDDEN");
    await service.cerrar(h as any, m.id);
    await expect(service.unirse(otro as any, m.id)).rejects.toThrow("MESA_NOT_FOUND");
  });

  test("listar filtra por nombre del anfitrión", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const service = new MesaService(mesas, users, logger as any);
    const h1 = addUser(users, "javi@gmail.com");
    const h2 = addUser(users, "malu@mail.com");
    await service.crear(h1 as any);
    await service.crear(h2 as any);
    const res = await service.listar("javi");
    expect(res.length).toBe(1);
    expect(res[0].hostName).toBe("javi");
  });

  test("list con límite devuelve solo las más recientes y en orden ascendente", async () => {
    const mesas = new MemoryMesaRepository();
    for (let i = 0; i < 6; i += 1) {
      await mesas.save({
        id: `m${i}`,
        hostId: "h",
        players: [],
        createdAt: new Date(Date.UTC(2026, 0, 1, i))
      });
    }

    expect((await mesas.list()).map(mesa => mesa.id)).toEqual([
      "m0",
      "m1",
      "m2",
      "m3",
      "m4",
      "m5"
    ]);
    expect((await mesas.list(4)).map(mesa => mesa.id)).toEqual([
      "m2",
      "m3",
      "m4",
      "m5"
    ]);
    expect(await mesas.list(0)).toEqual([]);
  });

  test("inicio muestra las 4 mesas más recientes con el nombre de su anfitrión", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const service = new MesaService(mesas, users, logger as any);

    for (let i = 0; i < 6; i += 1) {
      const host = addUser(users, `host${i}@test.com`);
      await mesas.save({
        id: `m${i}`,
        hostId: host.id,
        players: [],
        createdAt: new Date(Date.UTC(2026, 0, 1, i))
      });
    }

    const huecos = await service.inicio();
    expect(huecos.map(mesa => mesa?.hostName)).toEqual([
      "host2",
      "host3",
      "host4",
      "host5"
    ]);
  });

  test("inicio carga todos los nombres en una sola consulta (sin N+1)", async () => {
    const users = new MemoryUserRepository();
    const mesas = new MemoryMesaRepository();
    const configuracion = new MesaService(mesas, users, logger as any);

    const host = addUser(users, "host@test.com");
    const mesa = (await configuracion.crear(host as any)).mesa;
    for (let i = 0; i < 6; i += 1) {
      const jugador = addUser(users, `p${i}@test.com`);
      await configuracion.unirse(jugador as any, mesa.id);
    }

    let individuales = 0;
    let enLote = 0;
    const vigiladas = {
      findByEmail: (email: string) => users.findByEmail(email),
      findById: (id: string) => {
        individuales += 1;
        return users.findById(id);
      },
      findManyByIds: (ids: readonly string[]) => {
        enLote += 1;
        return users.findManyByIds(ids);
      },
      list: () => users.list(),
      save: (user: any) => users.save(user),
      delete: (id: string) => users.delete(id)
    };

    const service = new MesaService(mesas, vigiladas as any, logger as any);
    const huecos = await service.inicio();

    expect(huecos[3]?.players).toHaveLength(6);
    expect(individuales).toBe(0);
    expect(enLote).toBe(1);
  });
});
