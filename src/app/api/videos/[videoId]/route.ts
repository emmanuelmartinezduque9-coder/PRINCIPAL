import "@/jobs/video-jobs"; // define `video.finalizar`, que encola la consulta de las generaciones
import { badRequest, handle } from "@/server/http";
import { checkPromptInput, updatePrompts } from "@/server/videos/analysis";
import { pollVideoGenerations } from "@/server/videos/generations";
import { checkSongChoice, getVideoFor, isClipResolution, setVideoSong, updateVideoChoices, videoView } from "@/server/videos/videos";

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : Number.NaN);

/**
 * El vídeo, si es de quien pregunta, sus fotogramas, su último desglose, sus manifiestos, los
 * avisos de sus prompts y sus generaciones. Si quien mira es quien lo creó, antes pregunta a su
 * Higgsfield por las generaciones en curso (como mucho una vez cada 8 s por generación).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const id = parseId(videoId);
    await pollVideoGenerations(user!, id);
    return Response.json(await videoView(user!, id));
  });
}

const isPhotoChoice = (value: unknown) => value === undefined || value === null || (Number.isSafeInteger(value) && (value as number) > 0);

/**
 * Cambia `title`, `avatarPhotoId`, `avatarLibraryId` (un avatar de la biblioteca: pasa a `biblioteca`),
 * `environmentPhotoId` (id o `null`), `avatarMode`, `variantId` (una variante del producto o `null`), `clipResolution`,
 * `kind`, `adaptation`, `hookSeconds`, `bodyClipIds`, `note`, `imagePrompt`, `videoPrompt`, `frameUse` o
 * `songId` (la «Música»: id de una canción o `null` para el audio original). Solo quien creó el vídeo. Con algún prompt o `frameUse`, la
 * respuesta lleva también los avisos de los prompts (`imageIssues`, `videoIssues`).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  return handle(async (user) => {
    const { videoId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const { title, avatarPhotoId, avatarLibraryId, environmentPhotoId, avatarMode, variantId, clipResolution, kind, adaptation, hookSeconds, bodyClipIds, note, imagePrompt, videoPrompt, frameUse, songId } =
      input;
    if (title !== undefined && typeof title !== "string") return badRequest("Escribe el título del vídeo.");
    if (!isPhotoChoice(avatarPhotoId)) return badRequest("Elige una foto con papel «Avatar» de este producto.");
    if (!isPhotoChoice(environmentPhotoId)) return badRequest("Elige una foto con papel «Entorno» de este producto.");
    if (clipResolution !== undefined && !isClipResolution(clipResolution)) return badRequest("Resolución no disponible.");
    // Los prompts se comprueban antes de guardar nada: la petición se guarda entera o no se guarda.
    const prompts = checkPromptInput({ imagePrompt, videoPrompt, frameUse });
    await checkSongChoice(songId);

    const id = parseId(videoId);
    // Solo la música: también la puede elegir el dueño en un vídeo ajeno (`setVideoSong`), así que
    // no pasa por `updateVideoChoices`, que exige ser quien creó el vídeo.
    const onlySong = songId !== undefined && Object.keys(input).every((key) => key === "songId");
    if (onlySong) return Response.json({ video: await setVideoSong(user!, id, songId) });
    let video = await updateVideoChoices(user!, id, {
      title,
      avatarPhotoId: avatarPhotoId as number | null | undefined,
      avatarLibraryId,
      environmentPhotoId: environmentPhotoId as number | null | undefined,
      avatarMode,
      variantId,
      clipResolution: clipResolution as string | undefined,
      kind,
      adaptation,
      hookSeconds,
      bodyClipIds,
      note,
    });
    if (songId !== undefined) video = await setVideoSong(user!, id, songId);
    if (imagePrompt === undefined && videoPrompt === undefined && frameUse === undefined) return Response.json({ video });
    const issues = await updatePrompts(user!, id, prompts);
    video = await getVideoFor(user!, id);
    return Response.json({ video, ...issues });
  });
}
