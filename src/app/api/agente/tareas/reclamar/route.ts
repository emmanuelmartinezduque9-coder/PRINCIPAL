import { claimTask, OPTIONAL_TASKS, requireAgent, type OptionalTask } from "@/server/agent";
import { handle } from "@/server/http";

/** Los tipos de tarea opcionales que el Mac dice que sabe hacer (`{ puede: ["montaje"] }`); sin cuerpo, ninguno. */
async function capabilities(request: Request): Promise<OptionalTask[]> {
  const body = (await request.json().catch(() => null)) as { puede?: unknown } | null;
  const can = Array.isArray(body?.puede) ? body.puede : [];
  return OPTIONAL_TASKS.filter((kind) => can.includes(kind));
}

/**
 * El Mac pregunta si hay algo que hacer. Con tarea: 200 `{ taskId, kind, url, uploadId,
 * chunkBytes, maxBytes }` (y `spec`, la ficha de montaje, con `kind: "montaje"`), ya reservada a
 * su nombre (la más antigua de su cola); `kind` es `referencia` (el vídeo, MP4), `cancion` (el
 * audio, MP3) o `montaje` (el vídeo montado, MP4). Un montaje solo se da a un Mac que dice
 * `{ puede: ["montaje"] }` en el cuerpo. Sin tarea: 204. Sin sesión; entra con su ficha.
 */
export async function POST(request: Request) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const task = await claimTask(agentId, new Date(), { can: await capabilities(request) });
      return task ? Response.json(task) : new Response(null, { status: 204 });
    },
    { public: true },
  );
}
