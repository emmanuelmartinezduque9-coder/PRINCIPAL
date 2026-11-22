import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto, listProductPhotos } from "@/server/photos";
import type { Product } from "@/server/products";
import { PATCH as patchPhoto } from "@/app/api/fotos/[photoId]/route";
import { POST as postPhoto } from "@/app/api/productos/[id]/fotos/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);

let ana: AuthUser;
let luis: AuthUser;
let producto: Product;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const patch = (photoId: number, body: unknown) =>
  patchPhoto(new Request("http://localhost/api/fotos/x", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ photoId: String(photoId) }),
  });
const post = (productId: number, papel?: string) => {
  const form = new FormData();
  form.append("foto", new File([new Uint8Array(JPEG)], "a.jpg", { type: "image/jpeg" }));
  if (papel !== undefined) form.append("papel", papel);
  return postPhoto(new Request("http://localhost/api/productos/x/fotos", { method: "POST", body: form }), {
    params: Promise.resolve({ id: String(productId) }),
  });
};

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana);
});

describe("PATCH /api/fotos/[photoId]", () => {
  it("cambia el papel de la foto propia", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await as(ana);
    const response = await patch(id, { role: "entorno" });
    expect(response.status).toBe(200);
    expect((await response.json()).photo.role).toBe("entorno");
  });

  it("un papel no válido da 400 y no cambia nada", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await as(ana);
    for (const body of [{ role: "selfie" }, {}, { role: 3 }]) {
      const response = await patch(id, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Papel de foto no válido.");
    }
    expect((await listProductPhotos(ana, producto.id))[0].role).toBe("articulo");
  });

  it("la foto de otra persona da 404 y no cambia", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await as(luis);
    const response = await patch(id, { role: "avatar" });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Foto no encontrada.");
    expect((await listProductPhotos(ana, producto.id))[0].role).toBe("articulo");
  });
});

describe("POST /api/productos/[id]/fotos con papel", () => {
  it("guarda el papel indicado y, sin él, artículo", async () => {
    await as(ana);
    expect((await (await post(producto.id, "avatar")).json()).photo.role).toBe("avatar");
    expect((await (await post(producto.id)).json()).photo.role).toBe("articulo");
  });

  it("un papel no válido da 400 y no guarda la foto", async () => {
    await as(ana);
    const response = await post(producto.id, "selfie");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Papel de foto no válido.");
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
  });
});
