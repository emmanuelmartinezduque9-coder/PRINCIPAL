import { beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/server/auth";
import {
  addProductPhoto,
  coverPhotoIds,
  deleteProductPhoto,
  detectImageType,
  listProductPhotos,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_PRODUCT,
  importProductPhotos,
  listPhotoHashes,
  PHOTO_ROLES,
  readProductPhoto,
  setPhotoRole,
} from "@/server/photos";
import type { Product } from "@/server/products";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const pad = (head: number[], total = 64) => Buffer.concat([Buffer.from(head), Buffer.alloc(total - head.length, 1)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x20, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(32)]);
// Una foto de iPhone: caja `ftyp` con la marca `heic` en el byte 4.
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(32)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(32)]);
const bigJpeg = (size: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size - 3, 1)]);

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana);
});

describe("detectImageType", () => {
  it("reconoce JPEG, PNG y WebP por los primeros bytes", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });

  it("no reconoce HEIC, PDF, vacío ni basura", () => {
    expect(detectImageType(HEIC)).toBeNull();
    expect(detectImageType(PDF)).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(Buffer.from("RIFF....WAVEfmt "))).toBeNull();
  });
});

describe("fotos de producto", () => {
  it("guarda un JPEG y lo devuelve a quien puede ver el producto", async () => {
    const saved = await addProductPhoto(ana, producto.id, JPEG);
    expect(saved).toMatchObject({ mime: "image/jpeg", size: JPEG.length });
    const read = await readProductPhoto(ana, saved.id);
    expect(read.mime).toBe("image/jpeg");
    expect(read.data.equals(JPEG)).toBe(true);
    expect((await readProductPhoto(dueno, saved.id)).mime).toBe("image/jpeg");
  });

  it("guarda PNG y WebP y las lista en orden de subida", async () => {
    const a = await addProductPhoto(ana, producto.id, PNG);
    const b = await addProductPhoto(ana, producto.id, WEBP);
    expect(await listProductPhotos(ana, producto.id)).toEqual([
      { id: a.id, mime: "image/png", size: PNG.length, role: "articulo" },
      { id: b.id, mime: "image/webp", size: WEBP.length, role: "articulo" },
    ]);
  });

  it("otra persona no puede leer la foto por su id", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await expect(readProductPhoto(luis, id)).rejects.toMatchObject({ status: 404 });
    await expect(readProductPhoto(ana, id + 999)).rejects.toMatchObject({ status: 404 });
  });

  it("otra persona no puede listar, añadir ni borrar fotos de un producto ajeno", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await expect(listProductPhotos(luis, producto.id)).rejects.toMatchObject({ status: 404 });
    await expect(addProductPhoto(luis, producto.id, JPEG)).rejects.toMatchObject({ status: 404 });
    await expect(deleteProductPhoto(luis, id)).rejects.toMatchObject({ status: 404 });
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(1);
  });

  it("una persona desactivada deja de ver la foto", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    const { getDb, schema } = await import("@/db/client");
    const { eq } = await import("drizzle-orm");
    await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
    await expect(readProductPhoto(ana, id)).rejects.toMatchObject({ status: 404 });
  });

  it("borrar una foto la quita; el dueño puede borrar la de un colaborador", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await deleteProductPhoto(dueno, id);
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
    await expect(deleteProductPhoto(dueno, id)).rejects.toMatchObject({ status: 404 });
  });

  it("una foto HEIC de iPhone se rechaza con una explicación útil y no se guarda", async () => {
    await expect(addProductPhoto(ana, producto.id, HEIC)).rejects.toThrow(
      "Formato de foto no admitido. Usa JPG, PNG o WebP (en iPhone: Ajustes → Cámara → Formatos → «El más compatible»).",
    );
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
  });

  it("un PDF renombrado a .jpg se rechaza (se mira el contenido, no el nombre)", async () => {
    await expect(addProductPhoto(ana, producto.id, PDF)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Formato de foto no admitido"),
    });
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
  });

  it("un archivo vacío se rechaza", async () => {
    await expect(addProductPhoto(ana, producto.id, Buffer.alloc(0))).rejects.toThrow("La foto está vacía.");
  });

  it("una foto de más de 8 MB se rechaza y una de justo 8 MB se acepta", async () => {
    expect(MAX_PHOTO_BYTES).toBe(8 * 1024 * 1024);
    await expect(addProductPhoto(ana, producto.id, bigJpeg(MAX_PHOTO_BYTES + 1))).rejects.toThrow(
      "La foto pesa demasiado (máximo 8 MB).",
    );
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
    await addProductPhoto(ana, producto.id, bigJpeg(MAX_PHOTO_BYTES));
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(1);
  });

  it("un producto admite 12 fotos y la 13.ª se rechaza", async () => {
    expect(MAX_PHOTOS_PER_PRODUCT).toBe(12);
    for (let i = 0; i < MAX_PHOTOS_PER_PRODUCT; i++) await addProductPhoto(ana, producto.id, JPEG);
    await expect(addProductPhoto(ana, producto.id, JPEG)).rejects.toThrow("Este producto ya tiene 12 fotos.");
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(12);
  });

  it("subidas simultáneas no superan el máximo", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () => addProductPhoto(ana, producto.id, JPEG)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(12);
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(12);
  });

  it("la portada de cada producto es su primera foto, y solo de productos visibles", async () => {
    const otro = await makeProduct(luis);
    const sinFotos = await makeProduct(ana);
    const primera = await addProductPhoto(ana, producto.id, JPEG);
    await addProductPhoto(ana, producto.id, PNG);
    await addProductPhoto(luis, otro.id, JPEG);
    const covers = await coverPhotoIds(ana, [producto.id, otro.id, sinFotos.id]);
    expect(covers.get(producto.id)).toBe(primera.id);
    expect(covers.has(otro.id)).toBe(false);
    expect(covers.has(sinFotos.id)).toBe(false);
  });

  it("una foto nueva es «artículo» si no se dice otra cosa, y se puede subir ya con su papel", async () => {
    expect(PHOTO_ROLES).toEqual(["articulo", "embalaje", "avatar", "entorno", "otro"]);
    expect((await addProductPhoto(ana, producto.id, JPEG)).role).toBe("articulo");
    expect((await addProductPhoto(ana, producto.id, JPEG, "avatar")).role).toBe("avatar");
  });

  it("un papel desconocido se rechaza y no se guarda nada", async () => {
    await expect(addProductPhoto(ana, producto.id, JPEG, "selfie" as never)).rejects.toMatchObject({
      status: 400,
      message: "Papel de foto no válido.",
    });
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
  });

  it("cambiar el papel se guarda y se ve al listar", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    expect(await setPhotoRole(ana, id, "embalaje")).toMatchObject({ id, role: "embalaje" });
    expect((await listProductPhotos(ana, producto.id))[0].role).toBe("embalaje");
    await expect(setPhotoRole(ana, id, "selfie" as never)).rejects.toMatchObject({
      status: 400,
      message: "Papel de foto no válido.",
    });
    expect((await listProductPhotos(ana, producto.id))[0].role).toBe("embalaje");
  });

  it("cambiar el papel de la foto de un producto ajeno da el mismo 404 que si no existiera", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    await expect(setPhotoRole(luis, id, "avatar")).rejects.toMatchObject({ status: 404, message: "Foto no encontrada." });
    await expect(setPhotoRole(ana, id + 999, "avatar")).rejects.toMatchObject({ status: 404, message: "Foto no encontrada." });
    expect((await listProductPhotos(ana, producto.id))[0].role).toBe("articulo");
    expect((await setPhotoRole(dueno, id, "entorno")).role).toBe("entorno");
  });

  it("la portada es la primera foto de artículo, no el avatar; sin artículo, la primera foto", async () => {
    await addProductPhoto(ana, producto.id, JPEG, "avatar");
    const articulo = await addProductPhoto(ana, producto.id, PNG, "articulo");
    await addProductPhoto(ana, producto.id, WEBP, "articulo");
    expect((await coverPhotoIds(ana, [producto.id])).get(producto.id)).toBe(articulo.id);

    const otro = await makeProduct(ana);
    const primera = await addProductPhoto(ana, otro.id, JPEG, "entorno");
    await addProductPhoto(ana, otro.id, PNG, "otro");
    expect((await coverPhotoIds(ana, [otro.id])).get(otro.id)).toBe(primera.id);
  });

  it("la importación en bloque es solo del dueño, con papel validado y con las mismas reglas de foto", async () => {
    const saved = await importProductPhotos(dueno, producto.id, [
      { bytes: JPEG, role: "articulo" },
      { bytes: PNG, role: "avatar" },
    ]);
    expect(saved.map((p) => p.role)).toEqual(["articulo", "avatar"]);
    await expect(importProductPhotos(ana, producto.id, [{ bytes: JPEG, role: "otro" }])).rejects.toMatchObject({ status: 403 });
    await expect(importProductPhotos(dueno, producto.id, [{ bytes: HEIC, role: "otro" }])).rejects.toMatchObject({ status: 400 });
    await expect(importProductPhotos(dueno, producto.id, [{ bytes: JPEG, role: "x" as never }])).rejects.toMatchObject({ status: 400 });
    expect(await listProductPhotos(dueno, producto.id)).toHaveLength(2);
  });

  it("la importación conserva lo guardado antes de un fallo y propaga su código", async () => {
    await expect(
      importProductPhotos(dueno, producto.id, [
        { bytes: JPEG, role: "articulo" },
        { bytes: PNG, role: "avatar" },
        { bytes: HEIC, role: "otro" },
        { bytes: JPEG, role: "entorno" },
      ]),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Formato de foto no admitido") });
    expect((await listProductPhotos(dueno, producto.id)).map((p) => p.role)).toEqual(["articulo", "avatar"]);
  });

  it("si el producto llega a 12 fotos a mitad de una importación, se queda con las 12 y rechaza el resto", async () => {
    for (let i = 0; i < 10; i++) await addProductPhoto(ana, producto.id, JPEG);
    await expect(
      importProductPhotos(dueno, producto.id, [
        { bytes: JPEG, role: "articulo" },
        { bytes: JPEG, role: "avatar" },
        { bytes: JPEG, role: "entorno" },
      ]),
    ).rejects.toMatchObject({ status: 400, message: "Este producto ya tiene 12 fotos." });
    const roles = (await listProductPhotos(dueno, producto.id)).map((p) => p.role);
    expect(roles).toHaveLength(12);
    expect(roles.slice(10)).toEqual(["articulo", "avatar"]);
  });

  it("da el sha256 del contenido de cada foto, en orden, solo a quien ve el producto", async () => {
    const { createHash } = await import("node:crypto");
    const hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    await addProductPhoto(ana, producto.id, PNG, "avatar");
    await addProductPhoto(ana, producto.id, JPEG);
    expect(await listPhotoHashes(dueno, producto.id)).toEqual([hex(PNG), hex(JPEG)]);
    await expect(listPhotoHashes(luis, producto.id)).rejects.toMatchObject({ status: 404 });
  });

  it("la base rechaza un papel que no existe aunque se salte el servidor", async () => {
    const { id } = await addProductPhoto(ana, producto.id, JPEG);
    const { getDb } = await import("@/db/client");
    const { sql } = await import("drizzle-orm");
    await expect(getDb().execute(sql`update product_photos set role = 'x' where id = ${id}`)).rejects.toThrow();
  });
});
