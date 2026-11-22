import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { HIGGSFIELD_KIND, HiggsfieldAuthError, type HiggsfieldPort } from "@/connectors/higgsfield";
import { getDb, schema } from "@/db/client";
import { enqueueJob } from "@/jobs/boss";
import type { AuthUser } from "@/server/auth";
import { credentialStatus } from "@/server/credentials";
import { HttpError } from "@/server/http";
import { detectVideoType } from "@/server/media/detect";
import { getVideoFor, MAX_REFERENCE_BYTES, requireVideoOwner } from "@/server/videos/videos";

/**
 * Subida por trozos del vídeo de referencia. El archivo se va escribiendo en una carpeta temporal
 * (nunca en la base de datos) y, al terminar, se encola su preparación (`video.referencia`), que
 * lo borra al acabar. Pensado para una conexión mala: un trozo repetido no se escribe dos veces,
 * el progreso dice desde dónde seguir y, si el servidor se reinició y el archivo ya no está, lo
 * dice claro (410).
 *
 * Quien encola tiene que tener definido el trabajo: las rutas que terminan una subida importan
 * `@/jobs/video-jobs` (aquí no, para no crear un ciclo de importaciones).
 */

export const CHUNK_BYTES = 5 * 1024 * 1024;
export const REFERENCE_JOB = "video.referencia";

/** Quién sube: la persona (desde el navegador) o una tarea del agente del Mac en su nombre. */
export type UploadActor = { userId: number } | { agentTaskId: number };

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;
const MAX_FILENAME = 255;

const TOO_BIG = "El vídeo pesa demasiado (máximo 100 MB).";
const NOT_CONNECTED = "Conecta primero tu Higgsfield en Ajustes.";
const STILL_PROCESSING = "Espera a que termine de prepararse el vídeo de referencia.";
const BAD_FORMAT = "Formato de vídeo no admitido. Usa MP4, MOV o WebM.";
const BAD_CHUNK = "Trozo no válido.";
const MISSING_CHUNKS = "Faltan trozos anteriores.";
const NOT_FOUND = "Subida no encontrada.";
const INCOMPLETE = "El vídeo no ha llegado entero. Inténtalo de nuevo.";
export const UPLOAD_GONE = "La subida se ha interrumpido. Vuelve a elegir el vídeo.";
export const PREPARE_FAILED = "No se pudo preparar el vídeo. Vuelve a subirlo.";

/** 24 bytes aleatorios en base64url: imposible de adivinar y seguro como nombre de archivo. */
const UPLOAD_ID = /^[A-Za-z0-9_-]{32}$/;

const uploadDir = () => path.join(os.tmpdir(), "principal-subidas");

/** Archivo temporal de una subida. Un identificador con otra forma no llega nunca al disco. */
export function uploadPath(uploadId: string): string {
  if (!UPLOAD_ID.test(uploadId)) throw new HttpError(404, NOT_FOUND);
  return path.join(uploadDir(), uploadId);
}

/** El recorte normalizado que prepara `processReference`, junto al archivo subido. */
export function clipPath(uploadId: string): string {
  return `${uploadPath(uploadId)}.recorte.mp4`;
}

const totalChunksOf = (totalBytes: number) => Math.ceil(totalBytes / CHUNK_BYTES);

/** Bytes que debe tener el trozo `index`: todos `CHUNK_BYTES` menos el último, que lleva el resto. */
function chunkLength(totalBytes: number, index: number): number {
  return index < totalChunksOf(totalBytes) - 1 ? CHUNK_BYTES : totalBytes - CHUNK_BYTES * index;
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

async function removeFiles(uploadId: string): Promise<void> {
  await fs.rm(uploadPath(uploadId), { force: true });
  await fs.rm(clipPath(uploadId), { force: true });
}

/**
 * Empieza la subida de la referencia de un vídeo. Comprueba, por este orden: que el vídeo es
 * visible y de `user`, el tamaño, que su Higgsfield está conectado (y no pide volver a
 * conectar) y que no hay otra referencia preparándose. Una subida anterior del mismo vídeo se
 * descarta con su archivo. `deps` no se usa: la conexión se comprueba en la bóveda, sin llamar
 * a Higgsfield (se acepta para que quien llama pase el mismo simulado que al resto).
 */
export async function startUpload(
  user: AuthUser,
  videoId: number,
  input: { filename: string; totalBytes: number },
  deps: { higgsfield?: HiggsfieldPort } = {},
): Promise<{ uploadId: string; chunkBytes: number }> {
  void deps;
  const video = await getVideoFor(user, videoId);
  requireVideoOwner(user, video);
  const { totalBytes } = input;
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) throw new HttpError(400, "El vídeo está vacío.");
  if (totalBytes > MAX_REFERENCE_BYTES) throw new HttpError(400, TOO_BIG);
  const filename = typeof input.filename === "string" ? input.filename.trim().slice(0, MAX_FILENAME) : "";
  if (!filename) throw new HttpError(400, "Elige un vídeo.");

  const { connected, meta } = await credentialStatus(user.id, HIGGSFIELD_KIND);
  if (!connected) throw new HttpError(409, NOT_CONNECTED);
  if (meta.needsReconnect === true) throw new HttpError(409, new HiggsfieldAuthError().message);

  const uploadId = crypto.randomBytes(24).toString("base64url");
  const discarded = await getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select({ referenceStatus: schema.videos.referenceStatus })
      .from(schema.videos)
      .where(eq(schema.videos.id, video.id))
      .for("update");
    if (!locked) throw new HttpError(404, "Vídeo no encontrado.");
    if (locked.referenceStatus === "processing") throw new HttpError(409, STILL_PROCESSING);
    const old = await tx
      .delete(schema.uploadSessions)
      .where(eq(schema.uploadSessions.videoId, video.id))
      .returning({ id: schema.uploadSessions.id });
    await tx.insert(schema.uploadSessions).values({ id: uploadId, videoId: video.id, userId: user.id, filename, totalBytes });
    await tx
      .update(schema.videos)
      .set({ referenceStatus: "uploading", referenceError: null, updatedAt: new Date() })
      .where(eq(schema.videos.id, video.id));
    return old.map((row) => row.id);
  });
  for (const id of discarded) await removeFiles(id);
  return { uploadId, chunkBytes: CHUNK_BYTES };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Session = typeof schema.uploadSessions.$inferSelect;

function belongsTo(session: Session, actor: UploadActor): boolean {
  if ("agentTaskId" in actor) return session.agentTaskId !== null && session.agentTaskId === actor.agentTaskId;
  return session.agentTaskId === null && session.userId === actor.userId;
}

/** La sesión de `actor`, bloqueada hasta el final de la transacción. Ajena o inexistente: el mismo 404. */
async function lockedSession(tx: Tx, uploadId: string, actor: UploadActor): Promise<Session> {
  if (typeof uploadId !== "string" || !UPLOAD_ID.test(uploadId)) throw new HttpError(404, NOT_FOUND);
  const [session] = await tx.select().from(schema.uploadSessions).where(eq(schema.uploadSessions.id, uploadId)).for("update");
  if (!session || !belongsTo(session, actor)) throw new HttpError(404, NOT_FOUND);
  return session;
}

/**
 * Añade el trozo `index`. Con la fila de la sesión bloqueada: el trozo que toca se escribe y
 * cuenta; uno ya recibido (se perdió la respuesta) responde sin escribir; uno adelantado, 409.
 * El primero decide el formato por su contenido. Si quedó medio trozo de un intento anterior,
 * se recorta antes de seguir; si el archivo ya no está, 410.
 */
export async function appendChunk(uploadId: string, index: number, bytes: Buffer, actor: UploadActor): Promise<{ received: number }> {
  return getDb().transaction(async (tx) => {
    const session = await lockedSession(tx, uploadId, actor);
    if (!Number.isSafeInteger(index) || index < 0 || index >= totalChunksOf(session.totalBytes)) throw new HttpError(400, BAD_CHUNK);
    if (index < session.received) return { received: session.received };
    if (index > session.received) throw new HttpError(409, MISSING_CHUNKS);

    let mime = session.mime;
    if (index === 0) {
      mime = detectVideoType(bytes.subarray(0, 16));
      if (!mime) throw new HttpError(400, BAD_FORMAT);
    }
    if (bytes.length !== chunkLength(session.totalBytes, index)) throw new HttpError(400, BAD_CHUNK);

    const file = uploadPath(session.id);
    if (index === 0) {
      await fs.mkdir(uploadDir(), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, bytes, { mode: 0o600 });
    } else {
      const offset = index * CHUNK_BYTES;
      const size = await fileSize(file);
      if (size === null || size < offset) throw new HttpError(410, UPLOAD_GONE);
      if (size > offset) await fs.truncate(file, offset);
      await fs.appendFile(file, bytes);
    }
    await tx.update(schema.uploadSessions).set({ received: index + 1, mime }).where(eq(schema.uploadSessions.id, session.id));
    return { received: index + 1 };
  });
}

/** Cuántos trozos han llegado de cuántos; si el archivo ya no está, 410 (hay que empezar de nuevo). */
export async function uploadProgress(uploadId: string, actor: UploadActor): Promise<{ received: number; totalChunks: number }> {
  return getDb().transaction(async (tx) => {
    const session = await lockedSession(tx, uploadId, actor);
    if (session.received > 0 && (await fileSize(uploadPath(session.id))) === null) throw new HttpError(410, UPLOAD_GONE);
    return { received: session.received, totalChunks: totalChunksOf(session.totalBytes) };
  });
}

/**
 * Termina la subida: comprueba que llegó entera, deja la referencia «preparándose» y encola
 * `video.referencia`. Pulsar dos veces no encola dos veces: si ya se está preparando, no hace nada.
 */
export async function finishUpload(uploadId: string, actor: UploadActor): Promise<void> {
  const job = await getDb().transaction(async (tx) => {
    const session = await lockedSession(tx, uploadId, actor);
    const [video] = await tx.select().from(schema.videos).where(eq(schema.videos.id, session.videoId)).for("update");
    if (!video) throw new HttpError(404, NOT_FOUND);
    if (video.referenceStatus === "processing") return null;
    if (video.referenceStatus !== "uploading") throw new HttpError(410, UPLOAD_GONE);
    const size = await fileSize(uploadPath(session.id));
    if (session.received > 0 && size === null) throw new HttpError(410, UPLOAD_GONE);
    if (session.received < totalChunksOf(session.totalBytes) || size !== session.totalBytes) throw new HttpError(400, INCOMPLETE);
    await tx
      .update(schema.videos)
      .set({ referenceStatus: "processing", referenceError: null, updatedAt: new Date() })
      .where(eq(schema.videos.id, video.id));
    return { userId: video.createdBy, productId: video.productId, videoId: video.id };
  });
  if (!job) return;
  try {
    await enqueueJob(REFERENCE_JOB, { userId: job.userId, productId: job.productId }, { videoId: job.videoId, uploadId });
  } catch (error) {
    await getDb()
      .update(schema.videos)
      .set({ referenceStatus: "failed", referenceError: PREPARE_FAILED, updatedAt: new Date() })
      .where(and(eq(schema.videos.id, job.videoId), eq(schema.videos.referenceStatus, "processing")));
    throw error;
  }
}

/** Borra la subida (fila y archivos temporales). Lo usa la preparación al acabar, bien o mal. */
export async function discardUpload(uploadId: string): Promise<void> {
  if (!UPLOAD_ID.test(uploadId)) return;
  await removeFiles(uploadId);
  await getDb().delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, uploadId));
}

/**
 * Borra las sesiones de más de 24 h con sus archivos, y cualquier archivo temporal de la carpeta
 * de subidas que lleve más de 24 h sin tocarse (restos de un proceso que se cayó). Un vídeo que
 * se quedó «subiendo» sin sesión pasa a error. Devuelve cuántas sesiones borró.
 */
export async function cleanStaleUploads(now: Date = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - STALE_UPLOAD_MS);
  const sessions = schema.uploadSessions;
  const removed = await getDb().transaction(async (tx) => {
    const rows = await tx.delete(sessions).where(lt(sessions.createdAt, limit)).returning({ id: sessions.id, videoId: sessions.videoId });
    const videoIds = [...new Set(rows.map((row) => row.videoId))];
    if (videoIds.length > 0) {
      await tx
        .update(schema.videos)
        .set({ referenceStatus: "failed", referenceError: UPLOAD_GONE, updatedAt: new Date() })
        .where(
          and(
            inArray(schema.videos.id, videoIds),
            eq(schema.videos.referenceStatus, "uploading"),
            notExists(tx.select({ one: sql`1` }).from(sessions).where(eq(sessions.videoId, schema.videos.id))),
          ),
        );
    }
    return rows;
  });
  for (const row of removed) if (UPLOAD_ID.test(row.id)) await removeFiles(row.id);

  const entries = await fs.readdir(uploadDir()).catch(() => [] as string[]);
  for (const name of entries) {
    const file = path.join(uploadDir(), name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat && stat.mtime < limit) await fs.rm(file, { force: true, recursive: true });
  }
  return removed.length;
}
