import { batchPaused, ownerRedoPending } from "@/server/videos/batch-pause";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { ElevenLabsPort } from "@/connectors/elevenlabs";
import type { HiggsfieldPort } from "@/connectors/higgsfield";
import { getObjectStore, type ObjectStore } from "@/lib/object-store";
import { LlmCapReachedError } from "@/llm/gateway";
import { macOnline } from "@/server/agent-tasks";
import { downloadLinkMedia, ensureLinkMedia, fetchInCloud, macTaskStatus, requestFromMac, saveBreakdown, type FetchDeps } from "@/server/link-media";
import { extractAudio, MediaError, probeVideo } from "@/server/media/ffmpeg";
import { killPrograms, lastLine, runProgram } from "@/server/media/programs";
import { latestSongWithDrop, readSongFile } from "@/server/songs";
import { storedOriginalKey } from "@/server/videos/archive";
import { openClipStream } from "@/server/videos/clip";
import { checkFinalDialogue, dubbedAudio, requireRedub, restoreOriginal } from "@/server/videos/doblaje";
import { referenceEdit, targetPlace, withLocalPlaces, type ReferenceEdit } from "@/server/videos/edicion-referencia";
import { applyEditChange, saveEditChange, type EditChangeResult } from "@/server/videos/cambio-montaje";
import { localizeText, marketOf, shopOfLocalization, type LocalizationItem } from "@/server/videos/localization";
import { batchOfVideo, cleanSelfCheck, currentSpec, failEdit, MAX_EDIT_BYTES, readReferenceAudio, saveEdit, settleBatch, type EditSpec } from "@/server/videos/edits";

/**
 * El montaje en la nube: el proceso en segundo plano de Railway monta los vídeos de la cola
 * `edit_runs` con el montador de siempre (`montador/montar_auto.py`, Python con librosa; los
 * rótulos con `texto06b.py`, igual que el Swift del Mac) y rea-video para la referencia de edición.
 *
 * - **Varias personas a la vez**: cada proceso monta hasta `MONTAJE_CONCURRENCIA` vídeos a la vez
 *   (8 por defecto); el resto espera en la cola, por orden de llegada. Reservar es `for update
 *   skip locked`: dos procesos nunca montan el mismo.
 * - **Latido** cada 30 s. Un montaje sin latido en 3 minutos (el proceso se reinició, una
 *   publicación nueva) vuelve a la cola; a los 5 intentos falla y el vídeo lo dice.
 * - **Entradas**: los clips del almacén propio (o de Higgsfield si aún no se copiaron), la canción
 *   de la biblioteca, el audio de la referencia y la referencia de edición (`link-media.ts`: la
 *   nube con yt-dlp y, si no puede, el Mac). Mientras el Mac trae un enlace y da señales, el
 *   montaje espera (hasta 20 minutos desde que se pidió); si el Mac no responde, monta sin ese
 *   enlace y lo avisa. Nada importante depende del Mac.
 * - **Salida**: el MP4 al almacén (`montajes/<vídeo>/<montaje>.mp4`; sin almacén, a la base de
 *   datos) y una versión nueva en `edits`.
 */

/** 8 a la vez por defecto (23/11/2026: todos los montajes del lote juntos; la máquina de Railway tiene 24 vCPU y 24 GB). */
export const MONTAJE_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.MONTAJE_CONCURRENCIA) || 3)); // con 8 a la vez ffmpeg se quedaba sin recursos (lote 10, 25/11)
export const RUN_HEARTBEAT_MS = 30_000;
export const RUN_STALE_MS = 3 * 60_000;
/** Intentos de un montaje cortado sin latido (cada publicación reinicia el proceso; varias seguidas no deben agotarlos). */
export const MAX_RUN_ATTEMPTS = 5;
export const MONTADOR_TIMEOUT_MS = 25 * 60_000;
export const REA_VIDEO_TIMEOUT_MS = 10 * 60_000;
/** Separar la voz o mezclar el doblaje (`doblar.py`). */
export const DOBLAR_TIMEOUT_MS = 15 * 60_000;
/** Lo más que un montaje espera a que el Mac traiga un enlace, desde que se pidió el montaje. */
export const LINK_WAIT_MAX_MS = 20 * 60_000;
/** Cada cuánto se vuelve a mirar si el enlace ya llegó. */
export const LINK_RECHECK_MS = 60_000;
/** Dónde está la fuente de los rótulos en el almacén (se sube una vez: `scripts/subir-fuente.ts`). */
export const FONT_KEY = "recursos/fuentes/TikTok-Display-Medium.ttf";
/**
 * Los emojis de los rótulos, como en el iPhone: la fuente Apple Color Emoji del Mac en el almacén (se
 * sube una vez: `scripts/subir-fuente.ts --emojis`). Sin ella, Noto Color Emoji (los de Android) y un aviso.
 */
export const EMOJI_FONT_KEY = "recursos/fuentes/AppleColorEmoji.ttc";
export const NO_APPLE_EMOJI = "Los emojis salen como en Android: falta la fuente de emojis del iPhone en el almacén";

export const INTERRUPTED = "El montaje se interrumpió varias veces. Vuelve a montarlo.";
export const INTERNAL = "No se pudo montar: error interno del montaje.";
export const montajeFailure = (detail: string) => `No se pudo montar: ${detail || "el montador no dio detalles"}`;

const runs = schema.editRuns;
type Run = typeof runs.$inferSelect;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export interface MontajeDeps {
  store?: ObjectStore | null;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Python con las dependencias del montador (`MONTADOR_PYTHON`, por defecto `python3`). */
  python?: string;
  /** Python con rea-video (`REA_VIDEO_PYTHON`; sin él, el del montador). `null`: no desglosar. */
  reaPython?: string | null;
  /** Fuente de los rótulos ya en el disco (si no, `MONTADOR_FUENTE` o la del almacén). */
  font?: string;
  /** Fuente de los emojis del iPhone ya en el disco (si no, la del almacén). */
  emojiFont?: string;
  /** Carpeta del montador (por defecto `montador/` del proyecto). */
  montadorDir?: string;
  /** yt-dlp simulado (pruebas). */
  runYtDlp?: FetchDeps["runYtDlp"];
  /** Claude (pruebas: uno simulado) para leer la edición de la referencia. */
  gateway?: import("@/llm/gateway").LlmGateway;
  /** Dependencia de Higgsfield conservada para los consumidores existentes del montaje. */
  higgsfield?: HiggsfieldPort;
  /** ElevenLabs para el doblaje y las reparaciones de diálogo. */
  elevenlabs?: ElevenLabsPort;
  dubPollSeconds?: number;
}

const nowOf = (deps: MontajeDeps) => deps.now?.() ?? new Date();

// ───────────────────────── Cola ─────────────────────────

/** Reserva el montaje más antiguo cuya hora ha llegado; `null` si no hay. */
export async function claimRun(now: Date): Promise<Run | null> {
  const result = await getDb().execute<{ id: string }>(sql`
    update edit_runs set status = 'running', attempts = attempts + 1, started_at = ${now.toISOString()}::timestamptz,
      heartbeat_at = ${now.toISOString()}::timestamptz
    where id = (
      select id from edit_runs where status = 'queued'
      and not exists (select 1 from videos v join batches b on b.id = v.batch_id
        where v.id = edit_runs.video_id and b.status = 'pausado' and coalesce(v.owner_redo->>'kind', '') <> 'clip') and available_at <= ${now.toISOString()}::timestamptz
      order by id limit 1 for update skip locked)
    returning id`);
  const id = result.rows[0]?.id;
  if (!id) return null;
  const [run] = await getDb().select().from(runs).where(eq(runs.id, Number(id)));
  return run ?? null;
}

/** Montajes sin latido: vuelven a la cola o, agotados los intentos, fallan. */
export async function requeueStaleRuns(now: Date): Promise<void> {
  const stale = await getDb()
    .select()
    .from(runs)
    .where(and(eq(runs.status, "running"), lt(runs.heartbeatAt, new Date(now.getTime() - RUN_STALE_MS))));
  for (const run of stale) {
    if (run.attempts < MAX_RUN_ATTEMPTS) {
      await getDb()
        .update(runs)
        .set({ status: "queued", availableAt: now })
        .where(and(eq(runs.id, run.id), eq(runs.status, "running"), lt(runs.heartbeatAt, new Date(now.getTime() - RUN_STALE_MS))));
    } else {
      await finishFailed(run, INTERRUPTED, "sin latido", now);
    }
  }
}

async function finishFailed(run: Run, shown: string, detail: string, now: Date, notes: string[] = []): Promise<void> {
  console.warn(`[montaje] Vídeo ${run.videoId}: el montaje ${run.id} falló: ${shown} (${detail.slice(0, 1500)})`);
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(runs)
      .set({ status: "failed", error: detail.slice(0, 500), finishedAt: now, notes })
      .where(and(eq(runs.id, run.id), eq(runs.status, "running")))
      .returning({ id: runs.id });
    if (row) await failEdit(tx, run.videoId, run.id, shown);
  });
  await settleBatch(await batchOfVideo(run.videoId));
}

/**
 * Lo más que espera un montaje a que Claude pueda leer la edición de su referencia (la API sin saldo y
 * el Mac del dueño apagado o sin sesión). Pasado este tiempo se monta con el patrón de siempre.
 */
export const CLAUDE_WAIT_MS = 3 * 60 * 60_000;
/** TEMPORAL (hasta el 25/11/2026): enlaces firmados (2 h) del último montaje de esos vídeos, en el registro. */
export async function logVerifyLinks(videoIds: number[], now: Date = new Date()): Promise<void> {
  const store = getObjectStore();
  if (!store || now >= VERIFY_UNTIL) return;
  for (const id of videoIds) {
    const [edit] = await getDb().select().from(schema.edits).where(eq(schema.edits.videoId, id)).orderBy(sql`${schema.edits.version} desc`).limit(1);
    if (!edit?.storageKey) continue;
    const link = await store.signedUrl(edit.storageKey, { expiresIn: 2 * 3600 }).catch(() => null);
    console.log(`[montaje] Vídeo ${id} (versión ${edit.version}); comprobación: ${link ?? "sin enlace"}`);
  }
}

/** TEMPORAL: vídeos del lote 6 cuyo montaje final se comprueba a mano (enlace firmado en el registro). */
const VERIFY_VIDEOS = new Set([11, 15, 16, 19, 20, 21, 22, 24]);
const VERIFY_UNTIL = new Date("2026-11-25T12:00:00Z");
/** Cada cuánto vuelve a probar un montaje que espera a Claude (y al momento cuando el Mac está listo). */
export const CLAUDE_RETRY_MS = 5 * 60_000;

/**
 * El Mac del dueño acaba de tener Claude Code listo: los montajes que esperaban a Claude (en cola con la
 * hora más adelante) se adelantan a ahora. Devuelve cuántos.
 */
export async function wakeRunsWaitingForClaude(now: Date = new Date()): Promise<number> {
  const woken = await getDb()
    .update(runs)
    .set({ availableAt: now })
    .where(and(eq(runs.status, "queued"), sql`${runs.availableAt} > ${now.toISOString()}::timestamptz`, sql`${runs.error} = ${WAITING_CLAUDE}`))
    .returning({ id: runs.id });
  return woken.length;
}

/** Marca (en `edit_runs.error` mientras espera en cola) de un montaje que espera a Claude. */
export const WAITING_CLAUDE = "Esperando a Claude (sin saldo en la API y sin el Mac).";

/** Devuelve el montaje a la cola para dentro de `delayMs` sin gastar un intento (espera a un enlace). */
async function defer(run: Run, delayMs: number, now: Date): Promise<void> {
  await getDb()
    .update(runs)
    .set({ status: "queued", attempts: sql`greatest(${runs.attempts} - 1, 0)`, availableAt: new Date(now.getTime() + delayMs) })
    .where(and(eq(runs.id, run.id), eq(runs.status, "running")));
}

// ───────────────────────── Programas ─────────────────────────

/** Mata los programas en marcha (al parar el proceso). */
export function killMontajePrograms(): void {
  killPrograms();
}

const fontCache = path.join(os.tmpdir(), "principal-recursos");

/** Un recurso del almacén en el disco (se baja una vez por proceso y se reutiliza). `null` si no está. */
async function cachedResource(store: ObjectStore, key: string): Promise<string | null> {
  const target = path.join(fontCache, path.basename(key));
  if (await fs.stat(target).then((s) => s.size > 0, () => false)) return target;
  if ((await store.head(key)) === null) return null;
  await fs.mkdir(fontCache, { recursive: true });
  const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await store.download(key, temp);
  await fs.rename(temp, target);
  return target;
}

/** La fuente de los rótulos en el disco: la indicada, `MONTADOR_FUENTE` o la del almacén (se baja una vez). */
async function fontFile(store: ObjectStore | null, deps: MontajeDeps): Promise<string | null> {
  for (const candidate of [deps.font, process.env.MONTADOR_FUENTE]) {
    if (candidate && (await fs.stat(candidate).then((s) => s.isFile(), () => false))) return candidate;
  }
  return store ? cachedResource(store, FONT_KEY) : null;
}

/** La fuente de los emojis del iPhone: la indicada, la del almacén o, en el Mac, la del sistema. `null`: no hay. */
async function appleEmojiFile(store: ObjectStore | null, deps: MontajeDeps): Promise<string | null> {
  for (const candidate of [deps.emojiFont, "/System/Library/Fonts/Apple Color Emoji.ttc"]) {
    if (candidate && (await fs.stat(candidate).then((s) => s.isFile(), () => false))) return candidate;
  }
  return store ? cachedResource(store, EMOJI_FONT_KEY).catch(() => null) : null;
}

// ───────────────────────── Entradas ─────────────────────────

/** Un clip a `target`: del almacén propio si ya está copiado; si no, de Higgsfield. */
async function fetchClip(clip: { jobId: string | null; url: string }, target: string, store: ObjectStore | null, deps: MontajeDeps): Promise<void> {
  const key = store && clip.jobId ? await storedOriginalKey(clip.jobId) : null;
  if (store && key) {
    await store.download(key, target);
    return;
  }
  const { body } = await openClipStream(clip.url, { fetch: deps.fetch });
  await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), createWriteStream(target));
}

type LinkOutcome = { file: string | null; breakdown: string | null; defer: boolean };

/**
 * Lo que hace falta de un enlace (`kind`: referencia de edición o audio de la referencia). Lo
 * baja si ya está; si no, lo intenta en la nube y, si no puede, se lo pide al Mac y dice si
 * merece la pena esperar (`defer`). Lo que no llega se apunta en `notes`.
 */
async function resolveLink(
  url: string,
  kind: "edicion" | "audio",
  run: Run,
  dir: string,
  store: ObjectStore | null,
  notes: string[],
  deps: MontajeDeps,
): Promise<LinkOutcome> {
  const what = kind === "edicion" ? "la referencia de edición" : "el audio de la referencia";
  const none: LinkOutcome = { file: null, breakdown: null, defer: false };
  if (!store) {
    notes.push(`Sin almacén de archivos: se monta sin ${what}`);
    return none;
  }
  let row = await ensureLinkMedia(url);
  if (!row) {
    notes.push(`El enlace de ${what} no es de un sitio admitido: se monta sin ${what}`);
    return none;
  }
  if (row.status === "pending" && !row.cloudTriedAt) {
    await fetchInCloud(row, { store, runYtDlp: deps.runYtDlp, now: deps.now });
    row = (await ensureLinkMedia(url))!;
  }
  if (row.status === "pending") {
    const task = await macTaskStatus(row);
    if (task === null || task === "done" || task === "failed") {
      if (!(await requestFromMac(row, nowOf(deps)))) {
        notes.push(`La nube no pudo traer ${what} y no hay Mac: se monta sin ella`);
        return none;
      }
    }
    const waited = nowOf(deps).getTime() - run.createdAt.getTime();
    if (waited < LINK_WAIT_MAX_MS && (await macOnline(nowOf(deps)))) return { ...none, defer: true };
    notes.push(`El Mac no responde y la nube no pudo traer ${what}: se monta sin ella`);
    return none;
  }
  if (row.status !== "ready") {
    notes.push(`No se pudo traer ${what}: se monta sin ella`);
    return none;
  }
  const file = path.join(dir, kind === "edicion" ? "referencia-edicion.mp4" : "referencia-audio.mp4");
  await downloadLinkMedia(row, file, { store });
  if (kind === "audio") return { file, breakdown: null, defer: false };

  // El desglose de rea-video se hace una vez por enlace.
  let breakdown = row.breakdownStatus === "done" ? row.breakdown : null;
  if (row.breakdownStatus === null) {
    breakdown = await decompose(file, dir, deps);
    await saveBreakdown(row.id, breakdown, nowOf(deps));
    if (!breakdown) notes.push("rea-video no pudo analizar la referencia de edición: se monta con el patrón de siempre");
  }
  if (!breakdown) return { file, breakdown: null, defer: false };
  const breakdownFile = path.join(dir, "breakdown.json");
  await fs.writeFile(breakdownFile, JSON.stringify(breakdown));
  return { file, breakdown: breakdownFile, defer: false };
}

/** rea-video `decompose` de un vídeo: su `breakdown.json` o `null`. */
async function decompose(file: string, dir: string, deps: MontajeDeps): Promise<unknown | null> {
  const python = deps.reaPython === undefined ? process.env.REA_VIDEO_PYTHON || deps.python || process.env.MONTADOR_PYTHON || "python3" : deps.reaPython;
  if (!python) return null;
  const out = path.join(dir, "rea");
  const ran = await runProgram(python, ["-m", "rea_video", "decompose", file, "-o", out], { cwd: dir, timeoutMs: REA_VIDEO_TIMEOUT_MS, env: safeEnv(numbaCacheOf(dir)) });
  if (ran.code !== 0) {
    console.warn(`[montaje] rea-video no pudo: ${ran.timedOut ? "tardó demasiado" : lastLine(ran.stderr)}`);
    return null;
  }
  try {
    return JSON.parse(await fs.readFile(path.join(out, "breakdown.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Caché de numba (la usa librosa) de UN montaje, dentro de su carpeta. Una caché compartida (`/tmp/numba`) por varios
 * montajes a la vez se corrompe y el montador muere con SIGSEGV en `librosa.onset` (vídeo 21 del lote 6, 24/11/2026).
 */
const numbaCacheOf = (dir: string) => ({ NUMBA_CACHE_DIR: path.join(dir, "numba") });

/** Entorno de los programas: sin secretos de la web (base de datos, bóveda, claves). */
function safeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "PYTHONPATH", "UV_CACHE_DIR", "XDG_CACHE_HOME", "NUMBA_CACHE_DIR", "MPLCONFIGDIR", "EMOJI_FONT", "REA_VIDEO_HOME", "REA_VIDEO_MODELS", "WHISPER_MODELS"];
  const env: Record<string, string> = {};
  for (const name of keep) if (process.env[name]) env[name] = process.env[name]!;
  // Lote 10 (25/11/2026): el contenedor admite 1000 hilos y cada librería abría uno por núcleo (48): con varios
  // montajes a la vez ffmpeg y numpy fallaban con «Resource temporarily unavailable».
  const threads = { OMP_NUM_THREADS: "4", OPENBLAS_NUM_THREADS: "4", MKL_NUM_THREADS: "4", NUMBA_NUM_THREADS: "4", VECLIB_MAXIMUM_THREADS: "4", NUMEXPR_MAX_THREADS: "4" };
  return { ...env, ...threads, PYTHONDONTWRITEBYTECODE: "1", ...extra } as unknown as NodeJS.ProcessEnv;
}

let pinSlot = 0;
/**
 * El montador limitado a 8 núcleos (`taskset`): ffmpeg y libx264 calculan sus hilos con los núcleos que ven, así que
 * cada montaje abre unos 12 en vez de 72. Cada montaje va a otro bloque de núcleos. Sin `taskset` (Mac), tal cual.
 */
function pinned(command: string, args: string[]): [string, string[]] {
  const cpus = os.cpus().length;
  if (process.platform !== "linux" || cpus <= 8) return [command, args];
  const blocks = Math.floor(cpus / 8);
  const start = (pinSlot++ % blocks) * 8;
  return ["taskset", ["-c", `${start}-${start + 7}`, command, ...args]];
}

const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav" };

// ───────────────────────── Montar ─────────────────────────

/** Una canción de la biblioteca para un vídeo que se quedaría mudo: la más reciente con el drop marcado. */
async function fallbackSong(dir: string): Promise<(NonNullable<EditSpec["song"]> & { path: string }) | null> {
  const row = await latestSongWithDrop();
  if (!row) return null;
  const file = await readSongFile(row.id);
  if (!file) return null;
  const songPath = path.join(dir, `cancion-respaldo.${AUDIO_EXT[file.mime] ?? "mp3"}`);
  await fs.writeFile(songPath, file.data);
  return { id: row.id, title: row.title, dropMs: row.dropMs, startMs: row.startMs ?? 0, durationMs: row.durationMs, path: songPath };
}

/**
 * Monta el vídeo de un montaje ya reservado (`running`). Termina siempre: bien (versión nueva),
 * mal (el vídeo dice por qué) o de vuelta a la cola (esperando un enlace del Mac).
 */
export async function runEdit(run: Run, deps: MontajeDeps = {}): Promise<"done" | "failed" | "deferred"> {
  if (await batchPaused(run.videoId) && !await ownerRedoPending(run.videoId, "clip")) {
    await defer(run, 60_000, nowOf(deps));
    return "deferred";
  }
  const store = deps.store === undefined ? getObjectStore() : deps.store;
  const spec = run.spec as EditSpec;
  const personalized = spec.product.kind === "cancion";
  if (personalized) {
    // También protege fichas antiguas y cambios de doblaje pedidos sobre este tipo de producto.
    if (!spec.song) {
      await finishFailed(run, montajeFailure("falta la canción personalizada"), "sin canción", nowOf(deps), []);
      return "failed";
    }
    spec.song = { ...spec.song, dropMs: 0, startMs: 0 };
    spec.referenceAudio = null;
    spec.dubDialogue = false;
    spec.dubForced = false;
  }
  const notes: string[] = [];
  // Correcciones aprendidas («Mejoras») que use este montaje (rótulos y doblaje): se guardan para medir su efecto.
  const learned: number[] = [];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `montaje-${run.id}-`));
  const beat = setInterval(() => {
    void getDb().update(runs).set({ heartbeatAt: new Date() }).where(and(eq(runs.id, run.id), eq(runs.status, "running"))).catch(() => {});
  }, RUN_HEARTBEAT_MS);
  try {
    // 1. Enlaces (antes de bajar nada: si hay que esperar al Mac, no se ha gastado nada).
    // Sin referencia de edición, la de la réplica (regla de Codex): su enlace, si no está guardada entera.
    const replicaLink = !spec.editReferenceUrl && spec.replicaReference?.source === "enlace" ? spec.replicaReference.url : null;
    const editRef = spec.editReferenceUrl || replicaLink ? await resolveLink((spec.editReferenceUrl ?? replicaLink)!, "edicion", run, dir, store, notes, deps) : null;
    const audioLink = spec.referenceAudio?.source === "enlace" ? await resolveLink(spec.referenceAudio.url, "audio", run, dir, store, notes, deps) : null;
    if (editRef?.defer || audioLink?.defer) {
      await defer(run, LINK_RECHECK_MS, nowOf(deps));
      return "deferred";
    }

    // 2. Clips, canción, audio de la referencia y fuente.
    const clips: Array<{ role: string; path: string; trim?: { fromS: number; toS: number } }> = [];
    for (const [i, clip] of spec.clips.entries()) {
      const target = path.join(dir, `clip-${i}.mp4`);
      try {
        await fetchClip(clip, target, store, deps);
      } catch (error) {
        await finishFailed(run, montajeFailure("no se pudo descargar un clip"), messageOf(error), nowOf(deps), notes);
        return "failed";
      }
      clips.push({ role: clip.role, path: target, ...(clip.trim ? { trim: clip.trim } : {}) });
    }
    let song: (NonNullable<EditSpec["song"]> & { path: string }) | null = null;
    if (spec.song) {
      const file = await readSongFile(spec.song.id);
      if (!file) {
        await finishFailed(run, montajeFailure("la canción ya no está en la biblioteca"), "canción borrada", nowOf(deps), notes);
        return "failed";
      }
      const songPath = path.join(dir, `cancion.${AUDIO_EXT[file.mime] ?? "mp3"}`);
      await fs.writeFile(songPath, file.data);
      song = { ...spec.song, path: songPath };
    }
    let referenceAudio: { path: string } | null = null;
    if (spec.referenceAudio?.source === "web") {
      const audio = await readReferenceAudio(spec.videoId);
      if (audio) {
        referenceAudio = { path: path.join(dir, "referencia-audio.m4a") };
        await fs.writeFile(referenceAudio.path, audio.data);
      } else notes.push("No está el audio de la referencia: el vídeo queda sin él");
    } else if (audioLink?.file) {
      const out = path.join(dir, "referencia-audio.m4a");
      try {
        if (await extractAudio(audioLink.file, out)) referenceAudio = { path: out };
        else notes.push("La referencia no trae audio: el vídeo queda sin él");
      } catch (error) {
        if (!(error instanceof MediaError)) throw error;
        notes.push("No se pudo sacar el audio de la referencia: el vídeo queda sin él");
      }
    }
    // La edición de la referencia efectiva: rótulos adaptados con sus tiempos y cortes (`edicion-referencia.ts`).
    let referenceFile = editRef?.file ?? null;
    if (!referenceFile && !spec.editReferenceUrl && spec.replicaReference?.source === "almacen" && store) {
      const target = path.join(dir, "referencia-replica.mp4");
      try {
        await store.download(spec.replicaReference.key, target);
        referenceFile = target;
      } catch (error) {
        notes.push("No se pudo bajar el vídeo de referencia de la réplica: se monta con el patrón de siempre");
        console.warn(`[montaje] Referencia de la réplica ${spec.replicaReference.key}: ${messageOf(error)}`);
      }
    }
    const [owner] = await getDb()
      .select({
        productId: schema.videos.productId,
        userId: schema.videos.createdBy,
        note: schema.videos.note,
        adaptation: schema.videos.adaptation,
        batchId: schema.videos.batchId,
        editOverride: schema.videos.editOverride,
      })
      .from(schema.videos)
      .where(eq(schema.videos.id, spec.videoId));
    const [batchProduct] =
      owner?.batchId != null
        ? await getDb()
            .select({ notes: schema.batchProducts.notes })
            .from(schema.batchProducts)
            .where(and(eq(schema.batchProducts.batchId, owner.batchId), eq(schema.batchProducts.productId, owner.productId)))
        : [];
    // Dónde pasa el anuncio (regla 6c): la ciudad de las indicaciones del dueño o el país del producto.
    const place = targetPlace(
      [owner?.note, owner?.adaptation, batchProduct?.notes].filter(Boolean).join("\n"),
      spec.product.countries ?? [],
      spec.product.language,
    );
    // La tienda del anuncio (regla 5 de los rótulos): la que nombran las indicaciones del dueño o, si no, la de la
    // escena según la localización del desglose. Nunca el nombre del producto (vídeo 37 del lote 10: «zu EisWerk»).
    const indications = [owner?.note, owner?.adaptation, batchProduct?.notes].filter(Boolean).join("\n");
    const [analysisRow] = await getDb()
      .select({ result: schema.videoAnalyses.result })
      .from(schema.videoAnalyses)
      .where(and(eq(schema.videoAnalyses.videoId, spec.videoId), eq(schema.videoAnalyses.status, "done")))
      .orderBy(desc(schema.videoAnalyses.id))
      .limit(1);
    // La escena real del vídeo: el sitio de su imagen inicial (la tienda que se ve). Manda sobre las indicaciones del
    // lote, que son para todos los vídeos del producto (lote 10: «Aldi» en la escena y «Lidl» en el texto).
    const [sceneRow] = await getDb()
      .select({ scene: schema.videoPinterestRefs.scene })
      .from(schema.videoPinterestRefs)
      .where(and(eq(schema.videoPinterestRefs.videoId, spec.videoId), eq(schema.videoPinterestRefs.tramo, 0), eq(schema.videoPinterestRefs.status, "ready")))
      .orderBy(desc(schema.videoPinterestRefs.id))
      .limit(1);
    const sceneInfo = sceneRow?.scene as { namedPlace?: string | null; place?: string | null } | null | undefined;
    const sceneText = [sceneInfo?.namedPlace, sceneInfo?.place].filter(Boolean).join(": ");
    const cardNotes = [owner?.note, owner?.adaptation].filter(Boolean).join("\n");
    const shop =
      shopOfLocalization([{ kind: "tienda", original: cardNotes, target: cardNotes }]) ??
      shopOfLocalization([{ kind: "tienda", original: sceneInfo?.namedPlace ?? "", target: sceneText }]) ??
      shopOfLocalization([{ kind: "tienda", original: indications, target: indications }]) ??
      shopOfLocalization((analysisRow?.result as { localization?: LocalizationItem[] | null } | null)?.localization);
    let edicion: ReferenceEdit | null = null;
    if (referenceFile) {
      try {
        edicion = await referenceEdit({
          place,
          shop,
          indications: personalized
            ? `${indications}
Este producto es una canción personalizada: copia y adapta únicamente el gancho editorial y la llamada final. No incluyas la letra cantada ni sus subtítulos amarillos en los rótulos: la canción nueva lleva su propia capa de letra sincronizada.`
            : indications,
          scene: sceneText || null,
          song: spec.song?.title ?? null,
          file: referenceFile,
          product: { id: owner?.productId ?? 0, name: spec.product.name, language: spec.product.language },
          userId: owner?.userId ?? run.requestedBy,
          dir,
          store,
          videoId: spec.videoId,
          gateway: deps.gateway,
          learned,
        });
      } catch (error) {
        // Sin Claude por ahora (API sin saldo, Mac apagado o sin sesión): se espera a que lo haya en vez de
        // montar peor. Al tener el Mac listo se adelanta (`wakeRunsWaitingForClaude`).
        if (error instanceof LlmCapReachedError && nowOf(deps).getTime() - run.createdAt.getTime() < CLAUDE_WAIT_MS) {
          console.warn(`[montaje] Vídeo ${spec.videoId}: Claude no está disponible (${error.message}); el montaje espera.`);
          await getDb().update(runs).set({ error: WAITING_CLAUDE }).where(eq(runs.id, run.id));
          await defer(run, CLAUDE_RETRY_MS, nowOf(deps));
          return "deferred";
        }
        notes.push("No se pudo leer la edición de la referencia: se monta con el patrón de siempre");
        console.warn(`[montaje] Edición de la referencia del vídeo ${spec.videoId}: ${messageOf(error)}`);
      }
    } else if (!spec.editReferenceUrl) {
      notes.push("No está el vídeo de referencia de la réplica: se monta con el patrón de siempre");
    }

    // «¿Qué quieres cambiar?» (`cambio-montaje.ts`): los rótulos ya cambiados antes mandan sobre la lectura, y un
    // cambio pedido se aplica ahora con Claude, solo a lo que pide.
    const override = owner?.editOverride ?? null;
    // Rótulos que vienen de un cambio que dictó el dueño: la localización automática no los toca (él manda).
    let ownerTexts = false;
    if (override?.rotulos && edicion) {
      edicion = { ...edicion, cues: override.rotulos.map((r) => ({ startS: r.desde_s, source: "", text: r.texto, es: "", cta: r.cta })) };
    }
    if (override?.pendiente) {
      let changed: EditChangeResult;
      try {
        changed = await applyEditChange({
          videoId: spec.videoId,
          runId: run.id,
          userId: override.pendiente.por,
          productId: owner?.productId ?? 0,
          product: spec.product,
          instruction: override.pendiente.texto,
          cues: edicion?.cues ?? [],
          texts: spec.texts,
          song: spec.song ? { id: spec.song.id, title: spec.song.title } : null,
          dub: spec.dubDialogue === true,
          gateway: deps.gateway,
        });
      } catch (error) {
        if (error instanceof LlmCapReachedError && nowOf(deps).getTime() - run.createdAt.getTime() < CLAUDE_WAIT_MS) {
          console.warn(`[montaje] Vídeo ${spec.videoId}: Claude no está disponible para el cambio pedido (${error.message}); el montaje espera.`);
          await getDb().update(runs).set({ error: WAITING_CLAUDE }).where(eq(runs.id, run.id));
          await defer(run, CLAUDE_RETRY_MS, nowOf(deps));
          return "deferred";
        }
        await finishFailed(run, "No se pudo aplicar el cambio pedido: vuelve a montar para intentarlo otra vez.", messageOf(error), nowOf(deps), notes);
        return "failed";
      }
      await saveEditChange(spec.videoId, override, changed, edicion !== null, nowOf(deps));
      console.log(`[montaje] Vídeo ${spec.videoId}: cambio pedido aplicado (montaje ${run.id}): ${changed.summary}`);
      if (changed.songId !== undefined || changed.dub !== undefined) {
        // Otra música u otro doblaje: la ficha se rehace y el montaje vuelve a empezar con ella (el cambio ya está guardado).
        await getDb().update(runs).set({ spec: await currentSpec(spec.videoId) }).where(eq(runs.id, run.id));
        await defer(run, 0, nowOf(deps));
        return "deferred";
      }
      if (edicion) edicion = { ...edicion, cues: changed.cues };
      spec.texts = changed.texts;
      ownerTexts = true;
      notes.push(`Cambio pedido aplicado: ${changed.summary}`);
    }

    // Ningún montaje sale mudo (orden del 24/11/2026): sin canción ni audio de la referencia guardado, el audio del
    // vídeo de referencia (el de la réplica o el de edición); si tampoco, una canción de la biblioteca. Y se avisa.
    if (!personalized && !spec.song && !referenceAudio) {
      if (referenceFile) {
        const out = path.join(dir, "referencia-audio-respaldo.m4a");
        try {
          if (await extractAudio(referenceFile, out)) {
            referenceAudio = { path: out };
            notes.push("No estaba guardado el audio de la referencia: se usa el del vídeo de referencia");
          }
        } catch (error) {
          if (!(error instanceof MediaError)) throw error;
        }
      }
      if (!referenceAudio) {
        const fallback = await fallbackSong(dir);
        if (fallback) {
          song = fallback;
          notes.push(`El vídeo no tenía audio (ni canción ni audio de la referencia): se pone la canción «${fallback.title}» de la biblioteca`);
        } else notes.push("El vídeo no tiene audio y la biblioteca no tiene canciones con drop: elige una canción");
      }
    }

    // «Traducir el diálogo al alemán»: el «Audio original» con la voz doblada y la música de siempre.
    // Por defecto (regla fija del 24/11/2026); con canción elegida no suena la referencia y no hay nada que doblar.
    // La comprobación final (abajo) escucha el vídeo montado cuando la referencia pone el audio y el diálogo se dobla.
    let finalCheck: { audio: string; origin: string | null } | null = null;
    const doblar = async (args: string[]) => {
      const montadorDir = deps.montadorDir ?? path.join(process.cwd(), "montador");
      const python = process.env.REA_VIDEO_PYTHON || deps.python || process.env.MONTADOR_PYTHON || "python3";
      const out = path.join(dir, `doblar-${args[0]}.json`);
      await fs.rm(out, { force: true });
      const ran = await runProgram(...pinned(python, ["-B", path.join(montadorDir, "doblar.py"), "--resultado", out, ...args]), {
        cwd: montadorDir,
        timeoutMs: DOBLAR_TIMEOUT_MS,
        env: safeEnv(numbaCacheOf(dir)),
      });
      try {
        return JSON.parse(await fs.readFile(out, "utf8")) as import("@/server/videos/doblaje").DoblarResult;
      } catch {
        return { ok: false, error: ran.timedOut ? "tardó demasiado" : (lastLine(ran.stderr) ?? "doblar.py no respondió") };
      }
    };
    if (!personalized && spec.dubDialogue && !spec.song && referenceAudio) {
      if (!store) notes.push("Sin almacén de archivos: el diálogo no se traduce");
      else {
        finalCheck = { audio: referenceAudio.path, origin: null };
        const dub = await dubbedAudio({
          videoId: spec.videoId,
          requestedAt: run.createdAt,
          audio: referenceAudio.path,
          language: spec.product.language,
          forced: spec.dubForced === true,
          referenceVideo: audioLink?.file ?? null,
          dir,
          store,
          notes,
          elevenlabs: deps.elevenlabs,
          fetch: deps.fetch,
          now: deps.now,
          pollSeconds: deps.dubPollSeconds,
          gateway: deps.gateway,
          learned,
          doblar,
        });
        if (dub.kind === "defer") {
          await defer(run, dub.delayMs, nowOf(deps));
          return "deferred";
        }
        if (dub.kind === "failed") {
          await finishFailed(run, dub.shown, dub.detail, nowOf(deps), notes);
          return "failed";
        }
        if (dub.kind === "ready") {
          referenceAudio = { path: dub.path };
          finalCheck.origin = dub.origin;
        }
      }
    }

    const font = await fontFile(store, deps);
    if (!font) {
      await finishFailed(run, montajeFailure("falta la fuente de los rótulos en el servidor"), "sin fuente", nowOf(deps), notes);
      return "failed";
    }
    const emojiFont = await appleEmojiFile(store, deps);
    if (!emojiFont) notes.push(NO_APPLE_EMOJI);

    // 3. El montador.
    const work = path.join(dir, "trabajo");
    await fs.mkdir(work);
    const specPath = path.join(dir, "ficha.json");
    await fs.writeFile(
      specPath,
      JSON.stringify({
        ...spec,
        // Regla 6c también en los rótulos del desglose o de la tarjeta: nada de lugares de otro mercado.
        // Y la localización al país (tiendas, moneda): Target → Action, $ → €.
        texts: {
          main: ownerTexts ? spec.texts.main : localizeText(withLocalPlaces(spec.texts.main, [], place), marketOf(spec.product)),
          cta: ownerTexts ? spec.texts.cta : localizeText(withLocalPlaces(spec.texts.cta, [], place), marketOf(spec.product)),
        },
        clips,
        // Con la canción de respaldo si el vídeo se quedaba mudo.
        song,
        referenceAudio,
        referencia: editRef?.breakdown ? { breakdown: editRef.breakdown } : null,
        edicionReferencia: edicion
          ? { duracion_s: edicion.durationS, cortes_s: edicion.cutsS, rotulos: edicion.cues.map((c) => ({ desde_s: c.startS, texto: c.text, cta: c.cta })) }
          : null,
        avisos: notes,
      }),
    );
    const montadorDir = deps.montadorDir ?? path.join(process.cwd(), "montador");
    const python = deps.python ?? process.env.MONTADOR_PYTHON ?? "python3";
    const ran = await runProgram(...pinned(python, ["-B", path.join(montadorDir, "montar_auto.py"), specPath, work]), {
      cwd: montadorDir,
      timeoutMs: MONTADOR_TIMEOUT_MS,
      env: safeEnv({ ...numbaCacheOf(dir), MONTADOR_FUENTE: font, MONTADOR_CACHE: path.join(os.tmpdir(), "montador-cache"), ...(emojiFont ? { EMOJI_FONT: emojiFont } : {}) }),
    });
    let result: { ok?: boolean; error?: string; autocomprobacion?: unknown; avisos?: unknown } | null = null;
    try {
      result = JSON.parse(await fs.readFile(path.join(work, "resultado.json"), "utf8"));
    } catch {
      result = null;
    }
    if (!result || result.ok !== true) {
      const detail = ran.timedOut ? "el montador tardó más de 25 minutos" : (result?.error ?? (lastLine(ran.stderr) ?? "el montador no dejó resultado"));
      // Para el registro (no para la persona): cómo terminó y lo último que dijo.
      const exit = ran.signal ? `señal ${ran.signal}` : `código ${ran.code}`;
      const tail = ran.stderr.trim().split("\n").slice(-6).join(" | ").slice(-1200);
      await finishFailed(run, montajeFailure(String(detail).slice(0, 250)), `${detail} [${exit}]${tail ? ` ${tail}` : ""}`, nowOf(deps), notes);
      return "failed";
    }

    const output = path.join(work, "salida.mp4");
    // 3b. Comprobación final obligatoria (orden del dueño, 25/11/2026): se escucha el vídeo montado. Si queda diálogo en un
    // idioma que no es el del país, no se entrega: se vuelve a doblar (esos tramos, sí o sí) y a montar; si después de
    // MAX_FINAL_REDUBS veces sigue igual, se para con el motivo. Nunca se entrega con el diálogo sin traducir.
    if (finalCheck) {
      const [owner] = await getDb()
        .select({ createdBy: schema.videos.createdBy, productId: schema.videos.productId })
        .from(schema.videos)
        .where(eq(schema.videos.id, spec.videoId));
      const verdict = await checkFinalDialogue(
        {
          videoId: spec.videoId,
          file: output,
          audio: finalCheck.audio,
          language: spec.product.language,
          origin: finalCheck.origin,
          forced: spec.dubForced === true,
          dir,
          doblar,
          gateway: deps.gateway,
          learned,
        },
        owner?.createdBy ?? run.requestedBy,
        owner?.productId ?? null,
      );
      if (verdict.kind === "error") {
        await finishFailed(run, montajeFailure(`no se pudo comprobar que el diálogo esté traducido (${verdict.detail.slice(0, 160)}). Vuelve a montar`), verdict.detail, nowOf(deps), notes);
        return "failed";
      }
      if (verdict.kind === "leak" && verdict.lyrics.length) {
        // Letra traducida: vuelve el audio original en esos tramos, sin doblar otra vez (orden del dueño, 27/11/2026).
        const said = verdict.lyrics.map((l) => `«${l.texto}» (${l.desde}–${l.hasta} s)`).join(", ");
        if (store && (await restoreOriginal({ videoId: spec.videoId, audio: finalCheck.audio, language: spec.product.language, dir, store, doblar }, verdict.lyrics))) {
          console.warn(`[montaje] Vídeo ${spec.videoId}: letra traducida (${said}); vuelve el original en esos tramos y se monta otra vez`);
          await defer(run, 0, nowOf(deps));
          return "deferred";
        }
        await finishFailed(run, montajeFailure(`la letra de la canción sigue traducida (${said.slice(0, 200)}); no se entrega`), `comprobación final: ${said}`, nowOf(deps), notes);
        return "failed";
      }
      if (verdict.kind === "leak") {
        const said = verdict.leaks.map((l) => `«${l.texto}» (${l.desde}–${l.hasta} s)`).join(", ");
        if (!(await requireRedub(spec.videoId, finalCheck.audio, spec.product.language, verdict.leaks, []))) {
          await finishFailed(
            run,
            montajeFailure(
              verdict.leaks.length
                ? `el diálogo sigue sin traducir después de doblarlo otra vez (${said.slice(0, 200)}); no se entrega. Vuelve a montar para intentarlo de nuevo`
                : `la letra de la canción sigue traducida después de doblarlo otra vez (${said.slice(0, 200)}); no se entrega. Vuelve a montar para intentarlo de nuevo`,
            ),
            `comprobación final: ${said}`,
            nowOf(deps),
            notes,
          );
          return "failed";
        }
        console.warn(`[montaje] Vídeo ${spec.videoId}: la comprobación final oyó diálogo sin traducir o letra traducida (${said}); se vuelve a doblar y a montar`);
        await defer(run, 0, nowOf(deps));
        return "deferred";
      }
      notes.push(`Comprobado en el vídeo montado (Whisper): ${verdict.heard || "sin diálogo en otro idioma"}`);
    }

    // 4. Guardar.
    const { size } = await fs.stat(output);
    if (size <= 0 || size > MAX_EDIT_BYTES) {
      await finishFailed(run, montajeFailure("el vídeo montado pesa más de 200 MB"), `tamaño ${size}`, nowOf(deps), notes);
      return "failed";
    }
    const { durationMs } = await probeVideo(output);
    const key = store ? `montajes/${spec.videoId}/${run.id}.mp4` : null;
    if (store && key) await store.putFile(key, output, { contentType: "video/mp4" });
    const bytes = key ? null : await fs.readFile(output);
    const avisos = Array.isArray(result.avisos) ? result.avisos.filter((a): a is string => typeof a === "string") : [];
    const check = cleanSelfCheck({ ...(result.autocomprobacion as object), referencia: !!editRef?.breakdown });
    if (check) check.avisos = [...new Set([...avisos, ...check.avisos])].slice(0, 20);
    const finished = await getDb().transaction(async (tx) => {
      const [row] = await tx
        .update(runs)
        .set({ status: "done", finishedAt: nowOf(deps), error: null, notes: [...new Set([...notes, ...avisos])], learnedCorrections: [...new Set(learned)] })
        .where(and(eq(runs.id, run.id), eq(runs.status, "running")))
        .returning({ id: runs.id });
      if (!row) return false;
      await saveEdit(tx, { videoId: spec.videoId, runId: run.id, size, storageKey: key, bytes, durationMs, selfCheck: check }, nowOf(deps));
      return true;
    });
    if (!finished && store && key) await store.delete(key).catch(() => {});
    // TEMPORAL (hasta el 25/11/2026): para comprobar a mano sonido y rótulos de los montajes reparados del lote 6.
    if (finished && store && key && VERIFY_VIDEOS.has(spec.videoId) && nowOf(deps) < VERIFY_UNTIL) {
      const link = await store.signedUrl(key, { expiresIn: 2 * 3600 }).catch(() => null);
      console.log(`[montaje] Vídeo ${spec.videoId} montado (montaje ${run.id}); comprobación: ${link ?? "sin enlace"}`);
    }
    await settleBatch(await batchOfVideo(spec.videoId));
    return finished ? "done" : "failed";
  } catch (error) {
    console.error(`[montaje] el montaje ${run.id} falló: ${messageOf(error)}`);
    await finishFailed(run, INTERNAL, messageOf(error), nowOf(deps), notes).catch(() => {});
    return "failed";
  } finally {
    clearInterval(beat);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ───────────────────────── Bucle del proceso en segundo plano ─────────────────────────

const active = new Map<number, Promise<unknown>>();
let timer: NodeJS.Timeout | null = null;
let stopping = false;

/** Una vuelta: devuelve a la cola lo que se quedó sin latido y llena los huecos libres. */
export async function editLoopTick(deps: MontajeDeps = {}): Promise<void> {
  if (stopping) return;
  const now = nowOf(deps);
  await requeueStaleRuns(now);
  while (!stopping && active.size < MONTAJE_CONCURRENCY) {
    const run = await claimRun(nowOf(deps));
    if (!run) break;
    const job = runEdit(run, deps).finally(() => active.delete(run.id));
    active.set(run.id, job);
  }
}

/** Arranca el bucle de montajes (cada 10 s) en el proceso en segundo plano. */
export function startEditLoop(): void {
  if (timer) return;
  stopping = false;
  const tick = () => editLoopTick().catch((error) => console.error(`[montaje] ${messageOf(error)}`));
  timer = setInterval(tick, 10_000);
  void tick();
  console.log(`[montaje] en marcha (${MONTAJE_CONCURRENCY} a la vez)`);
}

/**
 * Para el bucle: no reserva más, mata los programas en marcha y devuelve sus montajes a la cola
 * (sin gastar el intento) para que el proceso nuevo los haga.
 */
export async function stopEditLoop(): Promise<void> {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  const ids = [...active.keys()];
  if (ids.length > 0) {
    await getDb()
      .update(runs)
      .set({ status: "queued", attempts: sql`greatest(${runs.attempts} - 1, 0)`, availableAt: new Date() })
      .where(and(inArray(runs.id, ids), eq(runs.status, "running")));
  }
  killMontajePrograms();
}

/** Solo para pruebas: espera a que terminen los montajes en marcha. */
export async function waitForActiveEdits(): Promise<void> {
  await Promise.allSettled([...active.values()]);
}
