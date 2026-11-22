import "@/jobs/system-check"; // define los trabajos, para ponerles nombre en pantalla
import { jobLabel } from "@/jobs/registry";
import { listPausedJobs } from "@/jobs/steps";
import { handle } from "@/server/http";
import { listProductsFor, productNamesByIds } from "@/server/products";
import { spendSummary } from "@/server/spend";

/**
 * Gasto del mes y trabajos esperando saldo. El dueño ve el de todos frente al tope global; un
 * colaborador, solo lo suyo frente a su tope (y nunca cifras de los demás).
 */
export async function GET() {
  return handle(async (user) => {
    const me = user!;
    const isOwner = me.role === "dueno";
    const [summary, pausedJobs] = await Promise.all([spendSummary(me), listPausedJobs(me)]);

    const people = new Map(summary.byUser.map((row) => [row.userId, row.name]));
    const wanted = [...new Set(pausedJobs.map((job) => job.productId).filter((id): id is number => id !== null))];
    const products = isOwner
      ? await productNamesByIds(wanted)
      : new Map((await listProductsFor(me)).map((product) => [product.id, product.name]));
    // Qué tope detuvo el trabajo: el que quedó apuntado al pausarlo (si no consta, el dueño lo
    // deduce del gasto global). Un colaborador no recibe motivo: no debe saber nada del tope global.
    const guessed = summary.spentMicros >= summary.capMicros ? "global" : "persona";

    const paused = pausedJobs.map((job) => ({
      jobName: job.jobName,
      label: jobLabel(job.jobName),
      userId: job.userId,
      userName: people.get(job.userId) ?? me.name,
      productId: job.productId,
      productName: job.productId === null ? null : (products.get(job.productId) ?? null),
      since: job.since,
      reason: isOwner ? (job.scope ?? guessed) : null,
    }));
    return Response.json({ role: me.role, summary, paused }, { headers: { "Cache-Control": "no-store" } });
  });
}
