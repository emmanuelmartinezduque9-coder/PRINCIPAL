import { requireAgent } from "@/server/agent";
import { handle, HttpError } from "@/server/http";
import { openEditStream } from "@/server/videos/edits";
import { publicationEditForTask } from "@/server/videos/publications";

/** El agente del Mac descarga el montaje que va a publicar en el móvil. */
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const edit = await publicationEditForTask(agentId, Number((await params).taskId));
      if (!edit) throw new HttpError(409, "Esta tarea ya no es tuya.");
      return new Response(await openEditStream(edit), {
        headers: { "Content-Type": "video/mp4", "Content-Length": String(edit.size), "Cache-Control": "no-store" },
      });
    },
    { public: true },
  );
}
