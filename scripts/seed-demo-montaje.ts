/**
 * Datos de ejemplo para ver el montaje automático sin el Mac (SOLO en este ordenador).
 *
 *   PRINCIPAL_AUTH=off npx tsx scripts/seed-demo-montaje.ts
 *
 * Usa la base de datos local de `npm run dev` (o `DATABASE_URL`) y crea el lote «Ejemplo · montaje»
 * con tres vídeos con su clip hecho: uno ya montado (un MP4 de prueba hecho con ffmpeg), uno
 * montándose en un Mac de ejemplo y uno que no se pudo montar. Los clips apuntan a direcciones de
 * ejemplo de Higgsfield: no se reproducen.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, getPool, schema } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import { isCloud } from "../src/lib/cloud-env";
import { agentHeartbeat, claimTask, createAgentToken } from "../src/server/agent";
import { LOCAL_USER } from "../src/server/auth";
import { createProduct } from "../src/server/products";
import { addVideoToBatch, createBatch } from "../src/server/videos/batches";
import { startEdit } from "../src/server/videos/edits";
import { startEmbeddedPg } from "./pg";

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err}`))));
  });
}

async function main() {
  if (isCloud()) throw new Error("Solo en este ordenador.");
  let url = process.env.DATABASE_URL;
  let stop = async () => {};
  if (!url) ({ url, stop } = await startEmbeddedPg());
  process.env.DATABASE_URL = url;
  await runMigrations(url);
  await seed(url);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "demo-montaje-"));
  try {
    const me = LOCAL_USER;
    const mp4 = path.join(dir, "editado.mp4");
    await ffmpeg([
      "-f", "lavfi", "-i", "testsrc2=s=540x960:r=24:d=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4,
    ]);
    const bytes = await fs.readFile(mp4);

    const product = await createProduct(me, { name: "EisWerk", summary: "Máquina de helado casera" });
    const batch = await createBatch(me, "Ejemplo · montaje", { autoAnalyze: false });
    const db = getDb();
    const videos = [];
    for (let i = 0; i < 3; i++) {
      const video = await addVideoToBatch(me, batch.id, { productId: product.id, avatarMode: "nadie", avatarPhotoId: null });
      const [gen] = await db
        .insert(schema.generations)
        .values({ videoId: video.id, kind: "clip", round: 1, status: "done", userId: me.id, request: {}, count: 1, quotedCredits: 18, creditsSpent: 18 })
        .returning({ id: schema.generations.id });
      await db.insert(schema.generationResults).values({ generationId: gen.id, index: 0, jobId: `demo-montaje-${video.id}`, ok: true, url: `https://demo.cloudfront.net/clip-${video.id}.mp4` });
      videos.push(video);
    }
    const { agentId } = await createAgentToken(me, "Mac de ejemplo");
    await agentHeartbeat(agentId, { version: "1.3.0", ytDlp: "2026.11.01" });

    // 1: montado (versión 1, con su autocomprobación).
    const first = await startEdit(me, videos[0].id);
    await db.insert(schema.edits).values({
      videoId: videos[0].id,
      version: 1,
      size: bytes.length,
      data: bytes,
      durationMs: 6000,
      taskId: first.taskId,
      selfCheck: { ok: true, avisos: [], planos: 8, cortesEnBeat: "6/7", intentos: 1, referencia: true },
    });
    await db.update(schema.agentTasks).set({ status: "done" }).where(eq(schema.agentTasks.id, first.taskId));
    await db.update(schema.videos).set({ editStatus: "hecho" }).where(eq(schema.videos.id, videos[0].id));
    // 2: montándose en el Mac.
    await startEdit(me, videos[1].id);
    await claimTask(agentId, new Date(), { can: ["montaje"] });
    // 3: no se pudo montar.
    const third = await startEdit(me, videos[2].id);
    await db.update(schema.agentTasks).set({ status: "failed", error: "La canción se acaba antes que el vídeo" }).where(eq(schema.agentTasks.id, third.taskId));
    await db
      .update(schema.videos)
      .set({ editStatus: "fallido", editError: "No se pudo montar: La canción se acaba antes que el vídeo" })
      .where(eq(schema.videos.id, videos[2].id));
    await db.update(schema.batches).set({ status: "listo", sentAt: new Date(), confirmedAt: new Date() }).where(eq(schema.batches.id, batch.id));
    console.log(`\nMontaje: /lotes/${batch.id}  ·  vídeo montado: /productos/${product.id}/videos/${videos[0].id}?paso=montaje\n`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await getPool().end();
    await stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
