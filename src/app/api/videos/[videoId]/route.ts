import { badRequest, handle } from "@/server/http";
import { updateVideoChoices, videoView } from "@/server/videos/videos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** El vídeo, si es de quien pregunta y la lista de sus fotogramas. */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await videoView(user!, parseId(videoId)));
  });
}

const isPhotoChoice = (value: unknown) => value === undefined || value === null || (Number.isSafeInteger(value) && (value as number) > 0);

/** Cambia `title`, `avatarPhotoId`, `environmentPhotoId` (id o `null`) o `noPerson`. Solo quien creó el vídeo. */
export async function PUT(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const { title, avatarPhotoId, environmentPhotoId, noPerson } = input;
    if (title !== undefined && typeof title !== "string") return badRequest("Escribe el título del vídeo.");
    if (noPerson !== undefined && typeof noPerson !== "boolean") return badRequest("Valor no válido.");
    if (!isPhotoChoice(avatarPhotoId)) return badRequest("Elige una foto con papel «Avatar» de este producto.");
    if (!isPhotoChoice(environmentPhotoId)) return badRequest("Elige una foto con papel «Entorno» de este producto.");
    const video = await updateVideoChoices(user!, parseId(videoId), {
      title,
      avatarPhotoId: avatarPhotoId as number | null | undefined,
      environmentPhotoId: environmentPhotoId as number | null | undefined,
      noPerson,
    });
    return Response.json({ video });
  });
}
