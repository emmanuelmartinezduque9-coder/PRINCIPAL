import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  HiggsfieldConnectError,
  HiggsfieldNotConnectedError,
  HiggsfieldRejectedError,
  HiggsfieldUnknownOutcomeError,
  type HfImageRequest,
  type HiggsfieldPort,
} from "@/connectors/higgsfield/port";
import { getHiggsfield } from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { imagePart, textPart, type LlmContent } from "@/llm/content";
import { getGateway, LlmCallError, LlmCapReachedError, LlmInvalidOutputError, LlmNotConfiguredError, LlmRefusalError, LlmTruncatedError, type LlmGateway } from "@/llm/gateway";
import { linkOf } from "@/lib/links";
import { getObjectStore, type ObjectStore } from "@/lib/object-store";
import { macOnline } from "@/server/agent-tasks";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { ensureMedia } from "@/server/higgsfield";
import { HttpError } from "@/server/http";
import { downloadLinkMedia, ensureLinkMedia, fetchInCloud, macTaskStatus, requestFromMac, type FetchDeps } from "@/server/link-media";
import { ensureLinkProfile, linkProfileById, resetLinkProfile, MAX_PROFILE_FAILURES, profileDataOf, profileTaskStatus, requestProfileFromMac, topReels, type ProfileData } from "@/server/link-profiles";
import { extractFrames, imageMimeOf, makeThumbnail, probeVideo } from "@/server/media/ffmpeg";
import { addProductPhoto, listProductPhotos, readProductPhoto } from "@/server/photos";
import { requestBrandAssets } from "@/server/product-brand-assets";
import { allProductNames, createProduct, getProductFor, setProductFacts, type Product } from "@/server/products";
import { loadRules } from "@/server/rules";
import { JobPausedError, runStep, StepFailedError } from "@/jobs/steps";
import { getImageModel, IMAGE_MODELS, type ImageModel } from "@/server/videos/frame";

/**
 * Alta de un producto pegando solo un enlace y eligiendo el país («Nuevo producto»).
 *
 * 1. **trayendo**: si es un reel, el vídeo llega por el mismo camino que las referencias de
 *    montaje (`link-media.ts`): yt-dlp en la nube y, si la nube no puede (Instagram), el Mac del
 *    dueño. Si el Mac no responde, se dice claro y, pasado un rato, se sigue sin el vídeo.
 * 2. **analizando**: Claude (nivel mediano, con búsqueda en internet) mira los fotogramas, la
 *    tienda y lo que encuentre, y devuelve la ficha: qué es, qué hace, nicho, audiencia, ángulo,
 *    marca propia y el prompt de la foto sobre gris. Una sola vez por alta (`runStep`).
 * 3. **mockup**: la foto «artículo» sobre gris con Nano Banana en el Higgsfield de quien pidió el
 *    alta. Si cuesta más de lo normal, espera a que la persona acepte el coste.
 * 4. **listo** (o **fallido**, con el motivo en palabras sencillas).
 *
 * Lo avanza la tarea programada `producto.altas` (cada minuto) y un trabajo que se lanza al crear.
 */

export const INTAKE_JOB = "producto.alta";
export const INTAKE_SWEEP = "producto.altas";

/** Países que se pueden elegir y su idioma. */
export const COUNTRY_LANGUAGE: Record<string, string> = { DE: "de", AT: "de", CH: "de", IT: "it", US: "en" };
const LANGUAGE_NAME: Record<string, string> = { de: "alemán", it: "italiano", en: "inglés (americano)" };
const COUNTRY_NAME: Record<string, string> = { DE: "Alemania", AT: "Austria", CH: "Suiza", IT: "Italia", US: "Estados Unidos" };

/** Cuánto se espera al Mac por un vídeo de Instagram antes de seguir sin él. */
export const MAC_WAIT_MS = 10 * 60_000;
/** Lo más que se espera a que Higgsfield termine el mockup. */
export const MOCKUP_TIMEOUT_MS = 30 * 60_000;
/** Un mockup normal (1 imagen 2K) cuesta pocos créditos; por encima de esto se pide el OK. */
export const MOCKUP_NORMAL_CREDITS = 6;
/** Fotogramas del reel que ve Claude. */
const FRAME_COUNT = 8;
/** Fotos de la tienda que ve Claude. */
const SHOP_IMAGES = 3;
/** Fotos subidas por la persona que ve Claude. */
const UPLOADED_IMAGES = 3;
/** Miniaturas de reels de la cuenta que ve Claude. */
const THUMBS = 4;
const MAX_SHOP_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RESULT_BYTES = 40 * 1024 * 1024;
const LEASE_MS = 5 * 60_000;

const PLACEHOLDER_NAME = "Producto nuevo";
const PLACEHOLDER_SUMMARY = "Analizando el enlace…";

const intakes = schema.productIntakes;
type Intake = typeof intakes.$inferSelect;
export type IntakeKind = "reel" | "cuenta" | "aliexpress" | "web";

// ───────────────────────── El enlace ─────────────────────────

const ALIEXPRESS = /(^|\.)aliexpress\.(com|us|de|es|fr|it|ru|co\.uk)$|^ali\.ski$/;

/**
 * El enlace tal como se guarda y qué es: un reel o vídeo (`reel`), una cuenta (`cuenta`) de
 * Instagram o TikTok, un producto de AliExpress o una tienda (`web`). `null` si no se admite
 * (solo `https`, sin usuario ni puerto).
 */
export function classifyLink(value: unknown): { url: string; kind: IntakeKind } | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (ALIEXPRESS.test(host)) return { url: url.href, kind: "aliexpress" };
  const social = linkOf(url.href);
  if (social) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      if (parts.length === 0) return null;
      const video = ["reel", "reels", "p", "tv", "stories"].includes(parts[0]) || parts[1] === "reel" || parts[1] === "p";
      return { url: social, kind: video && parts.length >= 2 ? "reel" : "cuenta" };
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      if (host.startsWith("vm.") || host.startsWith("vt.") || parts.includes("video") || parts.includes("photo")) return { url: social, kind: "reel" };
      return parts[0]?.startsWith("@") ? { url: social, kind: "cuenta" } : null;
    }
    return { url: social, kind: "reel" };
  }
  if (isIpLiteral(host) || host === "localhost" || !host.includes(".")) return null;
  return { url: url.href, kind: "web" };
}

function isIpLiteral(host: string): boolean {
  return net.isIP(host.replace(/^\[|\]$/g, "")) !== 0;
}

/** Dirección privada, de bucle o reservada: el servidor nunca la pide. */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

/**
 * Pide una dirección pública de internet (para la página de la tienda y sus fotos): solo `https`,
 * nunca a una dirección privada, sin seguir redirecciones a ciegas, con tope de tiempo y tamaño.
 * `null` si no se pudo.
 */
async function fetchPublic(target: string, maxBytes: number, deps: IntakeDeps, redirects = 3): Promise<{ bytes: Buffer; type: string } | null> {
  if (deps.fetchPublic) return deps.fetchPublic(target, maxBytes);
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "accept-language": "de-DE,de;q=0.9,en;q=0.8" },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      return next && redirects > 0 ? fetchPublic(new URL(next, url).href, maxBytes, deps, redirects - 1) : null;
    }
    if (!response.ok || !response.body) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) return null;
      chunks.push(Buffer.from(chunk));
    }
    return { bytes: Buffer.concat(chunks), type: response.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
}

/** Título, descripción e imágenes del producto que se pueden sacar del HTML de una tienda. */
export function shopFacts(html: string, base: string): { title: string | null; description: string | null; images: string[] } {
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i");
    const m = html.match(re);
    return m ? decodeEntities((m[1] ?? m[2]).trim()) : null;
  };
  const images: string[] = [];
  const add = (value: string | null | undefined) => {
    if (!value) return;
    try {
      const url = new URL(value.replace(/\\u002F/g, "/").replace(/^\/\//, "https://"), base);
      if (url.protocol === "https:" && !images.includes(url.href)) images.push(url.href);
    } catch {
      // dirección rota: se ignora
    }
  };
  add(meta("og:image"));
  const list = html.match(/"imagePathList"\s*:\s*\[([^\]]*)\]/);
  if (list) for (const m of list[1].matchAll(/"([^"]+)"/g)) add(m[1]);
  const title = meta("og:title") ?? html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim() ?? null;
  return { title: title ? decodeEntities(title) : null, description: meta("og:description") ?? meta("description"), images: images.slice(0, 8) };
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// ───────────────────────── Crear ─────────────────────────

export interface IntakeDeps {
  gateway?: LlmGateway;
  higgsfield?: HiggsfieldPort;
  store?: ObjectStore | null;
  runYtDlp?: FetchDeps["runYtDlp"];
  fetchPublic?: (url: string, maxBytes: number) => Promise<{ bytes: Buffer; type: string } | null>;
  macOnline?: () => Promise<boolean>;
  now?: () => Date;
}

const nowOf = (deps: IntakeDeps) => deps.now?.() ?? new Date();

/**
 * Crea el producto con un nombre provisional y su alta automática. Lanza 400 si el enlace o el
 * país no valen. Quien llama encola el trabajo (`INTAKE_JOB`) para empezar enseguida.
 */
export async function createProductFromLink(
  user: AuthUser,
  input: { url: unknown; country: unknown; waitForPhotos?: boolean },
): Promise<{ product: Product; intake: Intake }> {
  const link = classifyLink(input.url);
  if (!link) throw new HttpError(400, "Pega un enlace https de un reel o una cuenta de Instagram/TikTok, de AliExpress o de una tienda.");
  const country = typeof input.country === "string" ? input.country : "";
  const language = COUNTRY_LANGUAGE[country];
  if (!language) throw new HttpError(400, "Elige el país.");
  let intake: Intake | null = null;
  const product = await createProduct(
    user,
    { name: PLACEHOLDER_NAME, summary: PLACEHOLDER_SUMMARY, language, countries: [country] },
    {
      sourceUrl: link.url,
      alsoInTx: async (tx, created) => {
        [intake] = await tx
          .insert(intakes)
          .values({
            productId: created.id,
            url: link.url,
            kind: link.kind,
            country,
            createdBy: user.id,
            status: needsFetch(link) ? "trayendo" : "analizando",
            message: firstMessage(link.kind),
            // Con fotos por subir, nadie la empieza hasta que lleguen (`startIntake`) o pasen unos minutos.
            leaseUntil: input.waitForPhotos ? new Date(Date.now() + PHOTO_WAIT_MS) : null,
          })
          .returning();
      },
    },
  );
  return { product, intake: intake! };
}

/** Reels y cuentas pasan por «trayendo» (el vídeo o el perfil, por la nube o el Mac). */
const needsFetch = (link: { kind: IntakeKind }) => link.kind === "reel" || link.kind === "cuenta";

function firstMessage(kind: IntakeKind): string {
  if (kind === "reel") return "Trayendo el vídeo…";
  if (kind === "cuenta") return "Leyendo la cuenta…";
  return "Leyendo la tienda…";
}

/** Lo más que se espera a las fotos que la persona sube al crear el producto. */
export const PHOTO_WAIT_MS = 3 * 60_000;

/** Las fotos ya están subidas: el alta puede empezar. Devuelve el alta, o `null` si no hay. */
export async function startIntake(user: AuthUser, productId: number): Promise<Intake | null> {
  const product = await getProductFor(user, productId);
  const row = await latestIntake(product.id);
  if (!row) return null;
  const [freed] = await getDb().update(intakes).set({ leaseUntil: null }).where(and(eq(intakes.id, row.id), eq(intakes.status, row.status))).returning();
  return freed ?? row;
}

/** Vuelve a empezar el alta de un producto (otra fila; la anterior queda como historial). */
export async function restartIntake(user: AuthUser, productId: number, input: { url?: unknown } = {}): Promise<Intake> {
  const product = await getProductFor(user, productId);
  const last = await latestIntake(product.id);
  const link = classifyLink(input.url ?? last?.url ?? product.sourceUrl);
  if (!link) throw new HttpError(400, "Este producto no tiene un enlace válido para analizar.");
  const country = last?.country ?? product.countries[0] ?? "DE";
  // Volver a analizar una cuenta vuelve a leer su perfil (también si falló).
  if (link.kind === "cuenta") await resetLinkProfile(link.url);
  const [intake] = await getDb()
    .insert(intakes)
    .values({ productId: product.id, url: link.url, kind: link.kind, country, createdBy: user.id, status: needsFetch(link) ? "trayendo" : "analizando", message: firstMessage(link.kind) })
    .returning();
  if (link.url !== product.sourceUrl) await setProductFacts(product.id, { sourceUrl: link.url });
  return intake;
}

export async function latestIntake(productId: number): Promise<Intake | null> {
  const [row] = await getDb().select().from(intakes).where(eq(intakes.productId, productId)).orderBy(desc(intakes.id)).limit(1);
  return row ?? null;
}

// ───────────────────────── Avanzar ─────────────────────────

/** Reserva el alta para este proceso; `null` si otro la tiene o ya terminó. */
async function lease(intakeId: number, now: Date): Promise<Intake | null> {
  const [row] = await getDb()
    .update(intakes)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
    .where(
      and(
        eq(intakes.id, intakeId),
        or(inArray(intakes.status, ["trayendo", "analizando", "mockup"]), inArray(intakes.mockupStatus, ["enviado"])),
        or(isNull(intakes.leaseUntil), lt(intakes.leaseUntil, now)),
      ),
    )
    .returning();
  return row ?? null;
}

async function save(id: number, changes: Partial<typeof intakes.$inferInsert>, now: Date): Promise<Intake> {
  const [row] = await getDb().update(intakes).set({ ...changes, updatedAt: now }).where(eq(intakes.id, id)).returning();
  return row;
}

/** Avanza un alta todo lo que se pueda ahora (cada paso es seguro de repetir). */
export async function advanceIntake(intakeId: number, deps: IntakeDeps = {}): Promise<void> {
  let row = await lease(intakeId, nowOf(deps));
  if (!row) return;
  try {
    const owner = await getActiveUser(row.createdBy);
    if (!owner) {
      await save(row.id, { status: "fallido", message: "La cuenta que pidió el alta está desactivada." }, nowOf(deps));
      return;
    }
    if (row.status === "trayendo") row = await stepFetch(row, deps);
    if (row.status === "analizando") row = await stepAnalyze(row, owner, deps);
    if (row.status === "mockup" || row.mockupStatus === "enviado") row = await stepMockup(row, owner, deps);
  } finally {
    await getDb().update(intakes).set({ leaseUntil: null }).where(eq(intakes.id, intakeId));
  }
}

/** Tarea programada: avanza todas las altas sin terminar. */
export async function intakeSweep(deps: IntakeDeps = {}): Promise<void> {
  const rows = await getDb()
    .select({ id: intakes.id })
    .from(intakes)
    .where(or(inArray(intakes.status, ["trayendo", "analizando", "mockup"]), eq(intakes.mockupStatus, "enviado")))
    .orderBy(intakes.id)
    .limit(20);
  for (const { id } of rows) {
    try {
      await advanceIntake(id, deps);
    } catch (error) {
      console.error(`[altas] El alta ${id} no pudo avanzar:`, error instanceof Error ? error.message : error);
    }
  }
}

// 1. Traer el vídeo ────────────────────────────────────────────

/** Lo que ve la persona mientras el Mac no responde (Instagram solo se lee con el Mac). */
export const WAITING_FOR_MAC = "Esperando a tu Mac para leer Instagram…";
/** Cada cuánto se vuelve a pedir al Mac un perfil que no pudo leer. */
export const PROFILE_RETRY_MS = 5 * 60_000;
/** Reels de una cuenta que se miran (los más vistos). */
export const PROFILE_REELS = 2;

const isInstagram = (url: string) => /(^|\.)instagram\.com$/i.test(new URL(url).hostname);

async function stepFetch(row: Intake, deps: IntakeDeps): Promise<Intake> {
  const now = nowOf(deps);
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  const goOn = (message: string) => save(row.id, { status: "analizando", message }, now);
  const say = (message: string) => (row.message === message ? row : save(row.id, { message }, now));
  const online = () => (deps.macOnline ?? (() => macOnline(now)))();

  // Una cuenta: primero su perfil, que lee el Mac.
  if (row.kind === "cuenta") {
    let profile = await ensureLinkProfile(row.url);
    if (row.linkProfileId !== profile.id) row = await save(row.id, { linkProfileId: profile.id }, now);
    if (profile.status === "failed") {
      if (profile.failures >= MAX_PROFILE_FAILURES) return goOn("No se pudo leer la cuenta; se analiza con lo que hay en internet.");
      if (now.getTime() - profile.updatedAt.getTime() < PROFILE_RETRY_MS) return say(profileProblem(profile.error));
      if (!(await requestProfileFromMac(profile, now))) return say(WAITING_FOR_MAC);
      profile = (await linkProfileById(profile.id))!;
    }
    if (profile.status === "pending") {
      const task = await profileTaskStatus(profile);
      if ((task === null || task === "done" || task === "failed") && !(await requestProfileFromMac(profile, now))) return say(WAITING_FOR_MAC);
      return say((await online()) ? "Tu Mac está leyendo la cuenta…" : WAITING_FOR_MAC);
    }
    // Perfil listo: se traen sus reels más vistos (como cualquier reel).
    const data = profileDataOf(profile.data);
    const reels = data ? topReels(data, PROFILE_REELS).map((r) => r.url) : [];
    if (!row.reelUrls) row = await save(row.id, { reelUrls: reels }, now);
    if (!store || reels.length === 0) return goOn("Mirando la cuenta y buscando el producto en internet…");
    let pending = 0;
    for (const url of row.reelUrls ?? []) {
      const state = await fetchVideo(url, store, deps, now);
      if (state === "pending") pending += 1;
      if (state === "no_mac") return say(WAITING_FOR_MAC);
    }
    if (pending === 0) return goOn("Mirando los reels más vistos y buscando el producto…");
    if (!(await online())) return say(WAITING_FOR_MAC);
    if (now.getTime() - row.updatedAt.getTime() >= MAC_WAIT_MS) return goOn("Mirando la cuenta y buscando el producto…");
    return say("Tu Mac está trayendo los reels más vistos de la cuenta…");
  }

  // Un reel suelto.
  if (!store) return goOn("Sin almacén de archivos: se analiza el enlace sin el vídeo.");
  const media = await ensureLinkMedia(row.url);
  if (!media) return goOn("Analizando el enlace…");
  if (row.linkMediaId !== media.id) row = await save(row.id, { linkMediaId: media.id }, now);
  const state = await fetchVideo(row.url, store, deps, now);
  if (state === "ready") return goOn("Mirando el vídeo y buscando el producto en internet…");
  if (state === "failed") return goOn("No se pudo traer el vídeo; se analiza con lo que hay en internet.");
  if (state === "no_mac") return isInstagram(row.url) ? say(WAITING_FOR_MAC) : goOn("No se pudo traer el vídeo; se analiza con lo que hay en internet.");
  // Instagram solo lo trae el Mac: sin Mac, se espera (y se reintenta) sin rendirse.
  if (!(await online())) return isInstagram(row.url) ? say(WAITING_FOR_MAC) : say("Esperando a tu Mac para traer el vídeo…");
  if (now.getTime() - row.createdAt.getTime() >= MAC_WAIT_MS) return goOn("El Mac no trajo el vídeo a tiempo: se analiza con lo que hay en internet.");
  return say("Tu Mac está trayendo el vídeo…");
}

/** Trae un vídeo de enlace: la nube primero y, si no puede, el Mac. */
async function fetchVideo(url: string, store: ObjectStore, deps: IntakeDeps, now: Date): Promise<"ready" | "failed" | "pending" | "no_mac"> {
  let media = await ensureLinkMedia(url);
  if (!media) return "failed";
  // Instagram no deja entrar a la nube: directo al Mac (yt-dlp en la nube solo perdería minutos).
  if (media.status === "pending" && !media.cloudTriedAt && !isInstagram(url)) {
    await fetchInCloud(media, { store, runYtDlp: deps.runYtDlp, now: deps.now });
    media = (await ensureLinkMedia(url))!;
  }
  if (media.status === "ready" || media.status === "failed") return media.status;
  const task = await macTaskStatus(media);
  if ((task === null || task === "done" || task === "failed") && !(await requestFromMac(media, now))) return "no_mac";
  return "pending";
}

/** Qué decir cuando el Mac no pudo leer el perfil (se reintenta solo). */
function profileProblem(error: string | null): string {
  if (error?.includes("[aviso]")) return "Instagram enseña un aviso en tu cuenta: ábrela en Brave en tu Mac y ciérralo. Se reintenta solo.";
  if (error?.includes("[sin_sesion]")) return "Entra en Instagram con Brave en tu Mac (la sesión se cerró). Se reintenta solo.";
  if (error?.includes("[sin_reels]")) return "Tu Mac no vio ningún reel en la cuenta. Se reintenta solo.";
  if (error?.includes("[sin_brave]")) return "Hace falta Brave en tu Mac para leer Instagram. Se reintenta solo.";
  return "Tu Mac no pudo leer la cuenta esta vez. Se reintenta solo.";
}

// 2. Entender el producto ──────────────────────────────────────

const intakeSchema = z.object({
  identificado: z.boolean(),
  motivo: z.string(),
  producto: z.string(),
  queHace: z.string(),
  mecanismo: z.string(),
  nicho: z.string(),
  audiencia: z.string(),
  anguloActual: z.string(),
  emoji: z.string(),
  marca: z.object({ nombre: z.string(), porQue: z.string(), alternativas: z.array(z.string()) }),
  referencia: z.object({ tipo: z.enum(["fotograma", "foto_tienda", "foto_subida", "miniatura", "ninguna"]), numero: z.number().int() }),
  promptMockup: z.string(),
  /**
   * Texto impreso o bordado en el producto (no la marca del fabricante): tal como viene y adaptado al
   * idioma del mercado. Vacío si no lleva texto o ya está en ese idioma.
   */
  textoImpreso: z.array(z.object({ original: z.string(), adaptado: z.string() })),
  /** Para el logo-emblema (en inglés): qué ilustración lleva y con qué colores (como lo escribía Codex). */
  ideaMarca: z.string(),
  /** Subtítulo corto de la caja en el idioma del mercado (p. ej. «Hoodie mit integrierter Gesichtsmaske»). */
  descriptorCaja: z.string(),
  fuentes: z.array(z.object({ url: z.string(), que: z.string() })),
});
export type IntakeAnswer = z.infer<typeof intakeSchema>;

/** Lo que se guarda en `result`: la respuesta, con cada fuente marcada como comprobada o no. */
export interface IntakeResult extends Omit<IntakeAnswer, "fuentes"> {
  fuentes: Array<{ url: string; que: string; comprobada: boolean }>;
  referenciaFotoId: number | null;
  sinVideo: boolean;
  /** El mockup ya se reintentó tras un bloqueo del filtro de Higgsfield. */
  mockupReintento?: boolean;
  /** Cuántos reintentos lleva tras bloqueos del filtro (ver `MOCKUP_BLOCKED_PROMPTS`). */
  mockupIntentos?: number;
  costeMicros: number;
}

interface ShopProduct {
  title: string;
  type: string;
  text: string;
  price: string | null;
  image: string | null;
  url: string;
}

interface Inputs {
  frames: Array<{ timeMs: number; jpeg: Buffer; video?: string }>;
  /** Miniaturas de los reels más vistos de la cuenta. */
  thumbs: Array<{ url: string; vistas: number | null; bytes: Buffer; mime: "image/jpeg" | "image/png" | "image/webp" }>;
  /** El perfil que leyó el Mac. */
  profile: ProfileData | null;
  /** Fotos o capturas que subió la persona al crear el producto (opcionales). */
  uploaded: Array<{ id: number; jpeg: Buffer }>;
  shop: { title: string | null; description: string | null; products: ShopProduct[]; images: Array<{ url: string; bytes: Buffer; mime: "image/jpeg" | "image/png" | "image/webp" }> };
}

async function gatherInputs(row: Intake, owner: AuthUser, deps: IntakeDeps): Promise<Inputs> {
  const inputs: Inputs = { frames: [], uploaded: [], thumbs: [], profile: null, shop: { title: null, description: null, products: [], images: [] } };
  const photos = (await listProductPhotos(owner, row.productId)).filter((p) => p.role !== "avatar" && p.role !== "entorno").slice(-UPLOADED_IMAGES);
  for (const photo of photos) {
    try {
      const { data } = await readProductPhoto(owner, photo.id);
      inputs.uploaded.push({ id: photo.id, jpeg: await makeThumbnail(data, "image", 1568) });
    } catch {
      // Una foto que no se puede leer no impide seguir.
    }
  }
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  // Fotogramas: del reel pegado, o de los reels más vistos de la cuenta.
  const videos = row.kind === "reel" ? [row.url] : (row.reelUrls ?? []);
  const perVideo = videos.length > 1 ? Math.ceil(FRAME_COUNT / 2) : FRAME_COUNT;
  for (const url of videos) {
    const media = await ensureLinkMedia(url);
    if (media?.status !== "ready" || !store) continue;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "alta-"));
    try {
      const file = path.join(dir, "video.mp4");
      if (await downloadLinkMedia(media, file, { store })) {
        const { durationMs } = await probeVideo(file);
        const times = Array.from({ length: perVideo }, (_, i) => Math.round(((i + 0.5) * durationMs) / perVideo));
        inputs.frames.push(...(await extractFrames(file, times)).map((f) => ({ ...f, video: url })));
      }
    } catch (error) {
      console.warn(`[altas] No se pudieron sacar fotogramas del alta ${row.id}:`, error instanceof Error ? error.message : error);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  // La cuenta: lo que leyó el Mac y las miniaturas de sus reels más vistos.
  let shopLinks: string[] = row.kind === "aliexpress" || row.kind === "web" ? [row.url] : [];
  if (row.kind === "cuenta" && row.linkProfileId) {
    const profile = await linkProfileById(row.linkProfileId);
    const data = profile?.status === "ready" ? profileDataOf(profile.data) : null;
    if (data) {
      inputs.profile = data;
      shopLinks = data.enlaces;
      for (const reel of topReels(data, THUMBS)) {
        if (!reel.miniatura) continue;
        const image = await fetchPublic(reel.miniatura, MAX_IMAGE_BYTES, deps);
        const mime = image ? imageMimeOf(image.bytes.subarray(0, 16)) : null;
        if (image && (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp")) inputs.thumbs.push({ url: reel.url, vistas: reel.vistas, bytes: image.bytes, mime });
      }
    }
  }
  // La tienda: Shopify (`/products.json`) o la página con sus fotos.
  for (const link of shopLinks.slice(0, 2)) {
    const shopify = await shopifyProducts(link, deps);
    if (shopify.length > 0) {
      inputs.shop.products = shopify;
      for (const product of shopify) {
        if (inputs.shop.images.length >= SHOP_IMAGES) break;
        if (!product.image) continue;
        const image = await fetchPublic(product.image, MAX_IMAGE_BYTES, deps);
        const mime = image ? imageMimeOf(image.bytes.subarray(0, 16)) : null;
        if (image && (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp")) inputs.shop.images.push({ url: product.image, bytes: image.bytes, mime });
      }
      break;
    }
    const page = await fetchPublic(link, MAX_SHOP_PAGE_BYTES, deps);
    if (page && /html/i.test(page.type || "text/html")) {
      const facts = shopFacts(page.bytes.toString("utf8"), link);
      inputs.shop.title = facts.title;
      inputs.shop.description = facts.description;
      for (const url of facts.images) {
        if (inputs.shop.images.length >= SHOP_IMAGES) break;
        const image = await fetchPublic(url, MAX_IMAGE_BYTES, deps);
        const mime = image ? imageMimeOf(image.bytes.subarray(0, 16)) : null;
        if (image && (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp")) inputs.shop.images.push({ url, bytes: image.bytes, mime });
      }
      if (inputs.shop.images.length > 0 || inputs.shop.title) break;
    }
  }
  return inputs;
}

/** Productos de una tienda Shopify (`/products.json`), los primeros; vacío si no es Shopify. */
export async function shopifyProducts(link: string, deps: IntakeDeps): Promise<ShopProduct[]> {
  let origin: string;
  try {
    origin = new URL(link).origin;
  } catch {
    return [];
  }
  const response = await fetchPublic(`${origin}/products.json?limit=8`, MAX_SHOP_PAGE_BYTES, deps);
  if (!response) return [];
  try {
    const json = JSON.parse(response.bytes.toString("utf8")) as { products?: Array<Record<string, unknown>> };
    if (!Array.isArray(json.products)) return [];
    return json.products.slice(0, 8).map((p) => {
      const images = Array.isArray(p.images) ? (p.images as Array<{ src?: unknown }>) : [];
      const variants = Array.isArray(p.variants) ? (p.variants as Array<{ price?: unknown }>) : [];
      return {
        title: typeof p.title === "string" ? p.title.slice(0, 200) : "",
        type: typeof p.product_type === "string" ? p.product_type.slice(0, 100) : "",
        text: typeof p.body_html === "string" ? p.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : "",
        price: typeof variants[0]?.price === "string" ? variants[0].price : null,
        image: typeof images[0]?.src === "string" ? (images[0].src as string) : null,
        url: typeof p.handle === "string" ? `${origin}/products/${p.handle}` : origin,
      };
    });
  } catch {
    return [];
  }
}

function intakeInstructions(row: Intake, language: string, brands: string[]): string {
  const kindText: Record<IntakeKind, string> = {
    reel: "un reel o vídeo de una cuenta que vende el producto",
    cuenta: "la cuenta (perfil) de Instagram o TikTok de quien vende el producto. Tienes lo que leyó el Mac del perfil (cabecera, enlaces, reels con sus vistas), las miniaturas y fotogramas de sus reels más vistos y, si la hay, su tienda; el producto es el protagonista de los reels más vistos. Completa con la búsqueda en internet (la tienda, AliExpress, Amazon) si hace falta",
    aliexpress: "un producto de AliExpress",
    web: "la página de una tienda que vende el producto",
  };
  return [
    "Eres el asistente que da de alta productos nuevos en PRINCIPAL, la web de Emmanuel para producir anuncios en vídeo de sus tiendas Shopify.",
    `El enlace es ${kindText[row.kind as IntakeKind]}. Mercado: ${COUNTRY_NAME[row.country] ?? row.country} (idioma ${LANGUAGE_NAME[language] ?? language}).`,
    "Aplica las reglas «Alta de producto desde un enlace» y «Nombres de marca». Usa la búsqueda en internet para identificar el artículo concreto y comprobar datos; mira primero el propio enlace con web_fetch.",
    `Marcas que Emmanuel ya usa (no repitas sus raíces salvo que sea la misma familia): ${brands.join(", ") || "ninguna"}.`,
    "Campos: `producto` (qué es, en español, corto), `queHace` (una frase sencilla en español), `mecanismo`, `nicho`, `audiencia` (quién compra y quién usa), `anguloActual` (con qué motivo se vende en la fuente), `emoji` (uno), `marca` (la mejor opción y dos alternativas, en el idioma del mercado, con el porqué en español), `referencia` (la imagen numerada donde mejor se ve el producto entero y limpio para el mockup: `fotograma`, `foto_tienda`, `foto_subida` o `miniatura` con su número empezando en 1, o `ninguna`; mejor una foto limpia de la tienda que un fotograma), `promptMockup` (en inglés, según la regla), `fuentes` (direcciones que de verdad consultaste y qué sacaste de cada una).",
    `Texto impreso en el producto (regla de Emmanuel del 24/11/2026): si el producto lleva texto impreso, bordado o grabado en un idioma que no es el del mercado (${LANGUAGE_NAME[language] ?? language}), adáptalo SIEMPRE, sin preguntar: tradúcelo a un ${LANGUAGE_NAME[language] ?? language} natural y del estilo de la prenda, no palabra por palabra (p. ej. «Child of God / John 1:12» → «Kind Gottes / Johannes 1,12», con las citas como se escriben en ese país). Ponlo en \`textoImpreso\` (original → adaptado) y en \`promptMockup\` pide ese texto ya adaptado, escrito exactamente, con la misma tipografía, tamaño, color y colocación. Los logotipos y nombres de marca no se traducen. Sin texto, \`textoImpreso\` vacío.`,
    `Recursos de la marca (se generan solos después): \`ideaMarca\` = en inglés, la ilustración del emblema circular de la marca y su paleta, con carácter y relacionada con el producto o su mundo (p. ej. «A filled dark midnight-blue hood silhouette frames a warm gold cross and a restrained ivory halo; midnight blue, warm gold and cream»); \`descriptorCaja\` = qué es el producto en 3–6 palabras en ${LANGUAGE_NAME[language] ?? language}, para imprimir en la caja (p. ej. «Hoodie mit integrierter Gesichtsmaske»), sin promesas.`,
    "Sin avisos de marcas registradas, derechos, licencias ni propiedad intelectual en ningún campo (indicación de Emmanuel: la decisión es suya). En `promptMockup` no nombres marcas, franquicias, películas ni personajes: describe el producto y su estampado por formas, colores y dibujos (p. ej. «cartoon snowman», «ice castle line art»), para que el filtro de Higgsfield no lo bloquee.",
    "Si no puedes identificar el producto con seguridad, `identificado: false` y en `motivo` explica en una frase sencilla por qué y qué haría falta; deja el resto vacío. Si lo identificas, `motivo` puede quedar vacío o avisar de una duda.",
  ].join("\n");
}

async function stepAnalyze(row: Intake, owner: AuthUser, deps: IntakeDeps): Promise<Intake> {
  const now = nowOf(deps);
  let product: Product;
  try {
    product = await getProductFor(owner, row.productId);
  } catch {
    return save(row.id, { status: "fallido", message: "Ya no tienes acceso a este producto." }, now);
  }
  const ctx = { jobName: INTAKE_JOB, userId: owner.id, productId: product.id };
  let answer: { data: IntakeAnswer; webSources: string[]; costMicros: number; inputs: { frames: number; shop: number; shopUrls: string[] } };
  let inputs: Inputs | null = null;
  try {
    answer = await runStep(ctx, `${INTAKE_JOB}:${row.id}:ficha`, async () => {
      inputs = await gatherInputs(row, owner, deps);
      const brands = (await allProductNames()).filter((n) => n !== PLACEHOLDER_NAME);
      const content: LlmContent = [textPart(`Enlace: ${row.url}`)];
      if (inputs.frames.length > 0) {
        content.push(textPart(`Fotogramas del vídeo (${inputs.frames.length}):`));
        inputs.frames.forEach((frame, i) => content.push(textPart(`Fotograma ${i + 1} — ${(frame.timeMs / 1000).toFixed(1)} s${frame.video && row.kind === "cuenta" ? ` de ${frame.video}` : ""}`), imagePart(frame.jpeg, "image/jpeg")));
      } else if (row.kind === "reel" || (row.reelUrls?.length ?? 0) > 0) {
        content.push(textPart("No se pudo traer el vídeo: identifícalo por el enlace y la búsqueda en internet."));
      }
      if (inputs.profile) {
        const p = inputs.profile;
        const reels = p.reels.slice(0, 12).map((r, i) => `${i + 1}. ${r.url} — ${r.vistas === null ? "vistas ?" : `${r.vistas} vistas`}${r.texto ? ` — «${r.texto.slice(0, 200)}»` : ""}`);
        content.push(textPart([`Perfil de ${p.red} @${p.usuario} (lo leyó el Mac):`, `Cabecera: ${p.cabecera || "—"}`, p.descripcion ? `Descripción: ${p.descripcion}` : null, `Enlaces: ${p.enlaces.join(" ") || "ninguno"}`, "Reels:", ...reels].filter(Boolean).join("\n")));
      }
      inputs.thumbs.forEach((thumb, i) => content.push(textPart(`Miniatura ${i + 1} — ${thumb.url}${thumb.vistas === null ? "" : ` (${thumb.vistas} vistas)`}`), imagePart(thumb.bytes, thumb.mime)));
      if (inputs.shop.products.length > 0) {
        content.push(textPart(["Productos de su tienda Shopify (/products.json):", ...inputs.shop.products.map((pr, i) => `${i + 1}. ${pr.title}${pr.type ? ` [${pr.type}]` : ""}${pr.price ? ` — ${pr.price}` : ""} — ${pr.url}${pr.text ? ` — ${pr.text}` : ""}`)].join("\n")));
      }
      if (inputs.shop.title || inputs.shop.description) content.push(textPart(`Datos de la página: ${[inputs.shop.title, inputs.shop.description].filter(Boolean).join(" — ")}`));
      inputs.shop.images.forEach((image, i) => content.push(textPart(`Foto de la tienda ${i + 1}`), imagePart(image.bytes, image.mime)));
      inputs.uploaded.forEach((image, i) => content.push(textPart(`Foto subida ${i + 1} (la puso la persona: es el producto)`), imagePart(image.jpeg, "image/jpeg")));
      const result = await (deps.gateway ?? getGateway()).call({
        tier: "medium",
        stepKey: `${INTAKE_JOB}:${row.id}`,
        userId: owner.id,
        productId: product.id,
        rules: await loadRules(["alta-de-producto", "nombres-de-marca"]),
        instructions: intakeInstructions(row, product.language, [...new Set(brands)]),
        content,
        maxTokens: 6_000,
        schema: intakeSchema,
        web: { searches: 5, fetches: 3, country: row.country },
      });
      return {
        data: result.data!,
        webSources: result.webSources,
        costMicros: result.costMicros,
        inputs: { frames: inputs.frames.length, shop: inputs.shop.images.length, shopUrls: inputs.shop.images.map((i) => i.url) },
      };
    });
  } catch (error) {
    if (error instanceof JobPausedError) return save(row.id, { message: "Se ha llegado al tope de gasto de Claude este mes: el alta sigue cuando haya saldo." }, now);
    const message = gatewayMessage(error);
    if (message) return save(row.id, { status: "fallido", message }, now);
    throw error;
  }

  const { data } = answer;
  const checked = new Set([...answer.webSources, row.url]);
  const result: IntakeResult = {
    ...data,
    fuentes: data.fuentes.map((f) => ({ ...f, comprobada: checked.has(f.url) })),
    referenciaFotoId: null,
    sinVideo: row.kind === "reel" && answer.inputs.frames === 0,
    costeMicros: answer.costMicros,
  };

  if (!data.identificado) {
    await setProductFacts(product.id, { name: "Producto sin identificar", summary: "No se pudo identificar el producto del enlace." });
    return save(row.id, { status: "fallido", result, message: "No se ha podido identificar el producto. Pulsa «Volver a analizar» para intentarlo otra vez." }, now);
  }

  // La imagen de referencia del mockup se guarda como foto del producto (papel «Otra»).
  result.referenciaFotoId = await saveReference(owner, product.id, row, data, deps);

  await setProductFacts(product.id, {
    name: data.marca.nombre || PLACEHOLDER_NAME,
    summary: data.queHace || data.producto,
    niche: data.nicho,
    audience: data.audiencia,
    angle: data.anguloActual,
    ...(product.emoji ? {} : { emoji: data.emoji }),
  });
  const next: Partial<typeof intakes.$inferInsert> = result.referenciaFotoId
    ? { status: "mockup", message: "Generando el mockup sobre fondo gris…" }
    : { status: "listo", mockupStatus: "omitido", mockupNote: "No había una imagen clara del producto para el mockup: sube una foto y pulsa «Generar mockup».", message: null };
  return save(row.id, { ...next, result }, now);

  async function saveReference(user: AuthUser, productId: number, intake: Intake, answerData: IntakeAnswer, d: IntakeDeps): Promise<number | null> {
    const ref = answerData.referencia;
    let bytes: Buffer | null = null;
    // Los fotogramas y fotos no se guardan en el paso: se vuelven a sacar (es gratis).
    const fresh = (inputs as Inputs | null) ?? (await gatherInputs(intake, user, d));
    // Una foto subida ya es del producto: sirve tal cual.
    if (ref.tipo === "foto_subida") return fresh.uploaded[ref.numero - 1]?.id ?? fresh.uploaded[0]?.id ?? null;
    if (ref.tipo === "fotograma") bytes = fresh.frames[ref.numero - 1]?.jpeg ?? fresh.frames[0]?.jpeg ?? null;
    else if (ref.tipo === "miniatura") bytes = fresh.thumbs[ref.numero - 1]?.bytes ?? null;
    else if (ref.tipo === "foto_tienda") bytes = fresh.shop.images[ref.numero - 1]?.bytes ?? fresh.shop.images[0]?.bytes ?? null;
    if (!bytes) return null;
    try {
      const jpeg = await makeThumbnail(bytes, "image", 2048);
      const photo = await addProductPhoto(user, productId, jpeg, "otro");
      return photo.id;
    } catch (error) {
      console.warn(`[altas] No se pudo guardar la referencia del alta ${intake.id}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
}

/** Mensaje para la persona de un fallo de Claude; `null` si no es de la pasarela. */
function gatewayMessage(error: unknown): string | null {
  if (error instanceof LlmCapReachedError) return error.message;
  if (error instanceof LlmNotConfiguredError) return "Falta la clave de Claude en la web; avisa al dueño.";
  if (error instanceof LlmCallError || error instanceof LlmRefusalError || error instanceof LlmTruncatedError || error instanceof LlmInvalidOutputError) {
    return "No se pudo terminar el análisis. Pulsa «Volver a analizar».";
  }
  if (error instanceof StepFailedError) return "No se pudo terminar el análisis. Pulsa «Volver a analizar».";
  return null;
}

// 3. Mockup sobre gris ─────────────────────────────────────────

export const MOCKUP_FALLBACK_PROMPT =
  "Photorealistic commercial product photograph of the exact product in the reference image. Single fully assembled unit, 3/4 front view, on a neutral medium-gray seamless backdrop and tabletop (roughly #929396), soft even studio light, subtle soft contact shadow, everything in sharp focus, generous margins. Keep shape, parts, colors, prints and proportions exactly as the reference. No hands, no people, no props, no text, no logos, no graphics.";

async function stepMockup(row: Intake, owner: AuthUser, deps: IntakeDeps): Promise<Intake> {
  const now = nowOf(deps);
  const hf = deps.higgsfield ?? getHiggsfield();
  const result = (row.result ?? null) as IntakeResult | null;
  const finish = (changes: Partial<typeof intakes.$inferInsert>) => save(row.id, { status: "listo", message: null, ...changes }, now);

  if (row.mockupStatus === "enviado" && row.mockupJobId) {
    let job;
    try {
      [job] = await hf.jobs(owner.id, [row.mockupJobId], 0);
    } catch (error) {
      if (error instanceof HiggsfieldNotConnectedError) return finish({ mockupStatus: "fallido", mockupNote: "Tu Higgsfield se ha desconectado: conéctalo en Ajustes y mira el mockup en tu cuenta." });
      throw error;
    }
    if (job?.status === "done" && job.urls[0]) {
      const file = await fetchPublic(job.urls[0], MAX_RESULT_BYTES, deps);
      if (!file) return row;
      const jpeg = await makeThumbnail(file.bytes, "image", 2048);
      const photo = await addProductPhoto(owner, row.productId, jpeg, "articulo");
      // Con el artículo listo, los recursos de marca (logo, logo web y cajas) se generan solos.
      await requestBrandAssets(row.productId, owner.id);
      return finish({ mockupStatus: "hecho", mockupPhotoId: photo.id, mockupNote: null });
    }
    if (job?.status === "failed") {
      // Bloqueado por el filtro de Higgsfield: un reintento solo, con el otro modelo y un prompt neutro.
      const blocked = job.failure === "nsfw" || job.failure === "ip_detected";
      const tries = result?.mockupIntentos ?? (result?.mockupReintento ? 1 : 0);
      if (blocked && result && tries < MOCKUP_BLOCKED_PROMPTS.length) {
        const retried = { ...result, mockupReintento: true, mockupIntentos: tries + 1 };
        await save(row.id, { result: retried }, now);
        return stepMockup({ ...row, result: retried, mockupStatus: "pendiente", mockupJobId: null }, owner, deps);
      }
      const why = job.failure === "nsfw" || job.failure === "ip_detected" ? "Higgsfield lo bloqueó por su filtro de contenido o de marcas" : "Higgsfield no pudo generarlo";
      return finish({ mockupStatus: "fallido", mockupNote: `${why}. Puedes pulsar «Generar mockup» otra vez.` });
    }
    if (now.getTime() - row.updatedAt.getTime() > MOCKUP_TIMEOUT_MS) return finish({ mockupStatus: "fallido", mockupNote: "Higgsfield no terminó el mockup en 30 minutos; míralo en tu cuenta de Higgsfield." });
    return row;
  }

  const photoId = result?.referenciaFotoId ?? (await firstArticlePhoto(row.productId));
  if (!photoId) return finish({ mockupStatus: "omitido", mockupNote: "No hay una foto del producto para el mockup: sube una y pulsa «Generar mockup»." });

  try {
    const photo = await readProductPhoto(owner, photoId);
    const mediaId = await ensureMedia(owner.id, { bytes: photo.data, filename: `referencia-${photoId}.jpg`, contentType: photo.mime, type: "image" }, { higgsfield: hf });
    const request: HfImageRequest = {
      model: mockupTry(result) === 1 ? otherImageModel(await getImageModel()) : await getImageModel(),
      prompt: ((mockupTry(result) > 0 ? MOCKUP_BLOCKED_PROMPTS[mockupTry(result) - 1] : result?.promptMockup?.trim() || MOCKUP_FALLBACK_PROMPT) + printedTextClause(result)).slice(0, 3000),
      aspectRatio: "1:1",
      resolution: "2k",
      medias: [{ role: "image_references", value: mediaId }],
    };
    const quote = await hf.quoteImages(owner.id, request, 1);
    const allowed = Math.max(MOCKUP_NORMAL_CREDITS, row.mockupOkCredits ?? 0);
    if (quote.credits > allowed) {
      return finish({ mockupStatus: "pendiente", mockupCredits: quote.credits, mockupNote: `El mockup costaría ${quote.credits} créditos de Higgsfield, más de lo normal. Pulsa «Generar mockup» para aceptarlo.` });
    }
    // Se apunta antes de enviar: si el proceso cae a mitad, no se vuelve a enviar a ciegas.
    await save(row.id, { mockupStatus: "enviado", mockupCredits: quote.credits, mockupNote: "Enviando a Higgsfield…" }, now);
    const sent = await hf.submitImages(owner.id, request, 1);
    if (!sent.jobIds[0]) return finish({ mockupStatus: "fallido", mockupNote: `Higgsfield no aceptó el mockup${sent.rejected[0] ? `: ${sent.rejected[0]}` : ""}.` });
    return save(row.id, { status: "mockup", mockupJobId: sent.jobIds[0], mockupNote: `Generando en Higgsfield (${quote.credits} créditos)…`, message: "Generando el mockup sobre fondo gris…" }, now);
  } catch (error) {
    if (error instanceof HiggsfieldNotConnectedError) return finish({ mockupStatus: "omitido", mockupNote: "Conecta tu Higgsfield en Ajustes y pulsa «Generar mockup»." });
    if (error instanceof HiggsfieldRejectedError || error instanceof HiggsfieldConnectError) return finish({ mockupStatus: "fallido", mockupNote: `No se envió el mockup: ${error.message}` });
    if (error instanceof HiggsfieldUnknownOutcomeError) return finish({ mockupStatus: "fallido", mockupNote: "No sabemos si el mockup llegó a Higgsfield: míralo en tu cuenta antes de repetirlo." });
    if (error instanceof HttpError) return finish({ mockupStatus: "fallido", mockupNote: error.message });
    throw error;
  }
}

/**
 * Prompts para cuando el filtro de Higgsfield bloquea el mockup (estampados con personajes): primero
 * el neutro con el otro modelo; después, la prenda o el producto plegado con el estampado pequeño y
 * suave (mismos colores y formas, menos reconocible).
 */
export const MOCKUP_BLOCKED_PROMPTS = [
  MOCKUP_FALLBACK_PROMPT,
  "Photorealistic commercial product photograph of the product in the reference image, neatly folded or arranged as a catalog flat-lay, seen slightly from above, on a neutral medium-gray seamless backdrop (roughly #929396), soft even studio light, subtle contact shadow, generous margins. Keep the exact colors, fabric, trims and overall pattern layout, but render any printed illustration small, soft and low-contrast, as a generic decorative pattern without recognizable characters, logos or text. No hands, no people, no props.",
];

/** Qué intento de mockup toca (0: el prompt de Claude; 1 y 2: los de `MOCKUP_BLOCKED_PROMPTS`). */
const mockupTry = (result: IntakeResult | null): number => result?.mockupIntentos ?? (result?.mockupReintento ? 1 : 0);

/**
 * Con texto impreso adaptado al idioma del mercado, cada mockup (también los reintentos con prompt
 * neutro) lo pide escrito exactamente así. Vacío si no hay texto que cambiar.
 */
export function printedTextClause(result: IntakeResult | null): string {
  const texts = (result?.textoImpreso ?? []).filter((t) => t.adaptado.trim() && t.adaptado.trim() !== t.original.trim());
  if (texts.length === 0) return "";
  const pairs = texts.map((t) => `"${t.original.trim()}" → "${t.adaptado.trim()}"`).join("; ");
  return ` The printed/embroidered text on the product must read in the market language, spelled exactly: ${pairs}. Same typeface, size, color, thread or print look and placement as the original text; no other text.`;
}

/** El otro Nano Banana (para reintentar un mockup que el filtro bloqueó). */
const otherImageModel = (model: ImageModel): ImageModel => IMAGE_MODELS.find((m) => m !== model) ?? model;

async function firstArticlePhoto(productId: number): Promise<number | null> {
  const [photo] = await getDb()
    .select({ id: schema.productPhotos.id })
    .from(schema.productPhotos)
    .where(and(eq(schema.productPhotos.productId, productId), inArray(schema.productPhotos.role, ["articulo", "otro"])))
    .orderBy(sql`case when ${schema.productPhotos.role} = 'articulo' then 0 else 1 end`, desc(schema.productPhotos.id))
    .limit(1);
  return photo?.id ?? null;
}

/**
 * «Generar mockup» (otra vez o aceptando el coste): con `acceptCredits`, la persona acepta hasta
 * ese coste. Deja el alta en `mockup` para que el siguiente avance lo envíe.
 */
export async function requestMockup(user: AuthUser, productId: number, acceptCredits?: unknown): Promise<Intake> {
  const product = await getProductFor(user, productId);
  let intake = await latestIntake(product.id);
  if (intake?.mockupStatus === "enviado") throw new HttpError(409, "El mockup ya se está generando.");
  if (intake && ["trayendo", "analizando"].includes(intake.status)) throw new HttpError(409, "Espera a que termine el análisis del enlace.");
  const ok = typeof acceptCredits === "number" && Number.isSafeInteger(acceptCredits) && acceptCredits > 0 ? acceptCredits : null;
  if (!intake) {
    // Producto creado a mano: un alta solo para el mockup.
    [intake] = await getDb()
      .insert(intakes)
      .values({ productId: product.id, url: product.sourceUrl ?? "https://principal.local/manual", kind: "web", country: product.countries[0] ?? "DE", createdBy: user.id, status: "mockup" })
      .returning();
  }
  // Tras un bloqueo del filtro de Higgsfield se sigue por el siguiente intento, no desde el principio.
  const previous = intake.result as IntakeResult | null;
  const blockedBefore = intake.mockupStatus === "fallido" && (intake.mockupNote ?? "").includes("filtro");
  const nextTry = blockedBefore ? Math.min(mockupTry(previous) + 1, MOCKUP_BLOCKED_PROMPTS.length) : 0;
  const fresh = previous ? { ...previous, mockupReintento: nextTry > 0, mockupIntentos: nextTry } : intake.result;
  return save(intake.id, { result: fresh, status: "mockup", mockupStatus: "pendiente", mockupJobId: null, mockupOkCredits: ok ?? intake.mockupOkCredits, mockupNote: "Preparando el mockup…", message: "Generando el mockup sobre fondo gris…", createdBy: user.id }, new Date());
}

// ───────────────────────── Para la pantalla ─────────────────────────

export interface IntakeView {
  id: number;
  url: string;
  kind: string;
  country: string;
  status: string;
  message: string | null;
  result: IntakeResult | null;
  mockupStatus: string;
  mockupCredits: number | null;
  mockupNote: string | null;
  mockupPhotoId: number | null;
  createdAt: Date;
}

export async function intakeViewFor(user: AuthUser, productId: number): Promise<IntakeView | null> {
  const product = await getProductFor(user, productId);
  const row = await latestIntake(product.id);
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    country: row.country,
    status: row.status,
    message: row.message,
    result: (row.result ?? null) as IntakeResult | null,
    mockupStatus: row.mockupStatus,
    mockupCredits: row.mockupCredits,
    mockupNote: row.mockupNote,
    mockupPhotoId: row.mockupPhotoId,
    createdAt: row.createdAt,
  };
}
