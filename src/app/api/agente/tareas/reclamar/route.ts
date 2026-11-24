import { claimTask, OPTIONAL_TASKS, requireAgent, type OptionalTask } from "@/server/agent";
import { CLAUDE_CODE_TASK } from "@/server/claude-mac";
import { handle } from "@/server/http";

/**
 * Los tipos de tarea opcionales que el Mac dice que sabe hacer (`{ puede: ["enlace_medio"] }`); sin
 * cuerpo, ninguno. `{ solo: "claude_code" }`: solo una llamada a Claude (la cola aparte del 1.8.0).
 */
async function capabilities(request: Request): Promise<{ can: OptionalTask[]; solo?: typeof CLAUDE_CODE_TASK }> {
  const body = (await request.json().catch(() => null)) as { puede?: unknown; solo?: unknown } | null;
  const can = Array.isArray(body?.puede) ? body.puede : [];
  return { can: OPTIONAL_TASKS.filter((kind) => can.includes(kind)), ...(body?.solo === CLAUDE_CODE_TASK ? { solo: CLAUDE_CODE_TASK } : {}) };
}

/**
 * El Mac pregunta si hay algo que hacer. Con tarea: 200 `{ taskId, kind, url, uploadId,
 * chunkBytes, maxBytes }`, ya reservada a su nombre (la más antigua de su cola); `kind` es
 * `referencia` (el vídeo, MP4), `cancion` (el audio, MP3) o `enlace_medio` (el vídeo de un enlace
 * que necesita el montaje en la nube: MP4, MOV o WebM). `enlace_medio` solo se da a un Mac que dice
 * `{ puede: ["enlace_medio"] }` en el cuerpo (1.4.0); `perfil` (el JSON de un perfil de Instagram o
 * TikTok), solo a uno que dice `perfil` (1.5.0). Sin tarea: 204. Sin sesión; entra con su ficha.
 */
export async function POST(request: Request) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const task = await claimTask(agentId, new Date(), await capabilities(request));
      return task ? Response.json(task) : new Response(null, { status: 204 });
    },
    { public: true },
  );
}
