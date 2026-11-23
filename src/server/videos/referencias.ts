import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { makeThumbnail, MediaError } from "@/server/media/ffmpeg";
import { pinterestImageUrl, storePinterestImage } from "@/server/videos/pinterest";

/**
 * Referencias de imagen subidas a mano (orden del dueño, 24/11/2026): en cada tarjeta de «Nuevo
 * lote», en su grupo y en la pantalla del vídeo se pueden subir varias imágenes y decir para qué
 * son. Se guardan una vez por huella en el almacén (`pinterest_images`), así el borrador solo lleva
 * «huella + papel» y aguanta recargas, «Duplicar» y el grupo. Cómo se usan en la imagen inicial:
 * ver `pinterest.ts` (un fondo a mano hace de sala en el método aprobado y no se elige del banco).
 */

export const REFERENCE_ROLES = ["fondo", "ambiente", "ropa", "realismo", "otro"] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export const MAX_REFERENCES = 6;
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

export interface VideoReference {
  sha256: string;
  role: ReferenceRole;
}

const BAD_IMAGE = "Solo imágenes (JPG, PNG o WebP).";
const TOO_BIG = "La imagen pesa más de 20 MB.";
const BAD_LIST = `Como mucho ${MAX_REFERENCES} imágenes de referencia, cada una con su papel.`;
const NOT_FOUND = "Esa imagen de referencia no está subida.";

export const isReferenceRole = (value: unknown): value is ReferenceRole => REFERENCE_ROLES.includes(value as ReferenceRole);

/** Sube una imagen de referencia (la pasa a JPEG, lado largo 2048) y devuelve su huella y su enlace. */
export async function uploadReference(bytes: Buffer): Promise<{ sha256: string; url: string }> {
  if (bytes.length === 0) throw new HttpError(400, BAD_IMAGE);
  if (bytes.length > MAX_REFERENCE_BYTES) throw new HttpError(413, TOO_BIG);
  let jpeg: Buffer;
  try {
    jpeg = await makeThumbnail(bytes, "image", 2048);
  } catch (error) {
    if (error instanceof MediaError) throw new HttpError(400, BAD_IMAGE);
    throw error;
  }
  const sha256 = await storePinterestImage(jpeg, { url: "subida-a-mano", pinId: "", width: null, height: null });
  return { sha256, url: await pinterestImageUrl(sha256) };
}

/** Comprueba una lista de referencias (huellas ya subidas, papeles válidos). Lanza 400 si no vale. */
export async function checkReferences(value: unknown): Promise<VideoReference[]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCES) throw new HttpError(400, BAD_LIST);
  const refs = value.map((item) => {
    const ref = item as { sha256?: unknown; role?: unknown };
    if (typeof ref?.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(ref.sha256)) throw new HttpError(400, BAD_LIST);
    return { sha256: ref.sha256, role: isReferenceRole(ref.role) ? ref.role : ("fondo" as const) };
  });
  const unique = [...new Map(refs.map((ref) => [ref.sha256, ref])).values()];
  if (unique.length === 0) return [];
  const found = await getDb().select({ sha256: schema.pinterestImages.sha256 }).from(schema.pinterestImages).where(inArray(schema.pinterestImages.sha256, unique.map((ref) => ref.sha256)));
  if (found.length !== unique.length) throw new HttpError(400, NOT_FOUND);
  return unique;
}

type Db = ReturnType<typeof getDb>;
type Executor = Pick<Db, "delete" | "insert">;

/** Sustituye las referencias del vídeo por estas (en este orden) y rehace sus prompts con sala. */
export async function writeReferences(executor: Executor, videoId: number, refs: VideoReference[]): Promise<void> {
  await executor.delete(schema.videoReferences).where(eq(schema.videoReferences.videoId, videoId));
  if (refs.length > 0) {
    await executor.insert(schema.videoReferences).values(refs.map((ref, position) => ({ videoId, sha256: ref.sha256, role: ref.role, position })));
  }
  // La sala y el prompt con sala dependen de ellas: se vuelven a hacer.
  await executor.delete(schema.videoPinterestRefs).where(eq(schema.videoPinterestRefs.videoId, videoId));
}

/** Las referencias subidas a mano de un vídeo, en orden. */
export async function listReferences(videoId: number): Promise<VideoReference[]> {
  const rows = await getDb()
    .select({ sha256: schema.videoReferences.sha256, role: schema.videoReferences.role })
    .from(schema.videoReferences)
    .where(eq(schema.videoReferences.videoId, videoId))
    .orderBy(asc(schema.videoReferences.position));
  return rows.map((row) => ({ sha256: row.sha256, role: isReferenceRole(row.role) ? row.role : "otro" }));
}

/** Con su enlace para la pantalla. */
export async function referencesView(videoId: number): Promise<Array<VideoReference & { url: string }>> {
  const refs = await listReferences(videoId);
  return Promise.all(refs.map(async (ref) => ({ ...ref, url: await pinterestImageUrl(ref.sha256) })));
}

/**
 * Cambia las referencias de un vídeo desde su pantalla. Solo quien lo creó y mientras su imagen no
 * esté aprobada (después ya no cambiarían nada).
 */
export async function setVideoReferences(user: AuthUser, videoId: number, value: unknown): Promise<Array<VideoReference & { url: string }>> {
  const [video] = await getDb()
    .select({ createdBy: schema.videos.createdBy, approved: schema.videos.approvedFrameResultId })
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId));
  if (!video || video.createdBy !== user.id) throw new HttpError(404, "Vídeo no encontrado.");
  if (video.approved !== null) throw new HttpError(409, "La imagen ya está aprobada: las referencias ya no cambian nada.");
  const refs = await checkReferences(value);
  await getDb().transaction((tx) => writeReferences(tx, videoId, refs));
  return referencesView(videoId);
}
