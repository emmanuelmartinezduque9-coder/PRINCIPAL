import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { LocalStore, setObjectStoreForTests } from "@/lib/object-store";
import { agentHeartbeat, appendTaskChunk, claimTask, createAgentToken, finishTask, type ClaimedTask } from "@/server/agent";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { uploadSong } from "@/server/songs";
import { archiveSweep } from "@/server/videos/archive";
import { CHUNK_BYTES } from "@/server/videos/upload";
import { createVideo, getVideoFor, videoView, type Video } from "@/server/videos/videos";
import { batchView, createBatch } from "@/server/videos/batches";
import { editTextsFor, editVideoResponse, setEditTexts, standardCta, startBatchEdits, startEdit, type EditSpec } from "@/server/videos/edits";
import {
  claimRun,
  editLoopTick,
  INTERRUPTED,
  MAX_RUN_ATTEMPTS,
  MONTAJE_CONCURRENCY,
  requeueStaleRuns,
  RUN_STALE_MS,
  runEdit,
  waitForActiveEdits,
  type MontajeDeps,
} from "@/server/videos/montaje-nube";
import { POST as startRoute } from "@/app/api/videos/[videoId]/montaje/route";
import { PUT as textsRoute } from "@/app/api/videos/[videoId]/montaje/textos/route";
import { GET as editVideoRoute } from "@/app/api/videos/[videoId]/montaje/video/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";
import { makeSampleVideo } from "./helpers/sample-video";

/**
 * Montaje en la nube (`montaje-nube.ts`): la ficha, la cola `edit_runs`, el montaje con un
 * montador simulado (un `montar_auto.py` de prueba que copia el primer clip y apunta lo que
 * recibió), los enlaces (nube con yt-dlp simulado y, si no, el Mac) y el lote. El montador de
 * verdad tiene sus pruebas en `montador/test_montar_auto.py`.
 */

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
  headers: async () => new Headers(),
}));

const T0 = new Date("2026-11-22T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const CLIP = "https://d1abc.cloudfront.net/clip.mp4";
const CAN = { can: ["enlace_medio"] as const };
const REEL = "https://www.instagram.com/reel/abc/";

let dueno: AuthUser;
let ana: AuthUser;
let beto: AuthUser;
let sampleDir: string;
let montadorDir: string;
let fontPath: string;
let mp4: Buffer;
let mp3: Buffer;
let store: LocalStore;
const fetched: string[] = [];

/** Un `montar_auto.py` de prueba: copia el primer clip como salida y guarda la ficha que recibió. */
const FAKE_MONTADOR = `
import json, shutil, sys
from pathlib import Path
spec = json.loads(Path(sys.argv[1]).read_text())
work = Path(sys.argv[2])
(work / 'ficha-recibida.json').write_text(json.dumps(spec))
if spec.get('title') == 'falla':
    (work / 'resultado.json').write_text(json.dumps({'ok': False, 'error': 'Falta un clip descargado'}))
    sys.exit(1)
shutil.copy(spec['clips'][0]['path'], work / 'salida.mp4')
(work / 'resultado.json').write_text(json.dumps({'ok': True, 'avisos': spec.get('avisos', []),
  'autocomprobacion': {'ok': True, 'avisos': [], 'planos': 7, 'cortesEnBeat': '5/6', 'intentos': 1}}))
`;

const fakeFetch: typeof fetch = async (input) => {
  fetched.push(String(input));
  return new Response(new Uint8Array(mp4), { headers: { "content-length": String(mp4.length) } });
};

beforeAll(async () => {
  sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-montaje-"));
  mp4 = fs.readFileSync(await makeSampleVideo(sampleDir, { seconds: 3 }));
  mp3 = fs.readFileSync(await makeSampleAudio(sampleDir, "mp3", { seconds: 12 }));
  montadorDir = path.join(sampleDir, "montador");
  fs.mkdirSync(montadorDir);
  fs.writeFileSync(path.join(montadorDir, "montar_auto.py"), FAKE_MONTADOR);
  fontPath = path.join(sampleDir, "fuente.ttf");
  fs.writeFileSync(fontPath, "fuente de prueba");
}, 120_000);

afterAll(async () => {
  setObjectStoreForTests(undefined);
  fs.rmSync(sampleDir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  cookie.value = undefined;
  fetched.length = 0;
  store = new LocalStore(path.join(sampleDir, `objetos-${Math.random().toString(36).slice(2)}`), Buffer.alloc(32, 3));
  setObjectStoreForTests(store);
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  beto = await makeUser("colaborador");
});

/** El yt-dlp de la nube simulado: `ok` deja el vídeo de muestra donde se le pide. */
const ytDlp = (ok: boolean) => async (args: string[]) => {
  if (ok) fs.writeFileSync(args[args.indexOf("-o") + 1], mp4);
  return { ok, error: ok ? null : "ERROR: [Instagram] login required" };
};
const deps = (over: Partial<MontajeDeps> = {}): MontajeDeps => ({
  fetch: fakeFetch,
  python: "python3",
  reaPython: null,
  font: fontPath,
  montadorDir,
  runYtDlp: ytDlp(false),
  ...over,
});

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const params = (videoId: number) => ({ params: Promise.resolve({ videoId: String(videoId) }) });

/** Un Mac del dueño (programa 1.4.0) con un latido en `at`. */
async function mac(at: Date = new Date()) {
  const created = await createAgentToken(dueno, "Mac de casa");
  await agentHeartbeat(created.agentId, { version: "1.4.0", ytDlp: "2026.11.01" }, at);
  return created;
}

/** Un clip terminado (con su resultado de Higgsfield) para el vídeo. */
async function withClip(video: Video, url = CLIP): Promise<string> {
  const db = getDb();
  const [gen] = await db
    .insert(schema.generations)
    .values({ videoId: video.id, kind: "clip", round: 1, status: "done", userId: video.createdBy, request: {}, count: 1, quotedCredits: 10 })
    .returning({ id: schema.generations.id });
  const jobId = `job-${video.id}-${gen.id}`;
  await db.insert(schema.generationResults).values({ generationId: gen.id, index: 0, jobId, ok: true, url });
  return jobId;
}

/** Un cuerpo del producto (un clip de la biblioteca de `user`). */
async function body(user: AuthUser, productId: number, url: string, label: string): Promise<number> {
  const db = getDb();
  const [clip] = await db
    .insert(schema.libraryClips)
    .values({ userId: user.id, jobId: `lib-${label}`, videoUrl: url, createdAtHf: T0 })
    .returning({ id: schema.libraryClips.id });
  const [row] = await db.insert(schema.productBodies).values({ productId, libraryClipId: clip.id, label, createdBy: user.id }).returning({ id: schema.productBodies.id });
  return row.id;
}

async function videoWithClip(user: AuthUser, over: Partial<typeof schema.videos.$inferInsert> = {}, product?: { id: number }): Promise<Video> {
  const video = await createVideo(user, (product ?? (await makeProduct(user, { name: "EisWerk" }))).id);
  if (Object.keys(over).length > 0) await getDb().update(schema.videos).set(over).where(eq(schema.videos.id, video.id));
  await withClip(video);
  return getVideoFor(user, video.id);
}

const runRow = async (runId: number) => (await getDb().select().from(schema.editRuns).where(eq(schema.editRuns.id, runId)))[0];
const specOf = async (runId: number) => (await runRow(runId)).spec as EditSpec;
const editRows = (videoId: number) =>
  getDb()
    .select({ version: schema.edits.version, size: schema.edits.size, storageKey: schema.edits.storageKey, selfCheck: schema.edits.selfCheck })
    .from(schema.edits)
    .where(eq(schema.edits.videoId, videoId))
    .orderBy(schema.edits.version);

describe("ficha de montaje", () => {
  it("«Solo gancho»: el gancho y detrás los cuerpos en su orden, con su trabajo; la canción con su drop", async () => {
    const product = await makeProduct(dueno, { name: "EisWerk" });
    const b1 = await body(dueno, product.id, "https://d1abc.cloudfront.net/b1.mp4", "Uno");
    const b2 = await body(dueno, product.id, "https://d1abc.cloudfront.net/b2.mp4", "Dos");
    const { song } = await uploadSong(dueno, mp3, { title: "Canción 2", dropMs: 9320, startMs: 1000 });
    const video = await videoWithClip(
      dueno,
      { kind: "solo_gancho", hookSeconds: 5, segmentDurationMs: 4600, bodyClipIds: [b2, b1], songId: song.id, audioMode: "cancion", editReferenceUrl: REEL },
      product,
    );
    const { runId } = await startEdit(dueno, video.id, T0);
    expect(await specOf(runId)).toMatchObject({
      version: 2,
      videoId: video.id,
      kind: "solo_gancho",
      product: { name: "EisWerk", language: "de" },
      hookMs: 4600,
      clips: [
        { role: "hook", url: CLIP, jobId: expect.stringMatching(/^job-/) },
        { role: "body", url: "https://d1abc.cloudfront.net/b2.mp4", jobId: "lib-Dos" },
        { role: "body", url: "https://d1abc.cloudfront.net/b1.mp4", jobId: "lib-Uno" },
      ],
      song: { id: song.id, dropMs: 9320, startMs: 1000 },
      referenceAudio: null,
      texts: { main: "EISWERK 😍", cta: "Kommentiere „EisWerk“, wenn du auch eine willst! 🤩" },
      editReferenceUrl: REEL,
    });
    expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "en_marcha", editRunId: runId, editMainText: "EISWERK 😍" });
    expect((await runRow(runId)).requestedBy).toBe(dueno.id);
  });

  it("«Audio original» es el audio de la referencia: el guardado; si no, el enlace; si no hay ninguno, nada", async () => {
    const audioOf = async (video: Video) => (await specOf((await startEdit(dueno, video.id, T0)).runId)).referenceAudio;
    const guardado = await videoWithClip(dueno, { referenceSource: "link", referenceUrl: REEL });
    await getDb().insert(schema.videoReferenceAudio).values({ videoId: guardado.id, mime: "audio/mp4", size: 3, durationMs: 1000, data: Buffer.from("m4a") });
    expect(await audioOf(guardado)).toEqual({ source: "web" });
    expect(await audioOf(await videoWithClip(dueno, { referenceSource: "link", referenceUrl: REEL }))).toEqual({ source: "enlace", url: REEL });
    expect(await audioOf(await videoWithClip(dueno, { referenceSource: "file" }))).toBeNull();
  });

  it("la edición de referencia: la del vídeo o, si no tiene, la de su producto en el lote", async () => {
    const batch = await createBatch(dueno, "Lote");
    const product = await makeProduct(dueno, { name: "EisWerk" });
    const GRUPO = "https://www.instagram.com/reel/grupo/";
    const PROPIA = "https://www.instagram.com/reel/propia/";
    await getDb().insert(schema.batchProducts).values({ batchId: batch.id, productId: product.id, editReferenceUrl: GRUPO });
    const heredada = await videoWithClip(dueno, { batchId: batch.id }, product);
    const propia = await videoWithClip(dueno, { batchId: batch.id, editReferenceUrl: PROPIA }, product);
    expect(await specOf((await startEdit(dueno, heredada.id, T0)).runId)).toMatchObject({ editReferenceUrl: GRUPO });
    expect(await specOf((await startEdit(dueno, propia.id, T0)).runId)).toMatchObject({ editReferenceUrl: PROPIA });
  });

  it("rótulos: los guardados mandan; si no, los del desglose; si no, las indicaciones y el CTA de siempre", () => {
    const product = { name: "FalterPfote", language: "de" };
    const none = { editMainText: null, editCtaText: null, note: null };
    expect(editTextsFor(none, product, null)).toEqual({ main: "FALTERPFOTE 😍", cta: standardCta("FalterPfote", "de") });
    expect(editTextsFor({ ...none, note: "Más luz\nTexto: LIDL × FALTERPFOTE 😳🦋" }, product, null).main).toBe("LIDL × FALTERPFOTE 😳🦋");
    const analysis = { editTexts: { main: "Das will jede! 😍", cta: "Kommentiere „FalterPfote“! 🦋" } };
    expect(editTextsFor({ ...none, note: "Texto: otro" }, product, analysis)).toEqual(analysis.editTexts);
    expect(editTextsFor({ ...none, editMainText: "Mío", editCtaText: "CTA mío" }, product, analysis)).toEqual({ main: "Mío", cta: "CTA mío" });
    expect(standardCta("Lumi", "it")).toContain("Lumi");
  });

  it("los rótulos los cambia quien creó el vídeo o el dueño; con 1–200 caracteres", async () => {
    const product = await makeProduct(ana, { name: "Lumi" });
    const video = await videoWithClip(ana, {}, product);
    await getDb().insert(schema.productAssignments).values({ productId: product.id, userId: beto.id, assignedBy: dueno.id });
    expect(await setEditTexts(ana, video.id, { main: "  Hola   mundo " })).toMatchObject({ main: "Hola mundo" });
    expect(await setEditTexts(dueno, video.id, { cta: "Kommentiere!" })).toMatchObject({ main: "Hola mundo", cta: "Kommentiere!" });
    await expect(setEditTexts(beto, video.id, { main: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(setEditTexts(ana, video.id, { main: "" })).rejects.toMatchObject({ status: 400 });
    await expect(setEditTexts(ana, video.id, { cta: "x".repeat(201) })).rejects.toMatchObject({ status: 400 });
    await as(ana);
    const response = await textsRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ main: "Neu" }) }), params(video.id));
    expect(response.status).toBe(200);
    expect((await videoView(ana, video.id)).editTexts).toMatchObject({ main: "Neu", cta: "Kommentiere!", editable: true });
  });
});

describe("quién monta", () => {
  it("quien creó el vídeo o el dueño; otra persona que lo ve, 403; quien no lo ve, 404; sin Mac", async () => {
    const product = await makeProduct(ana, { name: "Lumi" });
    const video = await videoWithClip(ana, {}, product);
    await expect(startEdit(beto, video.id)).rejects.toMatchObject({ status: 404 });
    await getDb().insert(schema.productAssignments).values({ productId: product.id, userId: beto.id, assignedBy: dueno.id });
    await expect(startEdit(beto, video.id)).rejects.toMatchObject({ status: 403 });
    expect((await startEdit(dueno, video.id)).runId).toBeGreaterThan(0);
    await expect(startEdit(ana, video.id)).rejects.toMatchObject({ status: 409, message: "Este vídeo ya se está montando." });
    // Va a la cola de la nube; el Mac no interviene.
    expect(await getDb().select().from(schema.agentTasks)).toHaveLength(0);
    expect(await getDb().select().from(schema.editRuns)).toHaveLength(1);
  });

  it("sin clip, 409; la ruta responde 202", async () => {
    const empty = await createVideo(dueno, (await makeProduct(dueno)).id);
    await expect(startEdit(dueno, empty.id)).rejects.toMatchObject({ status: 409, message: "El vídeo aún no tiene clip." });
    const video = await videoWithClip(dueno);
    await as(dueno);
    expect((await startRoute(new Request("http://localhost/x", { method: "POST" }), params(video.id))).status).toBe(202);
    expect((await videoView(dueno, video.id)).edit).toMatchObject({ status: "en_cola", canStart: false });
  });
});

describe("la nube monta", () => {
  it("monta con los clips del almacén propio (o de Higgsfield si no están), la canción y guarda el MP4 en el almacén", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Canción", dropMs: 4000 });
    const video = await videoWithClip(dueno, { songId: song.id, audioMode: "cancion" });
    await archiveSweep({ fetch: fakeFetch, store });
    expect((await getDb().select().from(schema.storedMedia)).map((r) => [r.status, r.error])).toEqual([["done", null]]);
    fetched.length = 0;
    const { runId } = await startEdit(dueno, video.id);
    const run = (await claimRun(new Date()))!;
    expect(run.id).toBe(runId);
    expect((await videoView(dueno, video.id)).edit).toMatchObject({ status: "montando" });
    expect(await runEdit(run, deps())).toBe("done");
    // El clip vino del almacén propio: no se pidió nada a Higgsfield.
    expect(fetched).toEqual([]);
    const [edit] = await editRows(video.id);
    expect(edit).toMatchObject({ version: 1, size: mp4.length, storageKey: `montajes/${video.id}/${runId}.mp4`, selfCheck: { ok: true, planos: 7, cortesEnBeat: "5/6" } });
    expect(await store.head(edit.storageKey!)).toBe(mp4.length);
    expect(await runRow(runId)).toMatchObject({ status: "done", attempts: 1 });
    expect((await videoView(dueno, video.id)).edit).toMatchObject({ status: "hecho", canStart: true, latest: { version: 1 } });
    // Se sirve con un enlace firmado del almacén (también la descarga, con su nombre).
    await as(dueno);
    const played = await editVideoRoute(new Request("http://localhost/x"), params(video.id));
    expect(played.status).toBe(302);
    expect(played.headers.get("location")).toMatch(/^\/api\/objetos\/montajes\//);
    const download = await editVideoRoute(new Request("http://localhost/x?descargar=1"), params(video.id));
    expect(download.headers.get("location")).toContain("n=EisWerk");
    // «Volver a montar»: versión 2, ahora con el clip de Higgsfield (sin copia propia).
    await getDb().delete(schema.storedMedia);
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("done");
    expect(fetched).toEqual([CLIP]);
    expect((await editRows(video.id)).map((row) => row.version)).toEqual([1, 2]);
  });

  it("si el montador no puede, el vídeo lo dice con su motivo y se puede volver a montar", async () => {
    const video = await videoWithClip(dueno, { title: "falla" });
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("failed");
    expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "fallido", editError: "No se pudo montar: Falta un clip descargado" });
    expect((await videoView(dueno, video.id)).edit).toMatchObject({ status: "fallido", canStart: true });
  });

  it("sin la fuente de los rótulos, falla con un motivo claro", async () => {
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps({ font: path.join(sampleDir, "no-existe.ttf") }))).toBe("failed");
    expect((await getVideoFor(dueno, video.id)).editError).toBe("No se pudo montar: falta la fuente de los rótulos en el servidor");
  });

  it("sin almacén, el MP4 va a la base de datos y se sirve con Range", async () => {
    setObjectStoreForTests(null);
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps({ store: null }))).toBe("done");
    expect((await editRows(video.id))[0]).toMatchObject({ storageKey: null, size: mp4.length });
    const partial = await editVideoResponse(dueno, video.id, "bytes=0-99");
    expect(partial.status).toBe(206);
    expect((await partial.arrayBuffer()).byteLength).toBe(100);
    expect((await editVideoResponse(dueno, video.id, `bytes=${mp4.length + 10}-`)).status).toBe(416);
  });

  it("un montaje sin latido vuelve a la cola; a los 3 intentos falla y el vídeo lo dice", async () => {
    const video = await videoWithClip(dueno);
    const { runId } = await startEdit(dueno, video.id, T0);
    for (let attempt = 1; attempt <= MAX_RUN_ATTEMPTS; attempt++) {
      const claimed = await claimRun(later(attempt * 10 * 60_000));
      expect(claimed?.id).toBe(runId);
      await requeueStaleRuns(later(attempt * 10 * 60_000 + RUN_STALE_MS + 1000));
    }
    expect(await runRow(runId)).toMatchObject({ status: "failed", attempts: MAX_RUN_ATTEMPTS });
    expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "fallido", editError: INTERRUPTED });
  });

  it("varias personas a la vez: cada proceso monta como mucho MONTAJE_CONCURRENCIA a la vez, por orden", async () => {
    const ids: number[] = [];
    for (const user of [ana, beto, dueno]) {
      const video = await videoWithClip(user, {}, await makeProduct(user, { name: "P" }));
      ids.push((await startEdit(user, video.id)).runId);
    }
    await editLoopTick(deps());
    const running = (await getDb().select().from(schema.editRuns)).filter((run) => run.status !== "queued");
    expect(running.map((run) => run.id)).toEqual(ids.slice(0, MONTAJE_CONCURRENCY));
    await waitForActiveEdits();
    await editLoopTick(deps());
    await waitForActiveEdits();
    expect((await getDb().select().from(schema.editRuns)).map((run) => run.status)).toEqual(["done", "done", "done"]);
  });
});

describe("enlaces para el montaje", () => {
  it("la referencia de edición se trae en la nube si se puede (una sola vez por enlace)", async () => {
    const video = await videoWithClip(dueno, { editReferenceUrl: REEL });
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps({ runYtDlp: ytDlp(true) }))).toBe("done");
    const [media] = await getDb().select().from(schema.linkMedia);
    expect(media).toMatchObject({ url: REEL, status: "ready", objectKey: `enlaces/${media.id}.mp4`, mime: "video/mp4" });
    expect(await store.head(media.objectKey!)).toBe(mp4.length);
    // rea-video no está (pruebas): se monta con el patrón de siempre y se apunta; no se vuelve a intentar.
    expect(media.breakdownStatus).toBe("failed");
    expect((await editRows(video.id))[0].selfCheck).toMatchObject({ avisos: expect.arrayContaining([expect.stringContaining("rea-video")]) });
  });

  it("si la nube no puede, lo trae el Mac y el montaje espera; con el enlace ya en el almacén, monta", async () => {
    const { agentId } = await mac();
    const video = await videoWithClip(dueno, { editReferenceUrl: REEL });
    const { runId } = await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("deferred");
    // Vuelve a la cola sin gastar el intento, para dentro de un minuto.
    expect(await runRow(runId)).toMatchObject({ status: "queued", attempts: 0 });
    expect(await claimRun(new Date())).toBeNull();
    // El Mac 1.4.0 se lleva la tarea y entrega el vídeo; uno anterior no la ve.
    expect(await claimTask(agentId, new Date())).toBeNull();
    const task = (await claimTask(agentId, new Date(), CAN)) as ClaimedTask & { kind: string };
    expect(task).toMatchObject({ kind: "enlace_medio", url: REEL });
    for (let index = 0; index * CHUNK_BYTES < mp4.length; index++) {
      await appendTaskChunk(agentId, task.taskId, task.uploadId, index, mp4.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES));
    }
    await finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes: mp4.length });
    expect((await getDb().select().from(schema.linkMedia))[0]).toMatchObject({ status: "ready" });
    await getDb().update(schema.editRuns).set({ availableAt: new Date() }).where(eq(schema.editRuns.id, runId));
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("done");
  });

  it("si el Mac no responde, monta sin la referencia y lo avisa (nada se bloquea)", async () => {
    await mac(new Date(Date.now() - 10 * 60_000));
    const video = await videoWithClip(dueno, { editReferenceUrl: REEL });
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("done");
    const [edit] = await editRows(video.id);
    expect(edit.selfCheck).toMatchObject({ referencia: false, avisos: expect.arrayContaining([expect.stringContaining("El Mac no responde")]) });
  });

  it("«Audio original» de un enlace: se saca su audio para el montador", async () => {
    const video = await videoWithClip(dueno, { referenceSource: "link", referenceUrl: REEL });
    await startEdit(dueno, video.id);
    expect(await runEdit((await claimRun(new Date()))!, deps({ runYtDlp: ytDlp(true) }))).toBe("done");
    expect((await editRows(video.id))[0].selfCheck).toMatchObject({ ok: true });
  });
});

describe("el lote", () => {
  async function batchOf(n: number) {
    const batch = await createBatch(dueno, "Lote");
    const product = await makeProduct(dueno, { name: "EisWerk" });
    const list: Video[] = [];
    for (let i = 0; i < n; i++) list.push(await videoWithClip(dueno, { batchId: batch.id, ...(i === 1 ? { title: "falla" } : {}) }, product));
    await getDb().update(schema.batches).set({ status: "listo" }).where(eq(schema.batches.id, batch.id));
    return { batch, list };
  }
  const statusOf = async (batchId: number) => (await getDb().select().from(schema.batches).where(eq(schema.batches.id, batchId)))[0].status;

  it("al quedar listo, un montaje por vídeo (sin Mac); con todos terminados (bien o con su motivo), «montado»", async () => {
    const { batch, list } = await batchOf(2);
    await startBatchEdits(batch.id, T0);
    await startBatchEdits(batch.id, T0);
    expect(await getDb().select().from(schema.editRuns)).toHaveLength(2);
    expect(await statusOf(batch.id)).toBe("listo");
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("done");
    expect(await statusOf(batch.id)).toBe("listo");
    expect(await runEdit((await claimRun(new Date()))!, deps())).toBe("failed");
    expect(await statusOf(batch.id)).toBe("montado");
    const view = await batchView(dueno, batch.id);
    expect(view.rows.map((row) => row.edit.status)).toEqual(["hecho", "fallido"]);
    expect(view.rows.map((row) => row.id)).toEqual(list.map((video) => video.id));
  });

  it("un vídeo cuyo clip no se puede descargar queda fallido con el motivo; los demás se montan", async () => {
    const { batch, list } = await batchOf(2);
    await getDb().update(schema.generationResults).set({ url: "https://otro-sitio.example/x.mp4" }).where(eq(schema.generationResults.jobId, (await getDb().select().from(schema.generationResults))[0].jobId));
    await startBatchEdits(batch.id, T0);
    expect((await getVideoFor(dueno, list[0].id)).editError).toBe("El vídeo aún no tiene clip.");
    expect((await getVideoFor(dueno, list[1].id)).editStatus).toBe("en_marcha");
  });
});

describe("respuestas del vídeo montado", () => {
  it("sin montaje, 404", async () => {
    const video = await videoWithClip(dueno);
    await expect(editVideoResponse(dueno, video.id, null)).rejects.toMatchObject({ status: 404 });
  });
});
