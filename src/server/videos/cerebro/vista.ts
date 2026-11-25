import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { listCerebroProducts } from "@/server/products";
import { addVideoToBatch, createBatch } from "@/server/videos/batches";
import { sendBatch } from "@/server/videos/lote";
import {
  DNA_KEYS,
  inheritedFor,
  median,
  pieceStats,
  scorePosts,
  splitCandidates,
  winningTexts,
  type ModelAccount,
  type ModelPost,
  type Pillar,
  type PieceStat,
  type ScoredPost,
  type SplitHistory,
} from "./modelo";

/**
 * La vista «Cerebro de cuentas» (`docs/cerebro-cuentas.md`): se calcula al abrirla con todas las lecturas guardadas,
 * así que cada métrica nueva la cambia sola. Solo vistas y comentarios, nunca ventas.
 */

const PILLAR_NOTES: Record<Pillar, (text: string | null) => string> = {
  gancho: () =>
    "Split test, paso 1 (regla fija de split testing): replica este reel nuestro cambiando SOLO el gancho (los primeros segundos), regenerado con Genjutsu Motion Transfer. Conserva el mismo texto en pantalla, la misma canción y la misma edición del reel.",
  texto: (text) =>
    `Split test, paso 2: el gancho ya volvió a funcionar. Replica este reel nuestro igual (gancho, canción y edición) y cambia SOLO el texto en pantalla con una variación mínima: otra redacción o emoji, el mismo significado.${text ? ` Texto que se varía: «${text}».` : ""}`,
  fondo: () => "Split test: replica este reel nuestro igual y cambia SOLO el fondo por otro sitio real del mismo tipo, del país del producto. Conserva gancho, texto, canción y edición.",
  cancion: () => "Split test: replica este reel nuestro igual y cambia SOLO la canción por otra de la biblioteca con el mismo ritmo. Conserva gancho, texto, fondo y edición.",
};

interface ModelData {
  accounts: Array<ModelAccount & { country: string; countFrom: Date | null }>;
  posts: ModelPost[];
  history: Array<SplitHistory & { id: number; batchId: number | null; status: string; createdAt: Date }>;
  productNames: Map<number, string>;
  thumbs: Map<number, { thumbnail: string | null; caption: string | null; dnaSource: string | null }>;
}

async function loadModelData(): Promise<ModelData> {
  const db = getDb();
  const accountRows = await db.select().from(schema.socialAccounts).orderBy(asc(schema.socialAccounts.id));
  const postRows = await db.select().from(schema.socialPosts);
  const metricRows = postRows.length ? await db.select().from(schema.socialMetrics) : [];
  const tests = await db.select().from(schema.splitTests).orderBy(asc(schema.splitTests.id));
  const products = await listCerebroProducts();
  const readings = new Map<number, ModelPost["readings"]>();
  for (const m of metricRows) readings.set(m.postId, [...(readings.get(m.postId) ?? []), { ageHours: m.ageHours, views: m.views, comments: m.comments }]);
  return {
    accounts: accountRows.map((a) => ({ id: a.id, handle: a.handle, productId: a.productId, kind: a.kind as "propia" | "competidor", country: a.country, countFrom: a.countFrom })),
    posts: postRows.map((p) => ({
      id: p.id,
      accountId: p.accountId,
      productId: p.productId,
      shortcode: p.shortcode,
      url: p.url,
      videoId: p.videoId,
      publishedAt: p.publishedAt,
      excluded: p.excluded,
      dna: p.dna ? { angulo: p.dna.angulo, cta: p.dna.cta, fondo: p.dna.fondo, texto: p.dna.texto, cancion: p.dna.cancion } : {},
      readings: readings.get(p.id) ?? [],
    })),
    history: tests.map((t) => ({
      id: t.id,
      basePostId: t.basePostId,
      pillar: t.pillar as Pillar,
      step: t.step,
      batchId: t.batchId,
      status: t.status,
      createdAt: t.createdAt,
      won: t.status === "ganador" ? true : t.status === "perdedor" ? false : null,
    })),
    productNames: new Map(products.map((p) => [p.id, p.name])),
    thumbs: new Map(postRows.map((p) => [p.id, { thumbnail: p.thumbnail, caption: p.caption, dnaSource: p.dnaSource }])),
  };
}

const UNKNOWN = /^(desconocido|unknown|ninguna|n\/a|-)$/i;
const usable = (s: PieceStat) => !UNKNOWN.test(s.value.trim());

function postView(p: ScoredPost, data: ModelData) {
  const extra = data.thumbs.get(p.id);
  return {
    id: p.id,
    shortcode: p.shortcode,
    url: p.url,
    videoId: p.videoId,
    productId: p.productId,
    publishedAt: p.publishedAt,
    w24: p.w24,
    w48: p.w48,
    w72: p.w72,
    v72: p.v72,
    v72Exact: p.v72Exact,
    cpk: p.cpk,
    ratio: p.ratio,
    hit: p.hit,
    excluded: p.excluded,
    dna: p.dna,
    dnaSource: extra?.dnaSource ?? null,
    caption: extra?.caption ?? null,
  };
}

export async function cerebroView(now: Date = new Date()) {
  const data = await loadModelData();
  const scored = scorePosts(data.accounts, data.posts);
  const ownIds = new Set(data.accounts.filter((a) => a.kind === "propia").map((a) => a.id));
  // El modelo de recomendaciones se aprende de las cuentas propias; los competidores se ven aparte.
  const own = scored.filter((p) => ownIds.has(p.accountId));
  const stats = pieceStats(own);
  const commentStats = pieceStats(own, (p) => p.commentHit);
  const top = (list: PieceStat[]) => list.filter(usable);
  const accounts = data.accounts
    .filter((a) => a.kind === "propia")
    .map((a) => {
      const mine = scored.filter((p) => p.accountId === a.id);
      const counted = mine.filter((p) => !p.excluded && p.v72 !== null);
      const inherited = !stats.byAccount.has(a.id);
      return {
        id: a.id,
        handle: a.handle,
        product: a.productId !== null ? data.productNames.get(a.productId) ?? null : null,
        country: a.country,
        countFrom: a.countFrom,
        reels: counted.length,
        median: median(counted.map((p) => p.v72!)),
        medianFrom: counted[0]?.baselineFrom ?? null,
        inherited,
        works: top(inheritedFor(a, stats)).slice(0, 8),
        recent: [...mine].filter((p) => p.v72 !== null || p.cpk !== null).sort((x, y) => (y.publishedAt?.getTime() ?? 0) - (x.publishedAt?.getTime() ?? 0)).slice(0, 8).map((p) => postView(p, data)),
      };
    });
  const candidates = splitCandidates(data.accounts, scored, data.history, now).map((c) => ({
    post: postView(c.post, data),
    handle: data.accounts.find((a) => a.id === c.post.accountId)?.handle ?? "",
    pillar: c.pillar,
    step: c.step,
    why: c.why,
    running: data.history.some((h) => h.basePostId === c.post.id && h.won === null),
  }));
  const competitors = data.accounts.filter((a) => a.kind === "competidor");
  return {
    note: "Mide vistas y comentarios, no ventas.",
    totals: {
      accounts: accounts.length,
      reels: own.filter((p) => !p.excluded).length,
      readings: data.posts.filter((p) => ownIds.has(p.accountId)).reduce((n, p) => n + p.readings.length, 0),
      competitors: competitors.length,
      withDna: own.filter((p) => DNA_KEYS.some((k) => p.dna[k])).length,
    },
    accounts,
    global: Object.fromEntries(DNA_KEYS.map((k) => [k, top(stats.global).filter((s) => s.key === k).slice(0, 8)])) as Record<(typeof DNA_KEYS)[number], PieceStat[]>,
    comments: top(commentStats.global).filter((s) => s.key === "angulo").slice(0, 6),
    candidates,
    tests: data.history.map((h) => ({ id: h.id, basePostId: h.basePostId, pillar: h.pillar, step: h.step, batchId: h.batchId, status: h.status, createdAt: h.createdAt })),
    texts: winningTexts(own, stats.global),
    postAccounts: Object.fromEntries(data.posts.map((p) => [p.id, data.accounts.find((a) => a.id === p.accountId)?.handle ?? ""])),
  };
}

export type CerebroView = Awaited<ReturnType<typeof cerebroView>>;

/**
 * «Crear split test»: un lote con el reel ganador como referencia y, en la tarjeta, el único pilar que cambia según la
 * regla (paso 1, el gancho; paso 2, el texto si el gancho volvió a funcionar…). El lote se envía solo, como cualquiera.
 */
export async function createSplitTest(user: AuthUser, postId: number, now: Date = new Date()): Promise<{ batchId: number; splitTestId: number; sent: boolean }> {
  if (user.role !== "dueno") throw new HttpError(403, "Solo el dueño crea split tests.");
  const data = await loadModelData();
  const scored = scorePosts(data.accounts, data.posts);
  const candidate = splitCandidates(data.accounts, scored, data.history, now, 1000).find((c) => c.post.id === postId);
  if (!candidate) throw new HttpError(404, "Ese reel ya no es candidato a split test.");
  if (!candidate.pillar) throw new HttpError(409, candidate.why);
  if (data.history.some((h) => h.basePostId === postId && h.won === null)) throw new HttpError(409, "Ya hay un split test en marcha de este reel.");
  const account = data.accounts.find((a) => a.id === candidate.post.accountId)!;
  const productId = candidate.post.productId ?? account.productId;
  if (productId === null || !candidate.post.url) throw new HttpError(409, "Ese reel no tiene producto o enlace: no se puede replicar.");
  const [base] = candidate.post.videoId ? await getDb().select({ songId: schema.videos.songId }).from(schema.videos).where(eq(schema.videos.id, candidate.post.videoId)) : [];
  const batch = await createBatch(user, `Split test · @${account.handle} · ${candidate.pillar} (paso ${candidate.step})`);
  await addVideoToBatch(user, batch.id, {
    productId,
    avatarPhotoId: null,
    avatarMode: "automatico",
    linkUrl: candidate.post.url,
    note: PILLAR_NOTES[candidate.pillar](candidate.post.dna.texto ?? null),
    ...(base?.songId ? { songId: base.songId } : {}),
  });
  const [test] = await getDb()
    .insert(schema.splitTests)
    .values({ basePostId: postId, pillar: candidate.pillar, step: candidate.step, batchId: batch.id, status: "en_marcha" })
    .returning();
  let sent = true;
  try {
    await sendBatch(user, batch.id);
  } catch (error) {
    // Se queda en borrador y el lote lo enseña; no se pierde el test.
    sent = false;
    console.error("[cerebro] split test sin enviar:", error instanceof Error ? error.message : error);
  }
  return { batchId: batch.id, splitTestId: test.id, sent };
}

/**
 * Para el barrido: un split test en marcha se decide cuando sus reels publicados tienen 72 h. Gana si alguno supera la
 * mediana de su cuenta (vuelve a funcionar); si no, pierde y el concepto no se sigue variando.
 */
export async function settleSplitTests(now: Date = new Date()): Promise<void> {
  const db = getDb();
  const running = await db.select().from(schema.splitTests).where(eq(schema.splitTests.status, "en_marcha"));
  if (!running.length) return;
  const data = await loadModelData();
  const scored = scorePosts(data.accounts, data.posts);
  for (const test of running) {
    if (!test.batchId) continue;
    const videos = await db.select({ id: schema.videos.id }).from(schema.videos).where(eq(schema.videos.batchId, test.batchId));
    const ids = videos.map((v) => v.id);
    if (!ids.length) continue;
    const posts = await db.select({ id: schema.socialPosts.id }).from(schema.socialPosts).where(inArray(schema.socialPosts.videoId, ids));
    const mine = scored.filter((p) => posts.some((x) => x.id === p.id));
    if (!mine.length) continue;
    const ready = mine.every((p) => p.publishedAt !== null && (now.getTime() - p.publishedAt.getTime()) / 3_600_000 >= 72 && p.v72 !== null);
    if (!ready) {
      await db.update(schema.splitTests).set({ postIds: mine.map((p) => p.id) }).where(eq(schema.splitTests.id, test.id));
      continue;
    }
    const won = mine.some((p) => p.hit);
    await db
      .update(schema.splitTests)
      .set({ status: won ? "ganador" : "perdedor", postIds: mine.map((p) => p.id), result: { posts: mine.map((p) => ({ id: p.id, v72: p.v72, ratio: p.ratio })) } })
      .where(and(eq(schema.splitTests.id, test.id), eq(schema.splitTests.status, "en_marcha")));
  }
}
