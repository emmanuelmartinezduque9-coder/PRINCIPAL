import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import { addVideoToBatch, batchView, createBatch, getBatchFor, listBatchesFor } from "@/server/videos/batches";
import { createVideo, getVideoFor } from "@/server/videos/videos";
import { GET as listRoute, POST as createRoute } from "@/app/api/lotes/route";
import { GET as viewRoute } from "@/app/api/lotes/[id]/route";
import { POST as addRoute } from "@/app/api/lotes/[id]/videos/route";
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
let deAna: Product;
let deLuis: Product;
let avatarAna: number;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const post = (body: unknown) => new Request("http://localhost/api/lotes", { method: "POST", body: JSON.stringify(body) });

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  deAna = await makeProduct(ana, { name: "Lámpara Luna" });
  deLuis = await makeProduct(luis);
  avatarAna = (await addProductPhoto(ana, deAna.id, JPEG, "avatar")).id;
  await addProductPhoto(ana, deAna.id, JPEG, "articulo");
});

afterAll(async () => {
  await stopWorker();
});

describe("lotes", () => {
  it("crear: nombre obligatorio y como mucho 100 caracteres", async () => {
    const lote = await createBatch(ana, "  Pedido 54 ");
    expect(lote).toMatchObject({ name: "Pedido 54", createdBy: ana.id });
    await expect(createBatch(ana, "   ")).rejects.toMatchObject({ status: 400 });
    await expect(createBatch(ana, "x".repeat(101))).rejects.toMatchObject({ status: 400 });
  });

  it("cada uno ve sus lotes; el dueño, todos; uno ajeno da el mismo 404 que uno que no existe", async () => {
    const deAnaLote = await createBatch(ana, "A");
    const deLuisLote = await createBatch(luis, "L");
    expect((await listBatchesFor(ana)).map((b) => b.id)).toEqual([deAnaLote.id]);
    expect((await listBatchesFor(dueno)).map((b) => b.id).sort()).toEqual([deAnaLote.id, deLuisLote.id].sort());
    for (const id of [deLuisLote.id, 999_999, Number.NaN, -1, 1.5]) {
      await expect(getBatchFor(ana, id)).rejects.toMatchObject({ status: 404, message: "Lote no encontrado." });
    }
    expect((await getBatchFor(dueno, deAnaLote.id)).id).toBe(deAnaLote.id);
    await expect(batchView(luis, deAnaLote.id)).rejects.toMatchObject({ status: 404 });
  });

  it("añadir un vídeo: producto visible, avatar con papel «avatar» o «no aparece nadie», cambios específicos", async () => {
    const lote = await createBatch(ana, "A");
    const video = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido", note: " Gancho\nmás corto " });
    expect(video).toMatchObject({ batchId: lote.id, productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido", note: "Gancho\nmás corto", title: "Vídeo 1" });
    const sinNadie = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie" });
    expect(sinNadie).toMatchObject({ avatarMode: "nadie", avatarPhotoId: null, note: null, title: "Vídeo 2" });

    const articulo = (await addProductPhoto(ana, deAna.id, JPEG, "articulo")).id;
    const bad = [
      { productId: deAna.id, avatarPhotoId: articulo, avatarMode: "elegido" },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: "elegido" },
      { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "nadie" },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie", note: "x".repeat(6_001) },
      { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "sin_sustitucion" },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: "no_person" },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: undefined },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie", kind: "solo_cuerpo" },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie", adaptation: "Otra idea" },
      { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie", kind: "adaptacion_concepto", adaptation: "x".repeat(12_001) },
    ];
    for (const input of bad) await expect(addVideoToBatch(ana, lote.id, input)).rejects.toMatchObject({ status: 400 });
    // Un producto que no ve: 404 y nada creado.
    await expect(addVideoToBatch(ana, lote.id, { productId: deLuis.id, avatarPhotoId: null, avatarMode: "nadie" })).rejects.toMatchObject({ status: 404 });
    // En el lote de otra persona no se añade (el dueño lo ve, pero no es suyo).
    await expect(addVideoToBatch(dueno, lote.id, { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie" })).rejects.toMatchObject({ status: 403 });
    await expect(addVideoToBatch(luis, lote.id, { productId: deLuis.id, avatarPhotoId: null, avatarMode: "nadie" })).rejects.toMatchObject({ status: 404 });
    expect((await batchView(ana, lote.id)).rows).toHaveLength(2);
  });

  it("añadir un vídeo con su tipo, su adaptación y «sin sustitución»; el tablero enseña el tipo y quién sale", async () => {
    const lote = await createBatch(ana, "A");
    const adaptado = await addVideoToBatch(ana, lote.id, {
      productId: deAna.id,
      avatarPhotoId: null,
      avatarMode: "sin_sustitucion",
      kind: "adaptacion_concepto",
      adaptation: "  Que la lámpara cambie de color al tocarla  ",
      note: "Sin texto",
    });
    expect(adaptado).toMatchObject({
      avatarMode: "sin_sustitucion",
      avatarPhotoId: null,
      kind: "adaptacion_concepto",
      adaptation: "Que la lámpara cambie de color al tocarla",
      note: "Sin texto",
    });
    const sinAdaptacion = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido", kind: "adaptacion_concepto" });
    const replica = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido" });
    expect(replica).toMatchObject({ kind: "replicar", adaptation: null });

    const rows = (await batchView(ana, lote.id)).rows;
    expect(rows.map((r) => [r.id, r.kind, r.avatarMode, r.needsAdaptation])).toEqual([
      [adaptado.id, "adaptacion_concepto", "sin_sustitucion", false],
      [sinAdaptacion.id, "adaptacion_concepto", "elegido", true],
      [replica.id, "replicar", "elegido", false],
    ]);
  });

  it("el tablero da por repetir un desglose de otras indicaciones y dice por qué", async () => {
    const lote = await createBatch(ana, "A");
    const v = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido", note: "Más luz" });
    const pool = getPool();
    await pool.query("update videos set reference_status = 'ready', reference_media_id = 'm1' where id = $1", [v.id]);
    await pool.query(
      "insert into video_analyses (video_id, version, status, reference_media_id, note, created_by) values ($1, 1, 'done', 'm1', 'Más luz', $2)",
      [v.id, ana.id],
    );
    expect((await batchView(ana, lote.id)).rows[0].analysis).toEqual({ status: "done", error: null, stale: false, staleReason: null });
    await pool.query("update videos set note = 'Menos luz' where id = $1", [v.id]);
    expect((await batchView(ana, lote.id)).rows[0].analysis).toMatchObject({ stale: true, staleReason: "brief" });
    await pool.query("update videos set reference_media_id = 'm2' where id = $1", [v.id]);
    expect((await batchView(ana, lote.id)).rows[0].analysis).toMatchObject({ stale: true, staleReason: "reference" });
  });

  it("dentro de un lote, un colaborador solo ve los vídeos de los productos que ve", async () => {
    const lote = await createBatch(ana, "A");
    await setAssignments(dueno, ana.id, [deAna.id, deLuis.id]);
    const visible = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido" });
    const luego = await addVideoToBatch(ana, lote.id, { productId: deLuis.id, avatarPhotoId: null, avatarMode: "nadie" });
    expect((await batchView(ana, lote.id)).rows.map((r) => r.id)).toEqual([visible.id, luego.id]);
    expect((await listBatchesFor(ana))[0]).toMatchObject({ videos: 2, done: 0 });

    await setAssignments(dueno, ana.id, [deAna.id]);
    expect((await batchView(ana, lote.id)).rows.map((r) => r.id)).toEqual([visible.id]);
    expect((await listBatchesFor(ana))[0]).toMatchObject({ videos: 1 });
    // El dueño ve todos, de solo lectura.
    const delDueno = await batchView(dueno, lote.id);
    expect(delDueno.batch.mine).toBe(false);
    expect(delDueno.rows.map((r) => [r.id, r.mine])).toEqual([
      [visible.id, false],
      [luego.id, false],
    ]);
  });

  it("el tablero junta por vídeo la referencia, el avatar, el desglose, las generaciones, el coste y si hay clip", async () => {
    const lote = await createBatch(ana, "A");
    const v = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido", note: "Más luz" });
    // Un vídeo del mismo producto fuera del lote no aparece.
    await createVideo(ana, deAna.id);

    let [row] = (await batchView(ana, lote.id)).rows;
    expect(row).toMatchObject({
      id: v.id,
      productName: "Lámpara Luna",
      note: "Más luz",
      mine: true,
      referenceStatus: "none",
      avatarPhotoId: avatarAna,
      avatarMode: "elegido",
      kind: "replicar",
      needsAdaptation: false,
      analysis: null,
      frame: { round: 0, approvedResultId: null, current: null },
      clip: { round: 0, current: null },
      costs: { higgsfieldCredits: 0, claudeMicros: 0 },
      clipReady: false,
    });

    const pool = getPool();
    await pool.query("update videos set reference_status = 'ready', reference_media_id = 'm2' where id = $1", [v.id]);
    await pool.query(
      "insert into video_analyses (video_id, version, status, reference_media_id, note, created_by) values ($1, 1, 'done', 'm1', 'Más luz', $2), ($1, 2, 'done', 'm2', 'Más luz', $2)",
      [v.id, ana.id],
    );
    const frame = await pool.query(
      `insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits, credits_spent)
       values ($1, 'frame', 1, 'done', $2, '{}', 2, 4, 4) returning id`,
      [v.id, ana.id],
    );
    const frameResult = await pool.query(
      "insert into generation_results (generation_id, index, job_id, ok, url) values ($1, 0, 'j1', true, 'https://x.cloudfront.net/a.png') returning id",
      [frame.rows[0].id],
    );
    await pool.query("update videos set approved_frame_result_id = $1 where id = $2", [frameResult.rows[0].id, v.id]);
    const clip = await pool.query(
      `insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits, credits_spent)
       values ($1, 'clip', 1, 'done', $2, '{}', 1, 90, 90) returning id`,
      [v.id, ana.id],
    );
    await pool.query(
      "insert into generation_results (generation_id, index, job_id, ok, url) values ($1, 0, 'j2', true, 'https://x.cloudfront.net/a.mp4')",
      [clip.rows[0].id],
    );

    [row] = (await batchView(ana, lote.id)).rows;
    expect(row).toMatchObject({
      referenceStatus: "ready",
      analysis: { status: "done", stale: false },
      frame: { round: 1, approvedResultId: frameResult.rows[0].id, current: { status: "done" } },
      clip: { round: 1, current: { status: "done", quotedCredits: 90 } },
      costs: { higgsfieldCredits: 94 },
      clipReady: true,
    });
    expect((await getVideoFor(ana, v.id)).batchId).toBe(lote.id);
    // La lista cuenta como hecho el vídeo con un clip que se puede descargar (la misma regla que `clipReady`):
    // un clip terminado en una dirección que no se sirve no cuenta.
    const otro = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie" });
    const raro = await pool.query(
      `insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits, credits_spent)
       values ($1, 'clip', 1, 'done', $2, '{}', 1, 90, 90) returning id`,
      [otro.id, ana.id],
    );
    await pool.query(
      "insert into generation_results (generation_id, index, job_id, ok, url) values ($1, 0, 'j3', true, 'https://example.com/a.mp4')",
      [raro.rows[0].id],
    );
    const rows = (await batchView(ana, lote.id)).rows;
    expect(rows.map((r) => [r.id, r.clipReady])).toEqual([
      [v.id, true],
      [otro.id, false],
    ]);
    expect((await listBatchesFor(ana))[0]).toMatchObject({ videos: 2, done: 1 });
  });

  it("rutas: crear, listar, añadir y ver; el lote ajeno da 404", async () => {
    await as(ana);
    const created = await createRoute(post({ name: "Pedido 54" }));
    expect(created.status).toBe(201);
    const { batch } = await created.json();
    expect((await createRoute(post({ name: "" }))).status).toBe(400);

    const add = (id: number | string, body: unknown) => addRoute(post(body), ctx(id));
    const added = await add(batch.id, { productId: deAna.id, avatarPhotoId: avatarAna, avatarMode: "elegido", note: "Uno" });
    expect(added.status).toBe(201);
    expect((await added.json()).video).toMatchObject({ batchId: batch.id, note: "Uno" });
    expect((await add(batch.id, { productId: "1", avatarPhotoId: null, avatarMode: "nadie" })).status).toBe(400);
    expect((await add(batch.id, { productId: deAna.id, avatarPhotoId: "1", avatarMode: "elegido" })).status).toBe(400);
    expect((await add(batch.id, { productId: deAna.id, avatarPhotoId: null })).status).toBe(400);
    expect((await add(batch.id, { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie", kind: "otro" })).status).toBe(400);
    expect((await add(batch.id, { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie", note: 7 })).status).toBe(400);
    const keep = await add(batch.id, { productId: deAna.id, avatarPhotoId: null, avatarMode: "sin_sustitucion", kind: "adaptacion_concepto", adaptation: "Idea" });
    expect(keep.status).toBe(201);
    expect((await keep.json()).video).toMatchObject({ avatarMode: "sin_sustitucion", kind: "adaptacion_concepto", adaptation: "Idea" });
    expect((await add("1e3", { productId: deAna.id, avatarPhotoId: null, avatarMode: "nadie" })).status).toBe(404);

    expect((await (await listRoute()).json()).batches).toMatchObject([{ id: batch.id, name: "Pedido 54", videos: 2, done: 0, mine: true }]);
    const view = await viewRoute(new Request("http://localhost"), ctx(batch.id));
    expect(view.status).toBe(200);
    expect((await view.json()).rows).toHaveLength(2);

    await as(luis);
    expect((await viewRoute(new Request("http://localhost"), ctx(batch.id))).status).toBe(404);
    expect((await add(batch.id, { productId: deLuis.id, avatarPhotoId: null, avatarMode: "nadie" })).status).toBe(404);
    expect((await (await listRoute()).json()).batches).toEqual([]);
  });
});
