import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { jobKey } from "@/jobs/steps";
import "@/jobs/video-jobs";
import {
  AGENT_ONLINE_MS,
  agentHeartbeat,
  agentStatus,
  appendTaskChunk,
  claimTask,
  createAgentToken,
  expireLeases,
  extendLease,
  finishTask,
  LEASE_MS,
  LINK_HOSTS,
  linkOf,
  listAgents,
  MAX_TASK_AGE_MS,
  MAX_TASK_ATTEMPTS,
  QUEUE_WAIT_MS,
  requestLinkDownload,
  requireAgent,
  revokeAgent,
  type ClaimedTask,
} from "@/server/agent";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import { setPersonDisabled } from "@/server/people";
import { addVideoToBatch, createBatch } from "@/server/videos/batches";
import "@/server/videos/clip";
import { quoteGeneration } from "@/server/videos/generations";
import { processReference } from "@/server/videos/intake";
import { videoSweep } from "@/server/videos/sweep";
import { appendChunk, CHUNK_BYTES, finishUpload, startUpload, uploadPath, uploadProgress } from "@/server/videos/upload";
import { createVideo, getVideoFor, videoView, type Video } from "@/server/videos/videos";
import { POST as heartbeatRoute } from "@/app/api/agente/latido/route";
import { POST as claimRoute } from "@/app/api/agente/tareas/reclamar/route";
import { POST as leaseRoute } from "@/app/api/agente/tareas/[taskId]/latido/route";
import { PUT as chunkRoute } from "@/app/api/agente/tareas/[taskId]/trozo/route";
import { POST as finishRoute } from "@/app/api/agente/tareas/[taskId]/terminar/route";
import { DELETE as revokeRoute, GET as statusRoute, POST as tokenRoute } from "@/app/api/ajustes/agente/route";
import { POST as batchVideoRoute } from "@/app/api/lotes/[id]/videos/route";
import { GET as productsRoute } from "@/app/api/productos/route";
import { POST as newVideoRoute } from "@/app/api/productos/[id]/videos/route";
import { POST as linkRoute } from "@/app/api/videos/[videoId]/referencia/enlace/route";
import { GET as videoRoute } from "@/app/api/videos/[videoId]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleVideo } from "./helpers/sample-video";

/** Lo que vería Next de la petición: la cookie de sesión y, para la prueba de la ficha, sus cabeceras. */
const cookie = vi.hoisted(() => ({ value: undefined as string | undefined, authorization: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
  headers: async () => new Headers(cookie.authorization ? { Authorization: cookie.authorization } : {}),
}));

/** Cabecera MP4 (caja `ftyp` con marca `isom`) seguida de relleno. */
const mp4 = (size: number) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(size - 12, 7)]);
const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(100)]);

const REEL = "https://www.instagram.com/reel/abc/";
const TIKTOK = "https://vm.tiktok.com/xyz";
const MAC_OFFLINE = "El Mac no está conectado ahora mismo. Sube el archivo del vídeo.";
const LINK_FAILED = "No se pudo descargar el enlace. Sube el archivo del vídeo.";
const LINK_TOO_SLOW = "El Mac no trajo el enlace a tiempo. Pégalo otra vez o sube el archivo del vídeo.";
const TASK_LOST = { status: 409, message: "Esta tarea ya no es tuya." };
const T0 = new Date("2026-11-22T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;

let dueno: AuthUser;
let ana: AuthUser;
/** Un vídeo del dueño (el único con Mac) y otro de Ana, colaboradora. */
let v: Video;
let deAna: Video;

async function connect(user: AuthUser, meta: Record<string, unknown> = {}) {
  await saveCredential(user.id, "higgsfield", { accessToken: "a", refreshToken: "r", clientId: "c" }, { needsReconnect: false, ...meta });
}

/** Un Mac del dueño con su ficha y un latido en `at`. */
async function mac(owner: AuthUser = dueno, at: Date = T0): Promise<{ agentId: number; token: string }> {
  const created = await createAgentToken(owner, "Mac de casa");
  await agentHeartbeat(created.agentId, { version: "1.0.0", ytDlp: "2026.11.01" }, at);
  return created;
}

const tasks = () => getDb().select().from(schema.agentTasks).orderBy(schema.agentTasks.id);
const taskOf = async (taskId: number) => (await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.id, taskId)))[0];
const sessionRows = () => getDb().select().from(schema.uploadSessions);
const linkOfVideo = async (video: Video) => (await videoView(dueno, video.id)).link;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const agentRequest = (token: string | null, init: RequestInit = {}, query = "") =>
  new Request(`http://localhost/api/agente/x${query}`, { method: "POST", ...init, headers: token ? bearer(token) : {} });
const taskParams = (taskId: number | string) => ({ params: Promise.resolve({ taskId: String(taskId) }) });
const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};

/** Reserva la siguiente tarea, que tiene que existir. */
async function claim(agentId: number, now: Date = T0): Promise<ClaimedTask> {
  const claimed = await claimTask(agentId, now);
  expect(claimed).not.toBeNull();
  return claimed!;
}
/** Un trozo con la sesión de esa reserva. */
const send = (agentId: number, task: ClaimedTask, index: number, bytes: Buffer, now: Date = T0) =>
  appendTaskChunk(agentId, task.taskId, task.uploadId, index, bytes, now);
const succeed = (agentId: number, task: ClaimedTask, totalBytes: number, now: Date = T0) =>
  finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes }, now);
const fail = (agentId: number, task: ClaimedTask, error = "yt-dlp no pudo descargar el enlace", now: Date = T0) =>
  finishTask(agentId, task.taskId, { ok: false, uploadId: task.uploadId, error }, now);

/** Deja el vídeo con una referencia lista (subida como archivo), con un fotograma. */
async function makeReady(video: Video): Promise<void> {
  await getDb()
    .update(schema.videos)
    .set({
      referenceStatus: "ready",
      referenceSource: "file",
      referenceUrl: null,
      referenceMediaId: "ref-media",
      referenceDurationMs: 6000,
      referenceWidth: 360,
      referenceHeight: 640,
      segmentDurationMs: 6000,
      cutsMs: [2000],
    })
    .where(eq(schema.videos.id, video.id));
  await getDb().insert(schema.videoFrames).values({ videoId: video.id, index: 0, timeMs: 0, mime: "image/jpeg", size: 3, data: Buffer.from([1, 2, 3]) });
}

/** Todo lo que hace que una referencia sirva: su estado, su origen, su recorte y sus fotogramas. */
async function referenceOf(video: Video) {
  const row = await getVideoFor(dueno, video.id);
  const frames = await getDb()
    .select({ index: schema.videoFrames.index, size: schema.videoFrames.size })
    .from(schema.videoFrames)
    .where(eq(schema.videoFrames.videoId, video.id))
    .orderBy(asc(schema.videoFrames.index));
  return {
    referenceStatus: row.referenceStatus,
    referenceError: row.referenceError,
    referenceSource: row.referenceSource,
    referenceUrl: row.referenceUrl,
    referenceMediaId: row.referenceMediaId,
    referenceDurationMs: row.referenceDurationMs,
    segmentDurationMs: row.segmentDurationMs,
    cutsMs: row.cutsMs,
    frames,
  };
}

const READY = {
  referenceStatus: "ready",
  referenceError: null,
  referenceSource: "file",
  referenceUrl: null,
  referenceMediaId: "ref-media",
  referenceDurationMs: 6000,
  segmentDurationMs: 6000,
  cutsMs: [2000],
  frames: [{ index: 0, size: 3 }],
};

let sampleDir: string;
/** Dos vídeos de muestra de verdad (ffmpeg), para las pruebas que preparan la referencia. */
const samples = { tres: Buffer.alloc(0), cuatro: Buffer.alloc(0) };

beforeAll(async () => {
  sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-agente-"));
  for (const [name, seconds] of [["tres", 3], ["cuatro", 4]] as const) {
    const sub = path.join(sampleDir, name);
    fs.mkdirSync(sub);
    samples[name] = fs.readFileSync(await makeSampleVideo(sub, { seconds }));
  }
}, 120_000);

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  cookie.authorization = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  v = await createVideo(dueno, (await makeProduct(dueno)).id);
  deAna = await createVideo(ana, (await makeProduct(ana)).id);
  await connect(dueno);
  await connect(ana);
});

afterAll(async () => {
  fs.rmSync(sampleDir, { recursive: true, force: true });
  await stopWorker();
});

describe("fichas del Mac", () => {
  it("la ficha se guarda como huella y solo se enseña al crearla", async () => {
    const { agentId, token } = await createAgentToken(dueno, "  Mac de casa  ");
    expect(token).toMatch(/^pra_[A-Za-z0-9_-]{43}$/);
    const rows = await getDb().select().from(schema.agents);
    expect(rows).toMatchObject([{ id: agentId, name: "Mac de casa", createdBy: dueno.id, lastSeenAt: null, revokedAt: null }]);
    expect(rows[0].tokenHash).toBe(crypto.createHash("sha256").update(token).digest("hex"));
    // Ni la tabla ni la lista para la pantalla contienen la ficha.
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(await listAgents(dueno))).not.toContain(token);
    expect(JSON.stringify(await listAgents(dueno))).not.toContain(rows[0].tokenHash);
    // Otra ficha es distinta.
    expect((await createAgentToken(dueno, "Otro")).token).not.toBe(token);
    await expect(createAgentToken(dueno, "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("solo el dueño crea o revoca fichas; una ficha revocada o inventada da 401", async () => {
    await expect(createAgentToken(ana, "Mac de Ana")).rejects.toMatchObject({ status: 403 });
    const { agentId, token } = await createAgentToken(dueno, "Mac de casa");
    await expect(revokeAgent(ana, agentId)).rejects.toMatchObject({ status: 403 });

    const request = (headers: Record<string, string>) => new Request("http://localhost/api/agente/latido", { method: "POST", headers });
    expect(await requireAgent(request(bearer(token)))).toEqual({ agentId });
    expect(await requireAgent(request({ authorization: `bearer ${token}` }))).toEqual({ agentId });
    const invalid = { status: 401, message: "Ficha del Mac no válida." };
    await expect(requireAgent(request({}))).rejects.toMatchObject(invalid);
    await expect(requireAgent(request(bearer("pra_" + "x".repeat(43))))).rejects.toMatchObject(invalid);
    await expect(requireAgent(request({ Authorization: `Basic ${token}` }))).rejects.toMatchObject(invalid);
    await expect(requireAgent(request({ Authorization: token }))).rejects.toMatchObject(invalid);
    await expect(requireAgent(request(bearer(token.toUpperCase())))).rejects.toMatchObject(invalid);
    await expect(requireAgent(request(bearer(`${token}x`)))).rejects.toMatchObject(invalid);

    await revokeAgent(dueno, agentId);
    await expect(requireAgent(request(bearer(token)))).rejects.toMatchObject(invalid);
    await expect(revokeAgent(dueno, 9999)).rejects.toMatchObject({ status: 404 });
    await expect(revokeAgent(dueno, agentId)).rejects.toMatchObject({ status: 404 });
    expect(await listAgents(dueno)).toEqual([]);
  });

  it("la ficha de una cuenta desactivada deja de valer", async () => {
    const otroDueno = await makeUser("dueno");
    const { token } = await createAgentToken(otroDueno, "Mac del socio");
    const request = () => new Request("http://localhost/api/agente/latido", { method: "POST", headers: bearer(token) });
    await requireAgent(request());
    await setPersonDisabled(dueno, otroDueno.id, true);
    await expect(requireAgent(request())).rejects.toMatchObject({ status: 401 });
  });

  it("una ficha del Mac no abre las rutas de las personas", async () => {
    const { token } = await mac();
    cookie.authorization = `Bearer ${token}`;
    const response = await productsRoute();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Inicia sesión para continuar." });
    // Y como cookie de sesión tampoco vale.
    cookie.value = token;
    expect((await productsRoute()).status).toBe(401);
  });

  it("las rutas del agente piden la ficha: sin ella o con una sesión de persona, 401", async () => {
    await as(dueno);
    const { token } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    for (const bad of [null, cookie.value!, "pra_" + "y".repeat(43)]) {
      expect((await heartbeatRoute(agentRequest(bad, { body: "{}" }))).status).toBe(401);
      expect((await claimRoute(agentRequest(bad))).status).toBe(401);
      expect((await leaseRoute(agentRequest(bad), taskParams(taskId))).status).toBe(401);
      expect((await chunkRoute(agentRequest(bad, { method: "PUT", body: new Uint8Array(mp4(100)) }, "?indice=0&subida=x"), taskParams(taskId))).status).toBe(401);
      expect((await finishRoute(agentRequest(bad, { body: JSON.stringify({ ok: false, uploadId: "x", error: "x" }) }), taskParams(taskId))).status).toBe(401);
    }
    expect(await tasks()).toMatchObject([{ id: taskId, status: "queued", attempts: 0 }]);
    expect((await claimRoute(agentRequest(token))).status).toBe(200);
  });

  it("revocar una ficha devuelve a la cola lo que ese Mac tenía reservado", async () => {
    const viejo = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const first = await claim(viejo.agentId);
    await send(viejo.agentId, first, 0, mp4(100));
    await revokeAgent(dueno, viejo.agentId, later(MINUTE));
    // Sin esperar a que caduque, y sin gastar otro intento.
    expect(await taskOf(taskId)).toMatchObject({ status: "queued", leaseExpiresAt: null, attempts: 1 });
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
    // El Mac, con otra ficha, se la lleva con una sesión nueva; la vieja ya no existe.
    const nuevo = await mac(dueno, later(MINUTE));
    const second = await claim(nuevo.agentId, later(MINUTE));
    expect(second).toMatchObject({ taskId, url: REEL });
    expect(second.uploadId).not.toBe(first.uploadId);
    expect((await sessionRows()).map((row) => row.id)).toEqual([second.uploadId]);
    expect(fs.existsSync(uploadPath(first.uploadId))).toBe(false);
  });
});

describe("conectado", () => {
  it("«conectado» es un latido en los últimos 90 segundos", async () => {
    expect(await agentStatus(dueno, T0)).toEqual({ online: false, lastSeenAt: null });
    const { agentId } = await createAgentToken(dueno, "Mac de casa");
    // Crear la ficha no es estar conectado.
    expect(await agentStatus(dueno, T0)).toEqual({ online: false, lastSeenAt: null });
    await agentHeartbeat(agentId, { version: "1.0.0", ytDlp: null }, T0);
    expect(AGENT_ONLINE_MS).toBe(90_000);
    expect(await agentStatus(dueno, later(89_000))).toEqual({ online: true, lastSeenAt: T0 });
    expect(await agentStatus(dueno, later(91_000))).toEqual({ online: false, lastSeenAt: T0 });
    await agentHeartbeat(agentId, { version: "1.0.1", ytDlp: "2026.11.01" }, later(100_000));
    expect((await agentStatus(dueno, later(120_000))).online).toBe(true);
    expect(await listAgents(dueno, later(120_000))).toMatchObject([
      { id: agentId, name: "Mac de casa", online: true, lastSeenAt: later(100_000), version: "1.0.1", ytDlp: "2026.11.01" },
    ]);
    // Revocada, deja de contar.
    await revokeAgent(dueno, agentId);
    expect((await agentStatus(dueno, later(120_000))).online).toBe(false);
  });

  it("cualquier petición del Mac con su ficha cuenta como señal de vida, no solo el latido", async () => {
    const { token } = await createAgentToken(dueno, "Mac de casa");
    const request = () => new Request("http://localhost/api/agente/tareas/reclamar", { method: "POST", headers: bearer(token) });
    await requireAgent(request(), T0);
    expect(await agentStatus(dueno, later(30_000))).toEqual({ online: true, lastSeenAt: T0 });
    await requireAgent(request(), later(5 * MINUTE));
    expect(await agentStatus(dueno, later(5 * MINUTE + 30_000))).toEqual({ online: true, lastSeenAt: later(5 * MINUTE) });
    // Una ficha que no vale no cuenta.
    await expect(requireAgent(new Request("http://localhost/x", { headers: bearer("pra_" + "z".repeat(43)) }), later(20 * MINUTE))).rejects.toMatchObject({ status: 401 });
    expect((await agentStatus(dueno, later(20 * MINUTE))).lastSeenAt).toEqual(later(5 * MINUTE));
    // Por la ruta: reclamar sin tareas también deja al Mac «conectado».
    const antes = Date.now();
    expect((await claimRoute(agentRequest(token))).status).toBe(204);
    const { online, lastSeenAt } = await agentStatus(dueno);
    expect(online).toBe(true);
    expect(lastSeenAt!.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("el Mac es de quien creó su ficha: para los demás no hay Mac conectado", async () => {
    await mac();
    expect((await agentStatus(dueno, T0)).online).toBe(true);
    expect(await agentStatus(ana, T0)).toEqual({ online: false, lastSeenAt: null });
    await expect(requestLinkDownload(ana, deAna.id, REEL, T0)).rejects.toMatchObject({ status: 409, message: MAC_OFFLINE });
    expect(await tasks()).toEqual([]);
  });

  it("lo que el Mac dice de sí mismo se guarda recortado", async () => {
    const { agentId } = await createAgentToken(dueno, "Mac de casa");
    await agentHeartbeat(agentId, { version: "v".repeat(500), ytDlp: "y".repeat(500) }, T0);
    const [row] = await getDb().select().from(schema.agents);
    expect(row.info!.version).toHaveLength(40);
    expect(row.info!.ytDlp).toHaveLength(40);
  });
});

describe("pegar un enlace", () => {
  it("sin Mac conectado, pegar un enlace lo dice y no crea tarea", async () => {
    await expect(requestLinkDownload(ana, deAna.id, REEL)).rejects.toMatchObject({ status: 409, message: MAC_OFFLINE });
    await expect(requestLinkDownload(dueno, v.id, REEL, T0)).rejects.toMatchObject({ status: 409, message: MAC_OFFLINE });
    // Con un latido de hace más de 90 segundos, tampoco.
    await mac(dueno, T0);
    await expect(requestLinkDownload(dueno, v.id, REEL, later(91_000))).rejects.toMatchObject({ status: 409, message: MAC_OFFLINE });
    expect(await tasks()).toEqual([]);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "none", linkTaskId: null });
    expect(await linkOfVideo(v)).toBeNull();
  });

  it.each([
    "http://www.instagram.com/reel/a",
    "https://evil.test/?u=instagram.com",
    "https://instagram.com.evil.test/x",
    "https://user:pw@tiktok.com/x",
    "https://instagram.com@evil.test/x",
    "https://evil.test/#@instagram.com",
    "https://evil.test\\@instagram.com/x",
    "file:///etc/passwd",
    "https://notinstagram.com/reel/a",
    "https://www.instagram.com:8443/reel/a",
    "--exec=rm -rf ~",
    "instagram.com/reel/a",
    "",
    `https://www.instagram.com/reel/${"a".repeat(2100)}`,
  ])("el enlace %s se rechaza", async (url) => {
    await mac();
    await expect(requestLinkDownload(dueno, v.id, url, T0)).rejects.toMatchObject({
      status: 400,
      message: "Solo se admiten enlaces de Instagram, TikTok, YouTube o Facebook.",
    });
    expect(await tasks()).toEqual([]);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("none");
  });

  it("admite los sitios de la lista y sus subdominios", () => {
    expect([...LINK_HOSTS]).toEqual(["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"]);
    for (const url of [
      "https://instagram.com/reel/abc/",
      "https://www.instagram.com/reel/abc/?igsh=x",
      "https://vm.tiktok.com/abc",
      "https://www.youtube.com/shorts/abc",
      "https://youtu.be/abc",
      "https://m.facebook.com/watch/?v=1",
      "https://fb.watch/abc/",
      "  https://WWW.Instagram.com/reel/abc/  ",
    ]) {
      expect(linkOf(url), url).not.toBeNull();
    }
    expect(linkOf("  https://WWW.Instagram.com/reel/abc/  ")).toBe("https://www.instagram.com/reel/abc/");
    // Lo que se guarda y se le da al Mac es la dirección ya normalizada, no el texto pegado.
    expect(linkOf("https://instagram.com\\@evil.test/x")).toBe("https://instagram.com/@evil.test/x");
    expect(linkOf("https://www.tiktok.com/@a/video/1\n?x=1")).toBe("https://www.tiktok.com/@a/video/1?x=1");
  });

  it("exige lo mismo que una subida: vídeo propio y Higgsfield conectado", async () => {
    await mac();
    // El dueño ve el vídeo de Ana, pero no es suyo.
    await expect(requestLinkDownload(dueno, deAna.id, REEL, T0)).rejects.toMatchObject({ status: 403 });
    const luis = await makeUser("colaborador");
    await expect(requestLinkDownload(luis, v.id, REEL, T0)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
    await expect(requestLinkDownload(dueno, Number.NaN, REEL, T0)).rejects.toMatchObject({ status: 404 });

    await saveCredential(dueno.id, "higgsfield", { accessToken: "a" }, { needsReconnect: true });
    await expect(requestLinkDownload(dueno, v.id, REEL, T0)).rejects.toMatchObject({
      status: 409,
      message: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes.",
    });
    const sinHiggsfield = await makeUser("dueno");
    await mac(sinHiggsfield);
    const suyo = await createVideo(sinHiggsfield, (await makeProduct(sinHiggsfield)).id);
    await expect(requestLinkDownload(sinHiggsfield, suyo.id, REEL, T0)).rejects.toMatchObject({
      status: 409,
      message: "Conecta primero tu Higgsfield en Ajustes.",
    });
    expect(await tasks()).toEqual([]);
  });

  it("un vídeo sin referencia queda «subiendo», con el enlace apuntado y la tarea en cola", async () => {
    await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, `  ${REEL}  `, T0);
    expect(await tasks()).toMatchObject([
      { id: taskId, kind: "link_download", videoId: v.id, url: REEL, status: "queued", createdBy: dueno.id, agentId: null, attempts: 0, error: null },
    ]);
    // El origen y la dirección de la referencia no se tocan hasta que el archivo llegue.
    expect(await getVideoFor(dueno, v.id)).toMatchObject({
      referenceStatus: "uploading",
      referenceError: null,
      referenceSource: null,
      referenceUrl: null,
      linkTaskId: taskId,
    });
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "queued", error: null });
    expect(await sessionRows()).toEqual([]);
  });

  it("mientras la referencia se prepara no se puede pegar otro enlace", async () => {
    await mac();
    await getDb().update(schema.videos).set({ referenceStatus: "processing" }).where(eq(schema.videos.id, v.id));
    await expect(requestLinkDownload(dueno, v.id, REEL, T0)).rejects.toMatchObject({
      status: 409,
      message: "Espera a que termine de prepararse el vídeo de referencia.",
    });
    expect(await tasks()).toEqual([]);
    expect((await getVideoFor(dueno, v.id)).linkTaskId).toBeNull();
  });

  it("pegar otro enlace sustituye al anterior, también si el Mac ya lo estaba descargando", async () => {
    const { agentId } = await mac();
    const first = await requestLinkDownload(dueno, v.id, REEL, T0);
    const claimed = await claim(agentId);
    expect(claimed).toMatchObject({ taskId: first.taskId });
    await send(agentId, claimed, 0, mp4(100));
    const second = await requestLinkDownload(dueno, v.id, TIKTOK, T0);
    expect(await tasks()).toMatchObject([
      { id: first.taskId, status: "failed" },
      { id: second.taskId, status: "queued", url: TIKTOK },
    ]);
    expect(await sessionRows()).toEqual([]);
    expect(fs.existsSync(uploadPath(claimed.uploadId))).toBe(false);
    // El Mac se entera al siguiente paso y su fallo ya no toca el vídeo.
    await expect(send(agentId, claimed, 1, mp4(100))).rejects.toMatchObject(TASK_LOST);
    await expect(fail(agentId, claimed)).rejects.toMatchObject(TASK_LOST);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", linkTaskId: second.taskId });
    expect(await linkOfVideo(v)).toEqual({ url: TIKTOK, status: "queued", error: null });
    expect(await claim(agentId)).toMatchObject({ taskId: second.taskId, url: TIKTOK });
  });

  it("pulsar dos veces a la vez deja una sola tarea viva", async () => {
    await mac();
    const results = await Promise.all([requestLinkDownload(dueno, v.id, REEL, T0), requestLinkDownload(dueno, v.id, REEL, T0)]);
    const rows = await tasks();
    expect(rows).toHaveLength(2);
    const alive = rows.filter((row) => row.status === "queued");
    expect(alive).toHaveLength(1);
    expect(results.map((r) => r.taskId).sort()).toEqual(rows.map((row) => row.id));
    // El vídeo espera la que quedó viva.
    expect((await getVideoFor(dueno, v.id)).linkTaskId).toBe(alive[0].id);
  });
});

describe("una referencia que ya funciona no se pierde por un enlace", () => {
  it("pegar un enlace sobre una referencia lista la deja lista, con la tarea en cola y con el Mac descargando", async () => {
    await makeReady(v);
    const { agentId } = await mac();
    expect(await referenceOf(v)).toEqual(READY);

    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    expect(await referenceOf(v)).toEqual(READY);
    expect((await getVideoFor(dueno, v.id)).linkTaskId).toBe(taskId);
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "queued", error: null });

    const task = await claim(agentId);
    expect(await referenceOf(v)).toEqual(READY);
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "downloading", error: null });

    // Ni siquiera con el archivo a medias: solo cambia cuando ha llegado entero.
    await send(agentId, task, 0, mp4(CHUNK_BYTES));
    await extendLease(agentId, taskId, later(MINUTE));
    expect(await referenceOf(v)).toEqual(READY);
    expect((await videoView(dueno, v.id)).frames).toEqual([{ index: 0, timeMs: 0 }]);
  });

  /** Con la referencia lista y un desglose hecho, lo único que falta para el clip es aprobar la imagen. */
  async function clipStillAllowed(video: Video): Promise<void> {
    await expect(quoteGeneration(dueno, video.id, "clip", { higgsfield: createFakeHiggsfield().port })).rejects.toMatchObject({
      status: 409,
      message: "Aprueba primero la imagen inicial.",
    });
  }

  async function readyWithAnalysis(video: Video): Promise<void> {
    await makeReady(video);
    const row = await getVideoFor(dueno, video.id);
    await getDb().insert(schema.videoAnalyses).values({
      videoId: video.id,
      version: 1,
      status: "done",
      referenceMediaId: "ref-media",
      kind: row.kind,
      avatarMode: row.avatarMode,
      createdBy: dueno.id,
    });
    await getDb().update(schema.videos).set({ videoPrompt: "@Video1 gives only the movement." }).where(eq(schema.videos.id, video.id));
    await clipStillAllowed(video);
  }

  it("si el Mac dice que no pudo, la referencia sigue lista y el clip se puede seguir generando", async () => {
    await readyWithAnalysis(v);
    const { agentId } = await mac();
    await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    await send(agentId, task, 0, mp4(100));
    await fail(agentId, task);
    expect(await referenceOf(v)).toEqual(READY);
    // El fallo se ve en la vista del vídeo, no en la referencia.
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
    expect(JSON.stringify(await videoView(dueno, v.id))).not.toContain("yt-dlp");
    expect(await sessionRows()).toEqual([]);
    await clipStillAllowed(v);
  });

  it("si la reserva caduca tres veces, la referencia sigue lista", async () => {
    await readyWithAnalysis(v);
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    let now = T0;
    for (let attempt = 1; attempt <= MAX_TASK_ATTEMPTS; attempt++) {
      await claim(agentId, now);
      now = new Date(now.getTime() + LEASE_MS + 1000);
      await expireLeases(now);
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "failed", attempts: 3 });
    expect(await referenceOf(v)).toEqual(READY);
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
    await clipStillAllowed(v);
  });

  it("si ningún Mac recoge el enlace, o se pasa del tiempo máximo, la referencia sigue lista", async () => {
    await readyWithAnalysis(v);
    const otro = await createVideo(dueno, v.productId);
    await makeReady(otro);
    const { agentId } = await mac();
    // El Mac se apaga: a los 10 minutos el primero se da por perdido.
    await requestLinkDownload(dueno, v.id, REEL, T0);
    await expireLeases(later(QUEUE_WAIT_MS + 1000));
    expect(await referenceOf(v)).toEqual(READY);
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
    await clipStillAllowed(v);
    // El otro lo tiene el Mac, que sigue dando señales sin terminar: a los 30 minutos se corta.
    const start = later(60 * MINUTE);
    await agentHeartbeat(agentId, { version: "1.0.0", ytDlp: null }, start);
    const { taskId } = await requestLinkDownload(dueno, otro.id, TIKTOK, start);
    await claim(agentId, start);
    for (let minute = 1; minute <= 31; minute++) {
      const now = new Date(start.getTime() + minute * MINUTE);
      await extendLease(agentId, taskId, now).catch(() => {});
      await expireLeases(now);
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "failed" });
    expect(await referenceOf(otro)).toEqual(READY);
    expect(await linkOfVideo(otro)).toEqual({ url: TIKTOK, status: "failed", error: LINK_TOO_SLOW });
  });

  it("un enlace sustituido por otro deja la referencia lista", async () => {
    await readyWithAnalysis(v);
    const { agentId } = await mac();
    await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    await send(agentId, task, 0, mp4(100));
    const second = await requestLinkDownload(dueno, v.id, TIKTOK, T0);
    expect(await referenceOf(v)).toEqual(READY);
    expect(await linkOfVideo(v)).toEqual({ url: TIKTOK, status: "queued", error: null });
    expect((await getVideoFor(dueno, v.id)).linkTaskId).toBe(second.taskId);
    await clipStillAllowed(v);
  });

  it("volver a pegar un enlace tras un fallo lo vuelve a intentar", async () => {
    await makeReady(v);
    const { agentId } = await mac();
    await requestLinkDownload(dueno, v.id, REEL, T0);
    await fail(agentId, await claim(agentId));
    expect((await linkOfVideo(v))?.status).toBe("failed");
    const again = await requestLinkDownload(dueno, v.id, REEL, T0);
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "queued", error: null });
    expect(await claim(agentId)).toMatchObject({ taskId: again.taskId });
    expect(await referenceOf(v)).toEqual(READY);
  });

  it("entregado el enlace, la referencia pasa a prepararse y queda lista como «enlace», con su dirección", async () => {
    const fake = createFakeHiggsfield();
    // Primero, una referencia de verdad subida como archivo.
    const { uploadId } = await startUpload(dueno, v.id, { filename: "ref.mp4", totalBytes: samples.tres.length });
    await appendChunk(uploadId, 0, samples.tres, { userId: dueno.id });
    await finishUpload(uploadId, { userId: dueno.id });
    await processReference(v.id, uploadId, { higgsfield: fake.port });
    const before = await referenceOf(v);
    expect(before).toMatchObject({ referenceStatus: "ready", referenceSource: "file", referenceUrl: null, referenceMediaId: "media-1" });
    expect(before.frames.length).toBeGreaterThan(0);

    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    for (let i = 0; i * CHUNK_BYTES < samples.cuatro.length; i++) {
      await send(agentId, task, i, samples.cuatro.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
    }
    // Hasta aquí, intacta.
    expect(await referenceOf(v)).toEqual(before);

    await succeed(agentId, task, samples.cuatro.length);
    // Llegó entero: ahora sí se prepara. Todavía es la referencia anterior la que consta.
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "processing", referenceSource: "file", referenceMediaId: "media-1", linkTaskId: null });
    expect(await linkOfVideo(v)).toBeNull();
    expect(await taskOf(taskId)).toMatchObject({ status: "done" });

    await processReference(v.id, task.uploadId, { higgsfield: fake.port });
    const after = await getVideoFor(dueno, v.id);
    expect(after).toMatchObject({ referenceStatus: "ready", referenceError: null, referenceSource: "link", referenceUrl: REEL, referenceMediaId: "media-2", linkTaskId: null });
    expect(Math.abs(after.referenceDurationMs! - 4000)).toBeLessThan(200);
    // Se sube al Higgsfield de quien pegó el enlace, y el archivo no se guarda.
    expect(fake.calls.filter((c) => c.method === "uploadMedia")).toMatchObject([{ userId: dueno.id }, { userId: dueno.id }]);
    expect(fs.existsSync(uploadPath(task.uploadId))).toBe(false);
    expect(await sessionRows()).toEqual([]);
  }, 60_000);
});

describe("subir un archivo con un enlace pendiente", () => {
  it("con el enlace aún en la cola: la tarea se cancela y la subida del navegador sigue intacta", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const { uploadId } = await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 100 });
    // Cancelada en la misma transacción: no espera a que el Mac pregunte.
    expect(await tasks()).toMatchObject([{ id: taskId, status: "failed", error: "Sustituida por la subida de un archivo." }]);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceError: null, linkTaskId: null });
    expect(await linkOfVideo(v)).toBeNull();
    // El Mac no se lleva nada, y la sesión del navegador sigue ahí.
    expect(await claimTask(agentId, T0)).toBeNull();
    expect(await sessionRows()).toMatchObject([{ id: uploadId, userId: dueno.id, agentTaskId: null }]);
    // Ni el seguimiento la toca.
    await expireLeases(later(QUEUE_WAIT_MS + 1000));
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceError: null });
    // Y la subida termina con normalidad.
    await appendChunk(uploadId, 0, mp4(100), { userId: dueno.id });
    await finishUpload(uploadId, { userId: dueno.id });
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("con el Mac ya descargando: el Mac suelta la tarea y la subida del navegador sobrevive", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    await send(agentId, task, 0, mp4(CHUNK_BYTES));

    const { uploadId } = await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: CHUNK_BYTES + 100 });
    await appendChunk(uploadId, 0, mp4(CHUNK_BYTES), { userId: dueno.id });
    expect(await tasks()).toMatchObject([{ id: taskId, status: "failed" }]);
    expect(fs.existsSync(uploadPath(task.uploadId))).toBe(false);

    // Todo lo que el Mac intente después da 409 y no toca ni el vídeo ni la subida del navegador.
    await expect(send(agentId, task, 1, mp4(100))).rejects.toMatchObject(TASK_LOST);
    await expect(extendLease(agentId, taskId, T0)).rejects.toMatchObject(TASK_LOST);
    await expect(succeed(agentId, task, CHUNK_BYTES + 100)).rejects.toMatchObject(TASK_LOST);
    await expect(fail(agentId, task)).rejects.toMatchObject(TASK_LOST);
    expect(await claimTask(agentId, T0)).toBeNull();
    await expireLeases(later(LEASE_MS + 1000));

    expect(await sessionRows()).toMatchObject([{ id: uploadId, userId: dueno.id, agentTaskId: null, received: 1 }]);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceError: null, linkTaskId: null });
    expect(fs.existsSync(uploadPath(uploadId))).toBe(true);
    await appendChunk(uploadId, 1, mp4(100), { userId: dueno.id });
    await finishUpload(uploadId, { userId: dueno.id });
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("sobre una referencia lista: el enlace se cancela y la referencia sigue lista mientras sube el archivo", async () => {
    await makeReady(v);
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await claim(agentId);
    await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 100 });
    expect(await taskOf(taskId)).toMatchObject({ status: "failed" });
    expect(await referenceOf(v)).toEqual(READY);
    expect(await linkOfVideo(v)).toBeNull();
  });

  it("subir un archivo también quita de la vista el fallo de un enlace anterior", async () => {
    await makeReady(v);
    const { agentId } = await mac();
    await requestLinkDownload(dueno, v.id, REEL, T0);
    await fail(agentId, await claim(agentId));
    expect((await linkOfVideo(v))?.status).toBe("failed");
    await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 100 });
    expect(await linkOfVideo(v)).toBeNull();
    expect(await referenceOf(v)).toEqual(READY);
  });
});

describe("reserva y latido", () => {
  it("el Mac recibe la tarea con dónde entregar el archivo", async () => {
    const { agentId } = await mac();
    expect(await claimTask(agentId, T0)).toBeNull();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const claimed = await claimTask(agentId, T0);
    expect(claimed).toEqual({ taskId, url: REEL, uploadId: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/), chunkBytes: CHUNK_BYTES, maxBytes: 100 * 1024 * 1024 });
    expect(await tasks()).toMatchObject([{ id: taskId, status: "leased", agentId, attempts: 1, leaseExpiresAt: later(LEASE_MS) }]);
    expect(await sessionRows()).toMatchObject([{ id: claimed!.uploadId, videoId: v.id, userId: dueno.id, agentTaskId: taskId, totalBytes: null, received: 0 }]);
    // Ya reservada, no se vuelve a entregar.
    expect(await claimTask(agentId, T0)).toBeNull();
  });

  it("dos Macs reclaman a la vez y solo uno se lleva la tarea", async () => {
    const a = await mac();
    const b = await mac();
    for (let round = 0; round < 5; round++) {
      const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
      const claims = await Promise.all([claimTask(a.agentId, T0), claimTask(b.agentId, T0)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(claims.find(Boolean)).toMatchObject({ taskId });
      expect(await taskOf(taskId)).toMatchObject({ status: "leased", attempts: 1 });
      expect(await sessionRows()).toHaveLength(1);
    }
  });

  it("varios enlaces pegados a la vez salen uno detrás de otro, del más antiguo al más nuevo", async () => {
    const { agentId } = await mac();
    const videos = [v, await createVideo(dueno, v.productId), await createVideo(dueno, v.productId)];
    const urls = [REEL, TIKTOK, "https://youtu.be/abc"];
    const ids: number[] = [];
    for (const [i, video] of videos.entries()) ids.push((await requestLinkDownload(dueno, video.id, urls[i], T0)).taskId);
    expect((await tasks()).map((task) => task.status)).toEqual(["queued", "queued", "queued"]);

    // El Mac los atiende de uno en uno: descarga, entrega, y pide el siguiente.
    for (const [i, video] of videos.entries()) {
      const task = await claim(agentId, later(i * MINUTE));
      expect(task).toMatchObject({ taskId: ids[i], url: urls[i] });
      await send(agentId, task, 0, mp4(100), later(i * MINUTE));
      await succeed(agentId, task, 100, later(i * MINUTE));
      expect((await getVideoFor(dueno, video.id)).referenceStatus).toBe("processing");
      // Los que quedan siguen esperando su turno.
      expect((await tasks()).map((row) => row.status)).toEqual(ids.map((_, j) => (j <= i ? "done" : "queued")));
    }
    expect(await claimTask(agentId, later(3 * MINUTE))).toBeNull();
    expect((await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.jobName, "video.referencia"))).length).toBe(3);
  });

  it("si el Mac pide otra con una a medias, recibe la siguiente más antigua de la cola", async () => {
    const { agentId } = await mac();
    const otro = await createVideo(dueno, v.productId);
    const first = await requestLinkDownload(dueno, v.id, REEL, T0);
    const second = await requestLinkDownload(dueno, otro.id, TIKTOK, T0);
    expect(await claim(agentId)).toMatchObject({ taskId: first.taskId });
    expect(await claim(agentId)).toMatchObject({ taskId: second.taskId });
    expect(await claimTask(agentId, T0)).toBeNull();
  });

  it("el Mac de una persona solo se lleva sus enlaces", async () => {
    const socio = await makeUser("dueno");
    await connect(socio);
    const suMac = await mac(socio);
    const miMac = await mac(dueno);
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    expect(await claimTask(suMac.agentId, T0)).toBeNull();
    expect(await claimTask(miMac.agentId, T0)).toMatchObject({ taskId });
  });

  it("el latido de la tarea y cada trozo prolongan la reserva", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    await extendLease(agentId, taskId, later(60_000));
    expect((await taskOf(taskId)).leaseExpiresAt).toEqual(later(60_000 + LEASE_MS));
    await send(agentId, task, 0, mp4(100), later(120_000));
    expect((await taskOf(taskId)).leaseExpiresAt).toEqual(later(120_000 + LEASE_MS));
    // Con latidos no caduca aunque pasen más de 5 minutos desde que se reservó.
    await expireLeases(later(LEASE_MS + 60_000));
    expect(await taskOf(taskId)).toMatchObject({ status: "leased", attempts: 1 });
  });

  it("sin latido en 5 minutos la tarea vuelve a la cola; al tercer intento fallido el vídeo lo dice", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    expect(LEASE_MS).toBe(5 * 60_000);
    expect(MAX_TASK_ATTEMPTS).toBe(3);
    let now = T0;
    let last: ClaimedTask | null = null;
    for (let attempt = 1; attempt <= MAX_TASK_ATTEMPTS; attempt++) {
      const task = await claim(agentId, now);
      expect(task).toMatchObject({ taskId });
      last = task;
      await send(agentId, task, 0, mp4(100), now);
      // Antes de los 5 minutos sigue reservada.
      await expireLeases(new Date(now.getTime() + LEASE_MS - 1000));
      expect(await taskOf(taskId)).toMatchObject({ status: "leased", attempts: attempt });
      now = new Date(now.getTime() + LEASE_MS + 1000);
      await expireLeases(now);
      if (attempt < MAX_TASK_ATTEMPTS) {
        expect(await taskOf(taskId)).toMatchObject({ status: "queued", attempts: attempt, leaseExpiresAt: null });
        expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
        // Quien la tenía ya no puede seguir.
        await expect(send(agentId, task, 1, mp4(100), now)).rejects.toMatchObject(TASK_LOST);
      }
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "failed", attempts: 3 });
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
    // Lo que había llegado se borra.
    expect(await sessionRows()).toEqual([]);
    expect(fs.existsSync(uploadPath(last!.uploadId))).toBe(false);
    expect(await claimTask(agentId, now)).toBeNull();
  });

  it("un trozo o un «terminar» de un intento anterior da 409 y no estropea el intento en curso", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const stale = await claim(agentId);
    await send(agentId, stale, 0, mp4(CHUNK_BYTES));
    // La reserva caduca y el mismo Mac se la vuelve a llevar: sesión nueva.
    const now = later(LEASE_MS + 1000);
    await expireLeases(now);
    const fresh = await claim(agentId, now);
    expect(fresh.taskId).toBe(taskId);
    expect(fresh.uploadId).not.toBe(stale.uploadId);
    await send(agentId, fresh, 0, mp4(100), now);

    // Lo rezagado del primer intento: 409, aunque el Mac tenga la reserva.
    await expect(send(agentId, stale, 1, mp4(100), now)).rejects.toMatchObject(TASK_LOST);
    await expect(succeed(agentId, stale, CHUNK_BYTES + 100, now)).rejects.toMatchObject(TASK_LOST);
    await expect(fail(agentId, stale, "x", now)).rejects.toMatchObject(TASK_LOST);
    for (const uploadId of ["", "no-es-una-subida", "a".repeat(32)]) {
      await expect(appendTaskChunk(agentId, taskId, uploadId, 1, mp4(100), now)).rejects.toMatchObject(TASK_LOST);
      await expect(finishTask(agentId, taskId, { ok: false, uploadId, error: "x" }, now)).rejects.toMatchObject(TASK_LOST);
      await expect(finishTask(agentId, taskId, { ok: true, uploadId, totalBytes: 100 }, now)).rejects.toMatchObject(TASK_LOST);
    }
    // El intento en curso sigue entero y termina bien.
    expect(await taskOf(taskId)).toMatchObject({ status: "leased", attempts: 2 });
    expect(await sessionRows()).toMatchObject([{ id: fresh.uploadId, received: 1 }]);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
    await succeed(agentId, fresh, 100, now);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("si el Mac se apaga con la tarea en cola, a los 10 minutos falla y el vídeo lo dice", async () => {
    await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await expireLeases(later(QUEUE_WAIT_MS - 1000));
    expect(await taskOf(taskId)).toMatchObject({ status: "queued" });
    await expireLeases(later(QUEUE_WAIT_MS + 1000));
    expect(await taskOf(taskId)).toMatchObject({ status: "failed", attempts: 0 });
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
  });

  it("con el Mac vivo y ocupado, una tarea espera en la cola más de 10 minutos", async () => {
    const { agentId } = await mac();
    const otro = await createVideo(dueno, v.productId);
    const first = await requestLinkDownload(dueno, v.id, REEL, T0);
    const second = await requestLinkDownload(dueno, otro.id, TIKTOK, T0);
    // El Mac se lleva la primera y tarda: sigue dando señales y manteniendo su reserva.
    expect(await claim(agentId)).toMatchObject({ taskId: first.taskId });
    for (let minute = 1; minute <= 25; minute++) {
      await agentHeartbeat(agentId, { version: "1.0.0", ytDlp: null }, later(minute * MINUTE));
      await extendLease(agentId, first.taskId, later(minute * MINUTE));
      await expireLeases(later(minute * MINUTE + 1000));
    }
    expect(await taskOf(second.taskId)).toMatchObject({ status: "queued", attempts: 0 });
    expect((await getVideoFor(dueno, otro.id)).referenceStatus).toBe("uploading");
    // El Mac de otra persona no cuenta: si el suyo calla, la tarea se da por perdida.
    const socio = await makeUser("dueno");
    await mac(socio, later(28 * MINUTE));
    await expireLeases(later(28 * MINUTE));
    expect(await taskOf(second.taskId)).toMatchObject({ status: "queued" });
    await mac(socio, later(29 * MINUTE + 30_000));
    await getDb().update(schema.agents).set({ lastSeenAt: later(15 * MINUTE) }).where(eq(schema.agents.id, agentId));
    await expireLeases(later(29 * MINUTE + 30_000));
    expect(await taskOf(second.taskId)).toMatchObject({ status: "failed", error: "El Mac se desconectó antes de recoger la tarea." });
    expect(await getVideoFor(dueno, otro.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
  });

  it("ninguna tarea vive más de 30 minutos: ni reservada con latidos ni en cola con el Mac vivo", async () => {
    expect(MAX_TASK_AGE_MS).toBe(30 * MINUTE);
    const { agentId } = await mac();
    const otro = await createVideo(dueno, v.productId);
    const hung = await requestLinkDownload(dueno, v.id, REEL, T0);
    const waiting = await requestLinkDownload(dueno, otro.id, TIKTOK, T0);
    const task = await claim(agentId);
    await send(agentId, task, 0, mp4(100));
    // La descarga se cuelga, pero el programa sigue latiendo y manteniendo la reserva.
    for (let minute = 1; minute <= 29; minute++) {
      await agentHeartbeat(agentId, { version: "1.0.0", ytDlp: null }, later(minute * MINUTE));
      await extendLease(agentId, hung.taskId, later(minute * MINUTE));
      await expireLeases(later(minute * MINUTE + 1000));
    }
    expect((await tasks()).map((row) => row.status)).toEqual(["leased", "queued"]);
    await agentHeartbeat(agentId, { version: "1.0.0", ytDlp: null }, later(30 * MINUTE));
    await expireLeases(later(30 * MINUTE + 1000));
    expect(await tasks()).toMatchObject([
      { id: hung.taskId, status: "failed", error: "La tarea superó el tiempo máximo." },
      { id: waiting.taskId, status: "failed", error: "La tarea superó el tiempo máximo." },
    ]);
    // A la persona se le dice claro qué pasó y qué puede hacer.
    for (const [video, url] of [[v, REEL], [otro, TIKTOK]] as const) {
      expect(await getVideoFor(dueno, video.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_TOO_SLOW });
      expect(await linkOfVideo(video)).toEqual({ url, status: "failed", error: LINK_TOO_SLOW });
    }
    // El Mac se entera en su siguiente paso, y lo que había llegado se borra.
    await expect(extendLease(agentId, hung.taskId, later(31 * MINUTE))).rejects.toMatchObject(TASK_LOST);
    await expect(send(agentId, task, 1, mp4(100), later(31 * MINUTE))).rejects.toMatchObject(TASK_LOST);
    expect(await sessionRows()).toEqual([]);
    expect(await claimTask(agentId, later(31 * MINUTE))).toBeNull();
  });

  it("el seguimiento de cada minuto caduca las reservas", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await claimTask(agentId, T0);
    await videoSweep(later(LEASE_MS + 1000), { higgsfield: createFakeHiggsfield().port });
    expect(await taskOf(taskId)).toMatchObject({ status: "queued" });
  });

  it("un Mac que no tiene la reserva no puede subir trozos ni terminar la tarea", async () => {
    const a = await mac();
    const b = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    // En cola, nadie la tiene.
    await expect(appendTaskChunk(a.agentId, taskId, "x", 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
    const task = await claim(a.agentId);
    // Ni conociendo la sesión de quien la tiene.
    await expect(extendLease(b.agentId, taskId, T0)).rejects.toMatchObject(TASK_LOST);
    await expect(send(b.agentId, task, 0, mp4(100))).rejects.toMatchObject(TASK_LOST);
    await expect(succeed(b.agentId, task, 100)).rejects.toMatchObject(TASK_LOST);
    await expect(fail(b.agentId, task)).rejects.toMatchObject(TASK_LOST);
    for (const bad of [9999, Number.NaN, -1, 1.5]) {
      await expect(extendLease(a.agentId, bad, T0)).rejects.toMatchObject(TASK_LOST);
      await expect(appendTaskChunk(a.agentId, bad, task.uploadId, 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
      await expect(finishTask(a.agentId, bad, { ok: false, uploadId: task.uploadId, error: "x" }, T0)).rejects.toMatchObject(TASK_LOST);
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "leased", agentId: a.agentId });
    expect(await sessionRows()).toMatchObject([{ received: 0 }]);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
    // La persona tampoco puede tocar la subida del Mac por las rutas del navegador.
    await expect(uploadProgress(task.uploadId, { userId: dueno.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe("entrega del archivo", () => {
  it("al terminar bien, el vídeo entra en el mismo procesado que una subida", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    const file = mp4(CHUNK_BYTES + 300);
    expect(await send(agentId, task, 0, file.subarray(0, CHUNK_BYTES))).toEqual({ received: 1 });
    // Un trozo repetido (se perdió la respuesta) no se escribe dos veces.
    expect(await send(agentId, task, 0, file.subarray(0, CHUNK_BYTES))).toEqual({ received: 1 });
    expect(await send(agentId, task, 1, file.subarray(CHUNK_BYTES))).toEqual({ received: 2 });
    expect(fs.readFileSync(uploadPath(task.uploadId)).equals(file)).toBe(true);

    await succeed(agentId, task, file.length);
    const video = await getVideoFor(dueno, v.id);
    expect(video).toMatchObject({ referenceStatus: "processing", referenceError: null, linkTaskId: null });
    expect(await taskOf(taskId)).toMatchObject({ status: "done", error: null });
    const key = jobKey("video.referencia", dueno.id, video.productId, { videoId: v.id, uploadId: task.uploadId });
    const jobs = await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.jobName, "video.referencia"));
    expect(jobs.map((j) => [j.key, j.status])).toEqual([[key, "queued"]]);
    // Repetir «terminar» (se perdió la respuesta) no falla ni encola otra vez.
    await succeed(agentId, task, file.length);
    expect(await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.jobName, "video.referencia"))).toHaveLength(1);
    // Ya terminada, no admite un fallo tardío.
    await expect(fail(agentId, task)).rejects.toMatchObject(TASK_LOST);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("si lo que llegó no es lo que el Mac dice haber enviado, no se da por entregado", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    const incomplete = { status: 400, message: "El vídeo no ha llegado entero. Inténtalo de nuevo." };
    await expect(succeed(agentId, task, 100)).rejects.toMatchObject(incomplete);
    await send(agentId, task, 0, mp4(100));
    for (const totalBytes of [101, 99, 0, -1, 1.5, Number.NaN, 200 * 1024 * 1024]) {
      await expect(succeed(agentId, task, totalBytes)).rejects.toMatchObject(incomplete);
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "leased" });
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
    await succeed(agentId, task, 100);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("si el Mac informa de un fallo, el vídeo lo enseña sin detalles técnicos", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    await send(agentId, task, 0, mp4(100));
    const detail = "yt-dlp: ERROR: [Instagram] abc: Requested content is not available /Users/emmanuel/.cache " + "x".repeat(600);
    await fail(agentId, task, detail);
    const video = await getVideoFor(dueno, v.id);
    expect(video).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
    expect(JSON.stringify(await videoView(dueno, v.id))).not.toContain("yt-dlp");
    expect(await linkOfVideo(v)).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
    // El detalle queda recortado en la tarea, solo para el dueño.
    expect(await taskOf(taskId)).toMatchObject({ status: "failed", error: detail.slice(0, 500) });
    expect(await sessionRows()).toEqual([]);
    expect(fs.existsSync(uploadPath(task.uploadId))).toBe(false);
    // No se reintenta sola.
    expect(await claimTask(agentId, T0)).toBeNull();
    // Y se puede volver a pegar el enlace.
    await requestLinkDownload(dueno, v.id, REEL, T0);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceError: null });
  });

  it("el archivo que entrega el Mac pasa los mismos límites: 100 MB y tipo por contenido", async () => {
    const { agentId } = await mac();
    await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    // El tipo se decide por el contenido del primer trozo.
    await expect(send(agentId, task, 0, PDF_BYTES)).rejects.toMatchObject({
      status: 400,
      message: "Formato de vídeo no admitido. Usa MP4, MOV o WebM.",
    });
    const tooBig = { status: 400, message: "El vídeo pesa demasiado (máximo 100 MB)." };
    // 100 MB son 20 trozos de 5 MB: no existe un trozo 21.
    await expect(send(agentId, task, 20, mp4(100))).rejects.toMatchObject(tooBig);
    // Ningún trozo pasa de 5 MB ni llega vacío.
    await expect(send(agentId, task, 0, mp4(CHUNK_BYTES + 1))).rejects.toMatchObject({ status: 400, message: "Trozo no válido." });
    await expect(send(agentId, task, 0, Buffer.alloc(0))).rejects.toMatchObject({ status: 400 });
    await expect(send(agentId, task, 1, mp4(100))).rejects.toMatchObject({ status: 409, message: "Faltan trozos anteriores." });
    expect(await sessionRows()).toMatchObject([{ received: 0, mime: null }]);

    await send(agentId, task, 0, mp4(CHUNK_BYTES));
    await send(agentId, task, 1, mp4(100));
    // Un trozo corto es el último: detrás no cabe otro.
    await expect(send(agentId, task, 2, mp4(100))).rejects.toMatchObject({ status: 400, message: "Trozo no válido." });
    expect(await sessionRows()).toMatchObject([{ received: 2, mime: "video/mp4", totalBytes: null }]);
    await succeed(agentId, task, CHUNK_BYTES + 100);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("un vídeo sin referencia queda listo como «enlace» cuando el Mac entrega el archivo", async () => {
    const fake = createFakeHiggsfield();
    const { agentId } = await mac();
    await requestLinkDownload(dueno, v.id, REEL, T0);
    const task = await claim(agentId);
    await send(agentId, task, 0, samples.tres);
    await succeed(agentId, task, samples.tres.length);
    await processReference(v.id, task.uploadId, { higgsfield: fake.port });
    expect(await getVideoFor(dueno, v.id)).toMatchObject({
      referenceStatus: "ready",
      referenceSource: "link",
      referenceUrl: REEL,
      referenceMediaId: "media-1",
      linkTaskId: null,
    });
    expect(await linkOfVideo(v)).toBeNull();
  }, 60_000);
});

describe("crear el vídeo ya con su enlace", () => {
  const batchInput = (productId: number, linkUrl?: unknown) => ({ productId, avatarPhotoId: null, avatarMode: "nadie", linkUrl });

  it("un lote crea cada vídeo con su enlace en la cola del Mac, y el Mac los trae en orden", async () => {
    // El lote crea por el camino real, con la hora de verdad.
    const { agentId } = await mac(dueno, new Date());
    const batch = await createBatch(dueno, "Semana 48");
    const urls = [REEL, TIKTOK, "https://youtu.be/abc"];
    const created: Video[] = [];
    for (const url of urls) created.push(await addVideoToBatch(dueno, batch.id, batchInput(v.productId, url)));

    // Cada vídeo nace ya esperando su enlace.
    for (const [i, video] of created.entries()) {
      expect(video).toMatchObject({ batchId: batch.id, referenceStatus: "uploading", avatarMode: "nadie" });
      expect(await linkOfVideo(video)).toEqual({ url: urls[i], status: "queued", error: null });
    }
    expect((await tasks()).map((task) => [task.videoId, task.url, task.status, task.createdBy])).toEqual(
      created.map((video, i) => [video.id, urls[i], "queued", dueno.id]),
    );
    // Tres en la cola: el Mac se los lleva de uno en uno, del primero al último.
    for (const [i, video] of created.entries()) {
      const task = await claim(agentId, new Date());
      expect(task.url).toBe(urls[i]);
      await send(agentId, task, 0, mp4(100), new Date());
      await succeed(agentId, task, 100, new Date());
      expect((await getVideoFor(dueno, video.id)).referenceStatus).toBe("processing");
    }
    expect(await claimTask(agentId)).toBeNull();
    expect((await tasks()).map((task) => task.status)).toEqual(["done", "done", "done"]);
  });

  it("un enlace que no vale o un Mac desconectado no dejan un vídeo a medias en el lote", async () => {
    const batch = await createBatch(dueno, "Semana 48");
    const count = async () => (await getDb().select().from(schema.videos).where(eq(schema.videos.batchId, batch.id))).length;
    // Sin Mac.
    await expect(addVideoToBatch(dueno, batch.id, batchInput(v.productId, REEL))).rejects.toMatchObject({ status: 409, message: MAC_OFFLINE });
    await mac(dueno, new Date());
    for (const bad of ["https://evil.test/?u=instagram.com", 7, ""]) {
      await expect(addVideoToBatch(dueno, batch.id, batchInput(v.productId, bad))).rejects.toMatchObject({ status: 400 });
    }
    // Sin Higgsfield.
    await saveCredential(dueno.id, "higgsfield", { accessToken: "a" }, { needsReconnect: true });
    await expect(addVideoToBatch(dueno, batch.id, batchInput(v.productId, REEL))).rejects.toMatchObject({ status: 409 });
    expect(await count()).toBe(0);
    expect(await tasks()).toEqual([]);
    // Sin enlace, el lote sigue creando vídeos como siempre.
    const plain = await addVideoToBatch(dueno, batch.id, batchInput(v.productId));
    expect(plain).toMatchObject({ referenceStatus: "none", linkTaskId: null });
    expect(await addVideoToBatch(dueno, batch.id, batchInput(v.productId, null))).toMatchObject({ referenceStatus: "none" });
    expect(await tasks()).toEqual([]);
  });

  it("por las rutas: el lote y el vídeo suelto aceptan `linkUrl`", async () => {
    await as(dueno);
    await mac(dueno, new Date());
    const batch = await createBatch(dueno, "Semana 48");
    const json = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

    const inBatch = await batchVideoRoute(json({ productId: v.productId, avatarPhotoId: null, avatarMode: "nadie", linkUrl: REEL }), {
      params: Promise.resolve({ id: String(batch.id) }),
    });
    expect(inBatch.status).toBe(201);
    const first = (await inBatch.json()).video;
    expect(first).toMatchObject({ batchId: batch.id, referenceStatus: "uploading" });

    const product = { params: Promise.resolve({ id: String(v.productId) }) };
    const single = await newVideoRoute(json({ linkUrl: TIKTOK }), product);
    expect(single.status).toBe(201);
    const second = (await single.json()).video;
    expect(second).toMatchObject({ batchId: null, referenceStatus: "uploading" });
    expect((await tasks()).map((task) => [task.videoId, task.url])).toEqual([
      [first.id, REEL],
      [second.id, TIKTOK],
    ]);

    // Un enlace que no vale: 400 y ningún vídeo nuevo. Sin cuerpo, un vídeo vacío como siempre.
    const before = (await getDb().select().from(schema.videos)).length;
    expect((await newVideoRoute(json({ linkUrl: "https://evil.test/x" }), product)).status).toBe(400);
    expect((await getDb().select().from(schema.videos)).length).toBe(before);
    const empty = await newVideoRoute(new Request("http://localhost/x", { method: "POST" }), product);
    expect(empty.status).toBe(201);
    expect((await empty.json()).video).toMatchObject({ referenceStatus: "none", linkTaskId: null });
    // Quien no ve el producto recibe su 404 de siempre, antes que nada del enlace.
    await as(ana);
    expect((await newVideoRoute(json({ linkUrl: REEL }), product)).status).toBe(404);
  });
});

describe("rutas", () => {
  it("el Mac late, reclama, sube por trozos y termina con su ficha", async () => {
    const { agentId, token } = await createAgentToken(dueno, "Mac de casa");
    const beat = await heartbeatRoute(agentRequest(token, { body: JSON.stringify({ version: "1.0.0", ytDlp: "2026.11.01" }) }));
    expect(beat.status).toBe(200);
    expect(await listAgents(dueno)).toMatchObject([{ id: agentId, online: true, version: "1.0.0", ytDlp: "2026.11.01" }]);

    // Sin tareas: 204 sin cuerpo.
    const empty = await claimRoute(agentRequest(token));
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");

    await as(dueno);
    const asked = await linkRoute(new Request("http://localhost/api/videos/x/referencia/enlace", { method: "POST", body: JSON.stringify({ url: REEL }) }), {
      params: Promise.resolve({ videoId: String(v.id) }),
    });
    expect(asked.status).toBe(201);
    const { taskId } = await asked.json();
    // La pantalla del vídeo ve el enlace pendiente.
    const seen = await (await videoRoute(new Request("http://localhost/api/videos/x"), { params: Promise.resolve({ videoId: String(v.id) }) })).json();
    expect(seen.link).toEqual({ url: REEL, status: "queued", error: null });
    cookie.value = undefined;

    const claimed = await claimRoute(agentRequest(token));
    expect(claimed.status).toBe(200);
    const task = await claimed.json();
    expect(task).toEqual({ taskId, url: REEL, uploadId: expect.any(String), chunkBytes: CHUNK_BYTES, maxBytes: 100 * 1024 * 1024 });
    const chunk = (query: string) => chunkRoute(agentRequest(token, { method: "PUT", body: new Uint8Array(mp4(100)) }, query), taskParams(taskId));
    const finish = (body: unknown) => finishRoute(agentRequest(token, { body: typeof body === "string" ? body : JSON.stringify(body) }), taskParams(taskId));

    expect((await leaseRoute(agentRequest(token), taskParams(taskId))).status).toBe(200);
    // Sin la sesión de la reserva, o con otra, 409.
    expect((await chunk("?indice=0")).status).toBe(409);
    expect((await chunk(`?indice=0&subida=${"a".repeat(32)}`)).status).toBe(409);
    const put = await chunk(`?indice=0&subida=${task.uploadId}`);
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ received: 1 });
    // Un índice mal escrito no se acepta.
    expect((await chunk(`?indice=uno&subida=${task.uploadId}`)).status).toBe(400);
    expect((await chunk(`?subida=${task.uploadId}`)).status).toBe(400);
    // Un «terminar» sin forma válida no hace nada; con la sesión de otro intento, 409.
    expect((await finish({ ok: "sí", uploadId: task.uploadId })).status).toBe(400);
    expect((await finish({ ok: true, totalBytes: 100 })).status).toBe(400);
    expect((await finish("no es json")).status).toBe(400);
    expect((await finish({ ok: true, uploadId: "a".repeat(32), totalBytes: 100 })).status).toBe(409);
    expect((await finish({ ok: false, uploadId: "a".repeat(32), error: "x" })).status).toBe(409);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");

    const done = await finish({ ok: true, uploadId: task.uploadId, totalBytes: 100 });
    expect(done.status).toBe(200);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
    // Un identificador de tarea que no es un número: la misma respuesta que una tarea ajena.
    const lost = await leaseRoute(agentRequest(token), taskParams("abc"));
    expect(lost.status).toBe(409);
    expect(await lost.json()).toEqual({ error: "Esta tarea ya no es tuya." });
  });

  it("un trozo que dice pesar más del máximo da 413 sin leer el cuerpo", async () => {
    const { agentId, token } = await mac(dueno, new Date());
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL);
    const task = (await claimTask(agentId))!;
    const request = new Request(`http://localhost/api/agente/x?indice=0&subida=${task.uploadId}`, {
      method: "PUT",
      headers: { ...bearer(token), "content-length": String(CHUNK_BYTES + 2048) },
    });
    expect((await chunkRoute(request, taskParams(taskId))).status).toBe(413);
  });

  it("el Mac informa de un fallo por su ruta y el detalle no llega a la persona", async () => {
    const { token } = await mac(dueno, new Date());
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL);
    const task = await (await claimRoute(agentRequest(token))).json();
    const failed = await finishRoute(
      agentRequest(token, { body: JSON.stringify({ ok: false, uploadId: task.uploadId, error: "yt-dlp no pudo descargar el enlace" }) }),
      taskParams(taskId),
    );
    expect(failed.status).toBe(200);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
    await as(dueno);
    const seen = await (await videoRoute(new Request("http://localhost/api/videos/x"), { params: Promise.resolve({ videoId: String(v.id) }) })).json();
    expect(seen.link).toEqual({ url: REEL, status: "failed", error: LINK_FAILED });
    expect(JSON.stringify(seen)).not.toContain("yt-dlp");
  });

  it("pegar un enlace por la ruta: sin sesión 401, sin Mac 409 y un enlace raro 400", async () => {
    const link = (videoId: number, body: unknown) =>
      linkRoute(new Request("http://localhost/api/videos/x/referencia/enlace", { method: "POST", body: JSON.stringify(body) }), {
        params: Promise.resolve({ videoId: String(videoId) }),
      });
    expect((await link(v.id, { url: REEL })).status).toBe(401);
    await as(dueno);
    const offline = await link(v.id, { url: REEL });
    expect(offline.status).toBe(409);
    expect(await offline.json()).toEqual({ error: MAC_OFFLINE });
    await mac(dueno, new Date());
    expect((await link(v.id, { url: "https://evil.test/?u=instagram.com" })).status).toBe(400);
    expect((await link(v.id, { url: 7 })).status).toBe(400);
    expect((await link(v.id, null)).status).toBe(400);
    expect((await link(deAna.id, { url: REEL })).status).toBe(403);
    await as(ana);
    expect((await link(v.id, { url: REEL })).status).toBe(404);
    expect(await tasks()).toEqual([]);
  });

  it("Ajustes: todos ven si hay Mac; solo el dueño crea y revoca fichas y ve el detalle", async () => {
    const json = (method: string, body?: unknown) =>
      new Request("http://localhost/api/ajustes/agente", { method, body: body === undefined ? undefined : JSON.stringify(body) });
    expect((await statusRoute()).status).toBe(401);

    await as(ana);
    expect((await tokenRoute(json("POST", { name: "Mac de Ana" }))).status).toBe(403);
    expect(await (await statusRoute()).json()).toEqual({ online: false });

    await as(dueno);
    const created = await tokenRoute(json("POST", { name: "Mac de casa" }));
    expect(created.status).toBe(201);
    const { agentId, token } = await created.json();
    expect(token).toMatch(/^pra_/);
    expect((await tokenRoute(json("POST", {}))).status).toBe(400);
    await heartbeatRoute(agentRequest(token, { body: JSON.stringify({ version: "1.0.0", ytDlp: null }) }));
    const mine = await (await statusRoute()).json();
    expect(mine).toMatchObject({ online: true, agents: [{ id: agentId, name: "Mac de casa", online: true, version: "1.0.0", ytDlp: null }] });
    expect(typeof mine.lastSeenAt).toBe("string");
    expect(JSON.stringify(mine)).not.toContain(token);

    // El Mac del dueño no es el de Ana: ella sigue sin poder pegar enlaces.
    await as(ana);
    expect(await (await statusRoute()).json()).toEqual({ online: false });
    expect((await revokeRoute(json("DELETE", { agentId }))).status).toBe(403);

    await as(dueno);
    expect((await revokeRoute(json("DELETE", { agentId: "1" }))).status).toBe(404);
    expect((await revokeRoute(json("DELETE", { agentId }))).status).toBe(200);
    expect(await (await statusRoute()).json()).toEqual({ online: false, lastSeenAt: null, agents: [] });
    expect((await heartbeatRoute(agentRequest(token, { body: "{}" }))).status).toBe(401);
  });
});
