import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import {
  agentHeartbeat,
  appendTaskChunk,
  claimTask,
  createAgentToken,
  expireLeases,
  extendLease,
  finishTask,
  LEASE_MS,
  MAX_LEASE_AGE_MS,
  requestSongDownload,
  revokeAgent,
  type ClaimedTask,
} from "@/server/agent";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { dismissSongLink, listSongLinks, SONG_LINK_FAILED, SONG_LINK_TOO_SLOW } from "@/server/song-downloads";
import { listSongs, MAX_SONG_BYTES, updateSong } from "@/server/songs";
import { CHUNK_BYTES, uploadPath } from "@/server/videos/upload";
import { GET as listLinksRoute, POST as pasteRoute } from "@/app/api/canciones/enlaces/route";
import { DELETE as dismissRoute } from "@/app/api/canciones/enlaces/[taskId]/route";
import { POST as claimRoute } from "@/app/api/agente/tareas/reclamar/route";
import { PUT as chunkRoute } from "@/app/api/agente/tareas/[taskId]/trozo/route";
import { POST as finishRoute } from "@/app/api/agente/tareas/[taskId]/terminar/route";
import { makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/** «Canciones → Pegar enlace»: el Mac del dueño trae el audio como MP3 y entra en la biblioteca, sin drop. */

const SONG = "https://soundcloud.com/artista/cancion";
const YOUTUBE = "https://www.youtube.com/watch?v=abc";
const TASK_LOST = { status: 409, message: "Esta tarea ya no es tuya." };
const T0 = new Date("2026-11-22T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

let dir: string;
let mp3: Buffer;
let bigMp3: Buffer;
let dueno: AuthUser;
let ana: AuthUser;
let agentId: number;
let token: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-cancion-enlace-"));
  mp3 = fs.readFileSync(await makeSampleAudio(dir, "mp3", { seconds: 3 }));
  // Más de un trozo de 5 MB: un tono largo a 64 kb/s pesa poco, así que se rellena al final.
  bigMp3 = Buffer.concat([mp3, Buffer.alloc(CHUNK_BYTES, 0)]);
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  ({ agentId, token } = await createAgentToken(dueno, "Mac de casa"));
  await agentHeartbeat(agentId, { version: "1.2.0", ytDlp: "2026.10.26" }, T0);
});

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const taskOf = async (taskId: number) => (await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.id, taskId)))[0];
const paste = (url: unknown) =>
  pasteRoute(new Request("http://localhost/api/canciones/enlaces", { method: "POST", body: JSON.stringify({ url }), headers: { "Content-Type": "application/json" } }));

async function claim(now: Date = T0): Promise<ClaimedTask> {
  const claimed = await claimTask(agentId, now);
  expect(claimed).not.toBeNull();
  return claimed!;
}
/** Sube `bytes` por trozos con la sesión de la reserva. */
async function upload(task: ClaimedTask, bytes: Buffer, now: Date = T0) {
  for (let index = 0; index * CHUNK_BYTES < bytes.length; index++) {
    await appendTaskChunk(agentId, task.taskId, task.uploadId, index, bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES), now);
  }
}
const deliver = async (task: ClaimedTask, bytes: Buffer, title?: string, now: Date = T0) => {
  await upload(task, bytes, now);
  await finishTask(agentId, task.taskId, { ok: true, uploadId: task.uploadId, totalBytes: bytes.length, ...(title === undefined ? {} : { title }) }, now);
};
const fileExists = (uploadId: string) => fs.existsSync(uploadPath(uploadId));

describe("pegar el enlace de una canción", () => {
  it("solo el dueño; un colaborador recibe 403 y no se crea nada", async () => {
    await expect(requestSongDownload(ana, SONG, T0)).rejects.toMatchObject({ status: 403 });
    await as(ana);
    expect((await paste(SONG)).status).toBe(403);
    expect((await listLinksRoute()).status).toBe(403);
    expect(await listSongLinks(ana)).toEqual([]);
    expect(await getDb().select().from(schema.agentTasks)).toEqual([]);
  });

  it("admite YouTube, TikTok, Instagram, Facebook y SoundCloud; nada más", async () => {
    for (const url of [SONG, YOUTUBE, "https://music.youtube.com/watch?v=x", "https://vm.tiktok.com/abc", "https://www.instagram.com/reel/a/", "https://m.soundcloud.com/a/b"]) {
      expect((await requestSongDownload(dueno, url, T0)).created, url).toBe(true);
    }
    for (const url of [
      "https://evil.test/a.mp3",
      "http://soundcloud.com/a/b",
      "https://soundcloud.com.evil.test/a",
      "https://user:pw@soundcloud.com/a",
      "https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fevil.test",
      "--exec=x",
      42,
      undefined,
    ]) {
      await expect(requestSongDownload(dueno, url, T0), String(url)).rejects.toMatchObject({
        status: 400,
        message: "Solo se admiten enlaces de YouTube, TikTok, Instagram, Facebook o SoundCloud.",
      });
    }
    await expect(requestSongDownload(dueno, `https://soundcloud.com/${"a".repeat(2000)}`, T0)).rejects.toMatchObject({ status: 400 });
  });

  it("SoundCloud solo vale para canciones: como referencia de un vídeo no", async () => {
    const { linkOf } = await import("@/lib/links");
    expect(linkOf(SONG)).toBeNull();
  });

  it("con el Mac desconectado, 409 y nada en la cola", async () => {
    await expect(requestSongDownload(dueno, SONG, later(2 * 60_000))).rejects.toMatchObject({
      status: 409,
      message: "El Mac no está conectado ahora mismo. Importa el archivo de la canción.",
    });
    expect(await getDb().select().from(schema.agentTasks)).toEqual([]);
  });

  it("el mismo enlace pegado dos veces mientras se descarga es la misma tarea; ya terminado, otra", async () => {
    const first = await requestSongDownload(dueno, SONG, T0);
    expect(await requestSongDownload(dueno, ` ${SONG} `, T0)).toEqual({ taskId: first.taskId, created: false });
    const task = await claim();
    await finishTask(agentId, task.taskId, { ok: false, uploadId: task.uploadId, error: "x" }, T0);
    const again = await requestSongDownload(dueno, SONG, T0);
    expect(again.created).toBe(true);
    expect(again.taskId).not.toBe(first.taskId);
  });

  it("por la ruta: 201 con la tarea, y la lista la enseña esperando al Mac", async () => {
    vi.useFakeTimers({ now: T0, toFake: ["Date"] });
    try {
      await as(dueno);
      const response = await paste(SONG);
      expect(response.status).toBe(201);
      const { taskId } = await response.json();
      expect((await paste(SONG)).status).toBe(200);
      const listed = await (await listLinksRoute()).json();
      expect(listed.links).toEqual([{ id: taskId, url: SONG, status: "queued", error: null, songId: null, createdAt: T0.toISOString() }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("el Mac trae la canción", () => {
  it("la reserva dice que es una canción, con su máximo; la canción entra sin drop y con el título de yt-dlp", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    const task = await claim();
    expect(task).toEqual({ taskId, kind: "cancion", url: SONG, uploadId: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/), chunkBytes: CHUNK_BYTES, maxBytes: MAX_SONG_BYTES });
    expect((await listSongLinks(dueno, T0))[0]).toMatchObject({ id: taskId, status: "downloading" });

    await upload(task, bigMp3);
    expect(fileExists(task.uploadId)).toBe(true);
    await finishTask(agentId, taskId, { ok: true, uploadId: task.uploadId, totalBytes: bigMp3.length, title: "  Mi   canción (remix)  " }, T0);

    const [song] = await listSongs();
    expect(song).toMatchObject({ title: "Mi canción (remix)", dropMs: null, startMs: 0, mime: "audio/mpeg", size: bigMp3.length, number: null, sections: [] });
    expect(song.durationMs).toBeGreaterThan(2500);
    expect(await taskOf(taskId)).toMatchObject({ status: "done", songId: song.id, uploadId: null, leaseExpiresAt: null });
    expect(fileExists(task.uploadId)).toBe(false);
    expect(await listSongLinks(dueno, T0)).toEqual([{ id: taskId, url: SONG, status: "done", error: null, songId: song.id, createdAt: T0 }]);
    // Repetir el final no hace nada más.
    await finishTask(agentId, taskId, { ok: true, uploadId: task.uploadId, totalBytes: bigMp3.length, title: "Otra" }, T0);
    expect(await listSongs()).toHaveLength(1);
  });

  it("sin título, «Canción»; un título larguísimo se recorta a 200", async () => {
    await requestSongDownload(dueno, SONG, T0);
    await deliver(await claim(), mp3);
    expect((await listSongs())[0].title).toBe("Canción");
    await getDb().delete(schema.songs);
    await requestSongDownload(dueno, YOUTUBE, T0);
    await deliver(await claim(), mp3, "x".repeat(300));
    expect((await listSongs())[0].title).toBe("x".repeat(200));
  });

  it("la misma canción (mismo sha256) no se guarda dos veces ni pierde su título ni su drop", async () => {
    await requestSongDownload(dueno, SONG, T0);
    await deliver(await claim(), mp3, "Original");
    const [song] = await listSongs();
    await updateSong(dueno, song.id, { title: "Renombrada", dropMs: 1000 });
    const { taskId } = await requestSongDownload(dueno, YOUTUBE, T0);
    await deliver(await claim(), mp3, "Otro título");
    expect(await listSongs()).toMatchObject([{ id: song.id, title: "Renombrada", dropMs: 1000 }]);
    expect(await taskOf(taskId)).toMatchObject({ status: "done", songId: song.id });
  });

  it("por las rutas del Mac, con su ficha: reservar, trozos con `subida` y terminar con el título", async () => {
    await requestSongDownload(dueno, SONG, T0);
    const auth = { Authorization: `Bearer ${token}` };
    const claimed = await (await claimRoute(new Request("http://localhost/api/agente/tareas/reclamar", { method: "POST", headers: auth }))).json();
    expect(claimed.kind).toBe("cancion");
    const params = { params: Promise.resolve({ taskId: String(claimed.taskId) }) };
    const chunk = (query: string) =>
      chunkRoute(new Request(`http://localhost/api/agente/tareas/${claimed.taskId}/trozo?${query}`, { method: "PUT", headers: auth, body: new Uint8Array(mp3) }), params);
    expect((await chunk("indice=0")).status).toBe(400);
    expect((await chunk(`indice=0&subida=${"z".repeat(32)}`)).status).toBe(409);
    expect((await chunk(`indice=0&subida=${claimed.uploadId}`)).status).toBe(200);
    const done = await finishRoute(
      new Request(`http://localhost/api/agente/tareas/${claimed.taskId}/terminar`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, uploadId: claimed.uploadId, totalBytes: mp3.length, title: "Desde el Mac" }),
      }),
      params,
    );
    expect(done.status).toBe(200);
    expect((await listSongs())[0].title).toBe("Desde el Mac");
  });

  it("el primer trozo tiene que ser un MP3; no cabe más del máximo; un trozo adelantado, 409", async () => {
    await requestSongDownload(dueno, SONG, T0);
    const task = await claim();
    const send = (index: number, bytes: Buffer) => appendTaskChunk(agentId, task.taskId, task.uploadId, index, bytes, T0);
    await expect(send(0, Buffer.from("%PDF-1.7 no es audio"))).rejects.toMatchObject({ status: 400 });
    await expect(send(1, mp3)).rejects.toMatchObject({ status: 409 });
    await expect(send(Math.ceil(MAX_SONG_BYTES / CHUNK_BYTES), mp3)).rejects.toMatchObject({ status: 400 });
    await expect(send(0, Buffer.alloc(0))).rejects.toMatchObject({ status: 400 });
    expect(await send(0, mp3)).toEqual({ received: 1 });
    // Repetido: no se escribe dos veces.
    expect(await send(0, mp3)).toEqual({ received: 1 });
    expect(fs.statSync(uploadPath(task.uploadId)).size).toBe(mp3.length);
  });

  it("si no llegó entero, 400 y la tarea sigue reservada; si no es audio, falla", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    const task = await claim();
    await upload(task, mp3);
    await expect(finishTask(agentId, taskId, { ok: true, uploadId: task.uploadId, totalBytes: mp3.length + 1 }, T0)).rejects.toMatchObject({ status: 400 });
    expect((await taskOf(taskId)).status).toBe("leased");

    // Cabecera de MP3 y luego basura: ffprobe no lo da por audio.
    const fake = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(2000, 0x41)]);
    const { taskId: other } = await requestSongDownload(dueno, YOUTUBE, T0);
    await finishTask(agentId, taskId, { ok: false, uploadId: task.uploadId, error: "x" }, T0);
    const second = await claim();
    expect(second.taskId).toBe(other);
    await upload(second, fake);
    await expect(finishTask(agentId, other, { ok: true, uploadId: second.uploadId, totalBytes: fake.length }, T0)).rejects.toMatchObject({ status: 400 });
    expect(await taskOf(other)).toMatchObject({ status: "failed" });
    expect(fileExists(second.uploadId)).toBe(false);
    expect(await listSongs()).toEqual([]);
  });

  it("si el Mac no pudo, la tarea falla con el detalle para el dueño y la lista lo dice con el texto fijo", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    const task = await claim();
    await upload(task, mp3);
    await finishTask(agentId, taskId, { ok: false, uploadId: task.uploadId, error: `ERROR: ${"x".repeat(900)}` }, T0);
    const row = await taskOf(taskId);
    expect(row).toMatchObject({ status: "failed", uploadId: null });
    expect(row.error).toHaveLength(500);
    expect(fileExists(task.uploadId)).toBe(false);
    expect(await listSongLinks(dueno, T0)).toMatchObject([{ id: taskId, status: "failed", error: SONG_LINK_FAILED, songId: null }]);
    // Al día siguiente ya no sale.
    expect(await listSongLinks(dueno, later(25 * 60 * 60_000))).toEqual([]);
  });

  it("otro Mac, una sesión de otra reserva o una tarea ajena no pueden subir ni terminar", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    const task = await claim();
    const other = await createAgentToken(dueno, "Otro Mac");
    await expect(appendTaskChunk(other.agentId, taskId, task.uploadId, 0, mp3, T0)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(other.agentId, taskId, { ok: true, uploadId: task.uploadId, totalBytes: 1 }, T0)).rejects.toMatchObject(TASK_LOST);
    await expect(finishTask(agentId, taskId, { ok: false, uploadId: "z".repeat(32), error: "x" }, T0)).rejects.toMatchObject(TASK_LOST);
    expect((await taskOf(taskId)).status).toBe("leased");
  });
});

describe("plazos de la tarea", () => {
  it("una reserva sin latido vuelve a la cola; la nueva reserva abre otra sesión y la vieja deja de valer", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    const first = await claim();
    await appendTaskChunk(agentId, taskId, first.uploadId, 0, mp3, T0);
    await expireLeases(later(LEASE_MS + 1000));
    expect((await taskOf(taskId)).status).toBe("queued");
    await expect(appendTaskChunk(agentId, taskId, first.uploadId, 1, mp3, later(LEASE_MS + 2000))).rejects.toMatchObject(TASK_LOST);

    await agentHeartbeat(agentId, { version: "1.2.0", ytDlp: null }, later(LEASE_MS + 2000));
    const second = await claim(later(LEASE_MS + 2000));
    expect(second.taskId).toBe(taskId);
    expect(second.uploadId).not.toBe(first.uploadId);
    expect(fileExists(first.uploadId)).toBe(false);
    await expect(appendTaskChunk(agentId, taskId, first.uploadId, 0, mp3, later(LEASE_MS + 3000))).rejects.toMatchObject(TASK_LOST);
    await deliver(second, mp3, "Al segundo intento", later(LEASE_MS + 3000));
    expect((await listSongs())[0].title).toBe("Al segundo intento");
  });

  it("una reserva de más de 30 minutos falla aunque lata, y la lista dice que no llegó a tiempo", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    const task = await claim();
    await appendTaskChunk(agentId, taskId, task.uploadId, 0, mp3, T0);
    for (let minute = 4; minute < 32; minute += 4) {
      await agentHeartbeat(agentId, { version: "1.2.0", ytDlp: null }, later(minute * 60_000));
      await extendLease(agentId, taskId, later(minute * 60_000));
    }
    await expireLeases(later(MAX_LEASE_AGE_MS + 60_000));
    expect((await taskOf(taskId)).status).toBe("failed");
    expect(fileExists(task.uploadId)).toBe(false);
    expect(await listSongLinks(dueno, later(MAX_LEASE_AGE_MS + 60_000))).toMatchObject([{ status: "failed", error: SONG_LINK_TOO_SLOW }]);
  });

  it("revocar la ficha devuelve la canción a la cola", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    await claim();
    await revokeAgent(dueno, agentId, T0);
    expect((await taskOf(taskId)).status).toBe("queued");
  });
});

describe("quitar de la lista", () => {
  it("solo los terminados y solo el dueño; uno en marcha no se quita", async () => {
    const { taskId } = await requestSongDownload(dueno, SONG, T0);
    await expect(dismissSongLink(dueno, taskId)).rejects.toMatchObject({ status: 404 });
    await expect(dismissSongLink(ana, taskId)).rejects.toMatchObject({ status: 403 });
    const task = await claim();
    await finishTask(agentId, taskId, { ok: false, uploadId: task.uploadId, error: "x" }, T0);
    await as(ana);
    const params = { params: Promise.resolve({ taskId: String(taskId) }) };
    expect((await dismissRoute(new Request("http://localhost", { method: "DELETE" }), params)).status).toBe(403);
    await as(dueno);
    expect((await dismissRoute(new Request("http://localhost", { method: "DELETE" }), params)).status).toBe(204);
    expect(await taskOf(taskId)).toBeUndefined();
    expect((await dismissRoute(new Request("http://localhost", { method: "DELETE" }), params)).status).toBe(404);
  });
});
