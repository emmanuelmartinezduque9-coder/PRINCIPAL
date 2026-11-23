import "@/jobs/video-jobs"; // la sala se vuelve a elegir y su prompt se rehace (trabajo `video.pinterest`)
import { handle } from "@/server/http";
import { setVideoReferences } from "@/server/videos/referencias";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** Cambia las imágenes de referencia subidas a mano del vídeo: `{ references: { sha256, role }[] }` → `{ references }`. */
export async function PUT(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as { references?: unknown } | null;
    return Response.json({ references: await setVideoReferences(user!, parseId(videoId), body?.references ?? []) });
  });
}
