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
 * El archivo lo sube la persona desde el navegador o, si pegó un enlace, el agente del Mac en su
 * nombre (`src/server/agent.ts`), por estas mismas funciones: la sesión del Mac no anuncia el
 * tamaño (no lo sabe hasta descargar) y lleva la tarea en `agentTaskId`. Un vídeo que espera un
 * enlace está «subiendo» con origen «enlace».
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
/** Lo único que ve la persona cuando el Mac no consigue traer un enlace, sea cual sea el motivo. */
export const LINK_FAILED = "No se pudo descargar el enlace. Sube el archivo del vídeo.";
/** Nombre de archivo de las subidas del Mac (no tienen uno propio). */
const LINK_FILENAME = "enlace";

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
/** Los trozos que caben en el máximo: una subida sin tamaño anunciado no admite más. */
const MAX_CHUNKS = totalChunksOf(MAX_REFERENCE_BYTES);

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

/** Borra los archivos temporales de subidas cuya fila ya se borró. */
export async function removeUploadFiles(uploadIds: string[]): Promise<void> {
  for (const id of uploadIds) if (UPLOAD_ID.test(id)) await removeFiles(id);
}

/** Lo que hace falta para dar una referencia, se suba o se traiga de un enlace: el Higgsfield de la persona, conectado. */
export async function requireHiggsfieldConnected(userId: number): Promise<void> {
  const { connected, meta } = await credentialStatus(userId, HIGGSFIELD_KIND);
  if (!connected) throw new HttpError(409, NOT_CONNECTED);
  if (meta.needsReconnect === true) throw new HttpError(409, new HiggsfieldAuthError().message);
}

/**
 * Empieza la subida de la referencia de un vídeo. Comprueba, por este orden: que el vídeo es
 * visible y de `user`, el tamaño, que su Higgsfield está conectado (y no pide volver a
 * conectar) y que no hay otra referencia preparándose. Una subida anterior del mismo vídeo se
 * descarta con su archivo. El vídeo pasa a «subiendo», salvo si su referencia ya está lista:
 * esa se queda como está hasta terminar la nueva subida. `deps` no se usa: la conexión se
 * comprueba en la bóveda, sin llamar a Higgsfield (se acepta para que quien llama pase el mismo
 * simulado que al resto).
 *
 * Orden de los cerrojos en todo este módulo: primero el vídeo, después la sesión.
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

  await requireHiggsfieldConnected(user.id);

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
    // Una referencia que ya funciona se conserva (estado, fotogramas y recorte) hasta que la nueva
    // subida termine: elegir otro vídeo y abandonar no la pierde. La subida pendiente vive solo
    // en su sesión. Si el vídeo esperaba un enlace, deja de esperarlo (origen «archivo»): el Mac
    // suelta esa tarea en cuanto vuelve a preguntar por ella.
    if (locked.referenceStatus !== "ready") {
      await tx
        .update(schema.videos)
        .set({ referenceStatus: "uploading", referenceError: null, referenceSource: "file", referenceUrl: null, updatedAt: new Date() })
        .where(eq(schema.videos.id, video.id));
    }
    return old.map((row) => row.id);
  });
  await removeUploadFiles(discarded);
  return { uploadId, chunkBytes: CHUNK_BYTES };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
/** Con qué se ejecuta: la base de datos o la transacción ya abierta de quien llama. */
type Executor = ReturnType<typeof getDb> | Tx;
type Session = typeof schema.uploadSessions.$inferSelect;

/**
 * El vídeo pasa a esperar el archivo de un enlace que traerá el Mac: «subiendo», con origen
 * «enlace» y su dirección. Va dentro de la transacción de quien crea la tarea
 * (`requestLinkDownload`), para que la tarea y el estado del vídeo se guarden juntos. Como
 * `startUpload`: no mientras otra referencia se prepara, y las subidas anteriores del vídeo se
 * descartan; devuelve sus identificadores para borrar los archivos con `removeUploadFiles` al
 * confirmar. A diferencia de una subida, aquí no hay un archivo en el navegador que se pueda
 * abandonar: una referencia lista también pasa a «subiendo».
 */
export async function expectLinkReference(tx: Tx, videoId: number, url: string): Promise<string[]> {
  const [locked] = await tx
    .select({ referenceStatus: schema.videos.referenceStatus })
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .for("update");
  if (!locked) throw new HttpError(404, "Vídeo no encontrado.");
  if (locked.referenceStatus === "processing") throw new HttpError(409, STILL_PROCESSING);
  const old = await tx.delete(schema.uploadSessions).where(eq(schema.uploadSessions.videoId, videoId)).returning({ id: schema.uploadSessions.id });
  await tx
    .update(schema.videos)
    .set({ referenceStatus: "uploading", referenceError: null, referenceSource: "link", referenceUrl: url, updatedAt: new Date() })
    .where(eq(schema.videos.id, videoId));
  return old.map((row) => row.id);
}

/**
 * Sesión de subida para una tarea del Mac: sin tamaño anunciado (el Mac no lo sabe hasta
 * descargar; el tope de 100 MB se aplica según llegan los trozos) y a nombre de quien creó el
 * vídeo. Solo si el vídeo sigue esperando un enlace: si entretanto la persona subió un archivo,
 * devuelve `null` y no toca nada. Las sesiones que hubiera son de un intento anterior de la misma
 * tarea, que ya nadie tiene: se borran con su archivo. Con `executor`, dentro de la transacción de
 * quien reserva la tarea (cerrojos: la tarea, después el vídeo, después la sesión).
 */
export async function startAgentUpload(
  agentTaskId: number,
  videoId: number,
  executor: Executor = getDb(),
): Promise<{ uploadId: string; chunkBytes: number } | null> {
  const uploadId = crypto.randomBytes(24).toString("base64url");
  const discarded = await executor.transaction(async (tx) => {
    const [video] = await tx
      .select({
        createdBy: schema.videos.createdBy,
        referenceStatus: schema.videos.referenceStatus,
        referenceSource: schema.videos.referenceSource,
      })
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId))
      .for("update");
    if (!video || video.referenceStatus !== "uploading" || video.referenceSource !== "link") return null;
    const old = await tx.delete(schema.uploadSessions).where(eq(schema.uploadSessions.videoId, videoId)).returning({ id: schema.uploadSessions.id });
    await tx
      .insert(schema.uploadSessions)
      .values({ id: uploadId, videoId, userId: video.createdBy, agentTaskId, filename: LINK_FILENAME, totalBytes: null });
    return old.map((row) => row.id);
  });
  if (!discarded) return null;
  await removeUploadFiles(discarded);
  return { uploadId, chunkBytes: CHUNK_BYTES };
}

/** La sesión de subida de una tarea del Mac, o `null` si ya no existe (la tarea se sustituyó o se cerró). */
export async function agentUploadId(agentTaskId: number): Promise<string | null> {
  const [session] = await getDb()
    .select({ id: schema.uploadSessions.id })
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.agentTaskId, agentTaskId));
  return session?.id ?? null;
}

/**
 * El Mac no pudo traer el enlace: se borra lo que hubiera llegado y, si el vídeo seguía esperando
 * ese enlace, queda en error con el texto fijo (el detalle técnico se queda en la tarea, para el
 * dueño). Si la persona ya subió un archivo, el vídeo no se toca. Con `executor`, dentro de la
 * transacción que cierra la tarea.
 */
export async function failLinkReference(videoId: number, agentTaskId: number, executor: Executor = getDb()): Promise<void> {
  await executor
    .update(schema.videos)
    .set({ referenceStatus: "failed", referenceError: LINK_FAILED, updatedAt: new Date() })
    .where(and(eq(schema.videos.id, videoId), eq(schema.videos.referenceStatus, "uploading"), eq(schema.videos.referenceSource, "link")));
  const sessions = await executor
    .delete(schema.uploadSessions)
    .where(eq(schema.uploadSessions.agentTaskId, agentTaskId))
    .returning({ id: schema.uploadSessions.id });
  await removeUploadFiles(sessions.map((row) => row.id));
}

function belongsTo(session: Session, actor: UploadActor): boolean {
  if ("agentTaskId" in actor) return session.agentTaskId !== null && session.agentTaskId === actor.agentTaskId;
  return session.agentTaskId === null && session.userId === actor.userId;
}

/**
 * La sesión de `actor` (y, si se da `videoId`, de ese vídeo: el de la dirección de la ruta).
 * Ajena, de otro vídeo o inexistente: el mismo 404. Con `lock`, bloqueada hasta el final de la
 * transacción.
 */
async function findSession(tx: Tx, uploadId: string, actor: UploadActor, videoId: number | undefined, lock: boolean): Promise<Session> {
  if (typeof uploadId !== "string" || !UPLOAD_ID.test(uploadId)) throw new HttpError(404, NOT_FOUND);
  const query = tx.select().from(schema.uploadSessions).where(eq(schema.uploadSessions.id, uploadId));
  const [session] = lock ? await query.for("update") : await query;
  if (!session || !belongsTo(session, actor) || (videoId !== undefined && session.videoId !== videoId)) {
    throw new HttpError(404, NOT_FOUND);
  }
  return session;
}

const lockedSession = (tx: Tx, uploadId: string, actor: UploadActor, videoId?: number) => findSession(tx, uploadId, actor, videoId, true);

/**
 * Añade el trozo `index`. Con la fila de la sesión bloqueada: el trozo que toca se escribe y
 * cuenta; uno ya recibido (se perdió la respuesta) responde sin escribir; uno adelantado, 409.
 * El primero decide el formato por su contenido. Si quedó medio trozo de un intento anterior,
 * se recorta antes de seguir; si el archivo ya no está, 410. `videoId` (el de la dirección de la
 * ruta) exige que la subida sea de ese vídeo.
 */
export async function appendChunk(
  uploadId: string,
  index: number,
  bytes: Buffer,
  actor: UploadActor,
  videoId?: number,
): Promise<{ received: number }> {
  return getDb().transaction(async (tx) => {
    const session = await lockedSession(tx, uploadId, actor, videoId);
    const { totalBytes } = session;
    if (!Number.isSafeInteger(index) || index < 0) throw new HttpError(400, BAD_CHUNK);
    if (totalBytes === null) {
      // Sin tamaño anunciado, el tope se aplica aquí: no existe un trozo más allá de los 100 MB.
      if (index >= MAX_CHUNKS) throw new HttpError(400, TOO_BIG);
    } else if (index >= totalChunksOf(totalBytes)) {
      throw new HttpError(400, BAD_CHUNK);
    }
    if (index < session.received) return { received: session.received };
    if (index > session.received) throw new HttpError(409, MISSING_CHUNKS);

    let mime = session.mime;
    if (index === 0) {
      mime = detectVideoType(bytes.subarray(0, 16));
      if (!mime) throw new HttpError(400, BAD_FORMAT);
    }
    // Con tamaño anunciado cada trozo mide lo que le toca; sin él, de 1 byte a 5 MB.
    const validLength = totalBytes === null ? bytes.length > 0 && bytes.length <= CHUNK_BYTES : bytes.length === chunkLength(totalBytes, index);
    if (!validLength) throw new HttpError(400, BAD_CHUNK);

    const file = uploadPath(session.id);
    if (index === 0) {
      await fs.mkdir(uploadDir(), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, bytes, { mode: 0o600 });
    } else {
      const offset = index * CHUNK_BYTES;
      const size = await fileSize(file);
      if (size === null) throw new HttpError(410, UPLOAD_GONE);
      // Sin tamaño anunciado, un trozo anterior más corto era el último: detrás no cabe otro.
      if (size < offset) throw totalBytes === null ? new HttpError(400, BAD_CHUNK) : new HttpError(410, UPLOAD_GONE);
      if (size > offset) await fs.truncate(file, offset);
      await fs.appendFile(file, bytes);
    }
    await tx.update(schema.uploadSessions).set({ received: index + 1, mime }).where(eq(schema.uploadSessions.id, session.id));
    return { received: index + 1 };
  });
}

/** Un trozo más el margen de cabeceras de algunos clientes: lo que pase de aquí no se lee. */
const MAX_CHUNK_REQUEST = CHUNK_BYTES + 1024;
const CHUNK_TOO_LARGE = "El trozo es demasiado grande.";

/**
 * Cuerpo binario de un trozo, lo envíe el navegador o el Mac. Si `Content-Length` ya dice que no
 * cabe, 413 sin leer nada; si no lo dice (envío por partes), se lee por partes y se corta en
 * cuanto pasa del máximo.
 */
export async function readChunkBody(request: Request): Promise<Buffer> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_CHUNK_REQUEST) throw new HttpError(413, CHUNK_TOO_LARGE);
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
      throw new HttpError(413, CHUNK_TOO_LARGE);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/**
 * Cuántos trozos han llegado de cuántos; si el archivo ya no está, 410 (hay que empezar de nuevo).
 * Sin tamaño anunciado, `totalChunks` es el máximo que cabría.
 */
export async function uploadProgress(
  uploadId: string,
  actor: UploadActor,
  videoId?: number,
): Promise<{ received: number; totalChunks: number }> {
  return getDb().transaction(async (tx) => {
    const session = await lockedSession(tx, uploadId, actor, videoId);
    if (session.received > 0 && (await fileSize(uploadPath(session.id))) === null) throw new HttpError(410, UPLOAD_GONE);
    return { received: session.received, totalChunks: session.totalBytes === null ? MAX_CHUNKS : totalChunksOf(session.totalBytes) };
  });
}

/**
 * Termina la subida: comprueba que llegó entera, deja la referencia «preparándose» y encola
 * `video.referencia`. Pulsar dos veces no encola dos veces: si ya se está preparando, no hace nada.
 * Una referencia lista que se está sustituyendo pasa aquí a «preparándose». Una subida sin tamaño
 * anunciado (la del Mac) lo dice al terminar, en `totalBytes`: tiene que ser justo lo que llegó.
 */
export async function finishUpload(uploadId: string, actor: UploadActor, videoId?: number, totalBytes?: number): Promise<void> {
  const job = await getDb().transaction(async (tx) => {
    // Cerrojos en el mismo orden que `startUpload` (vídeo y luego sesión): así no se bloquean
    // entre sí. Primero se lee la sesión sin bloquear, solo para saber de qué vídeo es.
    const found = await findSession(tx, uploadId, actor, videoId, false);
    const [video] = await tx.select().from(schema.videos).where(eq(schema.videos.id, found.videoId)).for("update");
    if (!video) throw new HttpError(404, NOT_FOUND);
    // Entre tanto otra subida pudo sustituirla: se vuelve a leer, ya bloqueada.
    const session = await lockedSession(tx, uploadId, actor, video.id);
    if (video.referenceStatus === "processing") return null;
    if (video.referenceStatus !== "uploading" && video.referenceStatus !== "ready") throw new HttpError(410, UPLOAD_GONE);
    const size = await fileSize(uploadPath(session.id));
    if (session.received > 0 && size === null) throw new HttpError(410, UPLOAD_GONE);
    const expected = session.totalBytes ?? totalBytes;
    if (expected === undefined || !Number.isSafeInteger(expected) || expected <= 0 || expected > MAX_REFERENCE_BYTES) {
      throw new HttpError(400, INCOMPLETE);
    }
    if (session.received < totalChunksOf(expected) || size !== expected) throw new HttpError(400, INCOMPLETE);
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
 * se quedó «subiendo» sin sesión pasa a error; uno cuya referencia estaba lista sigue lista (la
 * subida abandonada no la tocó). Devuelve cuántas sesiones borró.
 *
 * Son dos sentencias sueltas, no una transacción: así no se toman cerrojos en el orden contrario
 * al del resto del módulo (sesión y luego vídeo). La condición «sin sesión» de la segunda basta
 * para no tocar un vídeo que entre una y otra empezó otra subida.
 */
export async function cleanStaleUploads(now: Date = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - STALE_UPLOAD_MS);
  const sessions = schema.uploadSessions;
  const db = getDb();
  const removed = await db.delete(sessions).where(lt(sessions.createdAt, limit)).returning({ id: sessions.id, videoId: sessions.videoId });
  const videoIds = [...new Set(removed.map((row) => row.videoId))];
  if (videoIds.length > 0) {
    await db
      .update(schema.videos)
      .set({ referenceStatus: "failed", referenceError: UPLOAD_GONE, updatedAt: new Date() })
      .where(
        and(
          inArray(schema.videos.id, videoIds),
          eq(schema.videos.referenceStatus, "uploading"),
          notExists(db.select({ one: sql`1` }).from(sessions).where(eq(sessions.videoId, schema.videos.id))),
        ),
      );
  }
  for (const row of removed) if (UPLOAD_ID.test(row.id)) await removeFiles(row.id);

  const entries = await fs.readdir(uploadDir()).catch(() => [] as string[]);
  for (const name of entries) {
    const file = path.join(uploadDir(), name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat && stat.mtime < limit) await fs.rm(file, { force: true, recursive: true });
  }
  return removed.length;
}
