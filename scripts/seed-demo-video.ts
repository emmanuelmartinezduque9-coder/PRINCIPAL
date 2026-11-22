/**
 * Datos de ejemplo para ver las pantallas de vídeo sin gastar nada (SOLO en este ordenador).
 *
 *   npx tsx scripts/seed-demo-video.ts
 *
 * Usa la base de datos local de `npm run dev` (o `DATABASE_URL`) y crea: un producto con fotos
 * (artículo, embalaje, avatar y entorno), un vídeo tuyo con la referencia ya preparada (fotogramas
 * de 34 s, así que avisa de que solo se usan 30), un desglose de ejemplo con su coste, y un vídeo
 * de «Ana García» (colaboradora) para ver la vista de solo lectura. No llama a Higgsfield ni a
 * Claude. Escribe en la base de datos directamente, por eso vive fuera de `src/`.
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
import { setAssignments } from "../src/server/access";
import { acceptInvite, createInvite, LOCAL_USER, type AuthUser } from "../src/server/auth";
import { addProductPhoto } from "../src/server/photos";
import { createProduct } from "../src/server/products";
import type { Analysis } from "../src/server/videos/analysis";
import { createVideo } from "../src/server/videos/videos";
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

/** Una imagen JPEG dibujada con `geq` (r, g, b en función de X e Y). */
async function drawJpeg(dir: string, name: string, size: string, rgb: [string, string, string]): Promise<Buffer> {
  const out = path.join(dir, `${name}.jpg`);
  await ffmpeg(["-f", "lavfi", "-i", `color=c=black:s=${size}`, "-vf", `geq=r='${rgb[0]}':g='${rgb[1]}':b='${rgb[2]}'`, "-frames:v", "1", "-q:v", "3", out]);
  return fs.readFile(out);
}

const inCircle = (cx: number, cy: number, r: number) => `lt(hypot(X-${cx},Y-${cy}),${r})`;
const inBox = (x0: number, y0: number, x1: number, y1: number) => `between(X,${x0},${x1})*between(Y,${y0},${y1})`;

/** Fotos del producto: una lámpara de noche (artículo ×2), su caja, una persona y un dormitorio. */
async function productPhotos(dir: string) {
  const lamp = (bg: number) => {
    const shade = `${inBox(300, 220, 500, 470)}+${inCircle(400, 220, 100)}*lt(Y,220)`;
    const base = inBox(360, 470, 440, 620);
    return [
      `if(${shade},250,if(${base},120,${bg}))`,
      `if(${shade},214,if(${base},96,${bg - 8}))`,
      `if(${shade},120,if(${base},80,${bg - 18}))`,
    ] as [string, string, string];
  };
  const box = inBox(220, 220, 580, 640);
  const head = inCircle(400, 300, 120);
  const body = `${inCircle(400, 860, 360)}`;
  const bed = inBox(80, 520, 720, 700);
  const window = inBox(470, 120, 690, 380);
  return {
    articulo1: await drawJpeg(dir, "articulo1", "800x800", lamp(236)),
    articulo2: await drawJpeg(dir, "articulo2", "800x800", lamp(200)),
    embalaje: await drawJpeg(dir, "embalaje", "800x800", [`if(${box},70,230)`, `if(${box},110,226)`, `if(${box},170,220)`]),
    avatar: await drawJpeg(dir, "avatar", "800x800", [
      `if(${head},224,if(${body},120,214))`,
      `if(${head},180,if(${body},86,200))`,
      `if(${head},150,if(${body},150,236))`,
    ]),
    entorno: await drawJpeg(dir, "entorno", "800x800", [
      `if(${window},200,if(${bed},170,90))`,
      `if(${window},220,if(${bed},140,80))`,
      `if(${window},250,if(${bed},120,110))`,
    ]),
  };
}

/** Fotogramas 360×640 de una referencia inventada de 34 s: tres planos con colores distintos. */
async function referenceFrames(dir: string): Promise<Array<{ timeMs: number; data: Buffer }>> {
  const shots: Array<[number, [string, string, string]]> = [
    [0, ["40+X/6", "30+Y/10", "90"]],
    [11_000, ["230-Y/8", "180-Y/10", "120"]],
    [22_000, ["60", "120+X/5", "140+Y/12"]],
  ];
  const frames: Array<{ timeMs: number; data: Buffer }> = [];
  for (let i = 0; i < 12; i++) {
    const timeMs = i * 2_500;
    const [, rgb] = [...shots].reverse().find(([start]) => timeMs >= start)!;
    // Una «persona» que se mueve un poco en cada fotograma.
    const figure = inCircle(150 + i * 6, 250, 50) + "+" + inBox(110 + i * 6, 300, 190 + i * 6, 520);
    frames.push({
      timeMs,
      data: await drawJpeg(dir, `f${i}`, "360x640", [`if(${figure},235,${rgb[0]})`, `if(${figure},205,${rgb[1]})`, `if(${figure},185,${rgb[2]})`]),
    });
  }
  return frames;
}

const IMAGE_PROMPT = [
  "A vertical smartphone photo taken at night in a small, lived-in bedroom. Use image 1 only for the composition and the camera distance: a handheld shot from slightly above the bed, the subject in the left third, the bedside table in the right third, never for the identity of anyone in it. The person is the woman from image 2: keep her face, hair, skin tone and build exactly as they are in that photo, wearing a soft grey sweatshirt. She sits cross-legged on an unmade bed with a white duvet, holding the lamp from image 3 in both hands at chest height, looking at it with a small, surprised smile, as if she has just switched it on for the first time.",
  "The lamp is the product from image 3 and image 4: a warm white fabric shade on a short wooden base, the same proportions, the same seam on the shade and the same rounded base as in those photos. It is the only light source in the room. It is switched on and gives off a warm, slightly orange light that falls on her hands, her face and the duvet, with soft falloff towards the walls. The shade glows evenly; the bulb is not visible. The cable runs down from the base and disappears behind the duvet. Her fingers wrap around the base and do not cover the shade.",
  "The open box from image 5 lies on the duvet next to her knee, lid off, with the paper insert sticking out, as if she has just unpacked it. The printed side faces the camera at an angle, slightly out of focus because it is closer to the lens than she is. Do not add any text to the box beyond what is visible in image 5 and do not invent a logo.",
  "The room follows image 6: plain off-white walls, a wooden bedside table with a glass of water and a paperback, a window with sheer curtains on the right and the dark blue of late evening outside. There is a small plant on the windowsill. The rest of the room is dim: only what the lamp lights is clearly visible. Everything looks ordinary and slightly messy, like a real flat rather than a set.",
  "The photo looks like it was taken with a recent phone in night mode by a friend standing next to the bed: natural grain in the shadows, a little motion softness at the edges, true-to-life colours with the warm lamp light dominating, no heavy retouching. Her skin shows normal texture and a few small imperfections. The framing is vertical, with some headroom above her and the bottom edge cutting through the duvet just below her knees.",
  "The scene is the very first moment of the clip: the lamp has just been switched on, her expression is the start of a reaction, not the peak of it. Nothing else happens yet. Avoid a cinematic look, avoid posing, avoid symmetrical framing, and keep the scale of the lamp consistent with her hands so that it is clearly a small bedside lamp, about the height of her forearm.",
].join("\n\n");

const VIDEO_PROMPT = [
  "Vertical handheld phone video, 9:16, in one continuous take. @Video1 provides only the camera movement, the rhythm and the type of action: a slow push-in from slightly above, a small wobble, the moment of switching something on and the reaction that follows. Do not take the person, the product, the room or any text from @Video1.",
  "@Image1 is the first frame: the woman from @Image2 sits on the bed holding the lamp from @Image3 and @Image4 in a dim bedroom, with the open box from @Image5 on the duvet. The clip continues from exactly that frame.",
  "She presses the switch on the wooden base with her thumb. The lamp, which was already glowing softly, brightens a little and the warm light spreads over her face and the duvet. She lifts it slightly towards the camera, turns it a quarter turn so the seam of the shade is visible, and smiles, then looks into the lens for a second. The camera keeps pushing in slowly until the lamp and her hands fill the lower half of the frame.",
  "The geometry of the product is fixed: the shade, the proportions of the base and the cable stay exactly as in @Image3 and @Image4 throughout the clip. Her face and hair stay exactly as in @Image2. No text, captions or titles appear on screen. Natural phone exposure, no cuts, no slow motion.",
].join("\n\n");

const RESULT: Analysis = {
  conceptLogic: "La reacción genuina al encender la lámpara por primera vez vende la luz cálida mejor que cualquier explicación.",
  shots: [
    { startS: 0, endS: 3.5, seen: "Chica sentada en la cama con una caja cerrada en las rodillas.", action: "Abre la caja con prisa mirando a cámara.", onScreenText: "POV: por fin ha llegado" },
    { startS: 3.5, endS: 11, seen: "Saca un objeto envuelto y quita el papel.", action: "Lo sujeta a la altura del pecho y busca el interruptor.", onScreenText: "" },
    { startS: 11, endS: 22, seen: "Habitación a oscuras; el objeto se enciende.", action: "La luz le ilumina la cara y sonríe sorprendida.", onScreenText: "" },
    { startS: 22, endS: 30, seen: "Plano cercano del objeto encendido en la mesilla.", action: "Lo coloca, apaga la luz del techo y se tumba.", onScreenText: "mi nueva rutina" },
  ],
  adaptation: [
    {
      original: "Objeto envuelto sin marca",
      equivalent: "Lámpara de mesilla con pantalla de tela",
      physicalAction: "La sujeta por la base con las dos manos",
      visibleResult: "La pantalla brilla de forma uniforme",
      kept: "El gesto de buscar el interruptor",
      changed: "El tamaño: cabe entre las manos",
      why: "La lámpara es pequeña; con la base en las manos se entiende la escala.",
    },
    {
      original: "Luz del techo que se apaga",
      equivalent: "La lámpara como única luz",
      physicalAction: "Pulsa el interruptor de la base",
      visibleResult: "Luz cálida sobre la cara y el edredón",
      kept: "El contraste entre oscuridad y luz cálida",
      changed: "No hay luz de techo: arranca ya en penumbra",
      why: "El clip empieza en el momento de encenderla; no hace falta otra fuente.",
    },
  ],
  risks: [
    { kind: "texto_en_pantalla", detail: "La referencia lleva rótulos («POV: por fin ha llegado»); el clip no debe copiarlos." },
    { kind: "escala", detail: "Ninguna foto del artículo tiene una mano: el tamaño puede salir exagerado." },
    { kind: "reveal_adelantado", detail: "Si la lámpara aparece encendida antes de pulsar, se pierde la reacción." },
  ],
  frameUse: "start_image",
  imagePrompt: IMAGE_PROMPT,
  videoPrompt: VIDEO_PROMPT,
};

async function makePerson(email: string, name: string): Promise<AuthUser> {
  const [existing] = await getDb().select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return { id: existing.id, email: existing.email, name: existing.name, role: existing.role as AuthUser["role"] };
  const { token } = await createInvite(email, name, { role: "colaborador" });
  return acceptInvite(token, "una-clave-larga-de-ejemplo");
}

/** Deja un vídeo con la referencia preparada, sus fotogramas y un desglose terminado. */
async function prepareVideo(
  owner: AuthUser,
  productId: number,
  photoIds: Record<"avatar" | "entorno", number>,
  frames: Array<{ timeMs: number; data: Buffer }>,
) {
  const db = getDb();
  const video = await createVideo(owner, productId);
  await db
    .update(schema.videos)
    .set({
      referenceStatus: "ready",
      referenceSource: "file",
      referenceDurationMs: 34_200,
      referenceWidth: 1080,
      referenceHeight: 1920,
      referenceMediaId: "media-ejemplo",
      segmentDurationMs: 30_000,
      cutsMs: [11_000, 22_000],
      avatarPhotoId: photoIds.avatar,
      environmentPhotoId: photoIds.entorno,
      imagePrompt: RESULT.imagePrompt,
      videoPrompt: RESULT.videoPrompt,
      frameUse: RESULT.frameUse,
    })
    .where(eq(schema.videos.id, video.id));
  await db.insert(schema.videoFrames).values(
    frames.map((frame, index) => ({ videoId: video.id, index, timeMs: frame.timeMs, mime: "image/jpeg", size: frame.data.length, data: frame.data })),
  );
  const [spend] = await db
    .insert(schema.spendEntries)
    .values({
      userId: owner.id,
      productId,
      provider: "claude",
      model: "ejemplo",
      stepKey: `ejemplo/desglose/${video.id}`,
      status: "settled",
      settledAt: new Date(),
      reservedMicros: 60_000,
      costMicros: 38_400,
    })
    .returning({ id: schema.spendEntries.id });
  await db.insert(schema.videoAnalyses).values({
    videoId: video.id,
    version: 1,
    status: "done",
    result: RESULT,
    ruleVersions: {},
    spendEntryId: spend.id,
    referenceMediaId: "media-ejemplo",
    createdBy: owner.id,
  });
  return video;
}

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

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "principal-ejemplo-"));
  try {
    const me = LOCAL_USER;
    const product = await createProduct(me, {
      name: "Nachtlicht Mondschein",
      summary: "Lámpara de mesilla de tela con luz cálida regulable para leer en la cama.",
      language: "de",
      countries: ["DE", "AT"],
    });
    const pics = await productPhotos(dir);
    await addProductPhoto(me, product.id, pics.articulo1, "articulo");
    await addProductPhoto(me, product.id, pics.articulo2, "articulo");
    await addProductPhoto(me, product.id, pics.embalaje, "embalaje");
    const avatar = await addProductPhoto(me, product.id, pics.avatar, "avatar");
    const entorno = await addProductPhoto(me, product.id, pics.entorno, "entorno");
    const frames = await referenceFrames(dir);

    const ana = await makePerson("ana.ejemplo@example.com", "Ana García");
    const assigned = await getDb()
      .select({ productId: schema.productAssignments.productId })
      .from(schema.productAssignments)
      .where(eq(schema.productAssignments.userId, ana.id));
    await setAssignments({ ...me, role: "dueno" }, ana.id, [...assigned.map((row) => row.productId), product.id]);

    const ids = { avatar: avatar.id, entorno: entorno.id };
    const anas = await prepareVideo(ana, product.id, ids, frames);
    const mine = await prepareVideo(me, product.id, ids, frames);

    console.log(`\nProducto de ejemplo: /productos/${product.id}?pestana=videos`);
    console.log(`Vídeo tuyo con desglose: /productos/${product.id}/videos/${mine.id}?paso=desglose`);
    console.log(`Vídeo de Ana (solo lectura): /productos/${product.id}/videos/${anas.id}\n`);
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
