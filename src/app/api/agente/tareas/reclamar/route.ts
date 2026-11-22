import { claimTask, requireAgent } from "@/server/agent";
import { handle } from "@/server/http";

/**
 * El Mac pregunta si hay algo que descargar. Con tarea: 200 `{ taskId, url, uploadId, chunkBytes,
 * maxBytes }`, ya reservada a su nombre (la más antigua de su cola). Sin tarea: 204. Sin sesión;
 * entra con su ficha.
 */
export async function POST(request: Request) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const task = await claimTask(agentId);
      return task ? Response.json(task) : new Response(null, { status: 204 });
    },
    { public: true },
  );
}
