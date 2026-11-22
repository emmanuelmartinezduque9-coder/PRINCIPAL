import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { LOCAL_USER, login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import {
  assignedProductIds,
  productScope,
  requireOwner,
  requireUser,
  scopedProducts,
  setAssignments,
} from "@/server/access";
import { getProductFor, listProductsFor, productNamesByIds, type Product } from "@/server/products";
import { GET as getProductsRoute, POST as postProductsRoute } from "@/app/api/productos/route";
import { GET as getProductRoute } from "@/app/api/productos/[id]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

// Las rutas leen la sesión de la cookie de la petición; aquí la cookie la pone cada prueba.
const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let a: Product;
let b: Product;

async function tokenOf(user: AuthUser): Promise<string> {
  return (await login(user.email, TEST_PASSWORD))!.token;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("se esperaba un error");
}

const byId = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const request = (url = "http://localhost/api/productos", init?: RequestInit) => new Request(url, init);

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador", { name: "Ana" });
  luis = await makeUser("colaborador", { name: "Luis" });
  a = await makeProduct(dueno, { name: "A" });
  b = await makeProduct(dueno, { name: "B" });
  await setAssignments(dueno, ana.id, [a.id]);
  await setAssignments(dueno, luis.id, [b.id]);
});

describe("propiedad de los productos", () => {
  it("un colaborador solo lista los productos que tiene asignados", async () => {
    expect((await listProductsFor(ana)).map((p) => p.id)).toEqual([a.id]);
    expect((await listProductsFor(luis)).map((p) => p.id)).toEqual([b.id]);
    expect((await listProductsFor(dueno)).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("un colaborador sin asignaciones no ve ningún producto", async () => {
    const nadie = await makeUser("colaborador");
    expect(await listProductsFor(nadie)).toEqual([]);
  });

  it("el dueño en el propio ordenador (sin cuenta) ve todos los productos", async () => {
    expect((await listProductsFor(LOCAL_USER)).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("un colaborador lee por id un producto suyo", async () => {
    expect((await getProductFor(ana, a.id)).name).toBe("A");
  });

  it("un colaborador NO puede leer por id un producto de otra persona: 404, no 403", async () => {
    await expect(getProductFor(ana, b.id)).rejects.toMatchObject({ status: 404, message: "Producto no encontrado." });
  });

  it("un id que no existe y un id ajeno dan exactamente el mismo error", async () => {
    const ajeno = (await caught(getProductFor(ana, b.id))) as HttpError;
    const inexistente = (await caught(getProductFor(ana, b.id + 1000))) as HttpError;
    expect(ajeno).toBeInstanceOf(HttpError);
    expect(inexistente).toBeInstanceOf(HttpError);
    expect({ status: inexistente.status, message: inexistente.message }).toEqual({
      status: ajeno.status,
      message: ajeno.message,
    });
  });

  it("un id que no es un entero positivo responde igual que uno que no existe", async () => {
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(getProductFor(dueno, id)).rejects.toMatchObject({ status: 404, message: "Producto no encontrado." });
    }
  });

  it("al quitar la asignación, el producto deja de verse en la siguiente consulta", async () => {
    await setAssignments(dueno, ana.id, []);
    await expect(getProductFor(ana, a.id)).rejects.toMatchObject({ status: 404 });
    expect(await listProductsFor(ana)).toEqual([]);
  });

  it("un colaborador desactivado no ve nada aunque quien llama conserve sus datos de antes", async () => {
    await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
    expect(await listProductsFor(ana)).toEqual([]);
    await expect(getProductFor(ana, a.id)).rejects.toMatchObject({ status: 404 });
  });

  it("una condición añadida a la consulta acotada solo puede estrechar, nunca ampliar", async () => {
    const rows = await scopedProducts(ana, or(eq(schema.products.id, b.id), sql`true`));
    expect(rows.map((p) => p.id)).toEqual([a.id]);
    const none = await scopedProducts(ana, eq(schema.products.id, b.id));
    expect(none).toEqual([]);
    // Volver a llamar a `.where` sustituiría el ámbito: TypeScript no lo permite.
    // @ts-expect-error la consulta acotada ya tiene su `where`
    expect(() => scopedProducts(ana).where(sql`true`)).toBeDefined();
  });

  it("productScope del dueño no filtra nada", async () => {
    const rows = await getDb().select().from(schema.products).where(productScope(dueno));
    expect(rows).toHaveLength(2);
  });
});

describe("asignaciones", () => {
  it("un colaborador no puede asignar productos", async () => {
    await expect(setAssignments(ana, ana.id, [b.id])).rejects.toMatchObject({
      status: 403,
      message: "Solo el dueño puede hacer esto.",
    });
    expect(await assignedProductIds(ana.id)).toEqual([a.id]);
  });

  it("sustituye el conjunto entero de asignaciones", async () => {
    const c = await makeProduct(dueno, { name: "C" });
    await setAssignments(dueno, ana.id, [c.id, b.id, c.id]);
    expect(await assignedProductIds(ana.id)).toEqual([b.id, c.id]);
    expect((await listProductsFor(ana)).map((p) => p.id).sort()).toEqual([b.id, c.id].sort());
    // Las asignaciones de otra persona no cambian.
    expect(await assignedProductIds(luis.id)).toEqual([b.id]);
  });

  it("rechaza un producto que no existe con un 400 y no cambia nada", async () => {
    await expect(setAssignments(dueno, ana.id, [b.id, b.id + 1000])).rejects.toMatchObject({
      status: 400,
      message: "Alguno de los productos elegidos no existe.",
    });
    expect(await assignedProductIds(ana.id)).toEqual([a.id]);
  });

  it("rechaza ids que no son enteros positivos", async () => {
    await expect(setAssignments(dueno, ana.id, [Number.NaN])).rejects.toMatchObject({ status: 400 });
    expect(await assignedProductIds(ana.id)).toEqual([a.id]);
  });

  it("rechaza una persona que no existe", async () => {
    await expect(setAssignments(dueno, 999_999, [a.id])).rejects.toMatchObject({
      status: 404,
      message: "Persona no encontrada.",
    });
  });

  it("dos cambios a la vez sobre la misma persona dejan uno de los dos conjuntos, sin mezclas ni errores", async () => {
    const c = await makeProduct(dueno, { name: "C" });
    await Promise.all([setAssignments(dueno, ana.id, [a.id, b.id]), setAssignments(dueno, ana.id, [c.id])]);
    const result = await assignedProductIds(ana.id);
    expect([JSON.stringify([a.id, b.id]), JSON.stringify([c.id])]).toContain(JSON.stringify(result));
  });

  it("guarda quién asignó", async () => {
    const [row] = await getDb()
      .select()
      .from(schema.productAssignments)
      .where(eq(schema.productAssignments.userId, ana.id));
    expect(row.assignedBy).toBe(dueno.id);
  });
});

describe("nombres de productos", () => {
  it("devuelve el nombre de cada id conocido y omite los desconocidos", async () => {
    const names = await productNamesByIds([a.id, b.id, b.id + 1000]);
    expect(names).toEqual(
      new Map([
        [a.id, "A"],
        [b.id, "B"],
      ]),
    );
  });

  it("sin ids devuelve un mapa vacío", async () => {
    expect(await productNamesByIds([])).toEqual(new Map());
  });
});

describe("requireUser y requireOwner", () => {
  it("sin sesión: 401 con mensaje en español", async () => {
    await expect(requireUser({ token: async () => undefined })).rejects.toMatchObject({
      status: 401,
      message: "Inicia sesión para continuar.",
    });
    await expect(requireOwner({ token: async () => undefined })).rejects.toMatchObject({ status: 401 });
  });

  it("con sesión devuelve a la persona", async () => {
    const token = await tokenOf(ana);
    expect((await requireUser({ token: async () => token })).id).toBe(ana.id);
  });

  it("una persona desactivada con la sesión abierta recibe 401", async () => {
    const token = await tokenOf(ana);
    await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
    await expect(requireUser({ token: async () => token })).rejects.toMatchObject({ status: 401 });
  });

  it("requireOwner deja pasar al dueño y responde 403 a un colaborador", async () => {
    const owner = await tokenOf(dueno);
    const collaborator = await tokenOf(ana);
    expect((await requireOwner({ token: async () => owner })).id).toBe(dueno.id);
    await expect(requireOwner({ token: async () => collaborator })).rejects.toMatchObject({
      status: 403,
      message: "Solo el dueño puede hacer esto.",
    });
  });
});

describe("rutas /api/productos", () => {
  it("GET /api/productos/[id] responde 404 al colaborador ajeno y 200 al asignado", async () => {
    cookie.value = await tokenOf(ana);
    const ajeno = await getProductRoute(request(), byId(b.id));
    expect(ajeno.status).toBe(404);
    expect(await ajeno.json()).toEqual({ error: "Producto no encontrado." });
    const propio = await getProductRoute(request(), byId(a.id));
    expect(propio.status).toBe(200);
    expect((await propio.json()).product).toMatchObject({ id: a.id, name: "A" });
  });

  it("GET /api/productos/[id] con un id que no es un número responde 404", async () => {
    cookie.value = await tokenOf(dueno);
    for (const id of ["abc", "1e3", "12abc", "99999999999999999999", ""]) {
      expect((await getProductRoute(request(), byId(id))).status).toBe(404);
    }
  });

  it("sin sesión las rutas responden 401 y no enseñan productos", async () => {
    const list = await getProductsRoute();
    expect(list.status).toBe(401);
    expect((await getProductRoute(request(), byId(a.id))).status).toBe(401);
  });

  it("una persona desactivada con la sesión abierta recibe 401 en la siguiente petición", async () => {
    cookie.value = await tokenOf(ana);
    expect((await getProductRoute(request(), byId(a.id))).status).toBe(200);
    await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
    expect((await getProductRoute(request(), byId(a.id))).status).toBe(401);
    expect((await getProductsRoute()).status).toBe(401);
  });

  it("al quitar la asignación, la siguiente petición responde 404", async () => {
    cookie.value = await tokenOf(ana);
    await setAssignments(dueno, ana.id, []);
    expect((await getProductRoute(request(), byId(a.id))).status).toBe(404);
  });

  it("GET /api/productos lista solo los productos de quien pregunta", async () => {
    cookie.value = await tokenOf(ana);
    const response = await getProductsRoute();
    expect(response.status).toBe(200);
    expect((await response.json()).products.map((p: Product) => p.id)).toEqual([a.id]);
  });

  it("POST /api/productos crea el producto y, si lo crea un colaborador, queda suyo", async () => {
    cookie.value = await tokenOf(ana);
    const response = await postProductsRoute(
      request(undefined, { method: "POST", body: JSON.stringify({ name: "Eismaschine", summary: "Hace helado" }) }),
    );
    expect(response.status).toBe(201);
    const { product } = await response.json();
    expect(product).toMatchObject({ name: "Eismaschine", language: "de", countries: ["DE", "AT", "CH"] });
    expect((await getProductFor(ana, product.id)).id).toBe(product.id);
    await expect(getProductFor(luis, product.id)).rejects.toMatchObject({ status: 404 });
  });

  it("POST /api/productos con datos que no valen responde 400 con el mensaje", async () => {
    cookie.value = await tokenOf(ana);
    const bad = async (body: unknown) => {
      const response = await postProductsRoute(request(undefined, { method: "POST", body: JSON.stringify(body) }));
      return { status: response.status, error: (await response.json()).error };
    };
    expect(await bad({ summary: "x" })).toEqual({ status: 400, error: "Escribe el nombre del producto." });
    expect(await bad({ name: "x", summary: "x", language: 3 })).toEqual({ status: 400, error: "Idioma no disponible." });
    expect(await bad({ name: "x", summary: "x", countries: "DE" })).toEqual({
      status: 400,
      error: "Elige al menos un país.",
    });
    const raw = await postProductsRoute(request(undefined, { method: "POST", body: "{no es json" }));
    expect(raw.status).toBe(400);
    expect(await listProductsFor(ana)).toHaveLength(1);
  });
});
