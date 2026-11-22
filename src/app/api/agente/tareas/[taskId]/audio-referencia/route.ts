import { requireAgent } from "@/server/agent";
import { handle } from "@/server/http";
import { montajeReferenceAudioResponse } from "@/server/montaje-tasks";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * El audio del vídeo de referencia de un montaje («Audio original»), para el Mac que tiene
 * reservada la tarea (409 si no la tiene). Sin sesión; entra con su ficha.
 */
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      return montajeReferenceAudioResponse(agentId, parseId((await params).taskId));
    },
    { public: true },
  );
}
