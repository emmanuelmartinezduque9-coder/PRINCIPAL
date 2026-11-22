import "@/jobs/video-jobs"; // define `video.referencia`, que encola terminar la entrega
import { finishTask, requireAgent, type TaskResult } from "@/server/agent";
import { badRequest, handle } from "@/server/http";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

function parseResult(body: unknown): TaskResult | null {
  if (typeof body !== "object" || body === null) return null;
  const { ok, uploadId, totalBytes, error, title, selfCheck } = body as {
    ok?: unknown;
    uploadId?: unknown;
    totalBytes?: unknown;
    error?: unknown;
    title?: unknown;
    selfCheck?: unknown;
  };
  if (typeof uploadId !== "string") return null;
  if (ok === true && typeof totalBytes === "number") {
    return {
      ok: true,
      uploadId,
      totalBytes,
      ...(typeof title === "string" ? { title } : {}),
      ...(selfCheck !== undefined ? { selfCheck } : {}),
    };
  }
  if (ok === false) return { ok: false, uploadId, error: typeof error === "string" ? error : "" };
  return null;
}

/**
 * El Mac termina la tarea: `{ ok: true, uploadId, totalBytes, title?, selfCheck? }` (el archivo llegó entero:
 * una referencia se prepara como una subida; una canción se guarda con `title`, el de yt-dlp; un
 * montaje se guarda con `selfCheck`, la autocomprobación del montador) o `{ ok: false, uploadId, error }` (no pudo: el vídeo lo dice).
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
