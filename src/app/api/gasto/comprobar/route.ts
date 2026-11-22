import { enqueueJob } from "@/jobs/boss";
import { SYSTEM_CHECK_JOB, systemCheckStatus } from "@/jobs/system-check";
import { handle } from "@/server/http";

/** Si hay una comprobación en marcha y el último resultado. Solo el dueño. */
export async function GET() {
  return handle(
    async (owner) => Response.json(await systemCheckStatus(owner!), { headers: { "Cache-Control": "no-store" } }),
    { role: "dueno" },
  );
}

/**
 * Lanza la comprobación del sistema en el proceso en segundo plano (la llamada a Claude nunca
 * corre dentro de una petición web). Solo una a la vez: si ya hay una en marcha, no encola otra.
 */
export async function POST() {
  return handle(
    async (owner) => {
      const before = await systemCheckStatus(owner!);
      if (before.running) return Response.json({ ...before, started: false }, { status: 202 });
      // Cada pulsación lleva su identificador: es otra comprobación, no la repetición de la anterior.
      await enqueueJob(SYSTEM_CHECK_JOB, { userId: owner!.id, productId: null }, { requestId: crypto.randomUUID() });
      return Response.json({ ...(await systemCheckStatus(owner!)), started: true }, { status: 202 });
    },
    { role: "dueno" },
  );
}
