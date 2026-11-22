import { badRequest, handle } from "@/server/http";
import { updatePrompts } from "@/server/videos/analysis";
import { FRAME_USES, type FrameUse } from "@/server/videos/manifest";
import { getVideoFor, updateVideoChoices, videoView } from "@/server/videos/videos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/** El vídeo, si es de quien pregunta, sus fotogramas, su último desglose, sus manifiestos y los avisos de sus prompts. */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    return Response.json(await videoView(user!, parseId(videoId)));
  });
}

const isPhotoChoice = (value: unknown) => value === undefined || value === null || (Number.isSafeInteger(value) && (value as number) > 0);

/**
 * Cambia `title`, `avatarPhotoId`, `environmentPhotoId` (id o `null`), `noPerson`, `imagePrompt`,
 * `videoPrompt` o `frameUse`. Solo quien creó el vídeo. Con algún prompt o `frameUse`, la
 * respuesta lleva también los avisos de los prompts (`imageIssues`, `videoIssues`).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const { title, avatarPhotoId, environmentPhotoId, noPerson, imagePrompt, videoPrompt, frameUse } = input;
    if (title !== undefined && typeof title !== "string") return badRequest("Escribe el título del vídeo.");
    if (noPerson !== undefined && typeof noPerson !== "boolean") return badRequest("Valor no válido.");
    if (!isPhotoChoice(avatarPhotoId)) return badRequest("Elige una foto con papel «Avatar» de este producto.");
    if (!isPhotoChoice(environmentPhotoId)) return badRequest("Elige una foto con papel «Entorno» de este producto.");
    if (imagePrompt !== undefined && typeof imagePrompt !== "string") return badRequest("Escribe el prompt.");
    if (videoPrompt !== undefined && typeof videoPrompt !== "string") return badRequest("Escribe el prompt.");
    if (frameUse !== undefined && !FRAME_USES.includes(frameUse as FrameUse)) return badRequest("Uso de la imagen no válido.");

    const id = parseId(videoId);
    let video = await updateVideoChoices(user!, id, {
      title,
      avatarPhotoId: avatarPhotoId as number | null | undefined,
      environmentPhotoId: environmentPhotoId as number | null | undefined,
      noPerson,
    });
    if (imagePrompt === undefined && videoPrompt === undefined && frameUse === undefined) return Response.json({ video });
    const issues = await updatePrompts(user!, id, { imagePrompt, videoPrompt, frameUse: frameUse as FrameUse | undefined });
    video = await getVideoFor(user!, id);
    return Response.json({ video, ...issues });
  });
}
