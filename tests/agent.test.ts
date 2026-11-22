import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  MAX_TASK_ATTEMPTS,
  QUEUE_WAIT_MS,
  requestLinkDownload,
  requireAgent,
  revokeAgent,
} from "@/server/agent";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { saveCredential } from "@/server/credentials";
import { setPersonDisabled } from "@/server/people";
import { processReference } from "@/server/videos/intake";
import { videoSweep } from "@/server/videos/sweep";
import { CHUNK_BYTES, startUpload, uploadPath, uploadProgress } from "@/server/videos/upload";
import { createVideo, getVideoFor, type Video } from "@/server/videos/videos";
import { POST as heartbeatRoute } from "@/app/api/agente/latido/route";
import { POST as claimRoute } from "@/app/api/agente/tareas/reclamar/route";
import { POST as leaseRoute } from "@/app/api/agente/tareas/[taskId]/latido/route";
import { PUT as chunkRoute } from "@/app/api/agente/tareas/[taskId]/trozo/route";
import { POST as finishRoute } from "@/app/api/agente/tareas/[taskId]/terminar/route";
import { DELETE as revokeRoute, GET as statusRoute, POST as tokenRoute } from "@/app/api/ajustes/agente/route";
import { GET as productsRoute } from "@/app/api/productos/route";
import { POST as linkRoute } from "@/app/api/videos/[videoId]/referencia/enlace/route";
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
const MAC_OFFLINE = "El Mac no está conectado ahora mismo. Sube el archivo del vídeo.";
const LINK_FAILED = "No se pudo descargar el enlace. Sube el archivo del vídeo.";
const TASK_LOST = { status: 409, message: "Esta tarea ya no es tuya." };
const T0 = new Date("2026-11-22T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

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
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const agentRequest = (token: string | null, init: RequestInit = {}, query = "") =>
  new Request(`http://localhost/api/agente/x${query}`, { method: "POST", ...init, headers: token ? bearer(token) : {} });
const taskParams = (taskId: number | string) => ({ params: Promise.resolve({ taskId: String(taskId) }) });
const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};

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
      expect((await chunkRoute(agentRequest(bad, { method: "PUT", body: new Uint8Array(mp4(100)) }, "?indice=0"), taskParams(taskId))).status).toBe(401);
      expect((await finishRoute(agentRequest(bad, { body: JSON.stringify({ ok: false, error: "x" }) }), taskParams(taskId))).status).toBe(401);
    }
    expect(await tasks()).toMatchObject([{ id: taskId, status: "queued", attempts: 0 }]);
    expect((await claimRoute(agentRequest(token))).status).toBe(200);
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
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("none");
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

  it("deja el vídeo esperando el enlace y la tarea en cola", async () => {
    await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, `  ${REEL}  `, T0);
    expect(await tasks()).toMatchObject([
      { id: taskId, kind: "link_download", videoId: v.id, url: REEL, status: "queued", createdBy: dueno.id, agentId: null, attempts: 0, error: null },
    ]);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceSource: "link", referenceUrl: REEL, referenceError: null });
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
  });

  it("pegar otro enlace sustituye al anterior, también si el Mac ya lo estaba descargando", async () => {
    const { agentId } = await mac();
    const first = await requestLinkDownload(dueno, v.id, REEL, T0);
    const claimed = await claimTask(agentId, T0);
    expect(claimed).toMatchObject({ taskId: first.taskId });
    const second = await requestLinkDownload(dueno, v.id, "https://vm.tiktok.com/xyz", T0);
    expect(await tasks()).toMatchObject([
      { id: first.taskId, status: "failed" },
      { id: second.taskId, status: "queued", url: "https://vm.tiktok.com/xyz" },
    ]);
    expect(await sessionRows()).toEqual([]);
    expect(fs.existsSync(uploadPath(claimed!.uploadId))).toBe(false);
    // El Mac se entera al siguiente paso y su fallo ya no toca el vídeo.
    await expect(appendTaskChunk(agentId, first.taskId, 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(agentId, first.taskId, { ok: false, error: "x" }, T0)).rejects.toMatchObject(TASK_LOST);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceUrl: "https://vm.tiktok.com/xyz" });
    expect(await claimTask(agentId, T0)).toMatchObject({ taskId: second.taskId, url: "https://vm.tiktok.com/xyz" });
  });

  it("pulsar dos veces a la vez deja una sola tarea viva", async () => {
    await mac();
    const results = await Promise.all([requestLinkDownload(dueno, v.id, REEL, T0), requestLinkDownload(dueno, v.id, REEL, T0)]);
    const rows = await tasks();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === "queued")).toHaveLength(1);
    expect(results.map((r) => r.taskId).sort()).toEqual(rows.map((row) => row.id));
  });

  it("subir un archivo deja sin efecto el enlace pendiente", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 100 });
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceSource: "file", referenceUrl: null });
    // El Mac ya no se la lleva, y la subida de la persona sigue intacta.
    expect(await claimTask(agentId, T0)).toBeNull();
    expect(await tasks()).toMatchObject([{ id: taskId, status: "failed" }]);
    expect(await sessionRows()).toMatchObject([{ userId: dueno.id, agentTaskId: null }]);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
  });

  it("si la persona sube un archivo con el Mac a medias, el Mac suelta la tarea", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await claimTask(agentId, T0);
    await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 100 });
    await expect(appendTaskChunk(agentId, taskId, 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
    expect(await tasks()).toMatchObject([{ id: taskId, status: "failed" }]);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceSource: "file", referenceError: null });
  });

  it("un enlace que falla después de que la persona suba un archivo no estropea su subida", async () => {
    const { agentId } = await mac();
    // El Mac lo tenía reservado y dice que no pudo.
    const leased = await requestLinkDownload(dueno, v.id, REEL, T0);
    await claimTask(agentId, T0);
    const { uploadId } = await startUpload(dueno, v.id, { filename: "a.mp4", totalBytes: 100 });
    await finishTask(agentId, leased.taskId, { ok: false, error: "yt-dlp no pudo" }, T0);
    // Otro, aún en la cola, se da por perdido cuando el Mac se apaga.
    const otro = await createVideo(dueno, v.productId);
    const queued = await requestLinkDownload(dueno, otro.id, REEL, T0);
    const suya = await startUpload(dueno, otro.id, { filename: "b.mp4", totalBytes: 100 });
    await expireLeases(later(QUEUE_WAIT_MS + 1000));
    expect(await tasks()).toMatchObject([
      { id: leased.taskId, status: "failed" },
      { id: queued.taskId, status: "failed" },
    ]);
    for (const video of [v, otro]) {
      expect(await getVideoFor(dueno, video.id)).toMatchObject({ referenceStatus: "uploading", referenceSource: "file", referenceError: null });
    }
    expect((await sessionRows()).map((row) => row.id).sort()).toEqual([uploadId, suya.uploadId].sort());
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
    await claimTask(agentId, T0);
    await extendLease(agentId, taskId, later(60_000));
    expect((await taskOf(taskId)).leaseExpiresAt).toEqual(later(60_000 + LEASE_MS));
    await appendTaskChunk(agentId, taskId, 0, mp4(100), later(120_000));
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
    let uploadId = "";
    for (let attempt = 1; attempt <= MAX_TASK_ATTEMPTS; attempt++) {
      const claimed = await claimTask(agentId, now);
      expect(claimed).toMatchObject({ taskId });
      uploadId = claimed!.uploadId;
      await appendTaskChunk(agentId, taskId, 0, mp4(100), now);
      // Antes de los 5 minutos sigue reservada.
      await expireLeases(new Date(now.getTime() + LEASE_MS - 1000));
      expect(await taskOf(taskId)).toMatchObject({ status: "leased", attempts: attempt });
      now = new Date(now.getTime() + LEASE_MS + 1000);
      await expireLeases(now);
      if (attempt < MAX_TASK_ATTEMPTS) {
        expect(await taskOf(taskId)).toMatchObject({ status: "queued", attempts: attempt, leaseExpiresAt: null });
        expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
        // Quien la tenía ya no puede seguir.
        await expect(appendTaskChunk(agentId, taskId, 1, mp4(100), now)).rejects.toMatchObject(TASK_LOST);
      }
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "failed", attempts: 3 });
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
    // Lo que había llegado se borra.
    expect(await sessionRows()).toEqual([]);
    expect(fs.existsSync(uploadPath(uploadId))).toBe(false);
    expect(await claimTask(agentId, now)).toBeNull();
  });

  it("si el Mac se apaga con la tarea en cola, a los 10 minutos falla y el vídeo lo dice", async () => {
    await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await expireLeases(later(QUEUE_WAIT_MS - 1000));
    expect(await taskOf(taskId)).toMatchObject({ status: "queued" });
    await expireLeases(later(QUEUE_WAIT_MS + 1000));
    expect(await taskOf(taskId)).toMatchObject({ status: "failed", attempts: 0 });
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
  });

  it("con el Mac vivo y ocupado, una tarea espera en la cola lo que haga falta", async () => {
    const { agentId } = await mac();
    const otro = await createVideo(dueno, v.productId);
    const first = await requestLinkDownload(dueno, v.id, REEL, T0);
    const second = await requestLinkDownload(dueno, otro.id, "https://vm.tiktok.com/xyz", T0);
    // El Mac se lleva la primera y tarda: sigue dando señales y manteniendo su reserva.
    expect(await claimTask(agentId, T0)).toMatchObject({ taskId: first.taskId });
    for (let minute = 1; minute <= 25; minute++) {
      await agentHeartbeat(agentId, { version: "1.0.0", ytDlp: null }, later(minute * 60_000));
      await extendLease(agentId, first.taskId, later(minute * 60_000));
      await expireLeases(later(minute * 60_000 + 1000));
    }
    expect(await taskOf(second.taskId)).toMatchObject({ status: "queued", attempts: 0 });
    expect((await getVideoFor(dueno, otro.id)).referenceStatus).toBe("uploading");
    // El Mac de otra persona no cuenta: sin el suyo, la tarea se da por perdida.
    const socio = await makeUser("dueno");
    const suMac = await mac(socio, later(40 * 60_000));
    await agentHeartbeat(suMac.agentId, { version: "1.0.0", ytDlp: null }, later(40 * 60_000));
    await expireLeases(later(40 * 60_000));
    expect(await taskOf(second.taskId)).toMatchObject({ status: "failed" });
    expect(await getVideoFor(dueno, otro.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
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
    await expect(appendTaskChunk(a.agentId, taskId, 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
    await claimTask(a.agentId, T0);
    await expect(extendLease(b.agentId, taskId, T0)).rejects.toMatchObject(TASK_LOST);
    await expect(appendTaskChunk(b.agentId, taskId, 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(b.agentId, taskId, { ok: true, totalBytes: 100 }, T0)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(b.agentId, taskId, { ok: false, error: "x" }, T0)).rejects.toMatchObject(TASK_LOST);
    for (const bad of [9999, Number.NaN, -1, 1.5]) {
      await expect(extendLease(a.agentId, bad, T0)).rejects.toMatchObject(TASK_LOST);
      await expect(appendTaskChunk(a.agentId, bad, 0, mp4(100), T0)).rejects.toMatchObject(TASK_LOST);
      await expect(finishTask(a.agentId, bad, { ok: false, error: "x" }, T0)).rejects.toMatchObject(TASK_LOST);
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "leased", agentId: a.agentId });
    expect(await sessionRows()).toMatchObject([{ received: 0 }]);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
    // La persona tampoco puede tocar la subida del Mac por las rutas del navegador.
    const [session] = await sessionRows();
    await expect(uploadProgress(session.id, { userId: dueno.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe("entrega del archivo", () => {
  it("al terminar bien, el vídeo entra en el mismo procesado que una subida", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const claimed = (await claimTask(agentId, T0))!;
    const file = mp4(CHUNK_BYTES + 300);
    expect(await appendTaskChunk(agentId, taskId, 0, file.subarray(0, CHUNK_BYTES), T0)).toEqual({ received: 1 });
    // Un trozo repetido (se perdió la respuesta) no se escribe dos veces.
    expect(await appendTaskChunk(agentId, taskId, 0, file.subarray(0, CHUNK_BYTES), T0)).toEqual({ received: 1 });
    expect(await appendTaskChunk(agentId, taskId, 1, file.subarray(CHUNK_BYTES), T0)).toEqual({ received: 2 });
    expect(fs.readFileSync(uploadPath(claimed.uploadId)).equals(file)).toBe(true);

    await finishTask(agentId, taskId, { ok: true, totalBytes: file.length }, T0);
    const video = await getVideoFor(dueno, v.id);
    expect(video).toMatchObject({ referenceStatus: "processing", referenceSource: "link", referenceUrl: REEL, referenceError: null });
    expect(await taskOf(taskId)).toMatchObject({ status: "done", error: null });
    const key = jobKey("video.referencia", dueno.id, video.productId, { videoId: v.id, uploadId: claimed.uploadId });
    const jobs = await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.jobName, "video.referencia"));
    expect(jobs.map((j) => [j.key, j.status])).toEqual([[key, "queued"]]);
    // Repetir «terminar» (se perdió la respuesta) no falla ni encola otra vez.
    await finishTask(agentId, taskId, { ok: true, totalBytes: file.length }, T0);
    expect(await getDb().select().from(schema.jobSteps).where(eq(schema.jobSteps.jobName, "video.referencia"))).toHaveLength(1);
    // Ya terminada, no admite un fallo tardío.
    await expect(finishTask(agentId, taskId, { ok: false, error: "x" }, T0)).rejects.toMatchObject(TASK_LOST);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("si lo que llegó no es lo que el Mac dice haber enviado, no se da por entregado", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await claimTask(agentId, T0);
    const incomplete = { status: 400, message: "El vídeo no ha llegado entero. Inténtalo de nuevo." };
    await expect(finishTask(agentId, taskId, { ok: true, totalBytes: 100 }, T0)).rejects.toMatchObject(incomplete);
    await appendTaskChunk(agentId, taskId, 0, mp4(100), T0);
    for (const totalBytes of [101, 99, 0, -1, 1.5, Number.NaN, 200 * 1024 * 1024]) {
      await expect(finishTask(agentId, taskId, { ok: true, totalBytes }, T0)).rejects.toMatchObject(incomplete);
    }
    expect(await taskOf(taskId)).toMatchObject({ status: "leased" });
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");
    await finishTask(agentId, taskId, { ok: true, totalBytes: 100 }, T0);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("si el Mac informa de un fallo, el vídeo lo enseña sin detalles técnicos", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    const claimed = (await claimTask(agentId, T0))!;
    await appendTaskChunk(agentId, taskId, 0, mp4(100), T0);
    const detail = "yt-dlp: ERROR: [Instagram] abc: Requested content is not available /Users/emmanuel/.cache " + "x".repeat(600);
    await finishTask(agentId, taskId, { ok: false, error: detail }, T0);
    const video = await getVideoFor(dueno, v.id);
    expect(video).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
    expect(JSON.stringify(video)).not.toContain("yt-dlp");
    // El detalle queda recortado en la tarea, solo para el dueño.
    const task = await taskOf(taskId);
    expect(task).toMatchObject({ status: "failed", error: detail.slice(0, 500) });
    expect(await sessionRows()).toEqual([]);
    expect(fs.existsSync(uploadPath(claimed.uploadId))).toBe(false);
    // No se reintenta sola.
    expect(await claimTask(agentId, T0)).toBeNull();
    // Y se puede volver a pegar el enlace.
    await requestLinkDownload(dueno, v.id, REEL, T0);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "uploading", referenceError: null });
  });

  it("el archivo que entrega el Mac pasa los mismos límites: 100 MB y tipo por contenido", async () => {
    const { agentId } = await mac();
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
    await claimTask(agentId, T0);
    // El tipo se decide por el contenido del primer trozo.
    await expect(appendTaskChunk(agentId, taskId, 0, PDF_BYTES, T0)).rejects.toMatchObject({
      status: 400,
      message: "Formato de vídeo no admitido. Usa MP4, MOV o WebM.",
    });
    const tooBig = { status: 400, message: "El vídeo pesa demasiado (máximo 100 MB)." };
    // 100 MB son 20 trozos de 5 MB: no existe un trozo 21.
    await expect(appendTaskChunk(agentId, taskId, 20, mp4(100), T0)).rejects.toMatchObject(tooBig);
    // Ningún trozo pasa de 5 MB ni llega vacío.
    await expect(appendTaskChunk(agentId, taskId, 0, mp4(CHUNK_BYTES + 1), T0)).rejects.toMatchObject({ status: 400, message: "Trozo no válido." });
    await expect(appendTaskChunk(agentId, taskId, 0, Buffer.alloc(0), T0)).rejects.toMatchObject({ status: 400 });
    await expect(appendTaskChunk(agentId, taskId, 1, mp4(100), T0)).rejects.toMatchObject({ status: 409, message: "Faltan trozos anteriores." });
    expect(await sessionRows()).toMatchObject([{ received: 0, mime: null }]);

    await appendTaskChunk(agentId, taskId, 0, mp4(CHUNK_BYTES), T0);
    await appendTaskChunk(agentId, taskId, 1, mp4(100), T0);
    // Un trozo corto es el último: detrás no cabe otro.
    await expect(appendTaskChunk(agentId, taskId, 2, mp4(100), T0)).rejects.toMatchObject({ status: 400, message: "Trozo no válido." });
    expect(await sessionRows()).toMatchObject([{ received: 2, mime: "video/mp4", totalBytes: null }]);
    await finishTask(agentId, taskId, { ok: true, totalBytes: CHUNK_BYTES + 100 }, T0);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("processing");
  });

  it("la referencia traída por enlace queda lista como «enlace», con su dirección", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-agente-"));
    try {
      const bytes = fs.readFileSync(await makeSampleVideo(dir, { seconds: 3 }));
      const fake = createFakeHiggsfield();
      const { agentId } = await mac();
      const { taskId } = await requestLinkDownload(dueno, v.id, REEL, T0);
      const claimed = (await claimTask(agentId, T0))!;
      for (let i = 0; i * CHUNK_BYTES < bytes.length; i++) {
        await appendTaskChunk(agentId, taskId, i, bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES), T0);
      }
      await finishTask(agentId, taskId, { ok: true, totalBytes: bytes.length }, T0);
      await processReference(v.id, claimed.uploadId, { higgsfield: fake.port });
      expect(await getVideoFor(dueno, v.id)).toMatchObject({
        referenceStatus: "ready",
        referenceSource: "link",
        referenceUrl: REEL,
        referenceMediaId: "media-1",
      });
      // Se sube al Higgsfield de quien pegó el enlace, y el archivo no se guarda.
      expect(fake.calls.filter((c) => c.method === "uploadMedia")).toMatchObject([{ userId: dueno.id }]);
      expect(fs.existsSync(uploadPath(claimed.uploadId))).toBe(false);
      expect(await sessionRows()).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
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
    cookie.value = undefined;

    const claimed = await claimRoute(agentRequest(token));
    expect(claimed.status).toBe(200);
    const task = await claimed.json();
    expect(task).toEqual({ taskId, url: REEL, uploadId: expect.any(String), chunkBytes: CHUNK_BYTES, maxBytes: 100 * 1024 * 1024 });

    expect((await leaseRoute(agentRequest(token), taskParams(taskId))).status).toBe(200);
    const put = await chunkRoute(agentRequest(token, { method: "PUT", body: new Uint8Array(mp4(100)) }, "?indice=0"), taskParams(taskId));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ received: 1 });
    // Un índice mal escrito no se acepta.
    expect((await chunkRoute(agentRequest(token, { method: "PUT", body: new Uint8Array(mp4(100)) }, "?indice=uno"), taskParams(taskId))).status).toBe(400);
    expect((await chunkRoute(agentRequest(token, { method: "PUT", body: new Uint8Array(mp4(100)) }), taskParams(taskId))).status).toBe(400);
    // Un «terminar» sin forma válida no hace nada.
    expect((await finishRoute(agentRequest(token, { body: JSON.stringify({ ok: "sí" }) }), taskParams(taskId))).status).toBe(400);
    expect((await finishRoute(agentRequest(token, { body: "no es json" }), taskParams(taskId))).status).toBe(400);
    expect((await getVideoFor(dueno, v.id)).referenceStatus).toBe("uploading");

    const done = await finishRoute(agentRequest(token, { body: JSON.stringify({ ok: true, totalBytes: 100 }) }), taskParams(taskId));
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
    await claimTask(agentId);
    const request = new Request("http://localhost/api/agente/x?indice=0", {
      method: "PUT",
      headers: { ...bearer(token), "content-length": String(CHUNK_BYTES + 2048) },
    });
    expect((await chunkRoute(request, taskParams(taskId))).status).toBe(413);
  });

  it("el Mac informa de un fallo por su ruta y el detalle no llega a la persona", async () => {
    const { token } = await mac(dueno, new Date());
    const { taskId } = await requestLinkDownload(dueno, v.id, REEL);
    await claimRoute(agentRequest(token));
    const failed = await finishRoute(agentRequest(token, { body: JSON.stringify({ ok: false, error: "yt-dlp no pudo descargar el enlace" }) }), taskParams(taskId));
    expect(failed.status).toBe(200);
    expect(await getVideoFor(dueno, v.id)).toMatchObject({ referenceStatus: "failed", referenceError: LINK_FAILED });
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
