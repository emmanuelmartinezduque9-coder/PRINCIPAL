import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stopWorker } from "@/jobs/boss";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { getProductFor, listProductsFor, updateProduct, validateEmoji, type Product } from "@/server/products";
import { addVideoToBatch, batchView, createBatch } from "@/server/videos/batches";
import { PRODUCT_EMOJIS } from "@/components/products/labels";
import { GET as listRoute } from "@/app/api/productos/route";
import { GET as getRoute, PATCH as patchRoute } from "@/app/api/productos/[id]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

let dueno: AuthUser;
let ana: AuthUser;
let helado: Product;
let viejo: Product;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const list = (query = "") => listRoute(new Request(`http://localhost/api/productos${query}`));
const patch = (id: number, body: unknown) =>
  patchRoute(new Request("http://localhost/api/productos/x", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: String(id) }),
  });
const ids = (products: { id: number }[]) => products.map((p) => p.id);

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  helado = await makeProduct(dueno, { name: "Eismaschine" });
  viejo = await makeProduct(dueno, { name: "Regenschirm" });
  await setAssignments(dueno, ana.id, [helado.id, viejo.id]);
});

afterAll(async () => {
  await stopWorker();
});

describe("emoji del producto", () => {
  it("acepta emoji simples y compuestos, y todos los de la cuadrícula", () => {
    expect(validateEmoji("🍦")).toBe("🍦");
    expect(validateEmoji(" 💇‍♀️ ")).toBe("💇‍♀️");
    expect(validateEmoji("🇩🇪")).toBe("🇩🇪");
    expect(validateEmoji("👨‍👩‍👧‍👦")).toBe("👨‍👩‍👧‍👦");
    for (const emoji of PRODUCT_EMOJIS) expect(validateEmoji(emoji)).toBe(emoji);
    expect(PRODUCT_EMOJIS.length).toBeGreaterThanOrEqual(40);
  });

  it("null o vacío lo quitan", () => {
    expect(validateEmoji(null)).toBeNull();
    expect(validateEmoji("  ")).toBeNull();
  });

  it("rechaza texto, números, más de 16 caracteres y tipos que no son texto", () => {
    for (const bad of ["a", "hola", "🍦 x", "🍦 🍦", "12", 5, true, {}]) {
      expect(() => validateEmoji(bad)).toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(() => validateEmoji("🍦".repeat(17))).toThrow(expect.objectContaining({ status: 400 }));
    expect(validateEmoji("🍦".repeat(16))).toBe("🍦".repeat(16));
  });

  it("un colaborador con el producto pone y quita el emoji por PATCH", async () => {
    await as(ana);
    const set = await patch(helado.id, { emoji: "💇‍♀️" });
    expect(set.status).toBe(200);
    expect((await set.json()).product.emoji).toBe("💇‍♀️");
    const bad = await patch(helado.id, { emoji: "hola" });
    expect(bad.status).toBe(400);
    expect((await getProductFor(dueno, helado.id)).emoji).toBe("💇‍♀️");
    const cleared = await patch(helado.id, { emoji: null });
    expect((await cleared.json()).product.emoji).toBeNull();
  });

  it("el lote enseña el emoji delante del nombre del producto", async () => {
    await updateProduct(dueno, helado.id, { emoji: "🍦" });
    const lote = await createBatch(dueno, "Pedido", { autoAnalyze: false });
    await addVideoToBatch(dueno, lote.id, { productId: helado.id, avatarPhotoId: null, avatarMode: "nadie" });
    const view = await batchView(dueno, lote.id);
    expect(view.groups[0].name).toBe("🍦 Eismaschine");
    expect(view.rows[0].productName).toBe("🍦 Eismaschine");
  });
});

describe("archivar productos", () => {
  it("solo el dueño archiva o desarchiva; un colaborador recibe 403 y no cambia nada", async () => {
    await expect(updateProduct(ana, viejo.id, { archived: true })).rejects.toMatchObject({ status: 403 });
    await as(ana);
    expect((await patch(viejo.id, { archived: true })).status).toBe(403);
    expect((await getProductFor(dueno, viejo.id)).archivedAt).toBeNull();

    await as(dueno);
    const archived = await patch(viejo.id, { archived: true });
    expect(archived.status).toBe(200);
    expect((await archived.json()).product.archivedAt).not.toBeNull();
    expect((await patch(viejo.id, { archived: "si" })).status).toBe(400);
    const restored = await patch(viejo.id, { archived: false });
    expect((await restored.json()).product.archivedAt).toBeNull();
  });

  it("archivado sale de la lista y de los selectores, pero se abre por dirección", async () => {
    await updateProduct(dueno, viejo.id, { archived: true });
    expect(ids(await listProductsFor(dueno))).toEqual([helado.id]);
    expect(ids(await listProductsFor(ana))).toEqual([helado.id]);
    expect(ids(await listProductsFor(dueno, "solo"))).toEqual([viejo.id]);
    expect(ids(await listProductsFor(dueno, "todos")).sort()).toEqual([helado.id, viejo.id].sort());

    // GET /api/productos: lo que leen la lista y todos los selectores (lote nuevo, biblioteca…).
    await as(ana);
    const forAna = await (await list()).json();
    expect(ids(forAna.products)).toEqual([helado.id]);
    expect(forAna.archivedCount).toBe(0);
    expect((await getRoute(new Request("http://localhost"), { params: Promise.resolve({ id: String(viejo.id) }) })).status).toBe(200);

    await as(dueno);
    const forOwner = await (await list()).json();
    expect(ids(forOwner.products)).toEqual([helado.id]);
    expect(forOwner.archivedCount).toBe(1);
    const direct = await getRoute(new Request("http://localhost"), { params: Promise.resolve({ id: String(viejo.id) }) });
    expect((await direct.json()).product.id).toBe(viejo.id);
  });

  it("?archivados=1 lista solo los archivados, y solo al dueño", async () => {
    await updateProduct(dueno, viejo.id, { archived: true });
    await as(dueno);
    const response = await list("?archivados=1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(ids(body.products)).toEqual([viejo.id]);
    expect(body.archivedCount).toBe(1);
    await as(ana);
    expect((await list("?archivados=1")).status).toBe(403);
  });

  it("los lotes con un producto archivado lo siguen enseñando", async () => {
    const lote = await createBatch(ana, "Pedido", { autoAnalyze: false });
    await addVideoToBatch(ana, lote.id, { productId: viejo.id, avatarPhotoId: null, avatarMode: "nadie" });
    await updateProduct(dueno, viejo.id, { archived: true, emoji: "☂️" });
    const view = await batchView(ana, lote.id);
    expect(view.groups.map((group) => group.name)).toEqual(["☂️ Regenschirm"]);
    expect(view.rows).toHaveLength(1);
  });
});
