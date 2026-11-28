import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { LlmCall, LlmGateway } from "@/llm/gateway";
import { classifyLibraryClips, sweepClipClassification } from "@/server/videos/body-classifier";
import { listProductBodies, markBody } from "@/server/videos/bodies";
import { addProductPhoto } from "@/server/photos";
import { createVideo } from "@/server/videos/videos";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const queue = vi.hoisted(() => vi.fn());
vi.mock("@/jobs/body-classifier", () => ({ queueClipClassification: queue }));
let serial = 0;
async function clip(userId: number, videoId: number | null = null) {
  const [row] = await getDb().insert(schema.libraryClips).values({ userId, videoId, jobId: `clip-${++serial}`,
    videoUrl: "https://d8j0ntlcm91z4.cloudfront.net/clip.mp4", thumbUrl: "https://d8j0ntlcm91z4.cloudfront.net/thumb.webp", createdAtHf: new Date(), prompt: "Producto en uso" }).returning();
  return row;
}
function gateway(labels: unknown[]) {
  const call = vi.fn(async (_request: LlmCall<unknown>) => ({ data: { clips: labels } }));
  return { gateway: { call } as unknown as LlmGateway, call };
}
beforeEach(async () => { await truncateAll(); queue.mockReset(); });
describe("cuerpos automáticos", () => {
  it("resuelve video_id sin visión, guarda cuerpo y no duplica", async () => {
    const user = await makeUser("colaborador");
    const product = await makeProduct(user);
    const video = await createVideo(user, product.id);
    const c = await clip(user.id, video.id);
    const fake = gateway([]);
    expect(await classifyLibraryClips(user, fake)).toBe(1);
    expect(fake.call).not.toHaveBeenCalled();
    expect(await classifyLibraryClips(user, fake)).toBe(0);
    expect(await listProductBodies(user, product.id)).toMatchObject([{ auto: true }]);
    const [label] = await getDb().select().from(schema.libraryClips).where(eq(schema.libraryClips.id, c.id));
    expect(label).toMatchObject({ detectedProductId: product.id, classificationMethod: "video", confidence: 100 });
  });
  it("compara varios clips por visión, conserva manuales y acepta ninguno", async () => {
    const user = await makeUser("colaborador");
    const product = await makeProduct(user);
    await addProductPhoto(user, product.id, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]), "articulo");
    const a = await clip(user.id), b = await clip(user.id), c = await clip(user.id);
    await markBody(user, product.id, { clipId: a.id, label: "Elegido por Emmanuel" });
    const fake = gateway([
      { clipId: a.id, productId: product.id, role: "cuerpo", confidence: 99, label: "En uso" },
      { clipId: b.id, productId: product.id, role: "cuerpo", confidence: 96, label: "Resultado del cepillado" },
      { clipId: c.id, productId: null, role: "otro", confidence: 30, label: "Paisaje" },
    ]);
    expect(await classifyLibraryClips(user, fake)).toBe(3);
    expect(fake.call).toHaveBeenCalledTimes(1);
    expect(fake.call.mock.calls[0][0].tier).toBe("small");
    const content = fake.call.mock.calls[0][0].content;
    expect(JSON.stringify(content)).toContain('"type":"base64"');
    expect(JSON.stringify(content)).toContain(a.thumbUrl);
    expect(JSON.stringify(content)).toContain(product.name);
    expect(await listProductBodies(user, product.id)).toMatchObject([
      { label: "Elegido por Emmanuel", auto: false }, { label: "Resultado del cepillado", auto: true },
    ]);
    expect(await classifyLibraryClips(user, fake)).toBe(0);
  });
  it("no da de alta ganchos ni cuerpos de poca confianza", async () => {
    const user = await makeUser("colaborador"), product = await makeProduct(user);
    const a = await clip(user.id), b = await clip(user.id);
    await classifyLibraryClips(user, gateway([
      { clipId: a.id, productId: product.id, role: "gancho", confidence: 99, label: "Presentación" },
      { clipId: b.id, productId: product.id, role: "cuerpo", confidence: 60, label: "Posible uso" },
    ]));
    expect(await listProductBodies(user, product.id)).toEqual([]);
  });
  it("sin miniatura no convierte una suposición del prompt en cuerpo", async () => {
    const user = await makeUser("colaborador"), product = await makeProduct(user);
    const c = await clip(user.id);
    await getDb().update(schema.libraryClips).set({ thumbUrl: null }).where(eq(schema.libraryClips.id, c.id));
    await classifyLibraryClips(user, gateway([{ clipId: c.id, productId: product.id, role: "cuerpo", confidence: 100, label: "Uso" }]));
    expect(await listProductBodies(user, product.id)).toEqual([]);
    const [label] = await getDb().select().from(schema.libraryClips);
    expect(label.confidence).toBe(79);
  });
  it("un vídeo solo gancho conserva su producto sin convertirse en cuerpo", async () => {
    const user = await makeUser("colaborador"), product = await makeProduct(user);
    const video = await createVideo(user, product.id);
    await getDb().update(schema.videos).set({ kind: "solo_gancho" }).where(eq(schema.videos.id, video.id));
    await clip(user.id, video.id);
    const fake = gateway([]);
    await classifyLibraryClips(user, fake);
    expect(fake.call).not.toHaveBeenCalled();
    expect(await listProductBodies(user, product.id)).toEqual([]);
    const [label] = await getDb().select().from(schema.libraryClips);
    expect(label).toMatchObject({ detectedProductId: product.id, classifiedRole: "gancho" });
  });
  it("el barrido solo encola 40 y el clasificador solo procesa 40", async () => {
    const user = await makeUser("colaborador");
    for (let i = 0; i < 45; i++) await clip(user.id);
    await sweepClipClassification();
    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue.mock.calls[0][1]).toHaveLength(40);
    expect(await classifyLibraryClips(user, gateway([]))).toBe(40);
    expect(await classifyLibraryClips(user, gateway([]))).toBe(5);
  });
  it("una tanda con respuesta inválida se reintenta clip a clip y la que sigue fallando queda como «otro»", async () => {
    const user = await makeUser("colaborador"), product = await makeProduct(user);
    await addProductPhoto(user, product.id, Buffer.from("/9j/4AAQSkZJRgABAQ", "base64"), "articulo").catch(() => null);
    const a = await clip(user.id), b = await clip(user.id);
    const call = vi.fn(async (request: LlmCall<unknown>) => {
      const ids = String(request.stepKey).split(":").pop()!.split("-").map(Number);
      if (ids.length > 1) throw new Error("La respuesta de Claude no tiene el formato esperado.");
      if (ids[0] === b.id) throw new Error("La respuesta de Claude no tiene el formato esperado.");
      return { data: { clips: [{ clipId: a.id, productId: product.id, role: "cuerpo", confidence: 95, label: "Uso" }] } };
    });
    expect(await classifyLibraryClips(user, { gateway: { call } as unknown as LlmGateway })).toBe(2);
    const rows = await getDb().select().from(schema.libraryClips);
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ detectedProductId: product.id, classifiedRole: "cuerpo" });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ detectedProductId: null, classifiedRole: "otro", confidence: 0 });
    expect(await listProductBodies(user, product.id)).toHaveLength(1);
  });
});
