import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, getPool, schema } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { createGateway } from "@/llm/gateway";
import { distill } from "@/server/videos/aprendizaje/destilar";
import { learningByBatch } from "@/server/videos/aprendizaje/medicion";
import { choosePreferred, preferencesFor, preferredChoice, recomputeWeight, settleApplications } from "@/server/videos/aprendizaje/preferencias";
import { collectSignals, ownerRejection } from "@/server/videos/aprendizaje/senales";
import { approveResult } from "@/server/videos/generations";
import { createVideo } from "@/server/videos/videos";
import { fakeMessages } from "./helpers/fake-llm";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

afterAll(stopWorker);

async function fixture() {
  const user = await makeUser("dueno");
  const product = await makeProduct(user, { countries: ["DE"] });
  const [b1, b2] = await getDb().insert(schema.batches).values([{ name: "Uno", createdBy: user.id }, { name: "Dos", createdBy: user.id }]).returning();
  const a = await createVideo(user, product.id, { batchId: b1.id });
  const b = await createVideo(user, product.id, { batchId: b2.id });
  return { user, product, b1, b2, a, b };
}

async function generation(videoId: number, userId: number, kind = "frame", reason: string | null = null, count = 1) {
  const [g] = await getDb().insert(schema.generations).values({ videoId, userId, kind, round: 1, status: "done", rejectReason: reason, request: {}, count, quotedCredits: 0 }).returning();
  const results = await getDb().insert(schema.generationResults).values(Array.from({ length: count }, (_, index) => ({ generationId: g.id, index, jobId: `test-${g.id}-${index}`, ok: true }))).returning();
  if (reason) await getDb().update(schema.videos).set({ updatedAt: new Date() }).where(eq(schema.videos.id, videoId));
  return { g, results };
}

describe("aprendizaje persistido", () => {
  beforeEach(truncateAll);
  it("ciclo: rechazo, Haiku, aplicación en DE, aprobación sube y otra corrección baja", async () => {
    const { user, product, b1, b2, a, b } = await fixture();
    // Dos vídeos del lote 1 rechazados por lo mismo: con uno solo no sale una regla para los demás.
    const a2 = await createVideo(user, product.id, { batchId: b1.id });
    await generation(a.id, user.id, "frame", "fondo de estudio no, calle real");
    await generation(a2.id, user.id, "frame", "otra vez estudio: quiero una calle de verdad");
    const captured = [...(await collectSignals({ videoId: a.id })), ...(await collectSignals({ videoId: a2.id }))];
    const rejections = captured.filter((s) => s.kind === "rechazado");
    expect(rejections).toHaveLength(2);
    const rejection = rejections[0];
    expect(rejection).toMatchObject({ country: "DE", polarity: -1, stage: "imagen" });
    const answer = (signalIds: number[]) => JSON.stringify({ topics: signalIds.map((signalId) => ({ signalId, topic: "fondo-real" })), preferences: [{ scope: "pais", scopeValue: "DE", stages: ["imagen"], directive: "Usar una calle real, sin fondo de estudio.", directiveEn: "Use a real street, no studio background.", polarity: 1, topic: "fondo-real", signalIds }], reinforcements: [] });
    // Un solo vídeo no basta, aunque Haiku la proponga.
    const lonely = fakeMessages([{ text: answer([rejection.id]) }]);
    await distill("diario", undefined, { gateway: createGateway({ client: lonely.client }) });
    expect(await getDb().select().from(schema.learnedPreferences)).toHaveLength(0);
    await getDb().update(schema.learningSignals).set({ distilledAt: null });
    const fake = fakeMessages([{ text: answer(rejections.map((r) => r.id)) }]);
    await distill("lote", b1.id, { gateway: createGateway({ client: fake.client }) });
    await distill("lote", b1.id, { gateway: createGateway({ client: fake.client }) });
    expect(fake.calls).toHaveLength(1);
    const [p] = await getDb().select().from(schema.learnedPreferences);
    expect(p.scope).toBe("pais");
    const carried = await preferencesFor("imagen", { videoId: b.id });
    expect(carried.text).toContain(p.directiveEn);
    expect(carried.ids).toEqual([p.id]);
    expect(await preferencesFor("imagen", { videoId: b.id, country: "IT" })).toEqual({ text: "", ids: [] });
    expect((await getDb().select().from(schema.preferenceApplications))).toHaveLength(1);
    const { results } = await generation(b.id, user.id);
    await approveResult(user, b.id, "frame", results[0].id);
    const [after] = await getDb().select().from(schema.learnedPreferences).where(eq(schema.learnedPreferences.id, p.id));
    expect(after.weight).toBeGreaterThan(p.weight);
    const c = await createVideo(user, product.id, { batchId: b2.id });
    await preferencesFor("imagen", { videoId: c.id });
    await generation(c.id, user.id, "frame", "No encaja el fondo");
    await collectSignals({ videoId: c.id });
    const [lower] = await getDb().select().from(schema.learnedPreferences).where(eq(schema.learnedPreferences.id, p.id));
    expect(lower.weight).toBeLessThan(after.weight);
    expect((await getDb().select().from(schema.learningRuns))).toHaveLength(2);
    // Los dos vídeos que la sostienen cuentan como apoyos.
    expect(after.supports).toBe(2);
  });

  it("dos capturas no duplican; las otras candidatas buenas quedan descartadas", async () => {
    const { user, a } = await fixture();
    const { results } = await generation(a.id, user.id, "frame", null, 2);
    await approveResult(user, a.id, "frame", results[0].id);
    const before = await getDb().select().from(schema.learningSignals);
    expect(before.filter((s) => s.kind === "candidata_descartada")).toHaveLength(1);
    expect(await collectSignals({ videoId: a.id })).toEqual([]);
    expect((await getDb().select().from(schema.learningSignals))).toHaveLength(before.length);
  });

  it("dos elecciones iguales producen una variante preferida sin IA, solo entre opciones existentes", async () => {
    const { user, product, b1, a, b } = await fixture();
    const { rows: [variant] } = await getPool().query("insert into product_variants(product_id, name, created_by) values ($1, 'Roja', $2) returning id", [product.id, user.id]);
    await getDb().update(schema.videos).set({ variantId: Number(variant.id) }).where(eq(schema.videos.id, a.id));
    await getDb().update(schema.videos).set({ variantId: Number(variant.id) }).where(eq(schema.videos.id, b.id));
    await collectSignals();
    await distill("lote", b1.id);
    expect(await preferredChoice("variante", { videoId: b.id }, ["var:todas", `var:${variant.id}`])).toBe(`var:${variant.id}`);
    expect(choosePreferred(["var:todas"], [{ value: `var:${variant.id}` }])).toBeNull();
  });

  it("cuenta temas repetidos por país y lote y filtra los vídeos de un colaborador", async () => {
    const { user, b1, b2, a, b } = await fixture();
    await generation(a.id, user.id, "frame", "Calle real");
    await generation(b.id, user.id, "frame", "Otra vez fondo de estudio");
    await collectSignals();
    await getDb().update(schema.learningSignals).set({ topic: "fondo-real" }).where(eq(schema.learningSignals.kind, "rechazado"));
    const metrics = await learningByBatch(user);
    expect(metrics.find((m) => m.batchId === b1.id)).toMatchObject({ corrections: 1, repeated: 0, correctionsPerVideo: 1 });
    expect(metrics.find((m) => m.batchId === b2.id)).toMatchObject({ corrections: 1, repeated: 1 });
    const outsider = await makeUser("colaborador");
    expect(await learningByBatch(outsider)).toEqual([]);
  });

  it("ignora la corrección automática del sistema y captura la del dueño", async () => {
    const { user, a, b } = await fixture();
    await generation(a.id, user.id, "frame", "Corrección automática: hay dedos extra");
    await generation(b.id, user.id, "frame", "Corrección automática: del dueño: calle real");
    const captured = await collectSignals();
    expect(captured.filter((s) => s.kind === "rechazado").map((s) => s.text)).toEqual(["calle real"]);
    expect(ownerRejection("Corrección automática: error del sistema")).toBeNull();
  });

  it("una corrección fijada no se deshace y cuatro aplicaciones malas retiran la preferencia", async () => {
    const { user, product, a } = await fixture();
    const [p] = await getDb().insert(schema.learnedPreferences).values({ key: "test", scope: "global", stages: ["imagen"], directive: "calle", directiveEn: "street", polarity: 1, topic: "fondo", supports: 0 }).returning();
    for (let i = 0; i < 4; i++) {
      const v = i === 0 ? a : await createVideo(user, product.id);
      await preferencesFor("imagen", { videoId: v.id });
      // El peso deja de inyectarla tras la primera corrección; simula aplicaciones ya en marcha.
      await getDb().insert(schema.preferenceApplications).values({ preferenceId: p.id, videoId: v.id, stage: "imagen" }).onConflictDoNothing();
      const [s] = await getDb().insert(schema.learningSignals).values({ sourceKey: `bad:${i}`, kind: "rechazado", stage: "imagen", polarity: -1, videoId: v.id, userId: user.id }).returning();
      await settleApplications(s);
      await settleApplications({ ...s, kind: "aprobado", polarity: 1 });
    }
    await recomputeWeight(p.id);
    const [retired] = await getDb().select().from(schema.learnedPreferences).where(eq(schema.learnedPreferences.id, p.id));
    expect(retired).toMatchObject({ status: "retirada", retiredBy: "peso" });
    expect((await getDb().select().from(schema.preferenceApplications)).every((a) => a.outcome === "corregido")).toBe(true);
  });
});


describe("rechazos y elecciones puros", () => {
  it("puros: distingue al dueño del sistema", () => {
    expect(ownerRejection("Corrección automática: del dueño: calle real")).toBe("calle real");
    expect(ownerRejection("Corrección automática: dedos extra")).toBeNull();
    expect(ownerRejection("Usa una calle real")).toBe("Usa una calle real");
  });
  it("puros: elige la preferida disponible", () => {
    expect(choosePreferred(["var:todas", "var:3"], [{ value: "var:2" }, { value: "var:3" }])).toBe("var:3");
    expect(choosePreferred(["var:todas"], [{ value: "var:3" }])).toBeNull();
  });
});
