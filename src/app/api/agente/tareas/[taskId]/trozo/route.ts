import { appendTaskChunk, requireAgent } from "@/server/agent";
import { handle } from "@/server/http";
import { readChunkBody } from "@/server/videos/upload";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const parseIndex = (value: string | null) => (value !== null && /^(0|[1-9]\d{0,4})$/.test(value) ? Number(value) : Number.NaN);

/**
 * Un trozo del archivo descargado: `?indice=N&subida=<uploadId>` y el cuerpo son sus bytes, como
 * en la subida del navegador. `subida` es el `uploadId` que recibió al reservar la tarea. Repetir
 * un trozo ya recibido no lo escribe dos veces. 409 si la tarea ya no es suya o la sesión es de
 * un intento anterior.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return handle(
    async () => {
      const { agentId } = await requireAgent(request);
      const query = new URL(request.url).searchParams;
      const index = parseIndex(query.get("indice"));
      const bytes = await readChunkBody(request);
      return Response.json(await appendTaskChunk(agentId, parseId((await params).taskId), query.get("subida") ?? "", index, bytes));
    },
    { public: true },
  );
}
