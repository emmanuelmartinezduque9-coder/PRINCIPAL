import { CheckCooldownError, requestSystemCheck, systemCheckStatus } from "@/jobs/system-check";
import { handle } from "@/server/http";

/** Si hay una comprobación en marcha, la espera que queda y el último resultado. Solo el dueño. */
export async function GET() {
  return handle(
    async (owner) => Response.json(await systemCheckStatus(owner!), { headers: { "Cache-Control": "no-store" } }),
    { role: "dueno" },
  );
}

/**
 * Lanza la comprobación del sistema en el proceso en segundo plano (la llamada a Claude nunca
 * corre dentro de una petición web). Una sola a la vez y con 30 s de espera entre dos: si ya hay
 * una en marcha devuelve esa (202, `started: false`); si es demasiado pronto, 409 con los segundos.
 */
export async function POST() {
  return handle(
    async (owner) => {
      try {
        const { started, status } = await requestSystemCheck(owner!);
        return Response.json({ ...status, started }, { status: 202 });
      } catch (error) {
        if (error instanceof CheckCooldownError) {
          return Response.json({ error: error.message, secondsLeft: error.secondsLeft }, { status: 409 });
        }
        throw error;
      }
    },
    { role: "dueno" },
  );
}
