import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import "@/jobs/video-jobs";
import { agentHeartbeat, appendTaskChunk, claimTask, createAgentToken, expireLeases, finishTask, LEASE_MS, MAX_MONTAJE_LEASE_AGE_MS, type ClaimedTask } from "@/server/agent";
import { cancelLinkTasks } from "@/server/agent-tasks";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { uploadSong } from "@/server/songs";
import { CHUNK_BYTES } from "@/server/videos/upload";
import { createVideo, getVideoFor, videoView, type Video } from "@/server/videos/videos";
import { batchView, createBatch } from "@/server/videos/batches";
import {
  editTextsFor,
  editVideoResponse,
  NEEDS_MAC,
  setEditTexts,
  standardCta,
  startBatchEdits,
  startEdit,
  type EditSpec,
} from "@/server/videos/edits";
import { MONTAJE_TOO_SLOW } from "@/server/montaje-tasks";
import { POST as claimRoute } from "@/app/api/agente/tareas/reclamar/route";
import { GET as songRoute } from "@/app/api/agente/tareas/[taskId]/cancion/route";
import { GET as referenceAudioRoute } from "@/app/api/agente/tareas/[taskId]/audio-referencia/route";
import { POST as finishRoute } from "@/app/api/agente/tareas/[taskId]/terminar/route";
import { POST as startRoute } from "@/app/api/videos/[videoId]/montaje/route";
import { PUT as textsRoute } from "@/app/api/videos/[videoId]/montaje/textos/route";
import { GET as editVideoRoute } from "@/app/api/videos/[videoId]/montaje/video/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";
import { makeSampleVideo } from "./helpers/sample-video";

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
const TASK_LOST = { status: 409, message: "Esta tarea ya no es tuya." };
const CAN = { can: ["montaje"] as const };

let dueno: AuthUser;
let ana: AuthUser;
let beto: AuthUser;
let sampleDir: string;
let mp4: Buffer;
let mp3: Buffer;

beforeAll(async () => {
  sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-montaje-"));
  mp4 = fs.readFileSync(await makeSampleVideo(sampleDir, { seconds: 3 }));
  mp3 = fs.readFileSync(await makeSampleAudio(sampleDir, "mp3", { seconds: 12 }));
}, 120_000);

afterAll(async () => {
  fs.rmSync(sampleDir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  beto = await makeUser("colaborador");
});

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const params = (videoId: number) => ({ params: Promise.resolve({ videoId: String(videoId) }) });
const taskParams = (taskId: number) => ({ params: Promise.resolve({ taskId: String(taskId) }) });

/** Un Mac del dueño (programa 1.3.0) con un latido en `at`. */
async function mac(at: Date = T0) {
  const created = await createAgentToken(dueno, "Mac de casa");
  await agentHeartbeat(created.agentId, { version: "1.3.0", ytDlp: "2026.11.01" }, at);
  return created;
}

/** Un clip terminado (con su resultado de Higgsfield) para el vídeo. */
async function withClip(video: Video, url = CLIP): Promise<void> {
  const db = getDb();
  const [gen] = await db
    .insert(schema.generations)
    .values({ videoId: video.id, kind: "clip", round: 1, status: "done", userId: video.createdBy, request: {}, count: 1, quotedCredits: 10 })
    .returning({ id: schema.generations.id });
  await db.insert(schema.generationResults).values({ generationId: gen.id, index: 0, jobId: `job-${video.id}-${gen.id}`, ok: true, url });
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

const taskRow = async (taskId: number) => (await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.id, taskId)))[0];
const editRows = (videoId: number) => getDb().select({ version: schema.edits.version, size: schema.edits.size, durationMs: schema.edits.durationMs, selfCheck: schema.edits.selfCheck }).from(schema.edits).where(eq(schema.edits.videoId, videoId)).orderBy(schema.edits.version);

/** Sube el MP4 entero por trozos con la sesión de la reserva. */
async function deliver(agentId: number, task: ClaimedTask, bytes: Buffer = mp4, now: Date = T0): Promise<void> {
  for (let index = 0; index * CHUNK_BYTES < bytes.length; index++) {
    await appendTaskChunk(agentId, task.taskId, task.uploadId, index, bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES), now);
  }
}

const SELF_CHECK = { ok: true, avisos: [], planos: 7, cortesEnBeat: "5/6", intentos: 1, referencia: false, extra: "x".repeat(10) };

describe("ficha de montaje", () => {
  it("«Solo gancho»: el gancho y detrás los cuerpos en su orden; la canción con su drop y su ruta para el Mac", async () => {
    await mac();
    const product = await makeProduct(dueno, { name: "EisWerk" });
    const b1 = await body(dueno, product.id, "https://d1abc.cloudfront.net/b1.mp4", "Uno");
    const b2 = await body(dueno, product.id, "https://d1abc.cloudfront.net/b2.mp4", "Dos");
    const { song } = await uploadSong(dueno, mp3, { title: "Canción 2", dropMs: 9320, startMs: 1000 });
    const video = await videoWithClip(
      dueno,
      { kind: "solo_gancho", hookSeconds: 5, segmentDurationMs: 4600, bodyClipIds: [b2, b1], songId: song.id, audioMode: "cancion", editReferenceUrl: "https://www.instagram.com/reel/abc/" },
      product,
    );
    const { taskId } = await startEdit(dueno, video.id, T0);
    const spec = (await taskRow(taskId)).payload as EditSpec;
    expect(spec).toMatchObject({
      version: 1,
      videoId: video.id,
      kind: "solo_gancho",
      product: { name: "EisWerk", language: "de" },
      hookMs: 4600,
      clips: [
        { role: "hook", url: CLIP },
        { role: "body", url: "https://d1abc.cloudfront.net/b2.mp4" },
        { role: "body", url: "https://d1abc.cloudfront.net/b1.mp4" },
      ],
      song: { url: `/api/agente/tareas/${taskId}/cancion`, id: song.id, dropMs: 9320, startMs: 1000 },
      // Con canción, nunca el audio de la referencia.
      referenceAudio: null,
      texts: { main: "EISWERK 😍", cta: "Kommentiere „EisWerk“, wenn du auch eine willst! 🤩" },
      editReferenceUrl: "https://www.instagram.com/reel/abc/",
    });
    // Los rótulos quedan guardados en el vídeo para poder cambiarlos.
    expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "en_marcha", editTaskId: taskId, editMainText: "EISWERK 😍" });
  });

  it("otros tipos: solo el clip aprobado; sin canción, audio original", async () => {
    await mac();
    const video = await videoWithClip(dueno);
    const { taskId } = await startEdit(dueno, video.id, T0);
    expect((await taskRow(taskId)).payload).toMatchObject({ kind: "replicar", clips: [{ role: "clip", url: CLIP }], song: null, hookMs: null, editReferenceUrl: null });
  });

  it("«Audio original» es el audio de la referencia: el guardado por la web; si no, el enlace; si no hay ninguno, nada", async () => {
    await mac();
    const audioOf = async (video: Video) => ((await taskRow((await startEdit(dueno, video.id, T0)).taskId)).payload as EditSpec).referenceAudio;
    // Guardado al preparar la referencia (subida o enlace): por la ruta de la tarea.
    const guardado = await videoWithClip(dueno, { referenceSource: "link", referenceUrl: "https://www.instagram.com/reel/ref/" });
    await getDb().insert(schema.videoReferenceAudio).values({ videoId: guardado.id, mime: "audio/mp4", size: 3, durationMs: 1000, data: Buffer.from("m4a") });
    const { taskId } = await startEdit(dueno, guardado.id, T0);
    expect(((await taskRow(taskId)).payload as EditSpec).referenceAudio).toEqual({ url: `/api/agente/tareas/${taskId}/audio-referencia`, source: "web" });
    // Sin audio guardado, de un enlace: el Mac lo trae.
    const enlace = await videoWithClip(dueno, { referenceSource: "link", referenceUrl: "https://www.instagram.com/reel/ref/" });
    expect(await audioOf(enlace)).toEqual({ url: "https://www.instagram.com/reel/ref/", source: "enlace" });
    // Un archivo sin audio guardado: nada.
    expect(await audioOf(await videoWithClip(dueno, { referenceSource: "file" }))).toBeNull();
  });

  it("el audio de la referencia solo para el Mac que tiene la tarea, y solo si la ficha lo lleva", async () => {
    const { agentId, token } = await mac();
    const other = await createAgentToken(dueno, "Otro Mac");
    const video = await videoWithClip(dueno);
    await getDb().insert(schema.videoReferenceAudio).values({ videoId: video.id, mime: "audio/mp4", size: 4, durationMs: 1000, data: Buffer.from("aac!") });
    const { taskId } = await startEdit(dueno, video.id, T0);
    const get = (t: string, id = taskId) => referenceAudioRoute(new Request("http://localhost/x", { headers: { Authorization: `Bearer ${t}` } }), taskParams(id));
    expect((await get(token)).status).toBe(409);
    await claimTask(agentId, T0, CAN);
    const response = await get(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mp4");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("aac!");
    expect((await get(other.token)).status).toBe(409);
    expect((await referenceAudioRoute(new Request("http://localhost/x"), taskParams(taskId))).status).toBe(401);
    // Una ficha que no lo lleva por la web (con canción, o por enlace): 404.
    await getDb()
      .update(schema.agentTasks)
      .set({ payload: { ...((await taskRow(taskId)).payload as EditSpec), referenceAudio: { url: "https://www.instagram.com/reel/x/", source: "enlace" } } })
      .where(eq(schema.agentTasks.id, taskId));
    expect((await get(token)).status).toBe(404);
  });

  it("la edición de referencia: la del vídeo o, si no tiene, la de su producto en el lote", async () => {
    await mac();
    const batch = await createBatch(dueno, "Lote");
    const product = await makeProduct(dueno, { name: "EisWerk" });
    const GRUPO = "https://www.instagram.com/reel/grupo/";
    const PROPIA = "https://www.instagram.com/reel/propia/";
    await getDb().insert(schema.batchProducts).values({ batchId: batch.id, productId: product.id, editReferenceUrl: GRUPO });
    const heredada = await videoWithClip(dueno, { batchId: batch.id }, product);
    const propia = await videoWithClip(dueno, { batchId: batch.id, editReferenceUrl: PROPIA }, product);
    expect((await taskRow((await startEdit(dueno, heredada.id, T0)).taskId)).payload).toMatchObject({ editReferenceUrl: GRUPO });
    expect((await taskRow((await startEdit(dueno, propia.id, T0)).taskId)).payload).toMatchObject({ editReferenceUrl: PROPIA });
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
  it("quien creó el vídeo o el dueño; otra persona que lo ve, 403; quien no lo ve, 404", async () => {
    await mac();
    const product = await makeProduct(ana, { name: "Lumi" });
    const video = await videoWithClip(ana, {}, product);
    await expect(startEdit(beto, video.id)).rejects.toMatchObject({ status: 404 });
    await getDb().insert(schema.productAssignments).values({ productId: product.id, userId: beto.id, assignedBy: dueno.id });
    await expect(startEdit(beto, video.id)).rejects.toMatchObject({ status: 403 });
    // El dueño monta el vídeo de Ana; mientras está en marcha, otro «Montar» da 409.
    expect((await startEdit(dueno, video.id)).taskId).toBeGreaterThan(0);
    await expect(startEdit(ana, video.id)).rejects.toMatchObject({ status: 409, message: "Este vídeo ya se está montando." });
    // El Mac es del dueño: la tarea va a su cola.
    expect((await getDb().select().from(schema.agentTasks))[0]).toMatchObject({ kind: "montaje", createdBy: dueno.id, status: "queued" });
  });

  it("sin Mac del dueño, 409 «Montaje: necesita el Mac»; sin clip, 409", async () => {
    const video = await videoWithClip(dueno);
    await expect(startEdit(dueno, video.id)).rejects.toMatchObject({ status: 409, message: NEEDS_MAC });
    await mac();
    const empty = await createVideo(dueno, (await makeProduct(dueno)).id);
    await expect(startEdit(dueno, empty.id)).rejects.toMatchObject({ status: 409, message: "El vídeo aún no tiene clip." });
    await as(dueno);
    expect((await startRoute(new Request("http://localhost/x", { method: "POST" }), params(video.id))).status).toBe(202);
  });

  it("pegar otro enlace de referencia no cancela el montaje en marcha", async () => {
    await mac();
    const video = await videoWithClip(dueno);
    const { taskId } = await startEdit(dueno, video.id);
    await cancelLinkTasks(getDb(), video.id, "Sustituida por otro enlace.");
    expect((await taskRow(taskId)).status).toBe("queued");
  });
});

describe("el Mac monta", () => {
  it("un Mac que no dice que sabe montar no se lleva montajes; el que sí, la ficha y su sesión", async () => {
    const { agentId, token } = await mac();
    const video = await videoWithClip(dueno);
    const { taskId } = await startEdit(dueno, video.id, T0);
    expect(await claimTask(agentId, T0)).toBeNull();
    // Por la ruta: sin cuerpo (un programa anterior), nada; con `puede`, la tarea.
    const claim = (body?: unknown) =>
      claimRoute(new Request("http://localhost/x", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }));
    expect((await claim()).status).toBe(204);
    const response = await claim({ puede: ["montaje"] });
    expect(response.status).toBe(200);
    const task = (await response.json()) as ClaimedTask;
    expect(task).toMatchObject({ taskId, kind: "montaje", chunkBytes: CHUNK_BYTES, maxBytes: 200 * 1024 * 1024, spec: { videoId: video.id } });
    expect(task.uploadId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await videoView(dueno, video.id)).edit).toMatchObject({ status: "montando", canStart: false });
  });

  it("la canción solo para el Mac que tiene la tarea", async () => {
    const { agentId, token } = await mac();
    const other = await createAgentToken(dueno, "Otro Mac");
    const { song } = await uploadSong(dueno, mp3, { title: "Canción", dropMs: 2000 });
    const video = await videoWithClip(dueno, { songId: song.id, audioMode: "cancion" });
    const { taskId } = await startEdit(dueno, video.id, T0);
    const get = (t: string) => songRoute(new Request("http://localhost/x", { headers: { Authorization: `Bearer ${t}` } }), taskParams(taskId));
    // Aún sin reservar: de nadie.
    expect((await get(token)).status).toBe(409);
    await claimTask(agentId, T0, CAN);
    const response = await get(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(Buffer.from(await response.arrayBuffer()).equals(mp3)).toBe(true);
    expect((await get(other.token)).status).toBe(409);
    expect((await songRoute(new Request("http://localhost/x"), taskParams(taskId))).status).toBe(401);
  });

  it("entrega el MP4: versión 1, el vídeo «hecho» y se sirve con Range; «Volver a montar» añade la versión 2", async () => {
    const { agentId, token } = await mac();
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id, T0);
    const task = (await claimTask(agentId, T0, CAN))!;
    // El primer trozo tiene que ser un MP4.
    await expect(appendTaskChunk(agentId, task.taskId, task.uploadId, 0, Buffer.from("ID3 no es un vídeo"), T0)).rejects.toMatchObject({ status: 400 });
    await deliver(agentId, task);
    // Le falta un byte: no está entero.
    await expect(finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes: mp4.length + 1 }, T0)).rejects.toMatchObject({ status: 400 });
    const done = await finishRoute(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ok: true, uploadId: task.uploadId, totalBytes: mp4.length, selfCheck: SELF_CHECK }),
      }),
      taskParams(task.taskId),
    );
    expect(done.status).toBe(200);
    // Repetirlo no hace nada.
    await finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes: mp4.length }, T0);
    const rows = await editRows(video.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 1, size: mp4.length, selfCheck: { ok: true, planos: 7, cortesEnBeat: "5/6", intentos: 1, referencia: false, avisos: [] } });
    expect(rows[0].selfCheck).not.toHaveProperty("extra");
    expect(rows[0].durationMs).toBeGreaterThan(2500);
    expect((await taskRow(task.taskId)).status).toBe("done");
    expect((await videoView(dueno, video.id)).edit).toMatchObject({ status: "hecho", error: null, canStart: true, latest: { version: 1, size: mp4.length } });

    await as(dueno);
    const partial = await editVideoRoute(new Request("http://localhost/x", { headers: { Range: "bytes=0-99" } }), params(video.id));
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 0-99/${mp4.length}`);
    expect(Buffer.from(await partial.arrayBuffer()).equals(mp4.subarray(0, 100))).toBe(true);
    const whole = await editVideoRoute(new Request("http://localhost/x?descargar=1"), params(video.id));
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-disposition")).toContain(`eiswerk-video-${video.id}-editado.mp4`);
    expect(Buffer.from(await whole.arrayBuffer()).equals(mp4)).toBe(true);

    // «Volver a montar»: otra tarea, otra versión; la 1 sigue ahí.
    await startEdit(dueno, video.id, later(1000));
    const again = (await claimTask(agentId, later(1000), CAN))!;
    expect(again.uploadId).not.toBe(task.uploadId);
    await deliver(agentId, again, mp4, later(1000));
    await finishTask(agentId, again.taskId, { ok: true, uploadId: again.uploadId, totalBytes: mp4.length }, later(1000));
    expect((await editRows(video.id)).map((row) => row.version)).toEqual([1, 2]);
    expect((await editVideoRoute(new Request("http://localhost/x?v=1", { headers: { Range: "bytes=0-9" } }), params(video.id))).status).toBe(206);
    // Quien no ve el vídeo, 404.
    await as(beto);
    expect((await editVideoRoute(new Request("http://localhost/x"), params(video.id))).status).toBe(404);
  });

  it("un archivo que no es un vídeo de verdad deja el montaje fallido", async () => {
    const { agentId } = await mac();
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id, T0);
    const task = (await claimTask(agentId, T0, CAN))!;
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(500, 7)]);
    await deliver(agentId, task, fake);
    await expect(finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes: fake.length }, T0)).rejects.toMatchObject({ status: 400 });
    expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "fallido", editError: "El Mac entregó un archivo que no es un vídeo." });
    expect(await editRows(video.id)).toEqual([]);
  });

  it("si el montador no puede, el vídeo lo dice con su motivo y se puede volver a montar", async () => {
    const { agentId } = await mac();
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id, T0);
    const task = (await claimTask(agentId, T0, CAN))!;
    await finishTask(agentId, task.taskId, { ok: false, uploadId: task.uploadId, error: "La canción se acaba antes que el vídeo" }, T0);
    expect((await videoView(dueno, video.id)).edit).toMatchObject({
      status: "fallido",
      error: "No se pudo montar: La canción se acaba antes que el vídeo",
      canStart: true,
      latest: null,
    });
    expect((await startEdit(dueno, video.id)).taskId).toBeGreaterThan(task.taskId);
  });
});

describe("reservas y sesiones (fencing)", () => {
  it("una reserva caducada vuelve a la cola con otra sesión: los trozos y el cierre de la anterior dan 409", async () => {
    const { agentId } = await mac();
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id, T0);
    const first = (await claimTask(agentId, T0, CAN))!;
    await appendTaskChunk(agentId, first.taskId, first.uploadId, 0, mp4.subarray(0, 1000), T0);
    // Sin latido en 5 minutos: vuelve a la cola.
    await expireLeases(later(LEASE_MS + 1));
    expect((await taskRow(first.taskId)).status).toBe("queued");
    const second = (await claimTask(agentId, later(LEASE_MS + 2), CAN))!;
    expect(second.taskId).toBe(first.taskId);
    expect(second.uploadId).not.toBe(first.uploadId);
    const now = later(LEASE_MS + 3);
    await expect(appendTaskChunk(agentId, first.taskId, first.uploadId, 1, mp4.subarray(1000, 2000), now)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(agentId, first.taskId, { ok: true, uploadId: first.uploadId, totalBytes: mp4.length }, now)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(agentId, first.taskId, { ok: false, uploadId: first.uploadId, error: "x" }, now)).rejects.toMatchObject(TASK_LOST);
    // Otro Mac no puede tocarla.
    const other = await createAgentToken(dueno, "Otro");
    await expect(appendTaskChunk(other.agentId, second.taskId, second.uploadId, 0, mp4.subarray(0, 1000), now)).rejects.toMatchObject(TASK_LOST);
    // La sesión nueva empieza de cero y entrega.
    await deliver(agentId, second, mp4, now);
    await finishTask(agentId, second.taskId, { ok: true, uploadId: second.uploadId, totalBytes: mp4.length }, now);
    expect((await editRows(video.id)).map((row) => row.size)).toEqual([mp4.length]);
  });

  it("un montaje dura como mucho una hora reservado; después falla y el vídeo lo dice", async () => {
    const { agentId } = await mac();
    const video = await videoWithClip(dueno);
    await startEdit(dueno, video.id, T0);
    const task = (await claimTask(agentId, T0, CAN))!;
    // Con latidos, a los 40 minutos sigue (más que los 30 de un enlace).
    for (let minute = 4; minute <= 40; minute += 4) {
      await agentHeartbeat(agentId, { version: "1.3.0", ytDlp: null }, later(minute * 60_000));
      await getDb().update(schema.agentTasks).set({ leaseExpiresAt: later(minute * 60_000 + LEASE_MS) }).where(eq(schema.agentTasks.id, task.taskId));
      await expireLeases(later(minute * 60_000));
    }
    expect((await taskRow(task.taskId)).status).toBe("leased");
    await getDb().update(schema.agentTasks).set({ leaseExpiresAt: later(MAX_MONTAJE_LEASE_AGE_MS + LEASE_MS) }).where(eq(schema.agentTasks.id, task.taskId));
    await expireLeases(later(MAX_MONTAJE_LEASE_AGE_MS + 1));
    expect((await taskRow(task.taskId)).status).toBe("failed");
    expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "fallido", editError: MONTAJE_TOO_SLOW });
  });
});

describe("el lote", () => {
  async function batchOf(n: number) {
    const batch = await createBatch(dueno, "Lote");
    const product = await makeProduct(dueno, { name: "EisWerk" });
    const list: Video[] = [];
    for (let i = 0; i < n; i++) list.push(await videoWithClip(dueno, { batchId: batch.id }, product));
    await getDb().update(schema.batches).set({ status: "listo" }).where(eq(schema.batches.id, batch.id));
    return { batch, list };
  }
  const statusOf = async (batchId: number) => (await getDb().select().from(schema.batches).where(eq(schema.batches.id, batchId)))[0].status;

  it("al quedar listo, un montaje por vídeo; con todos terminados (bien o con su motivo), «montado»", async () => {
    const { agentId } = await mac();
    const { batch, list } = await batchOf(2);
    await startBatchEdits(batch.id, T0);
    // Repetirlo no duplica nada.
    await startBatchEdits(batch.id, T0);
    expect(await getDb().select().from(schema.agentTasks)).toHaveLength(2);
    expect(await statusOf(batch.id)).toBe("listo");

    const a = (await claimTask(agentId, T0, CAN))!;
    await deliver(agentId, a);
    await finishTask(agentId, a.taskId, { ok: true, uploadId: a.uploadId, totalBytes: mp4.length }, T0);
    expect(await statusOf(batch.id)).toBe("listo");
    const b = (await claimTask(agentId, T0, CAN))!;
    await finishTask(agentId, b.taskId, { ok: false, uploadId: b.uploadId, error: "Falta la fuente" }, T0);
    expect(await statusOf(batch.id)).toBe("montado");

    const view = await batchView(dueno, batch.id);
    expect(view.rows.map((row) => row.edit.status)).toEqual(["hecho", "fallido"]);
    expect(view.rows.map((row) => row.id)).toEqual(list.map((video) => video.id));
  });

  it("sin Mac del dueño, cada vídeo queda «Montaje: necesita el Mac» y el lote, montado", async () => {
    const { batch, list } = await batchOf(2);
    await startBatchEdits(batch.id, T0);
    for (const video of list) expect(await getVideoFor(dueno, video.id)).toMatchObject({ editStatus: "fallido", editError: NEEDS_MAC });
    expect(await statusOf(batch.id)).toBe("montado");
    expect(await getDb().select().from(schema.agentTasks)).toHaveLength(0);
  });

  it("un vídeo cuyo clip no se puede descargar queda fallido con el motivo; los demás se montan", async () => {
    await mac();
    const { batch, list } = await batchOf(2);
    await getDb().update(schema.generationResults).set({ url: "https://otro-sitio.example/x.mp4" }).where(eq(schema.generationResults.jobId, (await getDb().select().from(schema.generationResults))[0].jobId));
    await startBatchEdits(batch.id, T0);
    expect((await getVideoFor(dueno, list[0].id)).editError).toBe("El vídeo aún no tiene clip.");
    expect((await getVideoFor(dueno, list[1].id)).editStatus).toBe("en_marcha");
  });
});

describe("respuestas del vídeo montado", () => {
  it("sin montaje, 404; un rango fuera, 416", async () => {
    const { agentId } = await mac();
    const video = await videoWithClip(dueno);
    await expect(editVideoResponse(dueno, video.id, null)).rejects.toMatchObject({ status: 404 });
    await startEdit(dueno, video.id, T0);
    const task = (await claimTask(agentId, T0, CAN))!;
    await deliver(agentId, task);
    await finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes: mp4.length }, T0);
    expect((await editVideoResponse(dueno, video.id, `bytes=${mp4.length + 10}-`)).status).toBe(416);
  });
});
