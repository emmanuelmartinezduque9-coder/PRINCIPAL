import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getPool, schema } from "@/db/client";
import { setAssignments } from "@/server/access";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import { detectAudioType } from "@/server/media/detect";
import { MediaError, probeAudio } from "@/server/media/ffmpeg";
import type { Product } from "@/server/products";
import { deleteSong, listSongs, MAX_RANGE_CHUNK, parseRange, updateSong, uploadSong } from "@/server/songs";
import { addVideoToBatch, batchView, createBatch, duplicateBatchVideo } from "@/server/videos/batches";
import { createVideo, getVideoFor, setVideoSong, videoView } from "@/server/videos/videos";
import { GET as listRoute, POST as uploadRoute } from "@/app/api/canciones/route";
import { DELETE as deleteRoute, PATCH as patchRoute } from "@/app/api/canciones/[songId]/route";
import { GET as audioRoute } from "@/app/api/canciones/[songId]/audio/route";
import { PUT as putVideo } from "@/app/api/videos/[videoId]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { makeSampleAudio } from "./helpers/sample-audio";
import { makeSampleVideo } from "./helpers/sample-video";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/** «Canciones»: la biblioteca común de canciones con su drop, y la música de cada vídeo. */

let dir: string;
let mp3: Buffer;
let otherMp3: Buffer;
let m4a: Buffer;
let wav: Buffer;
let mp4: Buffer;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-canciones-"));
  mp3 = fs.readFileSync(await makeSampleAudio(dir, "mp3", { seconds: 3 }));
  otherMp3 = fs.readFileSync(await makeSampleAudio(dir, "mp3", { seconds: 2, frequency: 660 }));
  m4a = fs.readFileSync(await makeSampleAudio(dir, "m4a", { seconds: 2 }));
  wav = fs.readFileSync(await makeSampleAudio(dir, "wav", { seconds: 1 }));
  mp4 = fs.readFileSync(await makeSampleVideo(dir, { seconds: 2 }));
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const params = (songId: number | string) => ({ params: Promise.resolve({ songId: String(songId) }) });
function uploadRequest(bytes: Buffer, fields: Record<string, string | string[]> = {}) {
  const form = new FormData();
  form.append("archivo", new File([new Uint8Array(bytes)], "cancion.mp3", { type: "audio/mpeg" }));
  for (const [name, value] of Object.entries(fields)) for (const v of [value].flat()) form.append(name, v);
  return new Request("http://localhost/api/canciones", { method: "POST", body: form });
}
const audio = (songId: number, range?: string) =>
  audioRoute(new Request(`http://localhost/api/canciones/${songId}/audio`, { headers: range ? { range } : {} }), params(songId));

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana);
});

describe("tipo de audio por el contenido", () => {
  it("reconoce MP3 (con y sin ID3), M4A y WAV por sus bytes", () => {
    expect(detectAudioType(mp3)).toBe("audio/mpeg");
    expect(detectAudioType(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).toBe("audio/mpeg");
    expect(detectAudioType(m4a)).toBe("audio/mp4");
    expect(detectAudioType(wav)).toBe("audio/wav");
  });

  it("no acepta lo que no es audio", () => {
    expect(detectAudioType(Buffer.from("hola, esto es texto"))).toBeNull();
    expect(detectAudioType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull(); // JPEG
    expect(detectAudioType(Buffer.alloc(0))).toBeNull();
  });

  it("mide la duración con ffprobe y rechaza un vídeo o un archivo roto", async () => {
    const info = await probeAudio(mp3);
    expect(info.mime).toBe("audio/mpeg");
    expect(Math.abs(info.durationMs - 3000)).toBeLessThanOrEqual(100);
    expect(Math.abs((await probeAudio(m4a)).durationMs - 2000)).toBeLessThanOrEqual(100);
    expect(Math.abs((await probeAudio(wav)).durationMs - 1000)).toBeLessThanOrEqual(50);
    // Un MP4 de vídeo comparte contenedor con el M4A: no cuela como canción.
    await expect(probeAudio(mp4)).rejects.toThrow("Esto es un vídeo, no una canción.");
    await expect(probeAudio(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200, 7)]))).rejects.toBeInstanceOf(MediaError);
    await expect(probeAudio(Buffer.from("texto"))).rejects.toThrow("Formato no admitido. Usa MP3, M4A o WAV.");
  });
});

describe("quién puede cambiar las canciones", () => {
  it("solo el dueño sube, cambia y borra; un colaborador recibe 403 y nada cambia", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno" });
    await as(ana);
    expect((await uploadRoute(uploadRequest(otherMp3))).status).toBe(403);
    const patch = await patchRoute(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ dropMs: 1000 }) }), params(song.id));
    expect(patch.status).toBe(403);
    expect((await deleteRoute(new Request("http://localhost/x", { method: "DELETE" }), params(song.id))).status).toBe(403);
    await expect(uploadSong(ana, otherMp3)).rejects.toMatchObject({ status: 403 });
    await expect(updateSong(ana, song.id, { title: "Otro" })).rejects.toMatchObject({ status: 403 });
    await expect(deleteSong(ana, song.id)).rejects.toMatchObject({ status: 403 });
    const songs = await listSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ title: "Uno", dropMs: null });
  });

  it("todas las personas ven la lista y escuchan; sin sesión, 401", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno" });
    await as(luis);
    const list = await listRoute();
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.songs).toHaveLength(1);
    expect(body.songs[0]).not.toHaveProperty("data");
    expect((await audio(song.id)).status).toBe(200);
    cookie.value = undefined;
    expect((await listRoute()).status).toBe(401);
    expect((await audio(song.id)).status).toBe(401);
  });

  it("el dueño sube por la ruta con sus datos; cambia el drop y el inicio dentro de la canción", async () => {
    await as(dueno);
    const response = await uploadRoute(uploadRequest(mp3, { titulo: "EisWerk C1", numero: "1", secciones: ["eiswerk", "navideñas"], drop: "2500", inicio: "300" }));
    expect(response.status).toBe(201);
    const { song, created } = await response.json();
    expect(created).toBe(true);
    expect(song).toMatchObject({ title: "EisWerk C1", number: 1, sections: ["eiswerk", "navideñas"], dropMs: 2500, startMs: 300, mime: "audio/mpeg" });
    expect(Math.abs(song.durationMs - 3000)).toBeLessThanOrEqual(100);

    const patch = (body: unknown) =>
      patchRoute(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), params(song.id));
    expect((await (await patch({ dropMs: 1200, startMs: 100 })).json()).song).toMatchObject({ dropMs: 1200, startMs: 100 });
    expect((await patch({ dropMs: 60_000 })).status).toBe(400);
    expect((await patch({ startMs: -1 })).status).toBe(400);
    expect((await patch({ title: "  " })).status).toBe(400);
    expect((await (await patch({ dropMs: null })).json()).song.dropMs).toBeNull();
    expect((await uploadRoute(uploadRequest(otherMp3, { drop: "abc" }))).status).toBe(400);
    expect((await uploadRoute(uploadRequest(Buffer.from("no soy audio")))).status).toBe(400);
  });
});

describe("idempotente por sha256", () => {
  it("subir la misma canción otra vez solo cambia sus datos: sigue habiendo una", async () => {
    const first = await uploadSong(dueno, mp3, { title: "Uno", number: 1, dropMs: 1000 });
    expect(first.created).toBe(true);
    const again = await uploadSong(dueno, mp3, { title: "Uno (bien)", dropMs: 2000, sections: ["eiswerk"] });
    expect(again.created).toBe(false);
    expect(again.song.id).toBe(first.song.id);
    expect(again.song).toMatchObject({ title: "Uno (bien)", number: 1, dropMs: 2000, sections: ["eiswerk"] });
    expect(await listSongs()).toHaveLength(1);

    // Por la ruta: 200 (no 201) y lo mismo.
    await as(dueno);
    const response = await uploadRoute(uploadRequest(mp3, { titulo: "Uno" }));
    expect(response.status).toBe(200);
    expect((await response.json()).created).toBe(false);
    expect(await listSongs()).toHaveLength(1);
  });

  it("dos subidas a la vez de la misma canción dejan una sola", async () => {
    const results = await Promise.all([uploadSong(dueno, mp3, { title: "A" }), uploadSong(dueno, mp3, { title: "A" })]);
    expect(new Set(results.map((r) => r.song.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await listSongs()).toHaveLength(1);
  });
});

describe("audio con Range", () => {
  it("entera sin Range (200); el trozo pedido con 206 y Content-Range", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno" });
    await as(ana);
    const full = await audio(song.id);
    expect(full.status).toBe(200);
    expect(full.headers.get("Accept-Ranges")).toBe("bytes");
    expect(full.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(Buffer.from(await full.arrayBuffer()).equals(mp3)).toBe(true);

    const part = await audio(song.id, "bytes=100-199");
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe(`bytes 100-199/${mp3.length}`);
    expect(part.headers.get("Content-Length")).toBe("100");
    expect(Buffer.from(await part.arrayBuffer()).equals(mp3.subarray(100, 200))).toBe(true);

    const tail = await audio(song.id, "bytes=-10");
    expect(tail.status).toBe(206);
    expect(Buffer.from(await tail.arrayBuffer()).equals(mp3.subarray(mp3.length - 10))).toBe(true);

    const open = await audio(song.id, "bytes=1000-");
    expect(open.status).toBe(206);
    expect(open.headers.get("Content-Range")).toBe(`bytes 1000-${mp3.length - 1}/${mp3.length}`);
    expect(Buffer.from(await open.arrayBuffer()).equals(mp3.subarray(1000))).toBe(true);

    const beyond = await audio(song.id, `bytes=${mp3.length}-`);
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get("Content-Range")).toBe(`bytes */${mp3.length}`);
    expect((await audio(99999)).status).toBe(404);
  });

  it("lee bien la cabecera: un rango abierto se corta, el final se ajusta y lo raro se ignora", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 10 * MAX_RANGE_CHUNK)).toEqual({ start: 0, end: MAX_RANGE_CHUNK - 1 });
    expect(parseRange("bytes=10-5000", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=0-1,5-9", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange("bytes=9-3", 100)).toBeNull();
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
  });
});

describe("la música de cada vídeo", () => {
  it("la base de datos no deja una canción sin modo «cancion» ni «cancion» sin canción", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno" });
    const video = await createVideo(ana, producto.id);
    const pool = getPool();
    await expect(pool.query("update videos set song_id = $1 where id = $2", [song.id, video.id])).rejects.toMatchObject({
      constraint: "videos_audio_mode_song",
    });
    await expect(pool.query("update videos set audio_mode = 'cancion' where id = $1", [video.id])).rejects.toMatchObject({
      constraint: "videos_audio_mode_song",
    });
    await expect(pool.query("update videos set audio_mode = 'otro' where id = $1", [video.id])).rejects.toThrow(/videos_audio_mode/);
    await pool.query("update videos set song_id = $1, audio_mode = 'cancion' where id = $2", [song.id, video.id]);
    expect((await getVideoFor(ana, video.id)).audioMode).toBe("cancion");
  });

  it("elegir canción la enseña en el vídeo; «Audio original» la quita", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Navideña", number: 7, dropMs: 1500 });
    const video = await createVideo(ana, producto.id);
    let view = await videoView(ana, video.id);
    expect(view.song).toBeNull();
    expect(view.video.audioMode).toBe("original");

    await as(ana);
    const put = (body: unknown) =>
      putVideo(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ videoId: String(video.id) }) });
    const response = await put({ songId: song.id });
    expect(response.status).toBe(200);
    expect((await response.json()).video).toMatchObject({ songId: song.id, audioMode: "cancion" });
    view = await videoView(ana, video.id);
    expect(view.song).toMatchObject({ id: song.id, number: 7, title: "Navideña", dropMs: 1500 });
    // Quien también ve el producto (el dueño) ve la canción.
    expect((await videoView(dueno, video.id)).song?.id).toBe(song.id);

    expect((await put({ songId: 99999 })).status).toBe(404);
    expect((await put({ songId: "7" })).status).toBe(400);
    expect((await getVideoFor(ana, video.id)).songId).toBe(song.id);

    expect((await put({ songId: null })).status).toBe(200);
    view = await videoView(ana, video.id);
    expect(view.song).toBeNull();
    expect(view.video.audioMode).toBe("original");
  });

  it("eligen la música quien creó el vídeo y el dueño; elegirla no deja el desglose por repetir", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno" });
    const video = await createVideo(ana, producto.id);
    // Otro colaborador que no ve el producto: 404; uno que lo ve pero no lo creó: 403.
    await expect(setVideoSong(luis, video.id, song.id)).rejects.toMatchObject({ status: 404 });
    const marta = await makeUser("colaborador");
    await setAssignments(dueno, marta.id, [producto.id]);
    await expect(setVideoSong(marta, video.id, song.id)).rejects.toMatchObject({ status: 403 });
    expect((await videoView(marta, video.id)).songEditable).toBe(false);
    expect((await videoView(ana, video.id)).songEditable).toBe(true);
    expect((await videoView(dueno, video.id)).songEditable).toBe(true);
    // El dueño, por la ruta y en un vídeo ajeno.
    await as(dueno);
    const response = await putVideo(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ songId: song.id }) }), {
      params: Promise.resolve({ videoId: String(video.id) }),
    });
    expect(response.status).toBe(200);
    expect((await getVideoFor(ana, video.id)).songId).toBe(song.id);
    // Con otro cambio a la vez sigue haciendo falta ser quien lo creó.
    const mixed = await putVideo(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ songId: null, note: "x" }) }), {
      params: Promise.resolve({ videoId: String(video.id) }),
    });
    expect(mixed.status).toBe(403);
    expect((await getVideoFor(ana, video.id)).songId).toBe(song.id);
    await setVideoSong(dueno, video.id, null);
    await getDb().update(schema.videos).set({ skipAutoAnalysis: true }).where(eq(schema.videos.id, video.id));
    await setVideoSong(ana, video.id, song.id);
    expect((await getVideoFor(ana, video.id)).skipAutoAnalysis).toBe(true);
  });

  it("borrar una canción devuelve sus vídeos a «Audio original»", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno" });
    const video = await createVideo(ana, producto.id);
    await setVideoSong(ana, video.id, song.id);
    expect(await deleteSong(dueno, song.id)).toEqual({ released: 1 });
    const after = await getVideoFor(ana, video.id);
    expect(after).toMatchObject({ songId: null, audioMode: "original" });
    expect(await listSongs()).toHaveLength(0);
    await expect(deleteSong(dueno, song.id)).rejects.toMatchObject({ status: 404 });
  });

  it("en el lote: se elige al crear, el tablero la enseña y «Duplicar» la copia", async () => {
    const { song } = await uploadSong(dueno, mp3, { title: "Uno", number: 12 });
    const batch = await createBatch(ana, "Lote");
    const video = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "nadie", songId: song.id });
    expect(video).toMatchObject({ songId: song.id, audioMode: "cancion" });
    const plain = await addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "nadie" });
    expect(plain).toMatchObject({ songId: null, audioMode: "original" });
    await expect(
      addVideoToBatch(ana, batch.id, { productId: producto.id, avatarPhotoId: null, avatarMode: "nadie", songId: 99999 }),
    ).rejects.toMatchObject({ status: 404 });

    const copy = await duplicateBatchVideo(ana, batch.id, video.id);
    expect(copy).toMatchObject({ songId: song.id, audioMode: "cancion" });
    const view = await batchView(ana, batch.id);
    expect(view.rows.map((row) => row.song?.number ?? null)).toEqual([12, null, 12]);
    expect(view.rows.every((row) => row.songEditable)).toBe(true);
    // El dueño ve el lote de Ana y también puede elegir la música de sus filas.
    expect((await batchView(dueno, batch.id)).rows.every((row) => row.songEditable)).toBe(true);
  });
});
