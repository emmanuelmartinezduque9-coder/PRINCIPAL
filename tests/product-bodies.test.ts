import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getPool, schema } from "@/db/client";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import type { Product } from "@/server/products";
import { addVideoToBatch, batchView, createBatch, duplicateBatchVideo } from "@/server/videos/batches";
import { bodyDownload, checkVideoBodies, listProductBodies, markBody, unmarkBody } from "@/server/videos/bodies";
import { createVideo, getVideoFor, updateVideoChoices, videoView } from "@/server/videos/videos";
import { DELETE as deleteRoute } from "@/app/api/cuerpos/[bodyId]/route";
import { GET as downloadRoute } from "@/app/api/cuerpos/[bodyId]/descargar/route";
import { GET as listRoute, POST as markRoute } from "@/app/api/productos/[id]/cuerpos/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/** Cuerpos de un producto: quién los ve, quién marca y desmarca, y cómo llegan al vídeo. */

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_x";

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let marta: AuthUser;
let producto: Product;
let otro: Product;
let counter = 0;

/** Un clip en la biblioteca de `user`, como lo dejaría «Actualizar». */
async function libraryClip(user: AuthUser): Promise<number> {
  counter += 1;
  const [row] = await getDb()
    .insert(schema.libraryClips)
    .values({
      userId: user.id,
      jobId: `hf-${counter}`,
      videoUrl: `${CDN}/hf-${counter}.mp4`,
      thumbUrl: `${CDN}/hf-${counter}_min.webp`,
      model: "seedance_2_5",
      createdAtHf: new Date(Date.UTC(2026, 10, 20, 0, counter)),
    })
    .returning();
  return row.id;
}

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  cookie.value = undefined;
  counter = 0;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  marta = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "BrilloMax Grifo" });
  otro = await makeProduct(luis);
  // Marta también ve el producto de Ana.
  await setAssignments(dueno, marta.id, [producto.id]);
});

describe("marcar y desmarcar cuerpos", () => {
  it("quien ve el producto marca un clip de su propia biblioteca, con nombre corto", async () => {
    const clipId = await libraryClip(ana);
    const body = await markBody(ana, producto.id, { clipId, label: "  Demostración   en  mano " });
    expect(body.label).toBe("Demostración en mano");
    expect(await listProductBodies(ana, producto.id)).toEqual([
      { accountName: null, auto: false, id: body.id, productId: producto.id, label: "Demostración en mano", thumbUrl: `${CDN}/hf-1_min.webp`, videoUrl: `${CDN}/hf-1.mp4`, previewUrl: null, canRemove: true },
    ]);
    // Sin nombre, «Cuerpo N».
    const second = await markBody(ana, producto.id, { clipId: await libraryClip(ana) });
    expect(second.label).toBe("Cuerpo 2");
    // Marcar otra vez el mismo clip no lo duplica: le cambia el nombre (o lo deja, si no se da).
    expect(await markBody(ana, producto.id, { clipId, label: "Otro nombre" })).toEqual({ id: body.id, label: "Otro nombre" });
    expect(await markBody(ana, producto.id, { clipId })).toEqual({ id: body.id, label: "Otro nombre" });
    expect(await listProductBodies(ana, producto.id)).toHaveLength(2);
  });

  it("no se marca un clip ajeno ni en un producto que no se ve; el nombre, hasta 60 caracteres", async () => {
    const deAna = await libraryClip(ana);
    const deLuis = await libraryClip(luis);
    await expect(markBody(ana, producto.id, { clipId: deLuis })).rejects.toMatchObject({ status: 404, message: "Clip no encontrado." });
    await expect(markBody(ana, producto.id, { clipId: 999_999 })).rejects.toMatchObject({ status: 404 });
    await expect(markBody(ana, producto.id, { clipId: "1" })).rejects.toMatchObject({ status: 404 });
    await expect(markBody(ana, otro.id, { clipId: deAna })).rejects.toMatchObject({ status: 404, message: "Producto no encontrado." });
    // Ni siquiera el dueño marca un clip de la biblioteca de otra persona.
    await expect(markBody(dueno, producto.id, { clipId: deAna })).rejects.toMatchObject({ status: 404 });
    await expect(markBody(ana, producto.id, { clipId: deAna, label: "x".repeat(61) })).rejects.toMatchObject({ status: 400 });
    await expect(markBody(ana, producto.id, { clipId: deAna, label: 7 })).rejects.toMatchObject({ status: 400 });
    expect(await getDb().select().from(schema.productBodies)).toEqual([]);
    expect((await markBody(ana, producto.id, { clipId: deAna, label: "x".repeat(60) })).label).toHaveLength(60);
  });

  it("el dueño ve todos los cuerpos; un colaborador, los de los productos que ve", async () => {
    const body = await markBody(ana, producto.id, { clipId: await libraryClip(ana), label: "De Ana" });
    const deMarta = await markBody(marta, producto.id, { clipId: await libraryClip(marta), label: "De Marta" });
    const labels = async (user: AuthUser) => (await listProductBodies(user, producto.id)).map((b) => `${b.label}:${b.canRemove}`);
    expect(await labels(dueno)).toEqual(["De Ana:true", "De Marta:true"]);
    expect(await labels(ana)).toEqual(["De Ana:true", "De Marta:false"]);
    expect(await labels(marta)).toEqual(["De Ana:false", "De Marta:true"]);
    await expect(listProductBodies(luis, producto.id)).rejects.toMatchObject({ status: 404 });
    await expect(bodyDownload(luis, body.id)).rejects.toMatchObject({ status: 404, message: "Cuerpo no encontrado." });
    expect(await bodyDownload(marta, deMarta.id)).toEqual({ url: `${CDN}/hf-2.mp4`, jobId: "hf-2", filename: "brillomax-grifo-cuerpo-de-marta.mp4" });
    expect(await bodyDownload(dueno, body.id)).toEqual({ url: `${CDN}/hf-1.mp4`, jobId: "hf-1", filename: "brillomax-grifo-cuerpo-de-ana.mp4" });
  });

  it("desmarca quien marcó o el dueño; otra persona que ve el producto, 403; quien no lo ve, 404", async () => {
    const one = await markBody(ana, producto.id, { clipId: await libraryClip(ana) });
    const two = await markBody(ana, producto.id, { clipId: await libraryClip(ana) });
    await expect(unmarkBody(marta, one.id)).rejects.toMatchObject({ status: 403 });
    await expect(unmarkBody(luis, one.id)).rejects.toMatchObject({ status: 404 });
    await expect(unmarkBody(ana, 999_999)).rejects.toMatchObject({ status: 404 });
    expect(await listProductBodies(ana, producto.id)).toHaveLength(2);
    await unmarkBody(ana, one.id);
    await unmarkBody(dueno, two.id);
    expect(await listProductBodies(ana, producto.id)).toEqual([]);
    // El clip sigue en la biblioteca de Ana.
    expect(await getDb().select().from(schema.libraryClips)).toHaveLength(2);
  });
});

describe("los cuerpos de un vídeo «Solo gancho»", () => {
  it("se guardan en orden y tienen que ser cuerpos de ese mismo producto", async () => {
    const a = await markBody(ana, producto.id, { clipId: await libraryClip(ana), label: "A" });
    const b = await markBody(ana, producto.id, { clipId: await libraryClip(ana), label: "B" });
    const ajeno = await markBody(luis, otro.id, { clipId: await libraryClip(luis), label: "De otro producto" });
    const video = await createVideo(ana, producto.id);

    await updateVideoChoices(ana, video.id, { kind: "solo_gancho", bodyClipIds: [b.id, a.id] });
    expect((await getVideoFor(ana, video.id)).bodyClipIds).toEqual([b.id, a.id]);
    expect((await videoView(ana, video.id)).bodies).toEqual([
      { id: b.id, label: "B", thumbUrl: `${CDN}/hf-2_min.webp`, videoUrl: `${CDN}/hf-2.mp4`, previewUrl: null, jobId: "hf-2" },
      { id: a.id, label: "A", thumbUrl: `${CDN}/hf-1_min.webp`, videoUrl: `${CDN}/hf-1.mp4`, previewUrl: null, jobId: "hf-1" },
    ]);

    for (const bad of [[ajeno.id], [a.id, a.id], [999_999], ["1"], [0], "1", null, Array.from({ length: 11 }, (_, i) => i + 1)]) {
      await expect(updateVideoChoices(ana, video.id, { bodyClipIds: bad })).rejects.toMatchObject({ status: 400 });
    }
    await expect(checkVideoBodies(otro.id, [a.id])).rejects.toMatchObject({ status: 400, message: "Elige cuerpos de este producto." });
    expect((await getVideoFor(ana, video.id)).bodyClipIds).toEqual([b.id, a.id]);

    // Un cuerpo desmarcado deja de salir en el vídeo.
    await unmarkBody(ana, b.id);
    expect((await videoView(ana, video.id)).bodies.map((body) => body.label)).toEqual(["A"]);
    await updateVideoChoices(ana, video.id, { bodyClipIds: [] });
    expect((await videoView(ana, video.id)).bodies).toEqual([]);
  });

  it("en un lote: se crea con su gancho y sus cuerpos, el tablero dice cuántos lleva y duplicar los copia", async () => {
    const a = await markBody(ana, producto.id, { clipId: await libraryClip(ana), label: "A" });
    const b = await markBody(ana, producto.id, { clipId: await libraryClip(ana), label: "B" });
    const ajeno = await markBody(luis, otro.id, { clipId: await libraryClip(luis) });
    const batch = await createBatch(ana, "Ganchos");
    const base = { productId: producto.id, avatarPhotoId: null, avatarMode: "nadie" };

    await expect(addVideoToBatch(ana, batch.id, { ...base, kind: "solo_gancho", bodyClipIds: [ajeno.id] })).rejects.toMatchObject({ status: 400 });
    await expect(addVideoToBatch(ana, batch.id, { ...base, kind: "solo_gancho", hookSeconds: 9 })).rejects.toMatchObject({ status: 400 });
    const video = await addVideoToBatch(ana, batch.id, { ...base, kind: "solo_gancho", hookSeconds: 6, bodyClipIds: [b.id, a.id] });
    expect(video).toMatchObject({ kind: "solo_gancho", hookSeconds: 6, bodyClipIds: [b.id, a.id] });
    const plain = await addVideoToBatch(ana, batch.id, base);
    expect(plain).toMatchObject({ kind: "replicar", hookSeconds: 4, bodyClipIds: [] });

    const copy = await duplicateBatchVideo(ana, batch.id, video.id);
    expect(copy).toMatchObject({ kind: "solo_gancho", hookSeconds: 6, bodyClipIds: [b.id, a.id] });
    await unmarkBody(ana, a.id);
    const rows = (await batchView(ana, batch.id)).rows;
    expect(rows.map((row) => ({ kind: row.kind, hookSeconds: row.hookSeconds, bodies: row.bodies }))).toEqual([
      { kind: "solo_gancho", hookSeconds: 6, bodies: 1 },
      { kind: "replicar", hookSeconds: 4, bodies: 0 },
      { kind: "solo_gancho", hookSeconds: 6, bodies: 1 },
    ]);
  });
});

describe("rutas de los cuerpos", () => {
  const as = async (user: AuthUser) => {
    cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
  };
  const product = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
  const bodyParams = (id: number | string) => ({ params: Promise.resolve({ bodyId: String(id) }) });
  const mark = (id: number, body: unknown) =>
    markRoute(new Request("http://localhost/api/productos/x/cuerpos", { method: "POST", body: JSON.stringify(body) }), product(id));

  it("marcar, listar y desmarcar por la API, cada uno con su sesión", async () => {
    const clipId = await libraryClip(ana);
    expect((await mark(producto.id, { clipId })).status).toBe(401);
    await as(ana);
    const created = await mark(producto.id, { clipId, label: "Uso en la ducha" });
    expect(created.status).toBe(201);
    const { body } = await created.json();
    expect(body).toMatchObject({ label: "Uso en la ducha" });
    expect((await (await listRoute(new Request("http://localhost"), product(producto.id))).json()).bodies).toMatchObject([{ id: body.id, canRemove: true }]);

    await as(luis);
    expect((await listRoute(new Request("http://localhost"), product(producto.id))).status).toBe(404);
    expect((await mark(producto.id, { clipId })).status).toBe(404);
    expect((await deleteRoute(new Request("http://localhost", { method: "DELETE" }), bodyParams(body.id))).status).toBe(404);
    expect((await downloadRoute(new Request("http://localhost"), bodyParams(body.id))).status).toBe(404);
    await as(marta);
    expect((await deleteRoute(new Request("http://localhost", { method: "DELETE" }), bodyParams(body.id))).status).toBe(403);
    await as(ana);
    expect((await deleteRoute(new Request("http://localhost", { method: "DELETE" }), bodyParams("1e3"))).status).toBe(404);
    expect((await deleteRoute(new Request("http://localhost", { method: "DELETE" }), bodyParams(body.id))).status).toBe(200);
    expect((await getPool().query("select count(*)::int as n from product_bodies")).rows[0].n).toBe(0);
  });
});
