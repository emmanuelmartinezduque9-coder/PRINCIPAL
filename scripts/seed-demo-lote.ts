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
 *
 * El producto lleva tres variantes (cada una con su foto) y la biblioteca, ocho avatares y tres
 * canciones de ejemplo: así se ven los selectores visuales de «Nuevo lote».
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
import { uploadAvatar } from "../src/server/avatars";
import { addProductPhoto } from "../src/server/photos";
import { createProduct } from "../src/server/products";
import { uploadSong } from "../src/server/songs";
import { createVariant } from "../src/server/variants";
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

type Rgb = [number, number, number];
/** Una forma plana: elipse (centro y radios) o rectángulo (esquinas), de un color. */
type Shape = { ellipse: [number, number, number, number] } | { rect: [number, number, number, number] };

/**
 * Dibujo plano por capas (la última manda) sobre un degradado vertical, con `geq` de ffmpeg: sin
 * fotos reales, pero con aspecto de ilustración para ver las pantallas.
 */
async function drawing(dir: string, name: string, [w, h]: [number, number], top: Rgb, bottom: Rgb, layers: Array<[Shape, Rgb]>): Promise<Buffer> {
  const cond = (shape: Shape) =>
    "ellipse" in shape
      ? `lt(pow((X-${shape.ellipse[0]})/${shape.ellipse[2]},2)+pow((Y-${shape.ellipse[1]})/${shape.ellipse[3]},2),1)`
      : `between(X,${shape.rect[0]},${shape.rect[2]})*between(Y,${shape.rect[1]},${shape.rect[3]})`;
  const channel = (i: number) =>
    layers.reduce((expr, [shape, color]) => `if(${cond(shape)},${color[i]},${expr})`, `${top[i]}+(${bottom[i] - top[i]})*Y/${h}`);
  return jpeg(dir, name, `${w}x${h}`, `geq=r='${channel(0)}':g='${channel(1)}':b='${channel(2)}'`);
}

/** Un bote de spray del color de la variante. */
const bottle = (dir: string, name: string, color: Rgb, label: Rgb) =>
  drawing(dir, name, [800, 800], [246, 244, 240], [228, 225, 219], [
    [{ ellipse: [400, 712, 150, 22] }, [210, 206, 200]],
    [{ rect: [300, 300, 500, 700] }, color],
    [{ ellipse: [400, 300, 100, 40] }, color],
    [{ rect: [365, 200, 435, 270] }, [52, 52, 56]],
    [{ rect: [340, 150, 520, 205] }, [40, 40, 44]],
    [{ rect: [325, 410, 475, 580] }, label],
    [{ rect: [345, 450, 455, 462] }, color],
    [{ rect: [345, 480, 430, 488] }, [150, 150, 150]],
  ]);

/** Un retrato plano: fondo, ropa, cuello, pelo, cara, ojos y boca. */
function portrait(dir: string, name: string, p: { bg: [Rgb, Rgb]; shirt: Rgb; skin: Rgb; hair: Rgb; long?: boolean; bald?: boolean }) {
  const shade = (c: Rgb, f: number): Rgb => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
  const layers: Array<[Shape, Rgb]> = [];
  if (p.long) layers.push([{ ellipse: [300, 470, 165, 250] }, p.hair]);
  layers.push([{ ellipse: [300, 880, 260, 250] }, p.shirt]);
  layers.push([{ rect: [255, 500, 345, 660] }, shade(p.skin, 0.88)]);
  layers.push([{ ellipse: [300, 400, 118, 148] }, p.skin]);
  if (!p.bald) layers.push([{ ellipse: [300, 318, 124, 84] }, p.hair]);
  layers.push([{ ellipse: [256, 410, 10, 10] }, [40, 32, 30]], [{ ellipse: [344, 410, 10, 10] }, [40, 32, 30]]);
  layers.push([{ ellipse: [300, 484, 30, 9] }, [176, 88, 84]]);
  return drawing(dir, name, [600, 800], p.bg[0], p.bg[1], layers);
}

const AVATARS: Array<{ name: string; group: "mujer" | "hombre" | "nina" | "nino"; age: number; tags: string[]; look: Parameters<typeof portrait>[2] }> = [
  { name: "mujer 1", group: "mujer", age: 28, tags: ["aleman"], look: { bg: [[226, 232, 240], [203, 213, 225]], shirt: [71, 85, 105], skin: [241, 206, 180], hair: [196, 152, 90], long: true } },
  { name: "mujer 2", group: "mujer", age: 34, tags: [], look: { bg: [[254, 226, 226], [252, 205, 205]], shirt: [190, 60, 70], skin: [224, 172, 135], hair: [58, 40, 32], long: true } },
  { name: "mujer 3", group: "mujer", age: 45, tags: ["aleman"], look: { bg: [[220, 238, 230], [190, 222, 208]], shirt: [30, 110, 90], skin: [238, 200, 170], hair: [120, 70, 40] } },
  { name: "mujer 4", group: "mujer", age: 62, tags: [], look: { bg: [[237, 233, 254], [221, 214, 254]], shirt: [110, 80, 170], skin: [230, 190, 160], hair: [200, 200, 205], long: true } },
  { name: "hombre 1", group: "hombre", age: 31, tags: ["aleman"], look: { bg: [[224, 242, 254], [186, 222, 250]], shirt: [37, 99, 235], skin: [236, 198, 168], hair: [90, 60, 40] } },
  { name: "hombre 2", group: "hombre", age: 48, tags: [], look: { bg: [[254, 243, 199], [253, 230, 160]], shirt: [180, 110, 30], skin: [180, 128, 95], hair: [30, 26, 24] } },
  { name: "hombre 3", group: "hombre", age: 67, tags: [], look: { bg: [[231, 229, 228], [214, 211, 209]], shirt: [87, 83, 78], skin: [232, 196, 170], hair: [210, 210, 210], bald: true } },
  { name: "niña 1", group: "nina", age: 9, tags: [], look: { bg: [[252, 231, 243], [249, 210, 232]], shirt: [236, 72, 153], skin: [244, 212, 190], hair: [160, 100, 50], long: true } },
];

/** Un tono de unos segundos, como canción de ejemplo. */
async function tone(dir: string, name: string, hz: number, seconds: number): Promise<Buffer> {
  const out = path.join(dir, `${name}.mp3`);
  await ffmpeg(["-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${seconds}`, "-q:a", "6", out]);
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
    await addProductPhoto(me, product.id, await bottle(dir, "articulo", [37, 99, 235], [248, 250, 252]), "articulo");
    for (const [variantName, color] of [
      ["Limón", [234, 179, 8]],
      ["Lavanda", [139, 92, 246]],
      ["Menta", [16, 185, 129]],
    ] as Array<[string, Rgb]>) {
      const photo = await addProductPhoto(me, product.id, await bottle(dir, `variante-${color.join("-")}`, color, [255, 255, 255]), "articulo");
      await createVariant(me, product.id, { name: variantName, articlePhotoIds: [photo.id] });
    }
    for (const [i, a] of AVATARS.entries()) {
      await uploadAvatar(me, await portrait(dir, `avatar-${i}`, a.look), { name: a.name, group: a.group, number: i + 1, ageYears: a.age, tags: a.tags });
    }
    for (const [i, [title, hz]] of ([["Sommerwind", 440], ["Golden Hour", 523], ["Neon Drive", 330]] as Array<[string, number]>).entries()) {
      await uploadSong(me, await tone(dir, `cancion-${i}`, hz, 20), { title, number: i + 1, dropMs: 6000 });
    }
    const avatar = await addProductPhoto(me, product.id, await portrait(dir, "avatar", { bg: [[241, 245, 249], [226, 232, 240]], shirt: [15, 118, 110], skin: [240, 204, 178], hair: [92, 58, 38], long: true }), "avatar");
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
