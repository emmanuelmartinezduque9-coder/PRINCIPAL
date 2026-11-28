import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import { defineJob } from "@/jobs/registry";
import { jobKey, runStep } from "@/jobs/steps";
import { getGateway, type LlmGateway } from "@/llm/gateway";
import { getActiveUser } from "@/server/auth";
import { classifyLibraryClips } from "@/server/videos/body-classifier";

const JOB = "biblioteca.clasificar";
defineJob<{ clipIds: number[] }>(JOB, async ({ clipIds }, ctx) => {
  const user = await getActiveUser(ctx.userId);
  if (!user) return;
  const gateway: LlmGateway = {
    call: request => runStep(ctx, request.stepKey, () => getGateway().call(request)),
  };
  await classifyLibraryClips(user, { gateway }, clipIds);
}, "Detectar productos y cuerpos");

export async function queueClipClassification(userId: number, clipIds: number[]): Promise<void> {
  if (!clipIds.length) return;
  clipIds = [...new Set(clipIds)].sort((a, b) => a - b);
  const ctx = { userId, productId: null };
  const data = { clipIds };
  const [existing] = await getDb().select({ status: schema.jobSteps.status, updatedAt: schema.jobSteps.updatedAt })
    .from(schema.jobSteps).where(eq(schema.jobSteps.key, jobKey(JOB, userId, null, data)));
  if (existing && (["queued", "running", "paused_cap"].includes(existing.status) ||
    (existing.status === "failed" && Date.now() - existing.updatedAt.getTime() < 5 * 60_000))) return;
  await enqueueJob(JOB, ctx, data);
}
