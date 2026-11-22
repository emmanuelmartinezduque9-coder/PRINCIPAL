import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { getPool, getSetting, setSetting } from "@/db/client";
import { truncateAll } from "./helpers/global-setup";

describe("base y salud", () => {
  beforeEach(truncateAll);

  it("la base de datos de pruebas responde y tiene la tabla settings", async () => {
    const { rows } = await getPool().query("select to_regclass('public.settings') as t");
    expect(rows[0].t).toBe("settings");
  });

  it("getSetting devuelve null si no existe y el valor guardado si existe", async () => {
    expect(await getSetting("x")).toBeNull();
    await setSetting("x", { a: 1 });
    expect(await getSetting("x")).toEqual({ a: 1 });
  });

  it("setSetting sustituye el valor anterior", async () => {
    await setSetting("x", { a: 1 });
    await setSetting("x", { a: 2 });
    expect(await getSetting("x")).toEqual({ a: 2 });
  });

  it("GET /api/health responde ok con la versión", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, version: "local" });
  });
});
