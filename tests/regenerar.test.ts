import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { parseDraft } from "@/components/batches/draft";
import { batchCardAvatar } from "@/lib/default-avatar";
import type { AuthUser } from "@/server/auth";
import { addProductPhoto } from "@/server/photos";
import type { Product } from "@/server/products";
import { addVideoToBatch, createBatch } from "@/server/videos/batches";
import { createVideo, getVideoFor, latestDoneAnalysis } from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * «Regenerar un vídeo» en «Nuevo lote» (como el «Regenerar concepto» de Codex) y el avatar
 * «Automático» por defecto en las tarjetas.
 */

let dir: string;
let jpeg: Buffer;
let ana: AuthUser;
let producto: Product;
let otro: Product;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prueba-regenerar-"));
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=360x640", "-frames:v", "1", path.join(dir, "foto.jpg")]);
  if (made.status !== 0) throw new Error(made.stderr.toString());
  jpeg = fs.readFileSync(path.join(dir, "foto.jpg"));
});

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await stopWorker();
});

beforeEach(async () => {
  await truncateAll();
  await makeUser("dueno");
  ana = await makeUser("colaborador");
  producto = await makeProduct(ana, { name: "EisWerk" });
  otro = await makeProduct(ana, { name: "HaarZauber" });
  await addProductPhoto(ana, producto.id, jpeg, "articulo");
});

/** Un vídeo anterior con la referencia preparada, su fotograma, su audio, un desglose hecho y sus prompts. */
async function previousVideo(): Promise<number> {
  const video = await createVideo(ana, producto.id, { avatarMode: "automatico", avatarPhotoId: null });
  const pool = getPool();
  await pool.query(
    "update videos set reference_status = 'ready', reference_media_id = 'ref-viejo', reference_duration_ms = 6000, segment_duration_ms = 6000, cuts_ms = '[2000]'::jsonb, image_prompt = 'prompt de imagen', video_prompt = 'prompt del clip' where id = $1",
    [video.id],
  );
  await pool.query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, 0, 0, 'image/jpeg', $2, $3)", [video.id, jpeg.length, jpeg]);
  await pool.query("insert into video_reference_audio (video_id, mime, size, duration_ms, data) values ($1, 'audio/mp4', 3, 6000, $2)", [video.id, Buffer.from("aac")]);
  // El desglose se hizo con las indicaciones que tiene el vídeo (tipo, quién sale, gancho, modelo…).
  await pool.query(
    "insert into video_analyses (video_id, version, status, reference_media_id, created_by, kind, avatar_mode, hook_seconds, clip_model, result) select id, 1, 'done', 'ref-viejo', $2, kind, avatar_mode, hook_seconds, clip_model, '{}'::jsonb from videos where id = $1",
    [video.id, ana.id],
  );
  return video.id;
}

const card = (extra: Record<string, unknown> = {}) => ({ productId: producto.id, avatarPhotoId: null, avatarMode: "automatico", ...extra });

describe("regenerar un vídeo", () => {
  it("reutiliza la referencia preparada, sus fotogramas, su audio y el desglose que sigue valiendo", async () => {
    const source = await previousVideo();
    const batch = await createBatch(ana, "Lote");
    const video = await addVideoToBatch(ana, batch.id, card({ regenerateFrom: source }));
    expect(video).toMatchObject({ referenceStatus: "ready", referenceMediaId: "ref-viejo", segmentDurationMs: 6000, cutsMs: [2000] });
    expect(video).toMatchObject({ imagePrompt: "prompt de imagen", videoPrompt: "prompt del clip" });
    const counts = (await getPool().query(
      "select (select count(*)::int from video_frames where video_id = $1) as frames, (select count(*)::int from video_reference_audio where video_id = $1) as audio, (select count(*)::int from generations where video_id = $1) as gens",
      [video.id],
    )).rows[0];
    expect(counts).toEqual({ frames: 1, audio: 1, gens: 0 });
    expect(await latestDoneAnalysis(await getVideoFor(ana, video.id))).toMatchObject({ staleReason: null });
    // Sin cargo: el desglose copiado no apunta gasto.
    expect((await getPool().query("select spend_entry_id from video_analyses where video_id = $1", [video.id])).rows).toEqual([{ spend_entry_id: null }]);
  });

  it("con cambios en la tarjeta no copia el desglose: el lote lo vuelve a hacer", async () => {
    const source = await previousVideo();
    const batch = await createBatch(ana, "Lote");
    const video = await addVideoToBatch(ana, batch.id, card({ regenerateFrom: source, note: "Ahora en la playa" }));
    expect(video.referenceStatus).toBe("ready");
    expect(await latestDoneAnalysis(video)).toBeNull();
  });

  it("solo vídeos de este producto con la referencia preparada", async () => {
    const source = await previousVideo();
    const batch = await createBatch(ana, "Lote");
    await expect(addVideoToBatch(ana, batch.id, { ...card({ regenerateFrom: source }), productId: otro.id })).rejects.toMatchObject({ status: 400 });
    const empty = await createVideo(ana, producto.id, { avatarMode: "automatico", avatarPhotoId: null });
    await expect(addVideoToBatch(ana, batch.id, card({ regenerateFrom: empty.id }))).rejects.toMatchObject({ status: 400 });
    await expect(addVideoToBatch(ana, batch.id, card({ regenerateFrom: source, linkUrl: "https://www.tiktok.com/@a/video/1" }))).rejects.toMatchObject({ status: 400 });
  });

  it("el borrador guarda la tarjeta «Regenerar» al recargar", () => {
    const row = { key: "f", source: { type: "video", videoId: 7, title: "Vídeo 3", version: "v" }, avatar: null, variant: null, kind: "replicar" };
    const draft = parseDraft({ v: 1, name: "", autoAnalyze: true, batchId: null, groups: [{ key: "g", productId: 1, rows: [row] }] });
    expect(draft?.groups[0].rows[0].source).toEqual({ type: "video", videoId: 7, title: "Vídeo 3", version: "v" });
  });
});

describe("avatar de las tarjetas", () => {
  it("por defecto «Automático»; un avatar concreto solo si se elige", () => {
    expect(batchCardAvatar({ defaultAvatarMode: "elegido" })).toBe("automatico");
    expect(batchCardAvatar({ defaultAvatarMode: "automatico" })).toBe("automatico");
    expect(batchCardAvatar({ defaultAvatarMode: "nadie" })).toBe("nadie");
    expect(batchCardAvatar({ defaultAvatarMode: "sin_sustitucion" })).toBe("sin_sustitucion");
  });
});
