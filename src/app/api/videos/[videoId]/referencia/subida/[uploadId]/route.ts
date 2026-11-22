import "@/jobs/video-jobs"; // define `video.referencia`, que encola terminar la subida
import { handle } from "@/server/http";
import { appendChunk, finishUpload, readChunkBody, uploadProgress } from "@/server/videos/upload";
import { getVideoFor } from "@/server/videos/videos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const parseIndex = (value: string | null) => (value !== null && /^(0|[1-9]\d{0,4})$/.test(value) ? Number(value) : Number.NaN);

type Context = { params: Promise<{ videoId: string; uploadId: string }> };

/** Progreso: `{ received, totalChunks }` (desde dónde seguir). 410 si el archivo ya no está. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async (user) => {
    const { videoId, uploadId } = await params;
    const video = await getVideoFor(user!, parseId(videoId));
    return Response.json(await uploadProgress(uploadId, { userId: user!.id }, video.id));
  });
}

/** Un trozo: `?indice=N` y el cuerpo son sus bytes. Repetir uno ya recibido no lo escribe dos veces. */
export async function PUT(request: Request, { params }: Context) {
  return handle(async (user) => {
    const { videoId, uploadId } = await params;
    const video = await getVideoFor(user!, parseId(videoId));
    const index = parseIndex(new URL(request.url).searchParams.get("indice"));
    const bytes = await readChunkBody(request);
    return Response.json(await appendChunk(uploadId, index, bytes, { userId: user!.id }, video.id));
  });
}

/** Terminar: comprueba que llegó entero y encola la preparación de la referencia. */
export async function POST(_request: Request, { params }: Context) {
  return handle(async (user) => {
    const { videoId, uploadId } = await params;
    const video = await getVideoFor(user!, parseId(videoId));
    await finishUpload(uploadId, { userId: user!.id }, video.id);
    return Response.json({ ok: true }, { status: 202 });
  });
}
