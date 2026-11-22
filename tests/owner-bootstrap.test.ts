import { beforeEach, describe, expect, it } from "vitest";
import { acceptInvite } from "@/server/auth";
import { ensureOwnerInvite } from "@/db/seed";
import { getDb, schema } from "@/db/client";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

beforeEach(truncateAll);

describe("invitación del dueño al arrancar", () => {
  it("sin cuentas y con OWNER_EMAIL crea una única invitación de dueño", async () => {
    const link = await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com", PUBLIC_URL: "https://x.up.railway.app" });
    expect(link).toMatch(/^https:\/\/x\.up\.railway\.app\/activar\?token=/);
    expect(await getDb().select().from(schema.invites)).toHaveLength(1);
  });

  it("mientras nadie la use, cada arranque da un enlace nuevo y deja una sola invitación", async () => {
    const env = { OWNER_EMAIL: "jefe@example.com", PUBLIC_URL: "https://x.test" };
    const first = (await ensureOwnerInvite(env))!;
    const second = (await ensureOwnerInvite(env))!;
    expect(second).not.toBe(first);
    expect(await getDb().select().from(schema.invites)).toHaveLength(1);
    await expect(acceptInvite(new URL(first).searchParams.get("token")!, "una-clave-larga-de-prueba")).rejects.toThrow(/enlace/);
    await expect(acceptInvite(new URL(second).searchParams.get("token")!, "una-clave-larga-de-prueba")).resolves.toMatchObject({ role: "dueno" });
  });

  it("dos arranques a la vez no dejan dos invitaciones", async () => {
    const env = { OWNER_EMAIL: "jefe@example.com" };
    await Promise.all([ensureOwnerInvite(env), ensureOwnerInvite(env), ensureOwnerInvite(env)]);
    expect(await getDb().select().from(schema.invites)).toHaveLength(1);
  });

  it("el enlace crea la cuenta del dueño", async () => {
    const link = (await ensureOwnerInvite({ OWNER_EMAIL: "Jefe@Example.com", PUBLIC_URL: "https://x.test/" }))!;
    expect(link.startsWith("https://x.test/activar?token=")).toBe(true);
    const user = await acceptInvite(new URL(link).searchParams.get("token")!, "una-clave-larga-de-prueba");
    expect(user).toMatchObject({ email: "jefe@example.com", role: "dueno" });
  });

  it("si ya existe alguna cuenta no crea nada", async () => {
    await makeUser("colaborador");
    expect(await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" })).toBeNull();
    expect(await getDb().select().from(schema.invites)).toHaveLength(1); // solo la de makeUser
  });

  it("sin OWNER_EMAIL no crea nada", async () => {
    expect(await ensureOwnerInvite({})).toBeNull();
    expect(await getDb().select().from(schema.invites)).toHaveLength(0);
  });

  it("si la invitación pendiente caducó, la sustituye", async () => {
    await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" }, new Date(Date.now() - 8 * 24 * 3600 * 1000));
    expect(await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" })).not.toBeNull();
    expect(await getDb().select().from(schema.invites)).toHaveLength(1);
  });
});
