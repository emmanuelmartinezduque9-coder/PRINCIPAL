import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { listCerebroProducts } from "@/server/products";
import { ingestProfile, shortcodeOf } from "./ingesta";
import { dnaSchema } from "./adn";

const count = z.number().int().nonnegative().nullable();
export const historicalSchema = z.object({
  version: z.literal(1),
  observations: z.array(z.object({
    network: z.enum(["instagram", "tiktok"]), handle: z.string().min(1),
    kind: z.enum(["propia", "competidor"]), product: z.string().nullable(),
    url: z.url(), observedAt: z.iso.datetime(), publishedAt: z.iso.datetime().nullable(),
    caption: z.string().nullable(), views: count, comments: count, likes: count,
    rounded: z.boolean(), ageHours: z.number().nonnegative().nullable(),
    source: z.string().min(1), path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    evidence: z.record(z.string(), z.unknown()), dna: dnaSchema.nullable(),
  })),
  requestedDna: z.array(z.object({ path: z.string(), sha256: z.string(), data: z.record(z.string(), z.unknown()) })).default([]),
  discarded: z.array(z.object({ path: z.string(), reason: z.string() })),
});
export type HistoricalData = z.infer<typeof historicalSchema>;

/** Solo consume el documento normalizado: no accede a ninguna ruta del Mac. */
export async function loadHistorical(input: unknown) {
  const data = historicalSchema.parse(input);
  const products = await listCerebroProducts();
  let posts = 0, metrics = 0, accounts = 0;
  for (const observation of data.observations) {
    const shortcode = shortcodeOf(observation.url);
    if (!shortcode) throw new Error("Observación sin shortcode válido");
    const product = products.find((p) => p.name.toLowerCase() === observation.product?.toLowerCase());
    const productId = product?.id ?? null;
    const inserted = await getDb().insert(schema.socialAccounts).values({
      network: observation.network, handle: observation.handle, kind: observation.kind, productId, country: product?.countries[0] ?? (["eiswerrk", "siilvenaa", "haarzauberr", "itswollzauber"].includes(observation.handle) ? "DE" : ""),
    }).onConflictDoNothing().returning();
    accounts += inserted.length;
    const [account] = await getDb().select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.network, observation.network), eq(schema.socialAccounts.handle, observation.handle)));
    // Una referencia del histórico no puede contaminar una cuenta propia ya registrada.
    if (account.kind !== observation.kind) throw new Error("Identidad propia/competidor incompatible");
    const source = `importado:${observation.source}:${observation.sha256}`;
    const insertedCounts = await ingestProfile(account.id, {
      red: observation.network, usuario: observation.handle, cabecera: "", descripcion: null, enlaces: [],
      reels: [{ url: observation.url, vistas: observation.views, texto: null, miniatura: null, fecha: observation.publishedAt,
        descripcion: observation.caption, comentarios: observation.comments, megusta: observation.likes, rounded: observation.rounded }],
    }, new Date(observation.observedAt), source, { path: observation.path, sha256: observation.sha256, evidence: observation.evidence });
    const [post] = await getDb().select().from(schema.socialPosts).where(and(eq(schema.socialPosts.network, observation.network), eq(schema.socialPosts.shortcode, shortcode)));
    posts += insertedCounts.posts;
    // Cuando la fuente solo documenta edad, se conserva esa edad literal sin inventar fecha.
    await getDb().update(schema.socialMetrics).set({ ageHours: observation.ageHours }).where(and(eq(schema.socialMetrics.postId, post.id), eq(schema.socialMetrics.source, source), eq(schema.socialMetrics.observedAt, new Date(observation.observedAt))));
    if (observation.dna) await getDb().update(schema.socialPosts).set({ dna: observation.dna, dnaSource: "importado" }).where(and(eq(schema.socialPosts.id, post.id), eq(schema.socialPosts.source, "importado")));
    metrics += insertedCounts.metrics;
  }
  return { posts, metrics, accounts, discarded: data.discarded };
}
