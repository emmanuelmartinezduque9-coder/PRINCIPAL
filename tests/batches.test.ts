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

  it("añadir un vídeo: producto visible, avatar con papel «avatar» o «no aparece nadie», indicación de una línea", async () => {
    const lote = await createBatch(ana, "A");
    const video = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, noPerson: false, note: " Gancho\nmás corto " });
    expect(video).toMatchObject({ batchId: lote.id, productId: deAna.id, avatarPhotoId: avatarAna, noPerson: false, note: "Gancho más corto", title: "Vídeo 1" });
    const sinNadie = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: null, noPerson: true });
    expect(sinNadie).toMatchObject({ noPerson: true, avatarPhotoId: null, note: null, title: "Vídeo 2" });

    const articulo = (await addProductPhoto(ana, deAna.id, JPEG, "articulo")).id;
    const bad = [
      { productId: deAna.id, avatarPhotoId: articulo, noPerson: false },
      { productId: deAna.id, avatarPhotoId: null, noPerson: false },
      { productId: deAna.id, avatarPhotoId: avatarAna, noPerson: true },
      { productId: deAna.id, avatarPhotoId: null, noPerson: true, note: "x".repeat(301) },
    ];
    for (const input of bad) await expect(addVideoToBatch(ana, lote.id, input)).rejects.toMatchObject({ status: 400 });
    // Un producto que no ve: 404 y nada creado.
    await expect(addVideoToBatch(ana, lote.id, { productId: deLuis.id, avatarPhotoId: null, noPerson: true })).rejects.toMatchObject({ status: 404 });
    // En el lote de otra persona no se añade (el dueño lo ve, pero no es suyo).
    await expect(addVideoToBatch(dueno, lote.id, { productId: deAna.id, avatarPhotoId: null, noPerson: true })).rejects.toMatchObject({ status: 403 });
    await expect(addVideoToBatch(luis, lote.id, { productId: deLuis.id, avatarPhotoId: null, noPerson: true })).rejects.toMatchObject({ status: 404 });
    expect((await batchView(ana, lote.id)).rows).toHaveLength(2);
  });

  it("dentro de un lote, un colaborador solo ve los vídeos de los productos que ve", async () => {
    const lote = await createBatch(ana, "A");
    await setAssignments(dueno, ana.id, [deAna.id, deLuis.id]);
    const visible = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, noPerson: false });
    const luego = await addVideoToBatch(ana, lote.id, { productId: deLuis.id, avatarPhotoId: null, noPerson: true });
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
    const v = await addVideoToBatch(ana, lote.id, { productId: deAna.id, avatarPhotoId: avatarAna, noPerson: false, note: "Más luz" });
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
      noPerson: false,
      analysis: null,
      frame: { round: 0, approvedResultId: null, current: null },
      clip: { round: 0, current: null },
      costs: { higgsfieldCredits: 0, claudeMicros: 0 },
      clipReady: false,
    });

    const pool = getPool();
    await pool.query("update videos set reference_status = 'ready', reference_media_id = 'm2' where id = $1", [v.id]);
    await pool.query(
      "insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 1, 'done', 'm1', $2), ($1, 2, 'done', 'm2', $2)",
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
    // La lista cuenta como hecho el vídeo con un clip terminado.
    expect((await listBatchesFor(ana))[0]).toMatchObject({ videos: 1, done: 1 });
  });

  it("rutas: crear, listar, añadir y ver; el lote ajeno da 404", async () => {
    await as(ana);
    const created = await createRoute(post({ name: "Pedido 54" }));
    expect(created.status).toBe(201);
    const { batch } = await created.json();
    expect((await createRoute(post({ name: "" }))).status).toBe(400);

    const add = (id: number | string, body: unknown) => addRoute(post(body), ctx(id));
    const added = await add(batch.id, { productId: deAna.id, avatarPhotoId: avatarAna, noPerson: false, note: "Uno" });
    expect(added.status).toBe(201);
    expect((await added.json()).video).toMatchObject({ batchId: batch.id, note: "Uno" });
    expect((await add(batch.id, { productId: "1", avatarPhotoId: null, noPerson: true })).status).toBe(400);
    expect((await add(batch.id, { productId: deAna.id, avatarPhotoId: "1", noPerson: false })).status).toBe(400);
    expect((await add(batch.id, { productId: deAna.id, avatarPhotoId: null })).status).toBe(400);
    expect((await add("1e3", { productId: deAna.id, avatarPhotoId: null, noPerson: true })).status).toBe(404);

    expect((await (await listRoute()).json()).batches).toMatchObject([{ id: batch.id, name: "Pedido 54", videos: 1, done: 0, mine: true }]);
    const view = await viewRoute(new Request("http://localhost"), ctx(batch.id));
    expect(view.status).toBe(200);
    expect((await view.json()).rows).toHaveLength(1);

    await as(luis);
    expect((await viewRoute(new Request("http://localhost"), ctx(batch.id))).status).toBe(404);
    expect((await add(batch.id, { productId: deLuis.id, avatarPhotoId: null, noPerson: true })).status).toBe(404);
    expect((await (await listRoute()).json()).batches).toEqual([]);
  });
});
