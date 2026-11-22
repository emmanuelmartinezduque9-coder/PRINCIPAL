/**
 * Datos de ejemplo para ver «Enviar lote» sin gastar nada (SOLO en este ordenador, con
 * `PRINCIPAL_HIGGSFIELD_FAKE=1`).
 *
 *   npx tsx scripts/seed-demo-lote.ts
 *
 * Usa la base de datos local de `npm run dev` (o `DATABASE_URL`) y crea tres lotes de un producto
 * con fotos y referencias ya preparadas y desglose hecho (escrito directamente, sin Claude):
 * - «Ejemplo · preguntas»: enviado, con una pregunta del desglose y un vídeo sin avatar elegido;
 * - «Ejemplo · listo para enviar»: en borrador, sin nada que preguntar (se puede enviar y
 *   confirmar en la pantalla: con Higgsfield simulado no gasta);
 * - «Ejemplo · en pausa»: confirmado y en pausa por un precio por encima de lo previsto.
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
import { LOCAL_USER } from "../src/server/auth";
import { addProductPhoto } from "../src/server/photos";
import { createProduct } from "../src/server/products";
import type { Analysis } from "../src/server/videos/analysis";
import { addVideoToBatch, createBatch } from "../src/server/videos/batches";
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

async function jpeg(dir: string, name: string, size: string, filter: string): Promise<Buffer> {
  const out = path.join(dir, `${name}.jpg`);
  await ffmpeg(["-f", "lavfi", "-i", `color=c=black:s=${size}`, "-vf", filter, "-frames:v", "1", "-q:v", "3", out]);
  return fs.readFile(out);
}

const RESULT: Analysis = {
  conceptLogic: "La reacción al probar el producto por primera vez lo vende mejor que una explicación.",
  shots: [{ startS: 0, endS: 6, seen: "Mujer en el baño con el producto", action: "Lo prueba y sonríe", onScreenText: "" }],
  adaptation: [],
  risks: [],
  frameUse: "start_image",
  imagePrompt:
    "Image 1 sets the composition and the framing. The woman is the person from image 2. She holds the bottle from image 3 at chest height in a bright bathroom.",
  videoPrompt:
    "@Video1 gives only the camera movement, the rhythm and the action. @Image1 is the first frame. The woman is @Image2. The bottle is @Image3.",
};

async function main() {
  if (isCloud(process.env)) throw new Error("Este script es solo para el propio ordenador.");
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "principal-lote-"));
  try {
    const me = LOCAL_USER;
    const product = await createProduct(me, { name: "Glanzwerk Spray", summary: "Spray que deja el grifo sin cal en un minuto.", language: "de", countries: ["DE"] });
    await addProductPhoto(me, product.id, await jpeg(dir, "articulo", "800x800", "geq=r='if(between(X,300,500)*between(Y,150,650),40,235)':g='if(between(X,300,500)*between(Y,150,650),120,232)':b='if(between(X,300,500)*between(Y,150,650),200,226)'"), "articulo");
    const avatar = await addProductPhoto(me, product.id, await jpeg(dir, "avatar", "800x800", "geq=r='if(lt(hypot(X-400,Y-300),120),224,214)':g='if(lt(hypot(X-400,Y-300),120),180,200)':b='if(lt(hypot(X-400,Y-300),120),150,236)'"), "avatar");
    const colors = [
      ["40+X/6", "30+Y/10", "90"],
      ["230-Y/8", "180-Y/10", "120"],
      ["60", "120+X/5", "140+Y/12"],
      ["200", "90+Y/8", "60+X/6"],
    ];
    const frames = await Promise.all(colors.map((c, i) => jpeg(dir, `f${i}`, "360x640", `geq=r='if(lt(hypot(X-180,Y-260),60),235,${c[0]})':g='if(lt(hypot(X-180,Y-260),60),205,${c[1]})':b='if(lt(hypot(X-180,Y-260),60),185,${c[2]})'`)));

    async function row(batchId: number, i: number, result: Analysis, options: { noAvatar?: boolean } = {}) {
      const video = await addVideoToBatch(me, batchId, { productId: product.id, avatarPhotoId: avatar.id, avatarMode: "elegido" });
      const pool = getPool();
      await pool.query(
        "update videos set reference_status = 'ready', reference_media_id = $2, reference_duration_ms = 6000, segment_duration_ms = 6000, cuts_ms = '[]'::jsonb, image_prompt = $3, video_prompt = $4 where id = $1",
        [video.id, `media-ejemplo-${video.id}`, result.imagePrompt, result.videoPrompt],
      );
      const frame = frames[i % frames.length];
      await pool.query("insert into video_frames (video_id, index, time_ms, mime, size, data) values ($1, 0, 0, 'image/jpeg', $2, $3)", [video.id, frame.length, frame]);
      await getDb().insert(schema.videoAnalyses).values({ videoId: video.id, version: 1, status: "done", result, referenceMediaId: `media-ejemplo-${video.id}`, ruleVersions: {}, createdBy: me.id });
      if (options.noAvatar) await pool.query("update videos set avatar_photo_id = null where id = $1", [video.id]);
      return video;
    }

    const asking = await createBatch(me, "Ejemplo · preguntas", { autoAnalyze: false });
    await row(asking.id, 0, { ...RESULT, questions: [{ id: "variante", text: "¿Qué bote sale: el de 500 ml o el de 250 ml?", options: ["500 ml", "250 ml"] }] });
    await row(asking.id, 1, RESULT, { noAvatar: true });
    await row(asking.id, 2, { ...RESULT, risks: [{ kind: "funcion_inexistente", detail: "En la referencia el spray hace espuma; este no la hace." }] });
    await row(asking.id, 3, RESULT);
    await getDb().update(schema.batches).set({ status: "preguntas", sentAt: new Date() }).where(eq(schema.batches.id, asking.id));

    const draft = await createBatch(me, "Ejemplo · listo para enviar", { autoAnalyze: false });
    for (let i = 0; i < 3; i++) await row(draft.id, i, RESULT);

    const paused = await createBatch(me, "Ejemplo · en pausa", { autoAnalyze: false });
    const pausedRows = [];
    for (let i = 0; i < 3; i++) pausedRows.push(await row(paused.id, i, RESULT));
    await getDb()
      .update(schema.batches)
      .set({
        status: "pausado",
        sentAt: new Date(),
        confirmedAt: new Date(),
        budgetCredits: 66,
        estimates: Object.fromEntries(pausedRows.map((v) => [String(v.id), { frame: 4, clip: 18 }])),
        pause: {
          kind: "precio",
          reason: `${pausedRows[0].title}: la imagen cuesta 6 créditos (previsto 4).`,
          from: "imagenes",
          extraCredits: 2,
          videoId: pausedRows[0].id,
          kindOf: "frame",
          quoted: 6,
        },
      })
      .where(eq(schema.batches.id, paused.id));

    console.log(`\nPreguntas: /lotes/${asking.id}/preguntas`);
    console.log(`Para enviar: /lotes/${draft.id}`);
    console.log(`En pausa: /lotes/${paused.id}\n`);
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
