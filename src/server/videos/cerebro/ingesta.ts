import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { listCerebroProducts } from "@/server/products";
import { ensureLinkProfile, profileTaskStatus, profileDataOf, requestProfileFromMac, resetLinkProfile, type ProfileData } from "@/server/link-profiles";
import { fillPendingDna } from "./adn";
import { settleSplitTests } from "./vista";

export function shortcodeOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (/(^|\.)instagram\.com$/.test(u.hostname)) return u.pathname.match(/\/(?:reel|p|tv)\/([\w-]+)/)?.[1] ?? null;
    if (/(^|\.)tiktok\.com$/.test(u.hostname)) return u.pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
  } catch { /* Enlace no válido. */ }
  return null;
}
export function profileIdentity(url: string): { network: string; handle: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (/(^|\.)instagram\.com$/.test(u.hostname) && parts.length === 1 && !["reel", "p", "explore", "accounts"].includes(parts[0]))
      return { network: "instagram", handle: parts[0].toLowerCase() };
    if (/(^|\.)tiktok\.com$/.test(u.hostname) && parts.length === 1 && /^@[\w.]+$/.test(parts[0]))
      return { network: "tiktok", handle: parts[0].slice(1).toLowerCase() };
  } catch { /* No es un perfil. */ }
  return null;
}
export function captionSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const x = words(a), y = words(b);
  return x.size && y.size ? [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size) : 0;
}

/** Solo publicaciones de esa cuenta y red; una coincidencia ambigua se queda sin vídeo. */
export async function matchPublication(account: { network: string; handle: string }, reel: { url: string; fecha?: string | null; descripcion?: string | null }) {
  const rows = await getDb().select().from(schema.publications).where(and(
    eq(schema.publications.network, account.network as "instagram" | "facebook"),
    eq(schema.publications.status, "publicada"),
  ));
  const own = rows.filter((p) => p.account.replace(/^@/, "").toLowerCase() === account.handle.toLowerCase());
  const exact = own.filter((p) => p.resultUrl && shortcodeOf(p.resultUrl) === shortcodeOf(reel.url));
  if (exact.length === 1) return exact[0];
  if (!reel.fecha || !reel.descripcion) return null;
  const candidates = own.filter((p) => Math.abs((p.finishedAt ?? p.scheduledFor).getTime() - Date.parse(reel.fecha!)) <= 36 * 3600000 &&
    captionSimilarity(p.description, reel.descripcion!) >= 0.6);
  return candidates.length === 1 ? candidates[0] : null;
}

/** Una transacción por lectura; el único conserva la idempotencia incluso entre workers. */
export async function ingestProfile(accountId: number, data: ProfileData, observedAt: Date, source = "perfil", raw: unknown = data) {
  const [account] = await getDb().select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, accountId));
  if (!account || data.red !== account.network || data.usuario.toLowerCase() !== account.handle.toLowerCase()) return { posts: 0, metrics: 0 };
  const matched = await Promise.all(data.reels.map((r) => matchPublication(account, r)));
  return getDb().transaction(async (tx) => {
    let posts = 0, metrics = 0;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"cerebro:" + accountId}))`);
    const [fresh] = await tx.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, accountId));
    let cutoff = fresh.countFrom;
    const dates = data.reels.flatMap((r) => r.fecha ? [new Date(r.fecha)] : []).sort((a, b) => b.getTime() - a.getTime());
    if (!cutoff && fresh.countLast && dates.length >= fresh.countLast) {
      cutoff = dates[fresh.countLast - 1];
      await tx.update(schema.socialAccounts).set({ countFrom: cutoff }).where(eq(schema.socialAccounts.id, accountId));
    }
    for (const [i, reel] of data.reels.entries()) {
      const shortcode = shortcodeOf(reel.url);
      if (!shortcode) continue;
      const publication = matched[i];
      const [video] = publication ? await tx.select().from(schema.videos).where(eq(schema.videos.id, publication.videoId)) : [];
      const publishedAt = reel.fecha ? new Date(reel.fecha) : null;
      const [existing] = await tx.select().from(schema.socialPosts).where(and(eq(schema.socialPosts.network, account.network), eq(schema.socialPosts.shortcode, shortcode)));
      const fields = {
        url: reel.url,
        ...(video && existing && existing.videoId !== video.id ? { dna: null, dnaSource: null } : {}),
        ...(reel.descripcion != null ? { caption: reel.descripcion } : {}),
        ...(reel.texto != null ? { thumbText: reel.texto } : {}),
        ...(reel.miniatura != null ? { thumbnail: reel.miniatura } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(video ? { videoId: video.id, publicationId: publication!.id, productId: video.productId } : {}),
      };
      // siilvenaa cambió de producto: nunca se hereda el actual sin una publicación.
      const productId = video?.productId ?? (account.handle === "siilvenaa" ? null : account.productId);
      const [post] = await tx.insert(schema.socialPosts).values({
        accountId, network: account.network, shortcode, productId,
        ...fields, source: source === "perfil" ? "perfil" : "importado",
      }).onConflictDoUpdate({ target: [schema.socialPosts.network, schema.socialPosts.shortcode], set: fields }).returning();
      const excluded = !!(fresh.countLast && !cutoff || cutoff && (!post.publishedAt || post.publishedAt < cutoff));
      await tx.update(schema.socialPosts).set({ excluded }).where(eq(schema.socialPosts.id, post.id));
      const age = post.publishedAt ? (observedAt.getTime() - post.publishedAt.getTime()) / 3600000 : null;
      if (!existing) posts++;
      const inserted = await tx.insert(schema.socialMetrics).values({
        postId: post.id, observedAt, views: reel.vistas, comments: reel.comentarios ?? null, likes: reel.megusta ?? null,
        ageHours: age !== null && age >= 0 ? age : null, rounded: reel.rounded ?? false, source, raw,
      }).onConflictDoNothing().returning({ id: schema.socialMetrics.id });
      metrics += inserted.length;
    }
    // Al fijar el corte se corrigen también los posts ya observados.
    if (cutoff) await tx.update(schema.socialPosts).set({
      excluded: sql`${schema.socialPosts.publishedAt} is null or ${schema.socialPosts.publishedAt} < ${cutoff}`,
    }).where(eq(schema.socialPosts.accountId, accountId));
    return { posts, metrics };
  });
}
export async function ingestReadyProfile(url: string) {
  const identity = profileIdentity(url);
  if (!identity) return;
  const [account] = await getDb().select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.network, identity.network), eq(schema.socialAccounts.handle, identity.handle)));
  const [profile] = await getDb().select().from(schema.linkProfiles).where(eq(schema.linkProfiles.url, url));
  const data = profileDataOf(profile?.data);
  if (account && profile?.status === "ready" && data) await ingestProfile(account.id, data, profile.updatedAt);
}

/** Cada fallo queda aislado: el barrido siguiente recupera lecturas y ADN pendientes. */
export async function cerebroSweep(now = new Date()): Promise<void> {
  try {
    for (const product of await listCerebroProducts()) {
      const identity = product.sourceUrl && profileIdentity(product.sourceUrl);
      if (identity) await getDb().insert(schema.socialAccounts).values({ ...identity, kind: "competidor", productId: product.id, country: product.countries[0] ?? "DE" }).onConflictDoNothing();
    }
    for (const account of await getDb().select().from(schema.socialAccounts)) {
      try {
        if (!["instagram", "tiktok"].includes(account.network)) continue;
        const url = account.network === "instagram" ? `https://www.instagram.com/${account.handle}/` : `https://www.tiktok.com/@${account.handle}`;
        const profile = await ensureLinkProfile(url);
        if (profile.status === "ready") await ingestReadyProfile(url);
        if (profile.status === "pending" && ["queued", "leased"].includes(await profileTaskStatus(profile) ?? "")) continue;
        // Las propias, cada 6 h (lecturas cerca de las 24, 48 y 72 h); los competidores de un producto, una vez al día;
        // las cuentas que solo vienen del histórico no se vuelven a leer (no cargar el Mac ni la sesión de Instagram).
        const every = account.kind === "propia" ? 6 : account.productId !== null ? 24 : null;
        if (every === null) continue;
        if (profile.agentTaskId === null || now.getTime() - profile.updatedAt.getTime() > every * 3600000) {
          await resetLinkProfile(url);
          await requestProfileFromMac(await ensureLinkProfile(url), now);
        }
      } catch (error) { cerebroError(error); }
    }
    await fillPendingDna({ limit: 60 });
    await settleSplitTests(now);
  } catch (error) { cerebroError(error); }
}
export function cerebroError(error: unknown) {
  console.error("[cerebro]", error instanceof Error ? error.message : "Fallo del barrido");
}
