import { extendLease, requireAgent } from "@/server/agent";
import { handle } from "@/server/http";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Latido de una tarea reservada (cada 60 s mientras descarga): la mantiene 5 minutos más. 409 si ya no es suya. */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      await extendLease(agentId, parseId((await params).taskId));
      return Response.json({ ok: true });
    },
    { public: true },
  );
}
