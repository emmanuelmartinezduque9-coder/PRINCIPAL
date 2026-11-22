import { handle } from "@/server/http";
import { startUpload } from "@/server/videos/upload";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Empieza la subida del vídeo de referencia: `{ filename, totalBytes }` → `{ uploadId, chunkBytes }`. */
export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { filename?: unknown; totalBytes?: unknown } | null;
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const totalBytes = typeof body?.totalBytes === "number" ? body.totalBytes : Number.NaN;
    return Response.json(await startUpload(user!, parseId(videoId), { filename, totalBytes }), { status: 201 });
  });
}
