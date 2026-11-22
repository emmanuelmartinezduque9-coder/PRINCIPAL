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
    expect(await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" })).toBeNull(); // ya hay una pendiente
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

  it("si la invitación pendiente caducó, crea otra", async () => {
    await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" }, new Date(Date.now() - 8 * 24 * 3600 * 1000));
    expect(await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" })).not.toBeNull();
  });
});
