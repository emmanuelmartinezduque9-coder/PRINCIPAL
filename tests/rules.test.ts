import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, type AuthUser } from "@/server/auth";
import { getRule, getRuleVersion, listRules, loadRules, MAX_RULE_CHARS, RULE_SLUGS, saveRuleVersion, seedRules } from "@/server/rules";
import { GET as getReglasRoute } from "@/app/api/reglas/route";
import { GET as getReglaRoute, POST as postReglaRoute } from "@/app/api/reglas/[slug]/route";
import { makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

let dueno: AuthUser;
let ana: AuthUser;
const tokenOf = async (user: AuthUser) => (await login(user.email, TEST_PASSWORD))!.token;
const bySlug = (slug: string) => ({ params: Promise.resolve({ slug }) });
const A = RULE_SLUGS.angulos;

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  await seedRules();
});

describe("reglas versionadas", () => {
  it("la siembra crea la versión 1 de las tres reglas y repetirla no cambia nada", async () => {
    await seedRules();
    expect((await listRules()).map((r) => [r.slug, r.version])).toEqual([
      ["angulos-de-venta", 1],
      ["angulos-ejemplos", 1],
      ["angulos-metodo-juanma", 1],
    ]);
  });

  it("guardar crea la versión 2 y conserva la 1", async () => {
    expect((await saveRuleVersion(dueno, A, "texto nuevo", "afino criterio")).version).toBe(2);
    expect((await getRuleVersion(A, 1)).body).toContain("ventas verificadas");
    const rule = await getRule(A);
    expect(rule.current).toMatchObject({ version: 2, body: "texto nuevo" });
    expect(rule.history.map((h) => [h.version, h.note, h.authorName])).toEqual([
      [2, "afino criterio", dueno.name],
      [1, "Texto inicial", null],
    ]);
  });

  it("volver a sembrar no pisa lo que editó el dueño", async () => {
    await saveRuleVersion(dueno, A, "texto nuevo", "");
    await seedRules();
    expect((await getRule(A)).current).toMatchObject({ version: 2, body: "texto nuevo" });
  });

  it("guardar el mismo texto no crea versión; un texto vacío se rechaza", async () => {
    const current = (await getRule(A)).current;
    expect(await saveRuleVersion(dueno, A, current.body, "nada")).toEqual(current);
    expect((await getRule(A)).history).toHaveLength(1);
    await expect(saveRuleVersion(dueno, A, "  \n ", "")).rejects.toMatchObject({
      status: 400,
      message: "La regla no puede quedar vacía.",
    });
  });

  it("rechaza un texto de más de 200 000 caracteres y admite uno justo en el límite", async () => {
    await expect(saveRuleVersion(dueno, A, "a".repeat(MAX_RULE_CHARS + 1), "")).rejects.toMatchObject({
      status: 400,
      message: "La regla es demasiado larga (máximo 200 000 caracteres).",
    });
    expect((await saveRuleVersion(dueno, A, "a".repeat(MAX_RULE_CHARS), "")).version).toBe(2);
  });

  it("recuperar una versión antigua es guardar su texto como versión nueva", async () => {
    const v1 = (await getRule(A)).current.body;
    await saveRuleVersion(dueno, A, "otro", "");
    expect((await saveRuleVersion(dueno, A, v1, "Recuperada la versión 1")).version).toBe(3);
    expect((await getRule(A)).current.body).toBe(v1);
  });

  it("dos guardados a la vez dan versiones distintas", async () => {
    const [x, y] = await Promise.all([saveRuleVersion(dueno, A, "uno", ""), saveRuleVersion(dueno, A, "dos", "")]);
    expect([x.version, y.version].sort()).toEqual([2, 3]);
  });

  it("una regla o versión que no existe da 404", async () => {
    await expect(getRule("no-existe")).rejects.toMatchObject({ status: 404 });
    await expect(getRuleVersion(A, 9)).rejects.toMatchObject({ status: 404 });
    await expect(saveRuleVersion(dueno, "no-existe", "x", "")).rejects.toMatchObject({ status: 404 });
  });

  it("un colaborador no puede guardar reglas ni leerlas por la API", async () => {
    await expect(saveRuleVersion(ana, A, "x", "")).rejects.toMatchObject({ status: 403 });
    cookie.value = await tokenOf(ana);
    expect((await getReglasRoute()).status).toBe(403);
    expect((await getReglaRoute(new Request(`http://localhost/api/reglas/${A}`), bySlug(A))).status).toBe(403);
    const post = new Request(`http://localhost/api/reglas/${A}`, { method: "POST", body: JSON.stringify({ body: "x" }) });
    expect((await postReglaRoute(post, bySlug(A))).status).toBe(403);
    expect((await getRule(A)).current.version).toBe(1);
  });

  it("el dueño lee, ve una versión antigua y guarda por la API", async () => {
    cookie.value = await tokenOf(dueno);
    expect((await (await getReglasRoute()).json()).rules).toHaveLength(3);
    const post = new Request(`http://localhost/api/reglas/${A}`, {
      method: "POST",
      body: JSON.stringify({ body: "por la API", note: "prueba" }),
    });
    const saved = await postReglaRoute(post, bySlug(A));
    expect(saved.status).toBe(200);
    expect((await saved.json()).rule.version).toBe(2);
    const old = await getReglaRoute(new Request(`http://localhost/api/reglas/${A}?version=1`), bySlug(A));
    expect((await old.json()).version.body).toContain("ventas verificadas");
    const bad = await getReglaRoute(new Request(`http://localhost/api/reglas/${A}?version=abc`), bySlug(A));
    expect(bad.status).toBe(404);
  });

  it("loadRules devuelve las vigentes ordenadas por slug y falla si falta una", async () => {
    expect((await loadRules(["angulos-metodo-juanma", "angulos-de-venta"])).map((r) => r.slug)).toEqual([
      "angulos-de-venta",
      "angulos-metodo-juanma",
    ]);
    await saveRuleVersion(dueno, A, "texto nuevo", "");
    expect((await loadRules([A]))[0]).toEqual({ slug: A, version: 2, body: "texto nuevo" });
    await expect(loadRules(["no-existe"])).rejects.toThrow("Falta la regla «no-existe».");
  });
});
