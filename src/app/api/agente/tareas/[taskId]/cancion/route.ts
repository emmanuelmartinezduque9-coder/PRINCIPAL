import { requireAgent } from "@/server/agent";
import { handle } from "@/server/http";
import { montajeSongResponse } from "@/server/montaje-tasks";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** La canción de un montaje, para el Mac que tiene reservada la tarea (409 si no la tiene). Sin sesión; entra con su ficha. */
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      return montajeSongResponse(agentId, parseId((await params).taskId));
    },
    { public: true },
  );
}
