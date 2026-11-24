import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getHiggsfield } from "@/connectors/higgsfield";
import { HiggsfieldNotConnectedError, type HfImageRequest, type HiggsfieldPort } from "@/connectors/higgsfield/port";
import { getDb, schema } from "@/db/client";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { makeThumbnail } from "@/server/media/ffmpeg";
import { addProductPhoto, listProductPhotos, readProductPhoto, type PhotoRole } from "@/server/photos";
import { getProductFor, productOwnerId, type Product } from "@/server/products";
import { listVariants, updateVariant } from "@/server/variants";
import { getImageModel } from "@/server/videos/frame";

/**
 * Recursos de marca que se generan solos al crear un producto, copiados de Codex
 * (`nuevo-producto`, PASO 2; prompts del alta de KreuzKapuze del 24/11/2026):
 *
 * - **marca**: el logo de la cuenta, un emblema circular ilustrado con el nombre y nada más.
 * - **logo_web**: el mismo logo en vertical (símbolo arriba, nombre debajo) para cuando se cree la web.
 * - **caja**: una caja diseñada por variante (o una para el producto sin variantes), en 3/4 sobre gris,
 *   con el emblema, una ilustración del producto de esa variante y el texto en el idioma del país.
 *   Queda como «Embalaje» del producto y de su variante: la usan las imágenes y clips de unboxing.
 *
 * Todo en el Higgsfield de quien creó el producto, sin preguntar (orden de Emmanuel). La marca va
 * primero; el logo vertical y las cajas la usan como referencia. Lo avanza la tarea `producto.recursos`.
 */

export const BRAND_SWEEP = "producto.recursos";
/** Más de esto por imagen no se envía solo (lo normal son ~2 créditos). */
export const BRAND_NORMAL_CREDITS = 6;
const MAX_ATTEMPTS = 2;
const MAX_RESULT_BYTES = 40 * 1024 * 1024;
const LANGUAGE_NAME: Record<string, string> = { de: "German", it: "Italian" };

const assets = schema.productBrandAssets;
type Row = typeof assets.$inferSelect;
export type BrandKind = "marca" | "logo_web" | "caja";

/** Lo que el alta sabe para escribir los prompts. */
export interface BrandBrief {
  /** Ilustración y paleta del emblema, en inglés. */
  idea?: string | null;
  /** Qué es el producto, corto y en el idioma del país, para la caja. */
  descriptor?: string | null;
}

// ───────────────────────── Prompts (los de Codex) ─────────────────────────

export function marcaPrompt(product: Pick<Product, "name" | "summary" | "niche" | "language">, brief: BrandBrief): string {
  const idea = brief.idea?.trim() || `A filled, colorful illustration of the product (${product.summary}) or its world, in a rich palette that fits it`;
  const language = LANGUAGE_NAME[product.language] ?? "German";
  return `Create an original illustrated circular brand emblem for ${product.name}, a ${language} brand${product.niche ? ` (${product.niche})` : ""}. ${idea}, within a substantial circular border. Integrate the single word ${product.name} in highly legible custom lettering with personality across the lower part of the badge. Rich solid shapes and carefully drawn illustration, a confident brand label, balanced at small size. Exactly one text: ${product.name}. No slogan, no descriptor, no borrowed logos, no mockup merchandise. Square composition on plain white.`;
}

export function logoWebPrompt(product: Pick<Product, "name">): string {
  return `Adapt the exact ${product.name} emblem in reference 1 into a clean vertical (stacked) website logo. Preserve its exact colors, the distinctive illustration and the lettering style. The illustrated symbol on top and the clearly legible word ${product.name} centered below it, in one line, dark enough to read on white. Recompose without stretching the circular artwork. Plain pure white background, tight but even margins, no shadow, no tagline or additional text. Tall vertical layout.`;
}

export function cajaPrompt(product: Pick<Product, "name" | "language">, brief: BrandBrief, variantName: string | null): string {
  const language = LANGUAGE_NAME[product.language] ?? "German";
  const descriptor = brief.descriptor?.trim();
  const color = variantName
    ? `The box colors match the ${variantName} version of the product in reference 1 (a box in that same color family, with the brand's accent color)`
    : "Box colors taken from the brand emblem";
  return `Design an original premium product box proposal for ${product.name}, shown closed in three-quarter perspective on a medium neutral grey seamless studio background (roughly #929396). Use the exact brand emblem from reference 2 prominently on the top. ${color}, with tasteful accent details and a small illustration of the exact product from reference 1 on the side, keeping its real colors and details. Only printed text: ${product.name}${descriptor ? ` and the small ${language} descriptor «${descriptor}»` : ""}, spelled exactly. Natural folded cardboard edges and believable proportions for the product, soft contact shadow. No certification, dimensions, origin or material claims, no extra contents. Integrate the artwork in the whole package rather than placing a photo inside a rectangle. Only the box: no people, no faces, no ghost figures, no other objects in the background.`;
}

// ───────────────────────── Pedir ─────────────────────────

/**
 * Apunta los recursos que faltan del producto: marca, logo web y una caja por variante (o una sin
 * variante). Repetirlo no duplica nada. `brief` va en la fila de la marca para las siguientes.
 */
export async function requestBrandAssets(productId: number, ownerId: number): Promise<void> {
  const owner = await getActiveUser(ownerId);
  if (!owner) return;
  const product = await getProductFor(owner, productId);
  const variants = await listVariants(owner, product.id);
  const wanted: Array<{ kind: BrandKind; variantId: number | null }> = [
    { kind: "marca", variantId: null },
    { kind: "logo_web", variantId: null },
    ...(variants.length > 0 ? variants.map((v) => ({ kind: "caja" as const, variantId: v.id })) : [{ kind: "caja" as const, variantId: null }]),
  ];
  for (const item of wanted) {
    await getDb()
      .insert(assets)
      .values({ productId: product.id, kind: item.kind, variantId: item.variantId })
      .onConflictDoNothing();
  }
  // Con variantes, la caja general sobra si aún no se hizo.
  if (variants.length > 0) {
    await getDb().delete(assets).where(and(eq(assets.productId, product.id), eq(assets.kind, "caja"), sql`${assets.variantId} is null`, eq(assets.status, "pendiente")));
  }
}

export async function brandAssetsOf(productId: number): Promise<Row[]> {
  return getDb().select().from(assets).where(eq(assets.productId, productId)).orderBy(asc(assets.id));
}

// ───────────────────────── Avanzar ─────────────────────────

export interface BrandDeps {
  higgsfield?: HiggsfieldPort;
  download?: (url: string) => Promise<Buffer | null>;
  brief?: (productId: number) => Promise<BrandBrief>;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > MAX_RESULT_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

/** La idea del emblema y el texto de la caja que dejó el alta (o nada). */
async function briefFromIntake(productId: number): Promise<BrandBrief> {
  const [row] = await getDb()
    .select({ result: schema.productIntakes.result })
    .from(schema.productIntakes)
    .where(eq(schema.productIntakes.productId, productId))
    .orderBy(sql`${schema.productIntakes.id} desc`)
    .limit(1);
  const result = (row?.result ?? null) as { ideaMarca?: string; descriptorCaja?: string } | null;
  return { idea: result?.ideaMarca ?? null, descriptor: result?.descriptorCaja ?? null };
}

const save = (id: number, changes: Partial<typeof assets.$inferInsert>) => getDb().update(assets).set({ ...changes, updatedAt: new Date() }).where(eq(assets.id, id));

/** Avanza los recursos de un producto todo lo que se pueda ahora. */
export async function advanceBrandAssets(productId: number, deps: BrandDeps = {}): Promise<void> {
  const rows = await brandAssetsOf(productId);
  if (rows.length === 0) return;
  const ownerId = await productOwnerId(productId);
  const owner = ownerId === null ? null : await getActiveUser(ownerId);
  if (!owner) return;
  const hf = deps.higgsfield ?? getHiggsfield();
  const product = await getProductFor(owner, productId);
  const brief = await (deps.brief ?? briefFromIntake)(productId);

  for (const row of rows.filter((r) => r.status === "enviado")) await poll(row, owner, product, hf, deps);

  const fresh = await brandAssetsOf(productId);
  const marca = fresh.find((r) => r.kind === "marca");
  for (const row of fresh.filter((r) => r.status === "pendiente")) {
    if (row.kind !== "marca" && marca?.status !== "hecho") continue;
    await submit(row, owner, product, brief, marca?.photoId ?? null, hf);
  }
}

async function submit(row: Row, owner: AuthUser, product: Product, brief: BrandBrief, marcaPhotoId: number | null, hf: HiggsfieldPort): Promise<void> {
  const refs: number[] = [];
  let prompt: string;
  let variantName: string | null = null;
  if (row.kind === "marca") {
    prompt = marcaPrompt(product, brief);
  } else if (row.kind === "logo_web") {
    if (!marcaPhotoId) return;
    refs.push(marcaPhotoId);
    prompt = logoWebPrompt(product);
  } else {
    const article = await articlePhotoFor(owner, product.id, row.variantId);
    if (!article || !marcaPhotoId) return;
    if (row.variantId !== null) variantName = (await listVariants(owner, product.id)).find((v) => v.id === row.variantId)?.name ?? null;
    refs.push(article, marcaPhotoId);
    prompt = cajaPrompt(product, brief, variantName);
  }
  try {
    const medias: HfImageRequest["medias"] = [];
    for (const photoId of refs) {
      const photo = await readProductPhoto(owner, photoId);
      medias.push({ role: "image_references", value: await ensureMedia(owner.id, { bytes: photo.data, filename: `marca-${photoId}.jpg`, contentType: photo.mime, type: "image" }, { higgsfield: hf }) });
    }
    const request: HfImageRequest = {
      model: await getImageModel(),
      prompt,
      // El logo web va en vertical (3:4); la marca y la caja, cuadradas (como en Codex).
      aspectRatio: row.kind === "logo_web" ? "3:4" : "1:1",
      resolution: "2k",
      medias,
    };
    const quote = await hf.quoteImages(owner.id, request, 1);
    if (quote.credits > BRAND_NORMAL_CREDITS) return void (await save(row.id, { status: "fallido", credits: quote.credits, error: `Costaría ${quote.credits} créditos, más de lo normal: no se envía solo.` }));
    await save(row.id, { status: "enviado", credits: quote.credits, attempts: row.attempts + 1 });
    const sent = await hf.submitImages(owner.id, request, 1);
    if (!sent.jobIds[0]) return void (await save(row.id, { status: "fallido", error: `Higgsfield no lo aceptó${sent.rejected[0] ? `: ${sent.rejected[0]}` : ""}.` }));
    await save(row.id, { jobId: sent.jobIds[0], error: null });
  } catch (error) {
    if (error instanceof HiggsfieldNotConnectedError) return void (await save(row.id, { status: "pendiente", error: "Higgsfield sin conectar." }));
    await save(row.id, { status: "fallido", error: error instanceof Error ? error.message.slice(0, 300) : "Error al enviar." });
  }
}

/** Un envío que se quedó sin número de trabajo (el proceso se reinició al enviarlo) se repite pasado esto. */
export const STUCK_SUBMIT_MS = 10 * 60_000;

async function poll(row: Row, owner: AuthUser, product: Product, hf: HiggsfieldPort, deps: BrandDeps): Promise<void> {
  if (!row.jobId) {
    if (Date.now() - row.updatedAt.getTime() >= STUCK_SUBMIT_MS) await save(row.id, { status: "pendiente", error: "El envío se cortó; se repite." });
    return;
  }
  const [job] = await hf.jobs(owner.id, [row.jobId], 0);
  if (job?.status === "failed") {
    return void (await save(row.id, row.attempts < MAX_ATTEMPTS ? { status: "pendiente", jobId: null, error: "Higgsfield no pudo; se repite una vez." } : { status: "fallido", error: "Higgsfield no pudo generarlo." }));
  }
  if (job?.status !== "done" || !job.urls[0]) return;
  const bytes = await (deps.download ?? download)(job.urls[0]);
  if (!bytes) return;
  const jpeg = await makeThumbnail(bytes, "image", 2048);
  const role: PhotoRole = row.kind === "caja" ? "embalaje" : row.kind === "logo_web" ? "logo_web" : "marca";
  const photo = await addProductPhoto(owner, product.id, jpeg, role);
  await save(row.id, { status: "hecho", photoId: photo.id, error: null });
  // La caja de una variante queda como su embalaje (la usan las imágenes de unboxing).
  if (row.kind === "caja" && row.variantId !== null) await updateVariant(owner, product.id, row.variantId, { packagingPhotoId: photo.id });
}

/** La foto del artículo de la variante (o la primera «Artículo» del producto). */
async function articlePhotoFor(owner: AuthUser, productId: number, variantId: number | null): Promise<number | null> {
  if (variantId !== null) {
    const variant = (await listVariants(owner, productId)).find((v) => v.id === variantId);
    if (variant?.articlePhotoIds[0]) return variant.articlePhotoIds[0];
  }
  const photos = await listProductPhotos(owner, productId);
  return photos.find((p) => p.role === "articulo")?.id ?? null;
}

/**
 * Tarea programada: avanza los recursos pendientes y, en los productos con marca, añade la caja de
 * las variantes nuevas («una caja por variante»).
 */
export async function brandAssetsSweep(deps: BrandDeps = {}): Promise<void> {
  const rows = await getDb()
    .selectDistinct({ productId: assets.productId })
    .from(assets)
    .where(inArray(assets.status, ["pendiente", "enviado", "hecho"]))
    .limit(50);
  for (const { productId } of rows) {
    try {
      const ownerId = await productOwnerId(productId);
      if (ownerId !== null) await requestBrandAssets(productId, ownerId);
      if ((await brandAssetsOf(productId)).some((r) => r.status === "pendiente" || r.status === "enviado")) await advanceBrandAssets(productId, deps);
    } catch (error) {
      console.error(`[recursos] El producto ${productId} no pudo avanzar:`, error instanceof Error ? error.message : error);
    }
  }
}
