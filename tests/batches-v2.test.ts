import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { startingAvatar } from "@/lib/default-avatar";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { setPersonDisabled } from "@/server/people";
import { addProductPhoto } from "@/server/photos";
import { updateProduct, type Product } from "@/server/products";
import { seedRules } from "@/server/rules";
import { autoAnalyzePending, autoRequestAnalysis, ownerNotes } from "@/server/videos/analysis";
import {
  addVideoToBatch,
  batchView,
  createBatch,
  duplicateBatchVideo,
  removeBatchVideo,
  setBatchAutoAnalyze,
  setBatchProductNotes,
} from "@/server/videos/batches";
import { briefOf } from "@/server/videos/brief";
import { createVideo, getVideoFor, updateVideoChoices, videoView, type Video } from "@/server/videos/videos";
import { PATCH as patchBatchRoute } from "@/app/api/lotes/[id]/route";
import { PUT as notesRoute } from "@/app/api/lotes/[id]/productos/[productId]/route";
import { DELETE as removeRoute } from "@/app/api/lotes/[id]/videos/[videoId]/route";
import { POST as duplicateRoute } from "@/app/api/lotes/[id]/videos/[videoId]/duplicar/route";
import { PATCH as patchProductRoute } from "@/app/api/productos/[id]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let lampara: Product;
let botella: Product;
let avatar: number;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const json = (body: unknown, method = "PUT") => new Request("http://localhost/x", { method, body: JSON.stringify(body) });

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  await seedRules();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  lampara = await makeProduct(ana, { name: "Lámpara Luna" });
  botella = await makeProduct(ana, { name: "Botella" });
  avatar = (await addProductPhoto(ana, lampara.id, JPEG, "avatar")).id;
  await addProductPhoto(ana, lampara.id, JPEG, "articulo");
});

afterAll(async () => {
  await stopWorker();
});

/** Referencia lista como la dejaría la preparación (`media`), con dos fotogramas. */
async function readyReference(videoId: number, media = "media-1"): Promise<void> {
  const pool = getPool();
  await pool.query(
    "update videos set reference_status = 'ready', reference_media_id = $2, reference_duration_ms = 6000, segment_duration_ms = 6000, cuts_ms = '[2000]'::jsonb where id = $1",
    [videoId, media],
  );
  await pool.query("delete from video_frames where video_id = $1", [videoId]);
  for (const index of [0, 1]) {
    await pool.query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, $2, $3, 'image/jpeg', $4, $5)", [
      videoId,
      index,
      index * 500,
      JPEG.length,
      JPEG,
    ]);
  }
}

const analysesOf = async (videoId: number) =>
  (await getPool().query("select id, status, reference_media_id as media, product_notes as \"productNotes\" from video_analyses where video_id = $1 order by id", [videoId]))
    .rows;

async function batchVideo(batchId: number, over: Record<string, unknown> = {}): Promise<Video> {
  return addVideoToBatch(ana, batchId, { productId: lampara.id, avatarPhotoId: avatar, avatarMode: "elegido", ...over });
}

describe("indicaciones por producto del lote", () => {
  it("se guardan por lote y producto, llegan al desglose y cambiarlas deja el desglose por repetir", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id, { note: "Gancho\nen 1 s" });
    expect(await setBatchProductNotes(ana, lote.id, lampara.id, "  Siempre de noche, luz cálida  ")).toBe("Siempre de noche, luz cálida");

    // Lo que se manda a Claude: las del producto, y después las del vídeo.
    const brief = briefOf({ ...(await getVideoFor(ana, v.id)), productNotes: "Siempre de noche, luz cálida", answers: null });
    expect(ownerNotes(brief)).toBe(
      [
        "<indicaciones_del_encargo>",
        "Para todos los vídeos de este producto en el lote:",
        "<indicaciones_del_producto>",
        "Siempre de noche, luz cálida",
        "</indicaciones_del_producto>",
        "Cambios específicos de este vídeo:",
        "<cambios_especificos>",
        "Gancho\nen 1 s",
        "</cambios_especificos>",
        "</indicaciones_del_encargo>",
      ].join("\n"),
    );

    // Un desglose hecho con esas indicaciones vale; al cambiarlas, ya no.
    await readyReference(v.id);
    await getPool().query(
      "insert into video_analyses (video_id, version, status, reference_media_id, note, product_notes, created_by) values ($1, 1, 'done', 'media-1', $2, $3, $4)",
      [v.id, "Gancho\nen 1 s", "Siempre de noche, luz cálida", ana.id],
    );
    expect((await videoView(ana, v.id)).analysis).toMatchObject({ stale: false });
    expect((await videoView(ana, v.id)).productNotes).toBe("Siempre de noche, luz cálida");
    expect((await batchView(ana, lote.id)).rows[0].analysis).toMatchObject({ stale: false });
    await setBatchProductNotes(ana, lote.id, lampara.id, "De día");
    expect((await videoView(ana, v.id)).analysis).toMatchObject({ stale: true, staleReason: "brief" });
    expect((await batchView(ana, lote.id)).rows[0].analysis).toMatchObject({ stale: true, staleReason: "brief" });
    // Quitarlas también cuenta.
    expect(await setBatchProductNotes(ana, lote.id, lampara.id, "   ")).toBeNull();
    expect((await batchView(ana, lote.id)).groups).toEqual([{ productId: lampara.id, name: "Lámpara Luna", coverPhotoId: expect.any(Number), notes: null, videos: 1 }]);
    expect((await videoView(ana, v.id)).analysis).toMatchObject({ stale: true });
  });

  it("solo quien creó el lote, con un producto que ve, y como mucho 4.000 caracteres", async () => {
    const lote = await createBatch(ana, "A");
    await expect(setBatchProductNotes(ana, lote.id, lampara.id, "x".repeat(4_001))).rejects.toMatchObject({
      status: 400,
      message: "Las indicaciones no pueden tener más de 4.000 caracteres.",
    });
    await expect(setBatchProductNotes(ana, lote.id, lampara.id, 5)).rejects.toMatchObject({ status: 400 });
    await expect(setBatchProductNotes(dueno, lote.id, lampara.id, "x")).rejects.toMatchObject({ status: 403 });
    await expect(setBatchProductNotes(luis, lote.id, lampara.id, "x")).rejects.toMatchObject({ status: 404 });
    const deLuis = await makeProduct(luis);
    await expect(setBatchProductNotes(ana, lote.id, deLuis.id, "x")).rejects.toMatchObject({ status: 404 });
    expect(await setBatchProductNotes(ana, lote.id, lampara.id, "x".repeat(4_000))).toHaveLength(4_000);

    await as(ana);
    const ctx = (productId: number) => ({ params: Promise.resolve({ id: String(lote.id), productId: String(productId) }) });
    const ok = await notesRoute(json({ notes: "Más luz" }), ctx(botella.id));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ notes: "Más luz" });
    expect((await notesRoute(json({ notes: ["x"] }), ctx(botella.id))).status).toBe(400);
    await as(luis);
    expect((await notesRoute(json({ notes: "x" }), ctx(botella.id))).status).toBe(404);
  });

  it("«Cambios específicos»: varias líneas y hasta 6.000 caracteres", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id, { note: " Uno\r\nDos " });
    expect(v.note).toBe("Uno\nDos");
    expect(await updateVideoChoices(ana, v.id, { note: "x".repeat(6_000) })).toMatchObject({ note: "x".repeat(6_000) });
    await expect(updateVideoChoices(ana, v.id, { note: "x".repeat(6_001) })).rejects.toMatchObject({
      status: 400,
      message: "«Cambios específicos» no puede tener más de 6.000 caracteres.",
    });
  });
});

describe("tablero agrupado por producto", () => {
  it("un grupo por producto en el orden de su primer vídeo, con portada, indicaciones y cuántos vídeos", async () => {
    const lote = await createBatch(ana, "A");
    await batchVideo(lote.id);
    await addVideoToBatch(ana, lote.id, { productId: botella.id, avatarPhotoId: null, avatarMode: "nadie" });
    await batchVideo(lote.id);
    await setBatchProductNotes(ana, lote.id, botella.id, "Sin texto");
    const view = await batchView(ana, lote.id);
    expect(view.batch.autoAnalyze).toBe(true);
    expect(view.groups.map((g) => [g.productId, g.name, g.notes, g.videos])).toEqual([
      [lampara.id, "Lámpara Luna", null, 2],
      [botella.id, "Botella", "Sin texto", 1],
    ]);
    expect(view.groups[0].coverPhotoId).not.toBeNull();
    expect(view.groups[1].coverPhotoId).toBeNull();
  });

  it("enseña los riesgos del último desglose hecho", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id);
    await readyReference(v.id);
    const risks = [
      { kind: "texto_en_pantalla", detail: "La referencia lleva un rótulo." },
      { kind: "funcion_inexistente", detail: "La lámpara no cambia de color." },
    ];
    await getPool().query(
      "insert into video_analyses (video_id, version, status, reference_media_id, result, created_by) values ($1, 1, 'done', 'media-1', $2, $3)",
      [v.id, JSON.stringify({ risks }), ana.id],
    );
    expect((await batchView(ana, lote.id)).rows[0].risks).toEqual(risks);
    // Con otro desglose en marcha, todavía no hay riesgos que enseñar.
    await getPool().query("insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 2, 'queued', 'media-1', $2)", [
      v.id,
      ana.id,
    ]);
    expect((await batchView(ana, lote.id)).rows[0].risks).toEqual([]);
  });
});

describe("duplicar y quitar filas", () => {
  it("duplicar copia lo elegido y reutiliza la referencia lista con sus fotogramas; sin desglose válido, espera a que lo cambien", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id, { kind: "adaptacion_concepto", adaptation: "Idea", note: "Más luz" });
    await updateVideoChoices(ana, v.id, { clipResolution: "720p" });
    await readyReference(v.id);
    // Un desglose de otras indicaciones (replicar, sin nota): no vale y no se copia.
    await getPool().query("insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 1, 'done', 'media-1', $2)", [
      v.id,
      ana.id,
    ]);

    const copy = await duplicateBatchVideo(ana, lote.id, v.id);
    expect(copy).toMatchObject({
      batchId: lote.id,
      productId: lampara.id,
      title: "Vídeo 2",
      kind: "adaptacion_concepto",
      adaptation: "Idea",
      note: "Más luz",
      avatarMode: "elegido",
      avatarPhotoId: avatar,
      clipResolution: "720p",
      referenceStatus: "ready",
      referenceMediaId: "media-1",
      segmentDurationMs: 6000,
      cutsMs: [2000],
      imagePrompt: null,
      skipAutoAnalysis: true,
    });
    expect((await videoView(ana, copy.id)).frames).toEqual([
      { index: 0, timeMs: 0 },
      { index: 1, timeMs: 500 },
    ]);
    expect(await analysesOf(copy.id)).toEqual([]);
    // No se gasta en Claude por un duplicado que nadie ha tocado…
    expect(await autoRequestAnalysis(copy.id)).toBe(false);
    expect(await autoAnalyzePending()).toBe(0);
    expect(await analysesOf(copy.id)).toEqual([]);
    // …hasta que se cambia.
    await updateVideoChoices(ana, copy.id, { note: "Menos luz" });
    expect(await autoAnalyzePending()).toBe(1);
    expect(await analysesOf(copy.id)).toHaveLength(1);

    // Sin referencia lista, el duplicado empieza sin referencia.
    const sinReferencia = await batchVideo(lote.id);
    expect(await duplicateBatchVideo(ana, lote.id, sinReferencia.id)).toMatchObject({ referenceStatus: "none", referenceMediaId: null, skipAutoAnalysis: false });
  });

  it("duplicar con un desglose válido lo copia (resultado, prompts y uso de la imagen) sin gastar; al editar el duplicado deja de valer", async () => {
    const lote = await createBatch(ana, "A");
    await setBatchProductNotes(ana, lote.id, lampara.id, "Luz cálida");
    const v = await batchVideo(lote.id, { note: "Más luz" });
    await readyReference(v.id);
    const result = { conceptLogic: "Idea", risks: [{ kind: "escala", detail: "Sin mano." }], imagePrompt: "Image 1 …", videoPrompt: "@Video1 …", frameUse: "contextual_reference" };
    await getPool().query(
      `insert into video_analyses (video_id, version, status, reference_media_id, note, product_notes, result, rule_versions, spend_entry_id, created_by)
       values ($1, 1, 'done', 'media-1', 'Más luz', 'Luz cálida', $2, '{"video-seedance": 3}'::jsonb, 77, $3)`,
      [v.id, JSON.stringify(result), ana.id],
    );
    await getPool().query("update videos set image_prompt = 'Image 1 …', video_prompt = '@Video1 …', frame_use = 'contextual_reference' where id = $1", [v.id]);

    const copy = await duplicateBatchVideo(ana, lote.id, v.id);
    expect(copy).toMatchObject({ imagePrompt: "Image 1 …", videoPrompt: "@Video1 …", frameUse: "contextual_reference", skipAutoAnalysis: false });
    const [copied] = (
      await getPool().query(
        'select version, status, result, note, product_notes as "productNotes", rule_versions as "ruleVersions", spend_entry_id as "spendEntryId" from video_analyses where video_id = $1',
        [copy.id],
      )
    ).rows;
    expect(copied).toEqual({ version: 1, status: "done", result, note: "Más luz", productNotes: "Luz cálida", ruleVersions: { "video-seedance": 3 }, spendEntryId: null });
    expect((await videoView(ana, copy.id)).analysis).toMatchObject({ status: "done", stale: false, costMicros: null });
    expect((await batchView(ana, lote.id)).rows.find((r) => r.id === copy.id)?.risks).toEqual(result.risks);
    // Ya tiene un desglose de esta referencia: el automático no pide otro.
    expect(await autoRequestAnalysis(copy.id)).toBe(false);
    expect(await analysesOf(copy.id)).toHaveLength(1);
    // Al editar el duplicado, su desglose deja de valer como el de cualquier vídeo.
    await updateVideoChoices(ana, copy.id, { note: "Otra cosa" });
    expect((await videoView(ana, copy.id)).analysis).toMatchObject({ stale: true, staleReason: "brief" });
    expect((await videoView(ana, v.id)).analysis).toMatchObject({ stale: false });
  });

  it("duplicar es todo o nada: si algo falla a mitad, no queda ningún vídeo", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id);
    await readyReference(v.id);
    const pool = getPool();
    await pool.query(`create function prueba_sin_fotogramas() returns trigger language plpgsql as $$
      begin raise exception 'corte simulado'; end $$`);
    await pool.query("create trigger prueba_sin_fotogramas before insert on video_frames for each row execute function prueba_sin_fotogramas()");
    try {
      await expect(duplicateBatchVideo(ana, lote.id, v.id)).rejects.toThrow();
    } finally {
      await pool.query("drop trigger if exists prueba_sin_fotogramas on video_frames");
      await pool.query("drop function if exists prueba_sin_fotogramas()");
    }
    expect((await batchView(ana, lote.id)).rows.map((r) => r.id)).toEqual([v.id]);
  });

  it("quitar borra el vídeo mientras no tenga ninguna generación", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id);
    const otro = await batchVideo(lote.id);
    await getPool().query(
      "insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits) values ($1, 'frame', 1, 'failed', $2, '{}', 2, 4)",
      [otro.id, ana.id],
    );
    expect((await batchView(ana, lote.id)).rows.map((r) => [r.id, r.removable])).toEqual([
      [v.id, true],
      [otro.id, false],
    ]);
    await expect(removeBatchVideo(ana, lote.id, otro.id)).rejects.toMatchObject({ status: 409 });
    // Con un desglose en cola o en marcha, tampoco: se está pagando.
    await readyReference(v.id);
    for (const status of ["queued", "running"]) {
      await getPool().query("delete from video_analyses where video_id = $1", [v.id]);
      await getPool().query("insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 1, $2, 'media-1', $3)", [
        v.id,
        status,
        ana.id,
      ]);
      await expect(removeBatchVideo(ana, lote.id, v.id)).rejects.toMatchObject({
        status: 409,
        message: "Este vídeo se está desglosando: espera a que termine para quitarlo.",
      });
    }
    await getPool().query("update video_analyses set status = 'failed' where video_id = $1", [v.id]);
    await removeBatchVideo(ana, lote.id, v.id);
    await expect(getVideoFor(ana, v.id)).rejects.toMatchObject({ status: 404 });
    expect((await batchView(ana, lote.id)).rows.map((r) => r.id)).toEqual([otro.id]);
  });

  it("solo en el lote propio y con vídeos de ese lote; por las rutas", async () => {
    const lote = await createBatch(ana, "A");
    const otroLote = await createBatch(ana, "B");
    const v = await batchVideo(lote.id);
    const suelto = await createVideo(ana, lampara.id);
    await expect(duplicateBatchVideo(ana, otroLote.id, v.id)).rejects.toMatchObject({ status: 404 });
    await expect(removeBatchVideo(ana, lote.id, suelto.id)).rejects.toMatchObject({ status: 404 });
    await expect(removeBatchVideo(dueno, lote.id, v.id)).rejects.toMatchObject({ status: 403 });
    await expect(duplicateBatchVideo(luis, lote.id, v.id)).rejects.toMatchObject({ status: 404 });

    const ctx = (videoId: number | string) => ({ params: Promise.resolve({ id: String(lote.id), videoId: String(videoId) }) });
    await as(ana);
    const dup = await duplicateRoute(new Request("http://localhost/x", { method: "POST" }), ctx(v.id));
    expect(dup.status).toBe(201);
    const { video } = await dup.json();
    expect(video).toMatchObject({ batchId: lote.id, title: "Vídeo 3" });
    expect((await removeRoute(new Request("http://localhost/x", { method: "DELETE" }), ctx(video.id))).status).toBe(204);
    expect((await removeRoute(new Request("http://localhost/x", { method: "DELETE" }), ctx("1e3"))).status).toBe(404);
  });
});

describe("valores por producto: avatar habitual", () => {
  it("el vídeo nuevo empieza con el avatar habitual; sin él, con el primer avatar; sin avatares, sin elegir", async () => {
    const segundo = (await addProductPhoto(ana, lampara.id, JPEG, "avatar")).id;
    expect(await createVideo(ana, lampara.id)).toMatchObject({ avatarMode: "elegido", avatarPhotoId: avatar });
    await updateProduct(ana, lampara.id, { defaultAvatarPhotoId: segundo });
    expect(await createVideo(ana, lampara.id)).toMatchObject({ avatarMode: "elegido", avatarPhotoId: segundo });
    await updateProduct(ana, lampara.id, { defaultAvatarMode: "sin_sustitucion" });
    expect(await createVideo(ana, lampara.id)).toMatchObject({ avatarMode: "sin_sustitucion", avatarPhotoId: null });
    // Un vídeo suelto de un producto sin fotos de avatar no se queda en «nadie» sin preguntar.
    expect(await createVideo(ana, botella.id)).toMatchObject({ avatarMode: "elegido", avatarPhotoId: null });
    // Lo que se elige en el lote manda sobre el habitual.
    const lote = await createBatch(ana, "A");
    expect(await batchVideo(lote.id)).toMatchObject({ avatarMode: "elegido", avatarPhotoId: avatar });
  });

  it("startingAvatar: la foto habitual solo si sigue siendo un avatar del producto", () => {
    expect(startingAvatar({ defaultAvatarMode: "elegido", defaultAvatarPhotoId: 7 }, [3, 7])).toEqual({ avatarMode: "elegido", avatarPhotoId: 7 });
    expect(startingAvatar({ defaultAvatarMode: "elegido", defaultAvatarPhotoId: 9 }, [3, 7])).toEqual({ avatarMode: "elegido", avatarPhotoId: 3 });
    // Tarjeta del lote sin avatares: «nadie» (Lotes v1); vídeo suelto: sin elegir.
    // Sin fotos de avatar, la tarjeta del lote empieza en «Automático».
    expect(startingAvatar({ defaultAvatarMode: "elegido", defaultAvatarPhotoId: null }, [])).toEqual({ avatarMode: "automatico", avatarPhotoId: null });
    expect(startingAvatar({ defaultAvatarMode: "elegido", defaultAvatarPhotoId: null }, [], "elegir")).toEqual({ avatarMode: "elegido", avatarPhotoId: null });
    expect(startingAvatar({ defaultAvatarMode: "nadie", defaultAvatarPhotoId: null }, [3])).toEqual({ avatarMode: "nadie", avatarPhotoId: null });
  });

  it("se comprueba: modo de la lista y foto de avatar de ese producto; quien no ve el producto, 404", async () => {
    const articulo = (await addProductPhoto(ana, lampara.id, JPEG, "articulo")).id;
    const ajeno = (await addProductPhoto(ana, botella.id, JPEG, "avatar")).id;
    for (const changes of [
      { defaultAvatarMode: "alguien" },
      { defaultAvatarPhotoId: articulo },
      { defaultAvatarPhotoId: ajeno },
      { defaultAvatarPhotoId: "1" },
      { defaultAvatarMode: "nadie", defaultAvatarPhotoId: avatar },
    ]) {
      await expect(updateProduct(ana, lampara.id, changes)).rejects.toMatchObject({ status: 400 });
    }
    // Elegir otro modo quita la foto; elegir una foto vuelve a «elegido».
    expect(await updateProduct(ana, lampara.id, { defaultAvatarPhotoId: avatar })).toMatchObject({ defaultAvatarMode: "elegido", defaultAvatarPhotoId: avatar });
    expect(await updateProduct(ana, lampara.id, { defaultAvatarMode: "nadie" })).toMatchObject({ defaultAvatarMode: "nadie", defaultAvatarPhotoId: null });
    expect(await updateProduct(ana, lampara.id, { defaultAvatarPhotoId: avatar })).toMatchObject({ defaultAvatarMode: "elegido", defaultAvatarPhotoId: avatar });
    await expect(updateProduct(luis, lampara.id, { defaultAvatarMode: "nadie" })).rejects.toMatchObject({ status: 404 });

    await as(ana);
    const ctx = { params: Promise.resolve({ id: String(lampara.id) }) };
    const ok = await patchProductRoute(json({ defaultAvatarMode: "sin_sustitucion" }, "PATCH"), ctx);
    expect(ok.status).toBe(200);
    expect((await ok.json()).product).toMatchObject({ defaultAvatarMode: "sin_sustitucion", defaultAvatarPhotoId: null });
    expect((await patchProductRoute(json({ defaultAvatarMode: 3 }, "PATCH"), ctx)).status).toBe(400);
  });
});

describe("desglose automático al subir", () => {
  it("con el interruptor encendido pide un desglose por referencia, una sola vez, con las indicaciones del lote", async () => {
    const lote = await createBatch(ana, "A");
    await setBatchProductNotes(ana, lote.id, lampara.id, "Luz cálida");
    const v = await batchVideo(lote.id);
    // Sin referencia lista, nada.
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    await readyReference(v.id);
    const [first, second] = await Promise.all([autoRequestAnalysis(v.id), autoRequestAnalysis(v.id)]);
    expect([first, second].sort()).toEqual([false, true]);
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    expect(await analysesOf(v.id)).toEqual([{ id: expect.any(Number), status: "queued", media: "media-1", productNotes: "Luz cálida" }]);

    // Aunque falle, no se repite solo para la misma referencia.
    await getPool().query("update video_analyses set status = 'failed' where video_id = $1", [v.id]);
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    expect(await autoAnalyzePending()).toBe(0);
    // Con otra referencia, sí.
    await readyReference(v.id, "media-2");
    expect(await autoAnalyzePending()).toBe(1);
    expect((await analysesOf(v.id)).map((a) => a.media)).toEqual(["media-1", "media-2"]);
  });

  it("un «Solo gancho» con la referencia preparada para otro tramo no se desglosa solo hasta que se vuelve a subir", async () => {
    const lote = await createBatch(ana, "Ganchos");
    // La referencia (6 s) se preparó entera; el vídeo es un gancho de 4 s: hay que volver a subirla.
    const v = await batchVideo(lote.id, { kind: "solo_gancho", hookSeconds: 4 });
    await readyReference(v.id);
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    expect(await autoAnalyzePending()).toBe(0);
    expect(await analysesOf(v.id)).toEqual([]);
    // Subida de nuevo (tramo de 4 s): ahora sí.
    await getPool().query("update videos set segment_duration_ms = 4000 where id = $1", [v.id]);
    expect(await autoAnalyzePending()).toBe(1);
    expect(await analysesOf(v.id)).toHaveLength(1);
  });

  it("no pide nada con el interruptor apagado, fuera de un lote o si falta algo; el seguimiento lo pide cuando ya no falta", async () => {
    const apagado = await createBatch(ana, "A", { autoAnalyze: false });
    const v = await batchVideo(apagado.id);
    await readyReference(v.id);
    const suelto = await createVideo(ana, lampara.id);
    await readyReference(suelto.id);
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    expect(await autoRequestAnalysis(suelto.id)).toBe(false);

    // Falta la foto del artículo: se pide cuando llega.
    const lote = await createBatch(ana, "B");
    const sinArticulo = await addVideoToBatch(ana, lote.id, { productId: botella.id, avatarPhotoId: null, avatarMode: "nadie" });
    await readyReference(sinArticulo.id);
    // Una adaptación sin texto tampoco.
    const sinTexto = await batchVideo(lote.id, { kind: "adaptacion_concepto" });
    await readyReference(sinTexto.id);
    expect(await autoAnalyzePending()).toBe(0);
    await addProductPhoto(ana, botella.id, JPEG, "articulo");
    await updateVideoChoices(ana, sinTexto.id, { adaptation: "Idea" });
    expect(await autoAnalyzePending()).toBe(2);
    expect(await analysesOf(v.id)).toEqual([]);
    expect(await analysesOf(suelto.id)).toEqual([]);

    // Al encenderlo, el seguimiento pide los que ya estaban listos.
    await setBatchAutoAnalyze(ana, apagado.id, true);
    expect(await autoAnalyzePending()).toBe(1);
    expect(await analysesOf(v.id)).toHaveLength(1);
  });

  it("el seguimiento no se atasca con 50 vídeos a los que siempre les falta algo", async () => {
    const lote = await createBatch(ana, "A");
    // 60 vídeos de un producto sin foto de artículo, más antiguos que el que sí se puede desglosar.
    await getPool().query(
      `insert into videos (product_id, created_by, title, batch_id, avatar_mode, reference_status, reference_media_id, updated_at)
       select $1, $2, 'Sin artículo ' || n, $3, 'nadie', 'ready', 'm-' || n, now() - interval '1 day' from generate_series(1, 60) n`,
      [botella.id, ana.id, lote.id],
    );
    const v = await batchVideo(lote.id);
    await readyReference(v.id);
    expect(await autoAnalyzePending()).toBe(1);
    expect(await analysesOf(v.id)).toHaveLength(1);
  });

  it("si quien creó el vídeo está desactivado o ya no ve el producto, no se pide", async () => {
    const lote = await createBatch(ana, "A");
    const v = await batchVideo(lote.id);
    await readyReference(v.id);
    await setPersonDisabled(dueno, ana.id, true);
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    await setPersonDisabled(dueno, ana.id, false);
    await setAssignments(dueno, ana.id, []);
    expect(await autoRequestAnalysis(v.id)).toBe(false);
    expect(await analysesOf(v.id)).toEqual([]);
  });

  it("el interruptor: al crear y después, solo quien creó el lote", async () => {
    expect((await createBatch(ana, "A")).autoAnalyze).toBe(true);
    const lote = await createBatch(ana, "B", { autoAnalyze: false });
    expect(lote.autoAnalyze).toBe(false);
    await expect(createBatch(ana, "C", { autoAnalyze: "sí" })).rejects.toMatchObject({ status: 400 });
    await expect(setBatchAutoAnalyze(dueno, lote.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(setBatchAutoAnalyze(ana, lote.id, 1)).rejects.toMatchObject({ status: 400 });
    await as(ana);
    const ctx = { params: Promise.resolve({ id: String(lote.id) }) };
    const ok = await patchBatchRoute(json({ autoAnalyze: true }, "PATCH"), ctx);
    expect(ok.status).toBe(200);
    expect((await ok.json()).batch).toMatchObject({ autoAnalyze: true });
  });
});
