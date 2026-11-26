import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import { jobKey } from "@/jobs/steps";
import { CANCION_JOB } from "@/server/videos/canciones";
import { createProduct } from "@/server/products";
import { createVideo } from "@/server/videos/videos";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const enqueueJob = vi.fn(async () => "id");
vi.mock("@/jobs/boss", () => ({ enqueueJob: (...args: unknown[]) => enqueueJob(...(args as [])) }));
const { queuePendingSongs, SONG_RETRY_MS } = await import("@/jobs/canciones");

beforeEach(async () => { await truncateAll(); enqueueJob.mockClear(); });

async function pendingVideo() {
  const owner = await makeUser("dueno");
  const product = await createProduct(owner, { name: "Tu canción", summary: "Regala música", kind: "cancion", language: "de", countries: ["DE"] });
  const video = await createVideo(owner, product.id);
  await getDb().update(schema.videos).set({ referenceStatus: "ready", referenceMediaId: "ref-1" }).where(eq(schema.videos.id, video.id));
  const key = jobKey(CANCION_JOB, owner.id, product.id, { videoId: video.id, referenceMediaId: "ref-1" });
  const step = (status: string, finishedAt: Date | null) =>
    getDb().insert(schema.jobSteps).values({ key, jobName: CANCION_JOB, userId: owner.id, productId: product.id, status, finishedAt })
      .onConflictDoUpdate({ target: schema.jobSteps.key, set: { status, finishedAt } });
  return { step };
}

it("encola una canción nueva, no repite la que está en cola o en marcha", async () => {
  const { step } = await pendingVideo();
  await queuePendingSongs();
  expect(enqueueJob).toHaveBeenCalledTimes(1);
  for (const status of ["queued", "running", "pending"]) {
    enqueueJob.mockClear();
    await step(status, null);
    await queuePendingSongs();
    expect(enqueueJob).not.toHaveBeenCalled();
  }
});

it("vuelve a encolar la terminada sin canción enlazada (se quitó para rehacerla)", async () => {
  const { step } = await pendingVideo();
  await step("done", new Date());
  await queuePendingSongs();
  expect(enqueueJob).toHaveBeenCalledTimes(1);
});

it("una fallida espera unos minutos antes de reintentarse (p. ej. esperando al desglose)", async () => {
  const { step } = await pendingVideo();
  const now = new Date();
  await step("failed", new Date(now.getTime() - 60_000));
  await queuePendingSongs(now);
  expect(enqueueJob).not.toHaveBeenCalled();
  await step("failed", new Date(now.getTime() - SONG_RETRY_MS));
  await queuePendingSongs(now);
  expect(enqueueJob).toHaveBeenCalledTimes(1);
});
