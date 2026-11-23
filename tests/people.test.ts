import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/db/client";
import { setAssignments } from "@/server/access";
import { acceptInvite, getSessionUser, login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { readCredential, saveCredential } from "@/server/credentials";
import { invitePerson, listPeople, passwordLink, setPersonDisabled } from "@/server/people";
import { listProductsFor } from "@/server/products";
import { setUserCap } from "@/server/spend";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

// Las rutas leen la cookie de la petición: aquí la fija cada prueba.
let cookieToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "pr_sesion" && cookieToken ? { value: cookieToken } : undefined) }),
}));

const personas = () => import("@/app/api/personas/route");
const persona = () => import("@/app/api/personas/[id]/route");
const productosRoute = () => import("@/app/api/personas/[id]/productos/route");

let dueno: AuthUser;
let ana: AuthUser;

const tokenFrom = (link: string) => new URL(link).searchParams.get("token")!;
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const json = (body: unknown, method = "PUT") =>
  new Request("http://localhost/api/personas", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  cookieToken = undefined;
  dueno = await makeUser("dueno", { name: "Dueña" });
  ana = await makeUser("colaborador", { name: "Ana", email: "ana@example.com" });
});

describe("contraseña nueva para quien ya tiene cuenta", () => {
  it("el dueño crea un enlace de un solo uso: cambia la contraseña, conserva el papel y cierra sus sesiones", async () => {
    const before = await login("ana@example.com", TEST_PASSWORD);
    const { link } = await passwordLink(dueno, ana.id, "https://x.test");
    const nueva = "otra-clave-larga-1234";
    const user = await acceptInvite(tokenFrom(link), nueva);
    expect(user).toMatchObject({ id: ana.id, role: "colaborador" });
    expect(await getSessionUser(before!.token)).toBeNull();
    expect(await login("ana@example.com", nueva)).not.toBeNull();
    await expect(acceptInvite(tokenFrom(link), nueva)).rejects.toThrow(/ya se ha usado/);
  });

  it("solo el dueño, solo personas existentes y activas; un enlace nuevo anula el anterior", async () => {
    await expect(passwordLink(ana, dueno.id, "https://x.test")).rejects.toMatchObject({ status: 403 });
    await expect(passwordLink(dueno, 999999, "https://x.test")).rejects.toMatchObject({ status: 404 });
    const first = await passwordLink(dueno, ana.id, "https://x.test");
    await passwordLink(dueno, ana.id, "https://x.test");
    await expect(acceptInvite(tokenFrom(first.link), "otra-clave-larga-1234")).rejects.toThrow(/ya se ha usado/);
    await setPersonDisabled(dueno, ana.id, true);
    await expect(passwordLink(dueno, ana.id, "https://x.test")).rejects.toMatchObject({ status: 409 });
  });
});

describe("invitar", () => {
  it("devuelve un enlace de un solo uso y la persona entra como colaborador", async () => {
    const { link } = await invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.up.railway.app");
    expect(link).toMatch(/^https:\/\/x\.up\.railway\.app\/activar\?token=/);
    const user = await acceptInvite(tokenFrom(link), TEST_PASSWORD);
    expect(user.role).toBe("colaborador");
    await expect(acceptInvite(tokenFrom(link), TEST_PASSWORD)).rejects.toThrow(/ya se ha usado/);
  });

  it("no guarda el token en claro", async () => {
    const { link } = await invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.test");
    const { rows } = await getPool().query("select * from invites where email = 'bea@example.com'");
    expect(JSON.stringify(rows)).not.toContain(tokenFrom(link));
  });

  it("rechaza un correo con cuenta y un correo mal escrito", async () => {
    await expect(invitePerson(dueno, { email: "ana@example.com", name: "Ana" }, "https://x.test")).rejects.toThrow(
      "Esa persona ya tiene cuenta.",
    );
    await expect(invitePerson(dueno, { email: "nada", name: "X" }, "https://x.test")).rejects.toThrow("Escribe un correo válido.");
  });

  it("invitar dos veces al mismo correo cancela el enlace anterior: solo vale el último", async () => {
    const first = await invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.test");
    const second = await invitePerson(dueno, { email: "BEA@example.com", name: "Bea" }, "https://x.test");
    expect((await listPeople(dueno)).pending).toHaveLength(1);
    await expect(acceptInvite(tokenFrom(first.link), TEST_PASSWORD)).rejects.toThrow(/no es válido o ya se ha usado/);
    const user = await acceptInvite(tokenFrom(second.link), TEST_PASSWORD);
    expect(user.role).toBe("colaborador");
    const { rows } = await getPool().query("select 1 from invites where email = 'bea@example.com' and used_at is null");
    expect(rows).toHaveLength(0);
    expect((await listPeople(dueno)).pending).toHaveLength(0);
  });

  it("dos invitaciones a la vez para el mismo correo dejan una sola vigente", async () => {
    await Promise.all([
      invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.test"),
      invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.test"),
    ]);
    const { rows } = await getPool().query("select 1 from invites where email = 'bea@example.com' and used_at is null");
    expect(rows).toHaveLength(1);
  });

  it("cancelar una invitación pendiente invalida su enlace", async () => {
    const { link } = await invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.test");
    cookieToken = (await login(dueno.email, TEST_PASSWORD))!.token;
    const route = await import("@/app/api/personas/invitaciones/route");
    expect((await route.DELETE(json({ email: "bea@example.com" }, "DELETE"))).status).toBe(200);
    await expect(acceptInvite(tokenFrom(link), TEST_PASSWORD)).rejects.toThrow(/no es válido/);
    expect((await listPeople(dueno)).pending).toHaveLength(0);
    cookieToken = (await login(ana.email, TEST_PASSWORD))!.token;
    expect((await route.DELETE(json({ email: "bea@example.com" }, "DELETE"))).status).toBe(403);
  });

  it("un nombre o un correo demasiado largos dan 400 en español, nunca 500", async () => {
    await expect(
      invitePerson(dueno, { email: "x@example.com", name: "n".repeat(101) }, "https://x.test"),
    ).rejects.toMatchObject({ status: 400, message: "El nombre no puede tener más de 100 caracteres." });
    await expect(
      invitePerson(dueno, { email: "a".repeat(250) + "@example.com", name: "X" }, "https://x.test"),
    ).rejects.toMatchObject({ status: 400 });
    cookieToken = (await login(dueno.email, TEST_PASSWORD))!.token;
    const response = await (await personas()).POST(json({ email: "x@example.com", name: "n".repeat(500) }, "POST"));
    expect(response.status).toBe(400);
  });

  it("reinvitar a un correo desactivado responde 409 y explica cómo reactivarlo", async () => {
    await setPersonDisabled(dueno, ana.id, true);
    await expect(invitePerson(dueno, { email: "ana@example.com", name: "Ana" }, "https://x.test")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("desactivada"),
    });
    const { rows } = await getPool().query("select 1 from invites where email = 'ana@example.com' and used_at is null");
    expect(rows).toHaveLength(0);
  });

  it("un colaborador no puede invitar", async () => {
    await expect(invitePerson(ana, { email: "c@example.com", name: "C" }, "https://x.test")).rejects.toMatchObject({ status: 403 });
  });
});

describe("listar", () => {
  it("muestra de cada persona su tope, lo gastado este mes y sus productos", async () => {
    const a = await makeProduct(dueno);
    await setAssignments(dueno, ana.id, [a.id]);
    await getPool().query(
      `insert into spend_entries (user_id, product_id, provider, model, step_key, reserved_micros, cost_micros, status)
       values ($1, $2, 'claude', 'm', 's1', 50000, 42000, 'settled')`,
      [ana.id, a.id],
    );
    const { users } = await listPeople(dueno);
    expect(users.find((u) => u.id === ana.id)).toMatchObject({
      capMicros: 10_000_000,
      spentMicros: 42_000,
      productIds: [a.id],
      disabled: false,
    });
    expect(users.find((u) => u.id === dueno.id)).toMatchObject({ capMicros: null, role: "dueno" });
  });

  it("incluye las invitaciones pendientes y no las usadas", async () => {
    await invitePerson(dueno, { email: "bea@example.com", name: "Bea" }, "https://x.test");
    const used = await invitePerson(dueno, { email: "cris@example.com", name: "Cris" }, "https://x.test");
    await acceptInvite(tokenFrom(used.link), TEST_PASSWORD);
    const { pending } = await listPeople(dueno);
    expect(pending.map((p) => p.email)).toEqual(["bea@example.com"]);
  });
});

describe("rutas: solo el dueño", () => {
  it("un colaborador recibe 403 en GET, POST y los dos PUT", async () => {
    cookieToken = (await login(ana.email, TEST_PASSWORD))!.token;
    expect((await (await personas()).GET()).status).toBe(403);
    expect((await (await personas()).POST(json({ email: "z@example.com", name: "Z" }, "POST"))).status).toBe(403);
    expect((await (await persona()).PUT(json({ capUsd: "99" }), ctx(ana.id))).status).toBe(403);
    expect((await (await productosRoute()).PUT(json({ productIds: [] }), ctx(ana.id))).status).toBe(403);
  });

  it("sin sesión responde 401", async () => {
    expect((await (await personas()).GET()).status).toBe(401);
  });

  it("el dueño lista personas y productos, e invita con el enlace en la respuesta", async () => {
    cookieToken = (await login(dueno.email, TEST_PASSWORD))!.token;
    await makeProduct(dueno, { name: "Eismaschine" });
    const list = await (await personas()).GET();
    const body = await list.json();
    expect(body.products).toMatchObject([{ name: "Eismaschine" }]);
    expect(body.users).toHaveLength(2);
    const created = await (await personas()).POST(json({ email: "bea@example.com", name: "Bea" }, "POST"));
    expect(created.status).toBe(201);
    expect((await created.json()).link).toContain("/activar?token=");
  });
});

describe("tope por persona", () => {
  beforeEach(async () => {
    cookieToken = (await login(dueno.email, TEST_PASSWORD))!.token;
  });

  it("capUsd '12,50' guarda 12,5 USD", async () => {
    const response = await (await persona()).PUT(json({ capUsd: "12,50" }), ctx(ana.id));
    expect(response.status).toBe(200);
    expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)?.capMicros).toBe(12_500_000);
  });

  it("'abc' responde 400 con el mensaje claro y no cambia el tope", async () => {
    const response = await (await persona()).PUT(json({ capUsd: "abc" }), ctx(ana.id));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Escribe un importe, por ejemplo 10 o 12,50.");
    expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)?.capMicros).toBe(10_000_000);
  });

  it("un id que no es número o una persona que no existe responde 404", async () => {
    expect((await (await persona()).PUT(json({ capUsd: "5" }), ctx("1e3"))).status).toBe(404);
    expect((await (await persona()).PUT(json({ capUsd: "5" }), ctx(99999))).status).toBe(404);
  });

  it("enviar tope y estado a la vez se rechaza y no cambia nada", async () => {
    const response = await (await persona()).PUT(json({ capUsd: "3", disabled: true }), ctx(ana.id));
    expect(response.status).toBe(400);
    const row = (await listPeople(dueno)).users.find((u) => u.id === ana.id)!;
    expect(row).toMatchObject({ capMicros: 10_000_000, disabled: false });
  });

  it("PUT {disabled} aplica las protecciones: uno mismo y el último dueño dan 400", async () => {
    const self = await (await persona()).PUT(json({ disabled: true }), ctx(dueno.id));
    expect(self.status).toBe(400);
    expect((await self.json()).error).toBe("No puedes desactivar tu propia cuenta.");
    const otro = await makeUser("dueno");
    expect((await (await persona()).PUT(json({ disabled: true }), ctx(otro.id))).status).toBe(200);
    expect((await listPeople(dueno)).users.find((u) => u.id === otro.id)?.disabled).toBe(true);
    expect((await (await persona()).PUT(json({ disabled: "si" }), ctx(ana.id))).status).toBe(400);
  });

  it("el dueño no tiene tope propio", async () => {
    expect((await (await persona()).PUT(json({ capUsd: "5" }), ctx(dueno.id))).status).toBe(400);
  });
});

describe("asignar productos", () => {
  beforeEach(async () => {
    cookieToken = (await login(dueno.email, TEST_PASSWORD))!.token;
  });

  it("asigna y sustituye el conjunto", async () => {
    const a = await makeProduct(dueno);
    const b = await makeProduct(dueno);
    await (await productosRoute()).PUT(json({ productIds: [a.id, b.id] }), ctx(ana.id));
    await (await productosRoute()).PUT(json({ productIds: [b.id] }), ctx(ana.id));
    expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)?.productIds).toEqual([b.id]);
  });

  it("un producto que no existe responde 400 y no cambia nada", async () => {
    const a = await makeProduct(dueno);
    await setAssignments(dueno, ana.id, [a.id]);
    const response = await (await productosRoute()).PUT(json({ productIds: [a.id, 99999] }), ctx(ana.id));
    expect(response.status).toBe(400);
    expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)?.productIds).toEqual([a.id]);
  });

  it("un cuerpo que no es una lista de números responde 400", async () => {
    expect((await (await productosRoute()).PUT(json({ productIds: "1" }), ctx(ana.id))).status).toBe(400);
  });
});

describe("desactivar", () => {
  it("cierra sus sesiones al momento y sus productos siguen existiendo para el dueño", async () => {
    const a = await makeProduct(dueno);
    await setAssignments(dueno, ana.id, [a.id]);
    const token = (await login(ana.email, TEST_PASSWORD))!.token;
    expect(await getSessionUser(token)).not.toBeNull();
    await setPersonDisabled(dueno, ana.id, true);
    expect(await getSessionUser(token)).toBeNull();
    expect(await login(ana.email, TEST_PASSWORD)).toBeNull();
    expect(await listProductsFor(dueno)).toHaveLength(1);
    expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)?.disabled).toBe(true);
  });

  it("borra sus credenciales de terceros y conserva su gasto; reactivar no las devuelve", async () => {
    await saveCredential(ana.id, "higgsfield", { token: "secreto" });
    await saveCredential(ana.id, "otra", { token: "otro" });
    await getPool().query(
      `insert into spend_entries (user_id, provider, model, step_key, reserved_micros, cost_micros, status)
       values ($1, 'claude', 'm', 's1', 50000, 42000, 'settled')`,
      [ana.id],
    );
    await setPersonDisabled(dueno, ana.id, true);
    expect(await readCredential(ana.id, "higgsfield")).toBeNull();
    expect(await readCredential(ana.id, "otra")).toBeNull();
    await setPersonDisabled(dueno, ana.id, false);
    expect(await readCredential(ana.id, "higgsfield")).toBeNull();
    const row = (await listPeople(dueno)).users.find((u) => u.id === ana.id)!;
    expect(row.disabled).toBe(false);
    expect(row.spentMicros).toBe(42_000);
    expect(await login(ana.email, TEST_PASSWORD)).not.toBeNull();
  });

  it("no toca las credenciales de otra persona", async () => {
    const luis = await makeUser("colaborador");
    await saveCredential(luis.id, "higgsfield", { token: "de-luis" });
    await setPersonDisabled(dueno, ana.id, true);
    expect(await readCredential(luis.id, "higgsfield")).not.toBeNull();
  });

  it("el dueño no puede desactivarse a sí mismo", async () => {
    await expect(setPersonDisabled(dueno, dueno.id, true)).rejects.toThrow("No puedes desactivar tu propia cuenta.");
  });

  it("con dos dueños activos se puede desactivar a uno", async () => {
    const otro = await makeUser("dueno");
    await setPersonDisabled(dueno, otro.id, true);
    expect((await listPeople(dueno)).users.find((u) => u.id === otro.id)?.disabled).toBe(true);
  });

  it("dos dueños que se desactivan entre sí a la vez: uno lo consigue y el otro recibe 400, sin 500", async () => {
    const otro = await makeUser("dueno");
    const results = await Promise.allSettled([
      setPersonDisabled(dueno, otro.id, true),
      setPersonDisabled(otro, dueno.id, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 400 });
    const active = (await listPeople(dueno)).users.filter((u) => u.role === "dueno" && !u.disabled);
    expect(active).toHaveLength(1);
  });

  it("si falla la desactivación no se borran las credenciales", async () => {
    await saveCredential(dueno.id, "higgsfield", { token: "t" });
    await expect(setPersonDisabled(dueno, dueno.id, true)).rejects.toThrow();
    expect(await readCredential(dueno.id, "higgsfield")).not.toBeNull();
    const otro = await makeUser("dueno");
    await saveCredential(otro.id, "higgsfield", { token: "t" });
    await setPersonDisabled(dueno, otro.id, true);
    expect(await readCredential(otro.id, "higgsfield")).toBeNull();
  });

  it("no se puede desactivar al último dueño activo", async () => {
    const otro = await makeUser("dueno");
    await setPersonDisabled(dueno, otro.id, true);
    // Una sesión de `otro` abierta antes seguiría con el objeto en memoria: no puede desactivar al único activo.
    await expect(setPersonDisabled(otro, dueno.id, true)).rejects.toThrow("No se puede desactivar al último dueño activo.");
  });

  it("un colaborador no puede desactivar a nadie y una persona inexistente da 404", async () => {
    await expect(setPersonDisabled(ana, dueno.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(setPersonDisabled(dueno, 99999, true)).rejects.toMatchObject({ status: 404 });
  });

  it("el tope de un colaborador se puede cambiar también desde el servicio de gasto (misma fuente)", async () => {
    await setUserCap(dueno, ana.id, 3_000_000);
    expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)?.capMicros).toBe(3_000_000);
  });
});
