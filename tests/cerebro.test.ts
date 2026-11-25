import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createGateway } from "@/llm/gateway";
import { fillPendingDna } from "@/server/videos/cerebro/adn";
import { ingestProfile, matchPublication } from "@/server/videos/cerebro/ingesta";
import { loadHistorical } from "@/server/videos/cerebro/importacion";
import { profileDataOf, type ProfileData } from "@/server/link-profiles";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";
import { fakeMessages } from "./helpers/fake-llm";

const now = new Date("2026-11-25T12:00:00Z");
function profile(handle = "eiswerrk"): ProfileData {
  return { red: "instagram", usuario: handle, cabecera: "", descripcion: null, enlaces: [],
    reels: [{ url: "https://www.instagram.com/reel/ABC123/", vistas: 36400, texto: "Regalo", miniatura: null,
      fecha: "2026-11-24T12:00:00Z", descripcion: "El regalo perfecto para celebrar juntos esta Navidad", comentarios: 12, megusta: null, rounded: true }] };
}
async function fixture(handle = "eiswerrk", countLast: number | null = null) {
  const owner = await makeUser("dueno");
  const product = await makeProduct(owner);
  const [account] = await getDb().insert(schema.socialAccounts).values({ network: "instagram", handle, kind: "propia", productId: product.id, countLast }).returning();
  return { owner, product, account };
}
describe("cerebro de cuentas", () => {
  beforeEach(truncateAll);
  it("una lectura crea posts y métricas una sola vez; calcula edad real y conserva ceros", async () => {
    const { account } = await fixture();
    const data = profile();
    data.reels[0].comentarios = 0;
    await ingestProfile(account.id, data, now);
    await ingestProfile(account.id, data, now);
    expect(await getDb().select().from(schema.socialPosts)).toHaveLength(1);
    expect(await getDb().select().from(schema.socialMetrics)).toMatchObject([{ ageHours: 24, views: 36400, comments: 0, likes: null, rounded: true }]);
    data.reels[0].fecha = null;
    await ingestProfile(account.id, data, new Date(now.getTime() + 3600000));
    expect(await getDb().select().from(schema.socialMetrics)).toHaveLength(2);
    expect((await getDb().select().from(schema.socialPosts))[0].publishedAt).not.toBeNull();
  });
  it("WollZauber fija el penúltimo por fecha, no por orden de cuadrícula, y no desplaza el corte", async () => {
    const { account } = await fixture("itswollzauber", 2);
    const data = profile("itswollzauber");
    data.reels.push({ ...data.reels[0], url: "https://www.instagram.com/reel/OLD/", fecha: "2026-11-20T12:00:00Z" },
      { ...data.reels[0], url: "https://www.instagram.com/reel/NEW/", fecha: "2026-11-25T10:00:00Z" });
    await ingestProfile(account.id, data, now);
    const [saved] = await getDb().select().from(schema.socialAccounts);
    expect(saved.countFrom?.toISOString()).toBe("2026-11-24T12:00:00.000Z");
    expect((await getDb().select().from(schema.socialPosts)).filter((p) => !p.excluded)).toHaveLength(2);
    await ingestProfile(account.id, { ...data, reels: data.reels.slice(0, 1) }, new Date(now.getTime() + 3600000));
    expect((await getDb().select().from(schema.socialAccounts))[0].countFrom).toEqual(saved.countFrom);
  });
  it("siilvenaa sin coincidencia no hereda FalterPfote", async () => {
    const { account } = await fixture("siilvenaa");
    await ingestProfile(account.id, profile("siilvenaa"), now);
    expect((await getDb().select().from(schema.socialPosts))[0].productId).toBeNull();
  });
  it("empareja por shortcode y por ±36 h y 60% de palabras, sin cruzar cuentas", async () => {
    const { owner, product, account } = await fixture();
    const [phone] = await getDb().insert(schema.phones).values({ name: "Teléfono" }).returning();
    const [video] = await getDb().insert(schema.videos).values({ productId: product.id, createdBy: owner.id, title: "Reel" }).returning();
    const [edit] = await getDb().insert(schema.edits).values({ videoId: video.id, version: 1, size: 4, data: Buffer.from("test"), durationMs: 1000 }).returning();
    const [publication] = await getDb().insert(schema.publications).values({ videoId: video.id, editId: edit.id, phoneId: phone.id, network: "instagram", account: account.handle,
      description: profile().reels[0].descripcion!, status: "publicada", scheduledFor: now, finishedAt: now, resultUrl: "https://www.instagram.com/eiswerrk/reel/ABC123/?x=1" }).returning();
    await ingestProfile(account.id, profile(), now);
    expect((await getDb().select().from(schema.socialPosts))[0]).toMatchObject({ publicationId: publication.id, videoId: video.id, productId: product.id });
    expect((await matchPublication(account, { ...profile().reels[0], url: "https://www.instagram.com/reel/DIFFERENT/" }))?.id).toBe(publication.id);
    expect(await matchPublication({ ...account, handle: "otra" }, profile().reels[0])).toBeNull();
    expect(await matchPublication(account, { ...profile().reels[0], url: "https://www.instagram.com/reel/DIFFERENT/", fecha: "2025-01-01T00:00:00Z" })).toBeNull();
  });
  it("ADN estimado con Haiku falso, gasto del creador y reintento tras fallo", async () => {
    const { owner, account } = await fixture();
    await ingestProfile(account.id, profile(), now);
    const fake = fakeMessages([{ text: JSON.stringify({ angulo: "regalo de Navidad", fondo: "salón", texto: "Regalo", cancion: "desconocido" }) }]);
    await fillPendingDna({ gateway: createGateway({ client: fake.client }) });
    await fillPendingDna({ gateway: createGateway({ client: fake.client }) });
    expect(fake.calls).toHaveLength(1);
    expect((await getDb().select().from(schema.socialPosts))[0]).toMatchObject({ dnaSource: "estimado", dna: { angulo: "regalo de Navidad" } });
    expect((await getDb().select().from(schema.spendEntries))[0].userId).toBe(owner.id);
  });
  it("ADN PRINCIPAL conserva rótulo y sitio reales; un fallo de Haiku queda pendiente", async () => {
    const { owner, product, account } = await fixture();
    await ingestProfile(account.id, profile(), now);
    const [video] = await getDb().insert(schema.videos).values({ productId: product.id, createdBy: owner.id, title: "Reel", editMainText: "Rótulo final" }).returning();
    await getDb().insert(schema.videoAnalyses).values({ videoId: video.id, version: 1, createdBy: owner.id, status: "done",
      result: { conceptLogic: "Reacción al regalo", shots: [{ onScreenText: "Propuesta antigua" }], places: [{ place: "kitchen" }] } });
    await getDb().update(schema.socialPosts).set({ videoId: video.id });
    const failed = fakeMessages([{ error: new Error("Sin conexión") }]);
    await fillPendingDna({ gateway: createGateway({ client: failed.client }) });
    expect((await getDb().select().from(schema.socialPosts))[0].dna).toBeNull();
    const fake = fakeMessages([{ text: JSON.stringify({ angulo: "regalo de Navidad", fondo: "inventado", texto: "inventado", cancion: "inventada" }) }]);
    await fillPendingDna({ gateway: createGateway({ client: fake.client }) });
    const [post] = await getDb().select().from(schema.socialPosts);
    expect(post).toMatchObject({ dnaSource: "principal", dna: { fondo: "kitchen", texto: "Rótulo final", cancion: "audio original" } });
    // Una lectura posterior mantiene el ADN si conserva el mismo vídeo.
    await ingestProfile(account.id, profile(), new Date(now.getTime() + 3600000));
    expect((await getDb().select().from(schema.socialPosts))[0].dna).toEqual(post.dna);
  });
  it("--cargar normalizado no necesita disco del Mac y es idempotente", async () => {
    const input = { version: 1, discarded: [], observations: [{
      network: "instagram", handle: "eiswerrk", kind: "propia", product: null,
      url: "https://www.instagram.com/reel/IMPORT/", observedAt: now.toISOString(), publishedAt: null,
      views: 105000, comments: null, likes: null, rounded: true, caption: null, ageHours: 44,
      source: "prueba", path: "/no-existe/fuente.json", sha256: "a".repeat(64), evidence: { age_display: "aprox. 44 h" }, dna: null,
    }] };
    await loadHistorical(input);
    await loadHistorical(input);
    expect(await getDb().select().from(schema.socialPosts)).toHaveLength(1);
    expect(await getDb().select().from(schema.socialMetrics)).toMatchObject([{ ageHours: 44, views: 105000 }]);
  });
  it("limpia fecha, contadores y descripción sin convertir ausencias a cero", () => {
    const cleaned = profileDataOf({ ...profile(), reels: [{ ...profile().reels[0], comentarios: -1, megusta: 0, fecha: "mal", vistasTexto: "36,4 mil" }] })!;
    expect(cleaned.reels[0]).toMatchObject({ comentarios: null, megusta: 0, fecha: null, rounded: true });
  });
});

describe("cerebro de cuentas: vista y split tests", () => {
  beforeEach(truncateAll);
  it("un reel propio muy por encima de su mediana sale como candidato (paso 1: gancho) y su test se decide a las 72 h", async () => {
    const { owner, account } = await fixture();
    const reels = [1000, 1100, 1200, 1300, 1400, 9000].map((v, i) => ({
      url: `https://www.instagram.com/reel/R${i}/`, vistas: v, texto: null, miniatura: null, fecha: "2026-11-20T12:00:00Z", descripcion: null, comentarios: 3, megusta: null, rounded: false,
    }));
    await ingestProfile(account.id, { ...profile(), reels }, new Date("2026-11-23T12:00:00Z"));
    const { cerebroView, settleSplitTests } = await import("@/server/videos/cerebro/vista");
    const view = await cerebroView(now);
    expect(view.note).toBe("Mide vistas y comentarios, no ventas.");
    expect(view.candidates).toHaveLength(1);
    expect(view.candidates[0]).toMatchObject({ handle: "eiswerrk", pillar: "gancho", step: 1 });
    const star = view.candidates[0].post;

    // El lote del test publica su reel; con 72 h y por encima de la mediana, el test «vuelve a funcionar» y toca el texto.
    const [batch] = await getDb().insert(schema.batches).values({ name: "Split", createdBy: owner.id }).returning();
    const [video] = await getDb().insert(schema.videos).values({ productId: star.productId!, createdBy: owner.id, title: "v", batchId: batch.id }).returning();
    await getDb().insert(schema.splitTests).values({ basePostId: star.id, pillar: "gancho", step: 1, batchId: batch.id });
    await ingestProfile(account.id, { ...profile(), reels: [{ ...reels[5], url: "https://www.instagram.com/reel/TEST1/", vistas: 7000, fecha: "2026-11-21T12:00:00Z" }] }, new Date("2026-11-24T12:00:00Z"));
    await getDb().update(schema.socialPosts).set({ videoId: video.id }).where(eq(schema.socialPosts.shortcode, "TEST1"));
    await settleSplitTests(now);
    const [test] = await getDb().select().from(schema.splitTests);
    expect(test.status).toBe("ganador");
    const after = await cerebroView(now);
    expect(after.candidates.find((c) => c.post.id === star.id)).toMatchObject({ pillar: "texto", step: 2 });
  });
});
