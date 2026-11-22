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
  readProductPhoto,
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
      { id: a.id, mime: "image/png", size: PNG.length },
      { id: b.id, mime: "image/webp", size: WEBP.length },
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

  it("la séptima foto se rechaza", async () => {
    expect(MAX_PHOTOS_PER_PRODUCT).toBe(6);
    for (let i = 0; i < MAX_PHOTOS_PER_PRODUCT; i++) await addProductPhoto(ana, producto.id, JPEG);
    await expect(addProductPhoto(ana, producto.id, JPEG)).rejects.toThrow("Este producto ya tiene 6 fotos.");
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(6);
  });

  it("subidas simultáneas no superan el máximo", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 9 }, () => addProductPhoto(ana, producto.id, JPEG)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(6);
    expect(await listProductPhotos(ana, producto.id)).toHaveLength(6);
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
});
