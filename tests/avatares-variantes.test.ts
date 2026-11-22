import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { createGateway } from "@/llm/gateway";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { activeAvatarSummaries, listAvatars, updateAvatar, uploadAvatar, type AvatarInfo } from "@/server/avatars";
import { addProductPhoto, deleteProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import { seedRules } from "@/server/rules";
import { createVariant, deleteVariant, importVariants, listVariants, updateVariant } from "@/server/variants";
import { answerQuestion, batchQuestions } from "@/server/videos/lote";
import { requestAnalysis, runAnalysis, type Analysis } from "@/server/videos/analysis";
import { addVideoToBatch, batchView, createBatch, duplicateBatchVideo } from "@/server/videos/batches";
import { buildClipRequest } from "@/server/videos/clip";
import { buildFrameRequest } from "@/server/videos/frame";
import { createVideo, getVideoFor, updateVideoChoices, videoView, type Video } from "@/server/videos/videos";
import { GET as listAvatarsRoute, POST as uploadAvatarRoute } from "@/app/api/avatares/route";
import { PATCH as patchAvatarRoute } from "@/app/api/avatares/[avatarId]/route";
import { GET as avatarImageRoute } from "@/app/api/avatares/[avatarId]/imagen/route";
import { GET as listVariantsRoute, POST as createVariantRoute } from "@/app/api/productos/[id]/variantes/route";
import { POST as importVariantsRoute } from "@/app/api/productos/[id]/variantes/importar/route";
import { PUT as putVideo } from "@/app/api/videos/[videoId]/route";
import { fakeMessages, type FakeCall } from "./helpers/fake-llm";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/**
 * Biblioteca de avatares, avatar automático y variantes de producto. Imágenes de verdad (hechas con
 * ffmpeg): se guardan comprobando su formato y el desglose las reduce con ffmpeg.
 */

let dir: string;
const images: Record<string, Buffer> = {};
function makeImage(name: string, color: string, ext = "jpg"): Buffer {
  const file = path.join(dir, `${name}.${ext}`);
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=320x480`, "-frames:v", "1", file]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
  return fs.readFileSync(file);
}
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-avatares-"));
  for (const [name, color] of Object.entries({
    a: "red", b: "green", c: "blue", d: "yellow", e: "white", f: "black", g: "gray", h: "orange", i: "purple", j: "pink", k: "brown",
  })) {
    images[name] = makeImage(name, color);
  }
  images.png = makeImage("png", "cyan", "png");
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await stopWorker();
});

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;

const as = async (user: AuthUser | null) => {
  cookie.value = user ? (await login(user.email, TEST_PASSWORD))!.token : undefined;
};
const json = (method: string, body: unknown) =>
  new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function avatarForm(bytes: Buffer, fields: Record<string, string | string[]>) {
  const form = new FormData();
  form.append("archivo", new File([new Uint8Array(bytes)], "avatar.png", { type: "image/png" }));
  for (const [name, value] of Object.entries(fields)) for (const v of [value].flat()) form.append(name, v);
  return new Request("http://localhost/api/avatares", { method: "POST", body: form });
}
const avatarParams = (avatarId: number | string) => ({ params: Promise.resolve({ avatarId: String(avatarId) }) });
const productParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const videoParams = (videoId: number) => ({ params: Promise.resolve({ videoId: String(videoId) }) });

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  await seedRules();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "EisWerk", summary: "Hace helado en casa", countries: ["DE", "AT", "CH"] });
});

async function addAvatar(image: string, meta: { name: string; group: string; ageYears?: number | null; tags?: string[]; retired?: boolean }): Promise<AvatarInfo> {
  return (await uploadAvatar(dueno, images[image], meta)).avatar;
}

// ───────────────────────── Biblioteca ─────────────────────────

describe("biblioteca de avatares", () => {
  it("todos la ven y ven las imágenes; solo el dueño sube y cambia (403)", async () => {
    const avatar = await addAvatar("a", { name: "mujer 1", group: "mujer" });
    await as(ana);
    const list = await listAvatarsRoute();
    expect(list.status).toBe(200);
    expect((await list.json()).avatars.map((a: AvatarInfo) => a.name)).toEqual(["mujer 1"]);
    const image = await avatarImageRoute(new Request("http://localhost/x"), avatarParams(avatar.id));
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    expect(Buffer.from(await image.arrayBuffer()).equals(images.a)).toBe(true);

    expect((await uploadAvatarRoute(avatarForm(images.b, { nombre: "mujer 2", grupo: "mujer" }))).status).toBe(403);
    expect((await patchAvatarRoute(json("PATCH", { ageYears: 30 }), avatarParams(avatar.id))).status).toBe(403);
    await expect(updateAvatar(ana, avatar.id, { ageYears: 30 })).rejects.toMatchObject({ status: 403 });
    await expect(uploadAvatar(ana, images.b, { name: "x", group: "mujer" })).rejects.toMatchObject({ status: 403 });

    await as(null);
    process.env.PRINCIPAL_AUTH = "1";
    expect((await listAvatarsRoute()).status).toBe(401);
    expect((await avatarImageRoute(new Request("http://localhost/x"), avatarParams(avatar.id))).status).toBe(401);
  });

  it("subida del dueño: tipo por el contenido, rasgos normalizados, idempotente por sha256 y nombre único", async () => {
    await as(dueno);
    const created = await uploadAvatarRoute(
      avatarForm(images.png, { nombre: "hombre 1", grupo: "hombre", numero: "1", edad: "55", rasgos: ["Alemán", "nórdico"], descripcion: "Barba canosa", higgsfield: "2bf8dca5-c94c" }),
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body).toMatchObject({
      created: true,
      avatar: { name: "hombre 1", group: "hombre", number: 1, ageYears: 55, tags: ["aleman", "nordico"], description: "Barba canosa", mime: "image/png", retired: false },
    });
    expect(body.avatar.sha256).toBe(sha(images.png));
    expect(body.avatar).not.toHaveProperty("data");

    // La misma imagen otra vez: no cambia nada (no pisa lo que el dueño puso a mano).
    await updateAvatar(dueno, body.avatar.id, { ageYears: 50 });
    const again = await uploadAvatarRoute(avatarForm(images.png, { nombre: "otro", grupo: "mujer", edad: "20" }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ created: false, avatar: { id: body.avatar.id, name: "hombre 1", ageYears: 50 } });

    // Otro archivo con el mismo nombre: 409.
    const clash = await uploadAvatarRoute(avatarForm(images.b, { nombre: "hombre 1", grupo: "hombre" }));
    expect(clash.status).toBe(409);
    // Lo que no es una imagen, grupo raro, sin nombre: 400.
    expect((await uploadAvatarRoute(avatarForm(Buffer.from("no soy una imagen"), { nombre: "x", grupo: "mujer" }))).status).toBe(400);
    expect((await uploadAvatarRoute(avatarForm(images.c, { nombre: "x", grupo: "abuela" }))).status).toBe(400);
    expect((await uploadAvatarRoute(avatarForm(images.c, { grupo: "mujer" }))).status).toBe(400);
    expect((await uploadAvatarRoute(avatarForm(images.c, { nombre: "x", grupo: "mujer", edad: "abc" }))).status).toBe(400);
    expect(await listAvatars()).toHaveLength(1);
  });

  it("más de 8 MB: 413", async () => {
    const big = Buffer.concat([images.a, Buffer.alloc(8 * 1024 * 1024)]);
    await expect(uploadAvatar(dueno, big, { name: "grande", group: "mujer" })).rejects.toMatchObject({ status: 413 });
  });

  it("editar edad, rasgos y descripción; retirar lo saca de la elección automática", async () => {
    const avatar = await addAvatar("a", { name: "mujer 1", group: "mujer" });
    await as(dueno);
    const response = await patchAvatarRoute(json("PATCH", { ageYears: 34, tags: ["Alemán", "rubia", ""], description: "  Pelo rubio " }), avatarParams(avatar.id));
    expect(response.status).toBe(200);
    expect((await response.json()).avatar).toMatchObject({ ageYears: 34, tags: ["aleman", "rubia"], description: "Pelo rubio" });
    expect((await patchAvatarRoute(json("PATCH", { ageYears: 200 }), avatarParams(avatar.id))).status).toBe(400);
    expect((await patchAvatarRoute(json("PATCH", { ageYears: 30 }), avatarParams(999))).status).toBe(404);

    expect((await activeAvatarSummaries()).map((a) => a.id)).toEqual([avatar.id]);
    await updateAvatar(dueno, avatar.id, { retired: true });
    expect(await activeAvatarSummaries()).toEqual([]);
    expect((await listAvatars())[0].retired).toBe(true);
  });
});

// ───────────────────────── Variantes ─────────────────────────

describe("variantes del producto", () => {
  it("quien ve el producto las crea, cambia y borra; otra persona recibe 404; las fotos tienen que ser del producto", async () => {
    const rosa = (await addProductPhoto(ana, producto.id, images.a, "articulo")).id;
    const rosa2 = (await addProductPhoto(ana, producto.id, images.b, "articulo")).id;
    const caja = (await addProductPhoto(ana, producto.id, images.c, "embalaje")).id;
    const otro = await makeProduct(luis);
    const ajena = (await addProductPhoto(luis, otro.id, images.d, "articulo")).id;

    await as(ana);
    const created = await createVariantRoute(json("POST", { name: " rosa ", articlePhotoIds: [rosa2, rosa], packagingPhotoId: caja }), productParams(producto.id));
    expect(created.status).toBe(201);
    const variant = (await created.json()).variant;
    expect(variant).toMatchObject({ name: "rosa", articlePhotoIds: [rosa2, rosa], packagingPhotoId: caja });
    expect((await createVariantRoute(json("POST", { name: "rosa", articlePhotoIds: [rosa] }), productParams(producto.id))).status).toBe(409);
    expect((await createVariantRoute(json("POST", { name: "azul", articlePhotoIds: [ajena] }), productParams(producto.id))).status).toBe(400);
    expect((await createVariantRoute(json("POST", { name: "azul", articlePhotoIds: [] }), productParams(producto.id))).status).toBe(400);
    expect((await listVariantsRoute(new Request("http://localhost/x"), productParams(producto.id))).status).toBe(200);

    await as(luis);
    expect((await listVariantsRoute(new Request("http://localhost/x"), productParams(producto.id))).status).toBe(404);
    await expect(updateVariant(luis, producto.id, variant.id, { name: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteVariant(luis, producto.id, variant.id)).rejects.toMatchObject({ status: 404 });
    // Una variante de otro producto: el mismo 404.
    await expect(updateVariant(luis, otro.id, variant.id, { name: "x" })).rejects.toMatchObject({ status: 404 });

    expect(await updateVariant(ana, producto.id, variant.id, { articlePhotoIds: [rosa], packagingPhotoId: null })).toMatchObject({
      articlePhotoIds: [rosa],
      packagingPhotoId: null,
    });
    // Una foto borrada deja de salir.
    await updateVariant(ana, producto.id, variant.id, { articlePhotoIds: [rosa, rosa2] });
    await deleteProductPhoto(ana, rosa);
    expect((await listVariants(ana, producto.id))[0].articlePhotoIds).toEqual([rosa2]);
    await deleteVariant(ana, producto.id, variant.id);
    expect(await listVariants(ana, producto.id)).toEqual([]);
  });

  it("importar por sha256 (solo el dueño): crea las que tienen todas sus fotos y dice qué salta y por qué", async () => {
    const rosa = (await addProductPhoto(ana, producto.id, images.a, "articulo")).id;
    const cajaRosa = (await addProductPhoto(ana, producto.id, images.b, "embalaje")).id;
    const azul = (await addProductPhoto(ana, producto.id, images.c, "articulo")).id;
    const body = {
      variants: [
        { name: "rosa", articleSha256: [sha(images.a)], packagingSha256: sha(images.b) },
        { name: "azul", articleSha256: [sha(images.c).toUpperCase()] },
        { name: "fresa", articleSha256: [sha(images.k)], packagingSha256: sha(images.j) },
        { name: "virutas", articleSha256: ["no-es-un-sha"] },
      ],
    };

    await as(ana);
    expect((await importVariantsRoute(json("POST", body), productParams(producto.id))).status).toBe(403);
    await expect(importVariants(ana, producto.id, body)).rejects.toMatchObject({ status: 403 });

    await as(dueno);
    const response = await importVariantsRoute(json("POST", body), productParams(producto.id));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.created.map((v: { name: string }) => v.name)).toEqual(["rosa", "azul"]);
    expect(result.skipped).toEqual([
      { name: "fresa", reason: "faltan 2 fotos en el producto" },
      { name: "virutas", reason: "articleSha256 no válido" },
    ]);
    expect(await listVariants(dueno, producto.id)).toMatchObject([
      { name: "rosa", articlePhotoIds: [rosa], packagingPhotoId: cajaRosa },
      { name: "azul", articlePhotoIds: [azul], packagingPhotoId: null },
    ]);

    // Repetir no duplica.
    const again = await importVariants(dueno, producto.id, body);
    expect(again.created).toEqual([]);
    expect(again.skipped.slice(0, 2)).toEqual([
      { name: "rosa", reason: "ya existe" },
      { name: "azul", reason: "ya existe" },
    ]);
    expect((await importVariantsRoute(json("POST", { nada: 1 }), productParams(producto.id))).status).toBe(400);
  });

  it("con variante, el manifiesto lleva solo sus fotos de artículo (en su orden) y su embalaje", async () => {
    const articulo1 = (await addProductPhoto(ana, producto.id, images.a, "articulo")).id;
    const articulo2 = (await addProductPhoto(ana, producto.id, images.b, "articulo")).id;
    const embalaje1 = (await addProductPhoto(ana, producto.id, images.c, "embalaje")).id;
    const rosaA = (await addProductPhoto(ana, producto.id, images.d, "otro")).id;
    const rosaB = (await addProductPhoto(ana, producto.id, images.e, "articulo")).id;
    const rosaCaja = (await addProductPhoto(ana, producto.id, images.f, "embalaje")).id;
    const avatar = (await addProductPhoto(ana, producto.id, images.g, "avatar")).id;
    const rosa = await createVariant(ana, producto.id, { name: "rosa", articlePhotoIds: [rosaB, rosaA], packagingPhotoId: rosaCaja });
    const v = await createVideo(ana, producto.id);
    await updateVideoChoices(ana, v.id, { avatarPhotoId: avatar });

    const sources = (view: Awaited<ReturnType<typeof videoView>>) => view.imageManifest.map((item) => [item.role, item.source]);
    expect(sources(await videoView(ana, v.id))).toEqual([
      ["composicion", { kind: "reference_frame" }],
      ["avatar", { kind: "photo", photoId: avatar }],
      ["articulo", { kind: "photo", photoId: articulo1 }],
      ["articulo", { kind: "photo", photoId: articulo2 }],
      ["articulo", { kind: "photo", photoId: rosaB }],
      ["embalaje", { kind: "photo", photoId: embalaje1 }],
      ["embalaje", { kind: "photo", photoId: rosaCaja }],
    ]);

    await as(ana);
    expect((await putVideo(json("PUT", { variantId: rosa.id }), videoParams(v.id))).status).toBe(200);
    const view = await videoView(ana, v.id);
    expect(sources(view)).toEqual([
      ["composicion", { kind: "reference_frame" }],
      ["avatar", { kind: "photo", photoId: avatar }],
      ["articulo", { kind: "photo", photoId: rosaB }],
      ["articulo", { kind: "photo", photoId: rosaA }],
      ["embalaje", { kind: "photo", photoId: rosaCaja }],
    ]);
    expect(view.clipManifest.map((item) => item.tag)).toEqual(["@Video1", "@Image1", "@Image2", "@Image3", "@Image4", "@Image5"]);

    // Una variante de otro producto no se puede elegir.
    const otro = await makeProduct(ana);
    const ajena = await createVariant(ana, otro.id, { name: "x", articlePhotoIds: [(await addProductPhoto(ana, otro.id, images.h, "articulo")).id] });
    expect((await putVideo(json("PUT", { variantId: ajena.id }), videoParams(v.id))).status).toBe(400);
    // Borrar la variante devuelve el vídeo a las fotos de siempre.
    await deleteVariant(ana, producto.id, rosa.id);
    expect((await getVideoFor(ana, v.id)).variantId).toBeNull();
  });
});

// ───────────────────────── Vídeos con avatar de la biblioteca o automático ─────────────────────────

const REPLY: Analysis = {
  conceptLogic: "Hacer helado en casa es más fácil de lo que parece.",
  shots: [{ startS: 0, endS: 4, seen: "Mujer en la cocina", action: "Saca el helado", onScreenText: "" }],
  adaptation: [],
  risks: [],
  frameUse: "start_image",
  imagePrompt: "Image 1 sets the composition. The woman is the person from image 2. She holds the machine from image 3.",
  videoPrompt: "@Video1 sets the pace. @Image1 is the first frame. The woman is the person from @Image2. The machine is the one from @Image3.",
};
const reply = (extra: Partial<Analysis> = {}) => ({ text: JSON.stringify({ ...REPLY, ...extra }), usage: { inputTokens: 1000, outputTokens: 500 } });
const texts = (call: FakeCall) =>
  (call.messages[0].content as Array<{ type: string; text?: string }>).flatMap((block) => (block.type === "text" ? [block.text!] : []));
const imageCount = (call: FakeCall) => (call.messages[0].content as Array<{ type: string }>).filter((block) => block.type === "image").length;

async function readyReference(videoId: number): Promise<void> {
  const pool = getPool();
  await pool.query(
    "update videos set reference_status = 'ready', reference_media_id = 'media-1', reference_duration_ms = 4000, segment_duration_ms = 4000 where id = $1",
    [videoId],
  );
  await pool.query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, 0, 0, 'image/jpeg', $2, $3)", [
    videoId,
    images.i.length,
    images.i,
  ]);
}

/** Pide y hace el desglose con Claude simulado; devuelve la llamada que recibió. */
async function analyse(videoId: number, extra: Partial<Analysis> = {}): Promise<FakeCall> {
  const { analysisId } = await requestAnalysis(ana, videoId);
  const { client, calls } = fakeMessages([reply(extra)]);
  await runAnalysis(analysisId, { gateway: createGateway({ client }) });
  return calls[0];
}

/** Aprueba una imagen inicial a mano (sin pasar por Higgsfield), para pedir el clip. */
async function approveFakeFrame(videoId: number): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits) values ($1, 'frame', 1, 'done', $2, '{}', 2, 4) returning id",
    [videoId, ana.id],
  );
  const result = await pool.query("insert into generation_results (generation_id, index, job_id, ok, url) values ($1, 0, 'job-frame-1', true, 'https://x/1.png') returning id", [
    rows[0].id,
  ]);
  await pool.query("update videos set approved_frame_result_id = $2 where id = $1", [videoId, result.rows[0].id]);
}

describe("avatar de la biblioteca y automático en los vídeos", () => {
  let v: Video;
  let mujer30: AvatarInfo;
  let mujer33Aleman: AvatarInfo;
  let mujer70: AvatarInfo;
  let hombre40: AvatarInfo;

  beforeEach(async () => {
    await addProductPhoto(ana, producto.id, images.a, "articulo");
    mujer30 = await addAvatar("b", { name: "mujer 1", group: "mujer", ageYears: 30 });
    mujer33Aleman = await addAvatar("c", { name: "mujer 7", group: "mujer", ageYears: 33, tags: ["aleman"] });
    mujer70 = await addAvatar("d", { name: "mujer 9", group: "mujer", ageYears: 70 });
    hombre40 = await addAvatar("e", { name: "hombre 2", group: "hombre", ageYears: 40, tags: ["aleman"] });
    v = await createVideo(ana, producto.id);
    await readyReference(v.id);
  });

  it("«biblioteca»: el avatar va en los manifiestos y Claude ve su imagen; se sube a Higgsfield con ensureMedia (una vez)", async () => {
    await as(ana);
    expect((await putVideo(json("PUT", { avatarLibraryId: mujer30.id }), videoParams(v.id))).status).toBe(200);
    v = await getVideoFor(ana, v.id);
    expect(v).toMatchObject({ avatarMode: "biblioteca", avatarLibraryId: mujer30.id, avatarPhotoId: null });
    const view = await videoView(ana, v.id);
    expect(view.libraryAvatar).toEqual({ id: mujer30.id, name: "mujer 1" });
    expect(view.imageManifest[1]).toMatchObject({ tag: "image 2", role: "avatar", source: { kind: "avatar", avatarId: mujer30.id } });

    const call = await analyse(v.id);
    expect(texts(call)).toContain("image 2 · @Image2 — papel: avatar");
    expect(imageCount(call)).toBe(1 + 2); // fotograma + avatar + artículo

    v = await getVideoFor(ana, v.id);
    const fake = createFakeHiggsfield();
    const built = await buildFrameRequest(ana, v, { higgsfield: fake.port });
    const uploads = fake.calls.filter((c) => c.method === "uploadMedia").map((c) => c.args as { filename: string; bytes: Buffer });
    expect(uploads.map((u) => u.filename)).toEqual([`fotograma-${v.id}.jpg`, `avatar-${mujer30.id}.jpg`, expect.stringMatching(/^foto-\d+\.jpg$/)]);
    expect(uploads[1].bytes.equals(images.b)).toBe(true);
    expect(built.request.medias).toHaveLength(3);
    // Otra vez: ya está subido.
    await buildFrameRequest(ana, v, { higgsfield: fake.port });
    expect(fake.calls.filter((c) => c.method === "uploadMedia")).toHaveLength(3);

    // Un avatar retirado o inexistente no se puede elegir; ni con otro modo.
    await updateAvatar(dueno, mujer70.id, { retired: true });
    expect((await putVideo(json("PUT", { avatarLibraryId: mujer70.id }), videoParams(v.id))).status).toBe(400);
    expect((await putVideo(json("PUT", { avatarLibraryId: 9999 }), videoParams(v.id))).status).toBe(400);
    expect((await putVideo(json("PUT", { avatarLibraryId: mujer33Aleman.id, avatarMode: "nadie" }), videoParams(v.id))).status).toBe(400);
    // Pasar a «nadie» quita el avatar de la biblioteca.
    expect((await putVideo(json("PUT", { avatarMode: "nadie" }), videoParams(v.id))).status).toBe(200);
    expect(await getVideoFor(ana, v.id)).toMatchObject({ avatarMode: "nadie", avatarLibraryId: null });
  });

  it("«Automático»: Claude no ve ningún avatar, describe a la persona y el código elige el parecido del país (mujer ~31, DE → la alemana)", async () => {
    await updateVideoChoices(ana, v.id, { avatarMode: "automatico" });
    expect((await videoView(ana, v.id)).imageManifest[1]).toMatchObject({ role: "avatar", source: { kind: "avatar_pending" } });

    const call = await analyse(v.id, { personaRef: { present: true, gender: "mujer", approxAge: 31, notes: "Pelo castaño" }, angleAudience: null });
    expect(imageCount(call)).toBe(1 + 1); // fotograma + artículo: el avatar aún no existe
    expect(texts(call).join("\n")).toContain("image 2 — avatar (lo elige la aplicación después de este desglose");
    expect((call.system as Array<{ text: string }>).map((b) => b.text).join("\n")).toContain("personaRef");

    const view = await videoView(ana, v.id);
    expect(view.analysis).toMatchObject({ status: "done", stale: false, avatarMode: "automatico", autoAvatar: { id: mujer33Aleman.id, name: "mujer 7" }, questions: [] });
    expect(view.analysis!.result!.autoAvatar).toEqual({
      avatarId: mujer33Aleman.id,
      target: { group: "mujer", age: 31, source: "referencia", label: null },
    });
    // El manifiesto ya lleva el elegido, y la imagen inicial lo sube.
    expect(view.imageManifest[1]).toMatchObject({ source: { kind: "avatar", avatarId: mujer33Aleman.id } });
    const fake = createFakeHiggsfield();
    await buildFrameRequest(ana, await getVideoFor(ana, v.id), { higgsfield: fake.port });
    expect(fake.calls.filter((c) => c.method === "uploadMedia").map((c) => (c.args as { filename: string }).filename)).toContain(`avatar-${mujer33Aleman.id}.jpg`);
  });

  it("«Automático» con «abuelas» en los cambios: una abuela aunque la referencia muestre a alguien de 30", async () => {
    await updateVideoChoices(ana, v.id, { avatarMode: "automatico", note: "Ángulo: para abuelas que miman a sus nietos" });
    await analyse(v.id, { personaRef: { present: true, gender: "mujer", approxAge: 30, notes: "" } });
    const view = await videoView(ana, v.id);
    expect(view.analysis!.autoAvatar).toEqual({ id: mujer70.id, name: "mujer 9" });
    expect(view.analysis!.result!.autoAvatar!.target).toMatchObject({ source: "indicaciones", label: "abuela", age: 70 });
  });

  it("«Automático» sin ninguno que encaje: pregunta (contrato `questions`) y no deja generar hasta elegir", async () => {
    await updateAvatar(dueno, mujer70.id, { retired: true });
    await updateVideoChoices(ana, v.id, { avatarMode: "automatico", note: "für Omas" });
    await analyse(v.id, { personaRef: { present: true, gender: "mujer", approxAge: 30, notes: "" } });
    let view = await videoView(ana, v.id);
    expect(view.analysis!.autoAvatar).toBeNull();
    expect(view.analysis!.questions).toEqual([
      { id: "avatar", text: "Ningún avatar encaja (mujer, ~70 años (abuela)). ¿Cuál sale?", options: ["mujer 7", "mujer 1", "hombre 2"] },
    ]);
    expect(view.imageManifest[1].source).toEqual({ kind: "avatar_pending" });
    v = await getVideoFor(ana, v.id);
    await expect(buildFrameRequest(ana, v, { higgsfield: createFakeHiggsfield().port })).rejects.toMatchObject({
      status: 400,
      message: "Ningún avatar encaja: elige uno antes de generar.",
    });
    await approveFakeFrame(v.id);
    await expect(buildClipRequest(ana, await getVideoFor(ana, v.id), { higgsfield: createFakeHiggsfield().port })).rejects.toMatchObject({ status: 409 });

    // Elegir uno a mano (otro que el automático, que no eligió ninguno) deja el desglose por repetir.
    await updateVideoChoices(ana, v.id, { avatarLibraryId: mujer30.id });
    view = await videoView(ana, v.id);
    expect(view.analysis).toMatchObject({ stale: true, staleReason: "brief" });
  });

  it("caducidad: cambiar el avatar o la variante deja el desglose por repetir; fijar justo el automático no", async () => {
    await updateVideoChoices(ana, v.id, { avatarMode: "automatico" });
    await analyse(v.id, { personaRef: { present: true, gender: "mujer", approxAge: 31, notes: "" } });
    const stale = async () => (await videoView(ana, v.id)).analysis!.staleReason;
    expect(await stale()).toBeNull();

    // Un clic para quedarse con el que eligió: sigue valiendo.
    await updateVideoChoices(ana, v.id, { avatarLibraryId: mujer33Aleman.id });
    expect(await stale()).toBeNull();
    // Otro avatar: ya no.
    await updateVideoChoices(ana, v.id, { avatarLibraryId: mujer30.id });
    expect(await stale()).toBe("brief");
    await updateVideoChoices(ana, v.id, { avatarLibraryId: mujer33Aleman.id });
    expect(await stale()).toBeNull();

    // Con un avatar de la biblioteca elegido a mano, otro avatar también caduca.
    await analyse(v.id);
    expect(await stale()).toBeNull();
    await updateVideoChoices(ana, v.id, { avatarLibraryId: hombre40.id });
    expect(await stale()).toBe("brief");
    await updateVideoChoices(ana, v.id, { avatarLibraryId: mujer33Aleman.id });
    expect(await stale()).toBeNull();

    // Con una foto del producto, otra foto también.
    const foto1 = (await addProductPhoto(ana, producto.id, images.f, "avatar")).id;
    const foto2 = (await addProductPhoto(ana, producto.id, images.g, "avatar")).id;
    await updateVideoChoices(ana, v.id, { avatarPhotoId: foto1 });
    await analyse(v.id);
    expect(await stale()).toBeNull();
    await updateVideoChoices(ana, v.id, { avatarPhotoId: foto2 });
    expect(await stale()).toBe("brief");
    await updateVideoChoices(ana, v.id, { avatarPhotoId: foto1 });

    // La variante.
    const rosa = await createVariant(ana, producto.id, { name: "rosa", articlePhotoIds: [(await addProductPhoto(ana, producto.id, images.h, "articulo")).id] });
    await updateVideoChoices(ana, v.id, { variantId: rosa.id });
    expect(await stale()).toBe("brief");
    await analyse(v.id);
    expect(await stale()).toBeNull();
    await updateVideoChoices(ana, v.id, { variantId: null });
    expect(await stale()).toBe("brief");
    // Y la imagen inicial no se pide con un desglose caducado.
    await expect(buildFrameRequest(ana, await getVideoFor(ana, v.id), { higgsfield: createFakeHiggsfield().port })).rejects.toMatchObject({ status: 400 });
  });

  it("variante dudosa: con variantes y ninguna elegida, pregunta si la referencia no coincide claramente con una", async () => {
    const rosa = (await addProductPhoto(ana, producto.id, images.h, "articulo")).id;
    const azul = (await addProductPhoto(ana, producto.id, images.j, "articulo")).id;
    await createVariant(ana, producto.id, { name: "rosa", articlePhotoIds: [rosa] });
    const azulVariant = await createVariant(ana, producto.id, { name: "azul turquesa", articlePhotoIds: [azul] });
    await updateVideoChoices(ana, v.id, { avatarLibraryId: mujer30.id });

    const call = await analyse(v.id, { variantMatch: null });
    expect(texts(call).join("\n")).toContain("Variantes: rosa, azul turquesa");
    expect((call.system as Array<{ text: string }>).map((b) => b.text).join("\n")).toContain("variantMatch");
    expect((await videoView(ana, v.id)).analysis!.questions).toEqual([{ id: "variante", text: "¿Qué variante sale?", options: ["rosa", "azul turquesa"] }]);

    await analyse(v.id, { variantMatch: "Azul Turquesa" });
    expect((await videoView(ana, v.id)).analysis!.questions).toEqual([]);

    await updateVideoChoices(ana, v.id, { variantId: azulVariant.id });
    await analyse(v.id, { variantMatch: null });
    expect((await videoView(ana, v.id)).analysis!.questions).toEqual([]);
  });

  it("lotes: tarjetas con «Automático», con avatar de la biblioteca y con variante; el tablero enseña el elegido y el duplicado lo conserva", async () => {
    const rosa = await createVariant(ana, producto.id, { name: "rosa", articlePhotoIds: [(await addProductPhoto(ana, producto.id, images.h, "articulo")).id] });
    const batch = await createBatch(ana, "Lote", { autoAnalyze: false });
    const auto = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "automatico", variantId: rosa.id });
    const lib = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "biblioteca", avatarLibraryId: hombre40.id });
    expect(auto).toMatchObject({ avatarMode: "automatico", variantId: rosa.id, avatarLibraryId: null });
    expect(lib).toMatchObject({ avatarMode: "biblioteca", avatarLibraryId: hombre40.id, variantId: null });

    await expect(addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "biblioteca" })).rejects.toMatchObject({ status: 400 });
    await expect(
      addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "nadie", avatarLibraryId: hombre40.id }),
    ).rejects.toMatchObject({ status: 400 });
    const otro = await makeProduct(ana);
    const ajena = await createVariant(ana, otro.id, { name: "x", articlePhotoIds: [(await addProductPhoto(ana, otro.id, images.k, "articulo")).id] });
    await expect(addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "nadie", variantId: ajena.id })).rejects.toMatchObject({
      status: 400,
    });

    await readyReference(auto.id);
    await analyse(auto.id, { personaRef: { present: true, gender: "hombre", approxAge: 45, notes: "" } });
    const board = await batchView(ana, batch.id);
    expect(board.rows.map((row) => [row.avatarMode, row.autoAvatar, row.libraryAvatar, row.variantId, row.questions])).toEqual([
      ["automatico", { id: hombre40.id, name: "hombre 2" }, null, rosa.id, 0],
      ["biblioteca", null, { id: hombre40.id, name: "hombre 2" }, null, 0],
    ]);

    const copy = await duplicateBatchVideo(ana, batch.id, auto.id);
    expect(copy).toMatchObject({ avatarMode: "automatico", variantId: rosa.id });
    const copied = await videoView(ana, copy.id);
    expect(copied.analysis).toMatchObject({ stale: false, autoAvatar: { id: hombre40.id, name: "hombre 2" } });
  });

  it("un colaborador elige avatares de la biblioteca aunque no pueda cambiarlos", async () => {
    await setAssignments(dueno, luis.id, [producto.id]);
    const suyo = await createVideo(luis, producto.id);
    expect((await updateVideoChoices(luis, suyo.id, { avatarLibraryId: mujer30.id })).avatarMode).toBe("biblioteca");
    // Pero no el vídeo de otra persona.
    await expect(updateVideoChoices(luis, v.id, { avatarLibraryId: mujer30.id })).rejects.toMatchObject({ status: 403 });
  });
  it("«Preguntas del lote»: la del avatar y la de la variante salen con sus opciones y responderlas cambia el vídeo", async () => {
    const rosaFoto = (await addProductPhoto(ana, producto.id, images.h, "articulo")).id;
    const rosa = await createVariant(ana, producto.id, { name: "rosa", articlePhotoIds: [rosaFoto] });
    await createVariant(ana, producto.id, { name: "azul", articlePhotoIds: [(await addProductPhoto(ana, producto.id, images.j, "articulo")).id] });
    await updateAvatar(dueno, mujer70.id, { retired: true });
    const batch = await createBatch(ana, "Lote", { autoAnalyze: false });
    const video = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "automatico", note: "für Omas" });
    await readyReference(video.id);
    await analyse(video.id, {
      personaRef: { present: true, gender: "mujer", approxAge: 30, notes: "" },
      variantMatch: null,
      questions: [{ id: "luz", text: "¿Cocina de día o de noche?", options: ["día", "noche"] }],
    });
    // Las de Claude se conservan junto a las de la aplicación.
    expect((await videoView(ana, video.id)).analysis!.questions.map((q) => q.id)).toEqual(["luz", "avatar", "variante"]);
    await getPool().query("update batches set status = 'preguntas' where id = $1", [batch.id]);

    const asked = await batchQuestions(ana, batch.id);
    expect(asked.map((q) => q.kind)).toEqual(["biblioteca", "variante"]);
    const avatarQuestion = asked[0];
    // Primero los que sugiere el desglose; con su imagen.
    expect(avatarQuestion.options[0]).toEqual({ value: `bib:${mujer33Aleman.id}`, label: "mujer 7", avatarId: mujer33Aleman.id });
    expect(avatarQuestion.options.map((o) => o.label)).not.toContain("mujer 9");
    expect(asked[1].options.map((o) => o.label)).toEqual(["rosa", "azul", "Fotos de siempre"]);

    await expect(answerQuestion(ana, batch.id, { videoId: video.id, key: avatarQuestion.key, value: "bib:99999" })).rejects.toMatchObject({ status: 400 });
    await answerQuestion(ana, batch.id, { videoId: video.id, key: avatarQuestion.key, value: `bib:${mujer30.id}` });
    expect(await getVideoFor(ana, video.id)).toMatchObject({ avatarMode: "biblioteca", avatarLibraryId: mujer30.id });
    await answerQuestion(ana, batch.id, { videoId: video.id, key: asked[1].key, value: `var:${rosa.id}` });
    expect((await getVideoFor(ana, video.id)).variantId).toBe(rosa.id);
    // No queda ninguna: las preguntas libres de Claude no se hacen al dueño.
    expect(await batchQuestions(ana, batch.id)).toEqual([]);
    expect((await videoView(ana, video.id)).analysis).toMatchObject({ stale: true, staleReason: "brief" });
  });

  it("una respuesta escrita del dueño en «Preguntas del lote» cuenta para el avatar automático", async () => {
    await getPool().query("update videos set avatar_mode = 'automatico', owner_answers = $2::jsonb where id = $1", [
      v.id,
      JSON.stringify([{ key: "c1:x", question: "¿Quién lo usa?", answer: "Una abuela con sus nietos", inBrief: true }]),
    ]);
    await analyse(v.id, { personaRef: { present: true, gender: "mujer", approxAge: 30, notes: "" } });
    expect((await videoView(ana, v.id)).analysis!.autoAvatar).toEqual({ id: mujer70.id, name: "mujer 9" });
  });
});
