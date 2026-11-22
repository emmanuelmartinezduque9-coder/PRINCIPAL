import "@/jobs/video-jobs"; // define `video.referencia`, que encola terminar la entrega
import { finishTask, requireAgent, type TaskResult } from "@/server/agent";
import { badRequest, handle } from "@/server/http";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

function parseResult(body: unknown): TaskResult | null {
  if (typeof body !== "object" || body === null) return null;
  const { ok, uploadId, totalBytes, error } = body as { ok?: unknown; uploadId?: unknown; totalBytes?: unknown; error?: unknown };
  if (typeof uploadId !== "string") return null;
  if (ok === true && typeof totalBytes === "number") return { ok: true, uploadId, totalBytes };
  if (ok === false) return { ok: false, uploadId, error: typeof error === "string" ? error : "" };
  return null;
}

/**
 * El Mac termina la tarea: `{ ok: true, uploadId, totalBytes }` (el archivo llegó entero: se
 * prepara como una subida) o `{ ok: false, uploadId, error }` (no pudo: el vídeo lo dice).
 * `uploadId` es el que recibió al reservarla. 409 si la tarea ya no es suya o la sesión es de un
 * intento anterior.
 */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const result = parseResult(await request.json().catch(() => null));
      if (!result) return badRequest("Resultado no válido.");
      await finishTask(agentId, parseId((await params).taskId), result);
      return Response.json({ ok: true });
    },
    { public: true },
  );
}
