/**
 * Datos de ejemplo para ver «Vídeos terminados» de un lote (SOLO en este ordenador):
 *
 *   npx tsx scripts/seed-demo-terminados.ts <video1.mp4> [<video2.mp4> …]
 *
 * Crea el lote «Ejemplo · terminados» con dos cuentas (EisWerk y HaarZauber) y un vídeo montado por
 * archivo dado (alternando cuenta), en estado «montado». Usa la base de datos local de `npm run dev`.
 */
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb, getPool, schema } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";
import { isCloud } from "../src/lib/cloud-env";
import { LOCAL_USER } from "../src/server/auth";
import { createProduct } from "../src/server/products";
import { createBatch } from "../src/server/videos/batches";
import { createVideo } from "../src/server/videos/videos";
import { startEmbeddedPg } from "./pg";

async function main() {
  if (isCloud(process.env)) throw new Error("Este script es solo para el propio ordenador.");
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("Pásale uno o más MP4.");
  let url = process.env.DATABASE_URL;
  let stop = async () => {};
  if (!url) {
    const pg = await startEmbeddedPg();
    url = pg.url;
    stop = pg.stop;
  }
  process.env.DATABASE_URL = url;
  await runMigrations(url);
  await seed(url);
  try {
    const me = LOCAL_USER;
    const eis = await createProduct(me, { name: "EisWerk", summary: "Eismaschine", language: "de", countries: ["DE"] });
    const haar = await createProduct(me, { name: "HaarZauber", summary: "Haarglätter", language: "de", countries: ["DE"] });
    const batch = await createBatch(me, "Ejemplo · terminados");
    for (const [i, file] of files.entries()) {
      const product = i % 2 === 0 ? eis : haar;
      const video = await createVideo(me, product.id);
      const data = await fs.readFile(file);
      await getDb().update(schema.videos).set({ batchId: batch.id, editStatus: "hecho" }).where(eq(schema.videos.id, video.id));
      await getDb().insert(schema.edits).values({ videoId: video.id, version: 1, size: data.length, data, durationMs: 14_000 });
    }
    await getDb().update(schema.batches).set({ status: "montado" }).where(eq(schema.batches.id, batch.id));
    console.log(`Lote ${batch.id}: /lotes/${batch.id}`);
  } finally {
    await getPool().end();
    await stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
