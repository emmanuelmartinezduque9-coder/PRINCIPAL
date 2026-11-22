import "@/jobs/video-jobs"; // define `video.referencia`, que encola terminar la subida
import { handle, HttpError } from "@/server/http";
import { appendChunk, CHUNK_BYTES, finishUpload, uploadProgress } from "@/server/videos/upload";
import { getVideoFor } from "@/server/videos/videos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);
const parseIndex = (value: string | null) => (value !== null && /^(0|[1-9]\d{0,4})$/.test(value) ? Number(value) : Number.NaN);

/** Un trozo más el margen de cabeceras de algunos clientes: lo que pase de aquí no se lee. */
const MAX_CHUNK_REQUEST = CHUNK_BYTES + 1024;
const TOO_LARGE = "El trozo es demasiado grande.";

type Context = { params: Promise<{ videoId: string; uploadId: string }> };

/**
 * Cuerpo binario del trozo. Si `Content-Length` ya dice que no cabe, 413 sin leer nada; si no lo
 * dice (envío por partes), se lee por partes y se corta en cuanto pasa del máximo.
 */
async function readChunk(request: Request): Promise<Buffer> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_CHUNK_REQUEST) throw new HttpError(413, TOO_LARGE);
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CHUNK_REQUEST) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, TOO_LARGE);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/** Progreso: `{ received, totalChunks }` (desde dónde seguir). 410 si el archivo ya no está. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async (user) => {
    const { videoId, uploadId } = await params;
    await getVideoFor(user!, parseId(videoId));
    return Response.json(await uploadProgress(uploadId, { userId: user!.id }));
  });
}

/** Un trozo: `?indice=N` y el cuerpo son sus bytes. Repetir uno ya recibido no lo escribe dos veces. */
export async function PUT(request: Request, { params }: Context) {
  return handle(async (user) => {
    const { videoId, uploadId } = await params;
    await getVideoFor(user!, parseId(videoId));
    const index = parseIndex(new URL(request.url).searchParams.get("indice"));
    const bytes = await readChunk(request);
    return Response.json(await appendChunk(uploadId, index, bytes, { userId: user!.id }));
  });
}

/** Terminar: comprueba que llegó entero y encola la preparación de la referencia. */
export async function POST(_request: Request, { params }: Context) {
  return handle(async (user) => {
    const { videoId, uploadId } = await params;
    await getVideoFor(user!, parseId(videoId));
    await finishUpload(uploadId, { userId: user!.id });
    return Response.json({ ok: true }, { status: 202 });
  });
}
