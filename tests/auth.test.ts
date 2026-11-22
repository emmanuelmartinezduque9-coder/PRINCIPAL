import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db/client";
import {
  acceptInvite,
  createInvite,
  getActiveUser,
  getActiveUserByEmail,
  getSessionUser,
  hashPassword,
  login,
  logout,
  resetLoginAttempts,
  verifyPassword,
} from "@/server/auth";
import { eq } from "drizzle-orm";
import { truncateAll } from "./helpers/global-setup";
import { makeUser } from "./helpers/fixtures";

const PASSWORD = "una-clave-larga-de-prueba";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
});

/** Persona con cuenta activa. */
async function person(email = "ana@example.com", name = "Ana") {
  const { token } = await createInvite(email, name);
  return acceptInvite(token, PASSWORD);
}

describe("contraseñas", () => {
  it("acepta la contraseña correcta y rechaza las demás", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}x`, stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("no guarda la contraseña ni da el mismo resultado dos veces", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).not.toContain(PASSWORD);
    expect(a).not.toBe(b);
  });

  it("rechaza un valor guardado que no reconoce", async () => {
    expect(await verifyPassword(PASSWORD, "no-es-un-hash")).toBe(false);
  });
});

describe("invitaciones", () => {
  it("crea la cuenta cuando la persona elige su contraseña con el enlace", async () => {
    const { token } = await createInvite("Ana@Example.com ", "Ana");
    const user = await acceptInvite(token, PASSWORD);
    expect(user).toMatchObject({ email: "ana@example.com", name: "Ana" });
    expect(await login("ana@example.com", PASSWORD)).not.toBeNull();
  });

  it("el enlace solo sirve una vez", async () => {
    const { token } = await createInvite("ana@example.com", "Ana");
    await acceptInvite(token, PASSWORD);
    await expect(acceptInvite(token, "otra-clave-larga-distinta")).rejects.toThrow(/enlace/i);
  });

  it("el enlace caduca", async () => {
    const { token } = await createInvite("ana@example.com", "Ana", { now: new Date(Date.now() - 8 * DAY) });
    await expect(acceptInvite(token, PASSWORD)).rejects.toThrow(/caducado/i);
  });

  it("rechaza un enlace inventado", async () => {
    await expect(acceptInvite("no-existe", PASSWORD)).rejects.toThrow(/enlace/i);
  });

  it("exige una contraseña de al menos 10 caracteres", async () => {
    const { token } = await createInvite("ana@example.com", "Ana");
    await expect(acceptInvite(token, "corta")).rejects.toThrow(/10 caracteres/);
    // El enlace sigue valiendo tras el intento fallido.
    await expect(acceptInvite(token, PASSWORD)).resolves.toMatchObject({ email: "ana@example.com" });
  });

  it("un enlace nuevo para alguien que ya tiene cuenta le permite cambiar la contraseña", async () => {
    await person();
    const { token } = await createInvite("ana@example.com", "Ana");
    await acceptInvite(token, "contraseña-nueva-larga");
    expect(await login("ana@example.com", PASSWORD)).toBeNull();
    expect(await login("ana@example.com", "contraseña-nueva-larga")).not.toBeNull();
    expect(await getDb().select().from(schema.users)).toHaveLength(1);
  });

  it("la invitación crea la cuenta con el papel de la invitación", async () => {
    const { token } = await createInvite("ana@example.com", "Ana"); // por defecto colaborador
    expect((await acceptInvite(token, PASSWORD)).role).toBe("colaborador");
    const { token: owner } = await createInvite("jefe@example.com", "Jefe", { role: "dueno" });
    expect((await acceptInvite(owner, PASSWORD)).role).toBe("dueno");
  });

  it("una invitación nueva a una cuenta existente cambia la contraseña pero NO el papel", async () => {
    await makeUser("dueno", { email: "jefe@example.com" });
    const { token } = await createInvite("jefe@example.com", "Jefe", { role: "colaborador" });
    expect((await acceptInvite(token, PASSWORD)).role).toBe("dueno");
  });

  it("un enlace usado no vale por segunda vez", async () => {
    const { token } = await createInvite("ana@example.com", "Ana");
    await acceptInvite(token, PASSWORD);
    await expect(acceptInvite(token, PASSWORD)).rejects.toThrow(/ya se ha usado/);
  });

  it("dos usos simultáneos del mismo enlace: solo uno vale", async () => {
    const { token } = await createInvite("ana@example.com", "Ana");
    const results = await Promise.allSettled([acceptInvite(token, PASSWORD), acceptInvite(token, PASSWORD)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("guarda quién invitó", async () => {
    const jefe = await makeUser("dueno");
    await createInvite("ana@example.com", "Ana", { invitedBy: jefe.id });
    const [row] = await getDb().select().from(schema.invites).where(eq(schema.invites.email, "ana@example.com"));
    expect(row.invitedBy).toBe(jefe.id);
  });

  it("no guarda el enlace en claro", async () => {
    const { token } = await createInvite("ana@example.com", "Ana");
    const rows = await getDb().select().from(schema.invites);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("rechaza un correo que no lo es", async () => {
    await expect(createInvite("no-es-un-correo", "X")).rejects.toThrow(/correo/i);
  });
});

describe("sesiones", () => {
  it("da una sesión con la contraseña correcta y reconoce a la persona", async () => {
    await person();
    const session = await login("ANA@example.com", PASSWORD);
    expect(session).not.toBeNull();
    expect(await getSessionUser(session!.token)).toMatchObject({ email: "ana@example.com", name: "Ana" });
  });

  it("no da sesión con contraseña equivocada ni a un correo desconocido", async () => {
    await person();
    expect(await login("ana@example.com", "equivocada-equivocada")).toBeNull();
    expect(await login("nadie@example.com", PASSWORD)).toBeNull();
  });

  it("una sesión inventada no es de nadie", async () => {
    expect(await getSessionUser("inventada")).toBeNull();
    expect(await getSessionUser("")).toBeNull();
  });

  it("la sesión caduca a los 30 días sin uso", async () => {
    await person();
    const session = await login("ana@example.com", PASSWORD);
    expect(await getSessionUser(session!.token, new Date(Date.now() + 29 * DAY))).not.toBeNull();
    // Ese uso la prolonga otros 30 días…
    expect(await getSessionUser(session!.token, new Date(Date.now() + 58 * DAY))).not.toBeNull();
    // …pero sin uso durante más de 30, caduca.
    expect(await getSessionUser(session!.token, new Date(Date.now() + 90 * DAY))).toBeNull();
  });

  it("cerrar sesión la invalida", async () => {
    await person();
    const session = await login("ana@example.com", PASSWORD);
    await logout(session!.token);
    expect(await getSessionUser(session!.token)).toBeNull();
  });

  it("no guarda la sesión en claro", async () => {
    await person();
    const session = await login("ana@example.com", PASSWORD);
    const rows = await getDb().select().from(schema.sessions);
    expect(JSON.stringify(rows)).not.toContain(session!.token);
  });

  it("cambiar la contraseña cierra las sesiones anteriores", async () => {
    await person();
    const session = await login("ana@example.com", PASSWORD);
    const { token } = await createInvite("ana@example.com", "Ana");
    await acceptInvite(token, "contraseña-nueva-larga");
    expect(await getSessionUser(session!.token)).toBeNull();
  });
});

describe("cuentas desactivadas", () => {
  it("no pueden entrar y sus sesiones dejan de valer", async () => {
    const ana = await person();
    const { token } = (await login("ana@example.com", PASSWORD))!;
    await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
    expect(await getSessionUser(token)).toBeNull();
    expect(await login("ana@example.com", PASSWORD)).toBeNull();
  });
});

describe("persona activa por su id (trabajos en segundo plano, sin sesión)", () => {
  it("devuelve a la persona si su cuenta está activa, sea colaborador o dueño", async () => {
    const ana = await person();
    const dueno = await makeUser("dueno");
    expect(await getActiveUser(ana.id)).toEqual(ana);
    expect(await getActiveUser(dueno.id)).toMatchObject({ id: dueno.id, role: "dueno" });
  });

  it("no devuelve a nadie si la cuenta está desactivada, también si es la del dueño", async () => {
    const ana = await person();
    const dueno = await makeUser("dueno");
    await getDb().update(schema.users).set({ disabledAt: new Date() });
    expect(await getActiveUser(ana.id)).toBeNull();
    expect(await getActiveUser(dueno.id)).toBeNull();
  });

  it("no devuelve a nadie para un id que no existe o no es un id", async () => {
    for (const id of [999_999, -1, 1.5, Number.NaN]) expect(await getActiveUser(id)).toBeNull();
  });

  it("el dueño del propio ordenador (id 0) solo existe con el inicio de sesión apagado", async () => {
    expect(await getActiveUser(0)).toBeNull();
    process.env.PRINCIPAL_AUTH = "off";
    try {
      expect(await getActiveUser(0)).toMatchObject({ id: 0, role: "dueno" });
    } finally {
      delete process.env.PRINCIPAL_AUTH;
    }
  });
});

describe("persona activa por su correo (importador)", () => {
  it("la encuentra sin distinguir mayúsculas ni espacios; desactivada o desconocida, nadie", async () => {
    const dueno = await makeUser("dueno", { email: "jefe@example.com" });
    expect(await getActiveUserByEmail("  JEFE@Example.com ")).toEqual(dueno);
    expect(await getActiveUserByEmail("otro@example.com")).toBeNull();
    expect(await getActiveUserByEmail("")).toBeNull();
    await getDb().update(schema.users).set({ disabledAt: new Date() });
    expect(await getActiveUserByEmail("jefe@example.com")).toBeNull();
  });
});

describe("invitación a una cuenta desactivada", () => {
  it("no la reactiva, avisa con claridad y no gasta el enlace", async () => {
    const ana = await person();
    await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
    const { token } = await createInvite("ana@example.com", "Ana");
    await expect(acceptInvite(token, "contraseña-nueva-larga")).rejects.toThrow(/desactivada/);
    const rows = await getDb().select().from(schema.invites).where(eq(schema.invites.email, "ana@example.com"));
    expect(rows.filter((r) => r.usedAt === null)).toHaveLength(1); // la nueva sigue sin gastar
    expect(await login("ana@example.com", PASSWORD)).toBeNull();
    expect(await login("ana@example.com", "contraseña-nueva-larga")).toBeNull();
  });
});

describe("intentos fallidos", () => {
  it("tras diez fallos seguidos bloquea ese correo un cuarto de hora, aunque la contraseña sea buena", async () => {
    await person();
    const start = new Date("2026-11-21T10:00:00Z");
    for (let i = 0; i < 10; i++) {
      expect(await login("ana@example.com", "equivocada-equivocada", start)).toBeNull();
    }
    expect(await login("ana@example.com", PASSWORD, new Date(start.getTime() + 60_000))).toBeNull();
    expect(await login("ana@example.com", PASSWORD, new Date(start.getTime() + 16 * 60_000))).not.toBeNull();
  });

  it("doce intentos fallidos a la vez también bloquean", async () => {
    await person();
    const now = new Date("2026-11-21T10:00:00Z");
    await Promise.all(Array.from({ length: 12 }, () => login("ana@example.com", "equivocada-equivocada", now)));
    expect(await login("ana@example.com", PASSWORD, now)).toBeNull();
  });

  it("rechaza entradas desmesuradas", async () => {
    await person();
    expect(await login("ana@example.com", "x".repeat(201))).toBeNull();
    expect(await login(`${"a".repeat(250)}@example.com`, PASSWORD)).toBeNull();
    const { token } = await createInvite("luz@example.com", "Luz");
    await expect(acceptInvite(token, "x".repeat(201))).rejects.toThrow(/200 caracteres/);
    await expect(createInvite(`${"a".repeat(250)}@example.com`, "X")).rejects.toThrow(/correo/i);
  });

  it("los fallos de un correo no bloquean a otra persona", async () => {
    await person();
    await person("luz@example.com", "Luz");
    const now = new Date("2026-11-21T10:00:00Z");
    for (let i = 0; i < 10; i++) await login("ana@example.com", "equivocada-equivocada", now);
    expect(await login("luz@example.com", PASSWORD, now)).not.toBeNull();
  });
});
