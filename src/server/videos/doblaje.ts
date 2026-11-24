import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getHiggsfield, HiggsfieldRejectedError, HiggsfieldUnknownOutcomeError, isHiggsfieldError, type HiggsfieldPort } from "@/connectors/higgsfield";
import type { ObjectStore } from "@/lib/object-store";

/**
 * «Traducir el diálogo al alemán» en el montaje. Copia del método que funcionó en Codex el 19/11/2026
 * (`EDITOR/dialogue_stems.py` + `EDITOR/reference_dubbing.py`; prueba real
 * `AUTOMATIZACION SEGA/Audio/Pruebas/Df5AlGsNWCn/DE`), en la nube:
 *
 * 1. `montador/doblar.py separar`: BandIt v2 separa el «Audio original» (el de la referencia) en voz,
 *    música y efectos, y hace `dialogue-only.mp4` (SOLO la voz).
 * 2. Ese vídeo se sube a Higgsfield y se dobla con el modelo `dubbing` (`target_language: deu`). GASTA
 *    créditos (66 por 12 s en la prueba de Codex): se presupuesta, se mira el saldo y se envía UNA vez.
 * 3. `montador/doblar.py mezclar`: la voz alemana sobre la música y los efectos ORIGINALES (la canción
 *    no se toca), con la duración del original. Ese audio pasa a ser el «Audio original» del montaje.
 *
 * Una fila de `dubs` por vídeo y audio de partida: volver a montar el mismo vídeo reutiliza el doblaje
 * (del almacén) y no paga otra vez. Un envío del que no se sabe si llegó no se repite solo: el montaje
 * se para con el motivo y, si la persona vuelve a montar, se intenta de nuevo.
 */

/**
 * Idioma del anuncio (`products.language`, ISO 639-1) → el código de Higgsfield `dubbing` (ISO 639-3) y su nombre.
 * Regla fija del dueño (24/11/2026): el diálogo se dobla POR DEFECTO al idioma del país del producto.
 */
export const DUB_LANGUAGES: Record<string, { code: string; name: string }> = {
  de: { code: "deu", name: "alemán" },
  it: { code: "ita", name: "italiano" },
  fr: { code: "fra", name: "francés" },
  es: { code: "spa", name: "español" },
  en: { code: "eng", name: "inglés" },
  pt: { code: "por", name: "portugués" },
  pl: { code: "pol", name: "polaco" },
  sv: { code: "swe", name: "sueco" },
  fi: { code: "fin", name: "finés" },
  tr: { code: "tur", name: "turco" },
};
export const dubLanguageOf = (language: string) => DUB_LANGUAGES[language] ?? DUB_LANGUAGES.de;
/** Lo que se espera a Higgsfield dentro de un mismo montaje antes de devolverlo a la cola (Codex: 20 min). */
export const DUB_WAIT_IN_RUN_MS = 10 * 60_000;
/** Desde el envío, lo más que se espera un doblaje antes de darlo por fallido. */
export const DUB_MAX_MS = 60 * 60_000;
/** Cada cuánto se vuelve a mirar un doblaje que sigue en marcha cuando el montaje vuelve a la cola. */
export const DUB_RECHECK_MS = 2 * 60_000;

export const DUB_UNKNOWN =
  "No sabemos si el doblaje llegó a Higgsfield. Vuelve a montar el vídeo para intentarlo otra vez (puede cobrarse de nuevo).";
export const dubFailure = (detail: string) => `No se pudo doblar el diálogo: ${detail}`;

const dubs = schema.dubs;
type Dub = typeof dubs.$inferSelect;

/**
 * Si el montaje dobla el diálogo: SIEMPRE, salvo que el dueño lo apague en la tarjeta (regla fija del 24/11/2026).
 * Doblar no gasta si no hace falta: sin diálogo o con el diálogo ya en el idioma del anuncio, no se envía nada.
 */
export async function dubDialogueOf(video: { dubDialogue: boolean | null }): Promise<boolean> {
  return video.dubDialogue ?? true;
}

export interface DubContext {
  videoId: number;
  /** Cuándo se pidió el montaje: una duda anterior a él se puede volver a intentar (lo pidió la persona). */
  requestedAt: Date;
  /** El «Audio original» ya en el disco. */
  audio: string;
  /** Idioma del anuncio (`products.language`, ISO 639-1): al que se dobla. */
  language: string;
  /** El vídeo de la referencia, si está (el `dialogue-only.mp4` lleva su imagen, como en Codex); si no, negro. */
  referenceVideo: string | null;
  dir: string;
  store: ObjectStore;
  notes: string[];
  /** Corre `doblar.py` con sus argumentos; `{ ok, error?, … }` de su última línea. */
  doblar: (args: string[]) => Promise<DoblarResult>;
  higgsfield?: HiggsfieldPort;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Lo que `jobs_wait` espera en cada pregunta a Higgsfield (0–15 s; por defecto 15). */
  pollSeconds?: number;
}

/** Lo que responde `doblar.py`; `voz` (al separar): si hay diálogo y en qué idioma (Whisper), `null` si no se sabe. */
export interface DoblarResult {
  ok: boolean;
  error?: string;
  voz?: { hay: boolean; idioma: string | null; probabilidad: number | null; texto: string; motivo: string | null } | null;
  /** Frases habladas que BandIt dejó en la música y se pasaron a la voz para doblarlas también. */
  rescatadas?: Array<{ pista: string; desde: number; hasta: number; texto: string; idioma: string }>;
  /** `comprobar`: si se pudo comprobar y las frases que siguen en el idioma original. */
  comprobado?: boolean;
  quedan?: Array<{ desde: number; hasta: number; texto: string; idioma: string }>;
  /** `tramo`: el trozo que se vuelve a doblar (s). */
  desde?: number;
  hasta?: number;
}

/** Cuántas veces se vuelve a doblar un trozo que quedó en el idioma original. */
export const MAX_REPAIRS = 2;

export type DubOutcome =
  | { kind: "ready"; path: string }
  /** No hace falta doblar (sin diálogo, ya en el idioma del anuncio o no se sabe): el «Audio original» tal cual. */
  | { kind: "skip" }
  | { kind: "defer"; delayMs: number }
  | { kind: "failed"; shown: string; detail: string };

const nowOf = (ctx: DubContext) => ctx.now?.() ?? new Date();
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function update(id: number, values: Partial<Dub>): Promise<void> {
  await getDb().update(dubs).set({ ...values, updatedAt: new Date() }).where(eq(dubs.id, id));
}

/**
 * Vuelve a doblar un trozo (`file`, solo esa voz) y lo deja en `out`: subir, presupuestar, mirar el saldo, enviar y
 * esperar como mucho `DUB_WAIT_IN_RUN_MS`. `null` si no se pudo (no hay saldo, Higgsfield no lo hizo…): el montaje sigue
 * con lo que hay y lo dice. Los créditos se suman al doblaje del vídeo.
 */
async function redubPiece(ctx: DubContext, higgsfield: HiggsfieldPort, userId: number, language: string, file: string, out: string): Promise<{ file: string; credits: number } | null> {
  try {
    const { mediaId } = await higgsfield.uploadMedia(userId, { bytes: await fs.readFile(file), filename: "dialogue-piece.mp4", contentType: "video/mp4", type: "video" });
    const request = { mediaId, targetLanguage: language };
    const quote = await higgsfield.quoteDubbing(userId, request);
    if ((await higgsfield.balance(userId)).credits < quote.credits) return null;
    const sent = await higgsfield.submitDubbing(userId, request);
    const jobId = sent.jobIds[0];
    const started = nowOf(ctx).getTime();
    for (;;) {
      const [job] = await higgsfield.jobs(userId, [jobId], ctx.pollSeconds ?? 15);
      if (job?.status === "done" && job.urls[0]) {
        const response = await (ctx.fetch ?? fetch)(job.urls[0]);
        if (!response.ok || !response.body) return null;
        await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(out));
        return { file: out, credits: quote.credits };
      }
      if (job?.status === "failed" || nowOf(ctx).getTime() - started > DUB_WAIT_IN_RUN_MS) return null;
    }
  } catch (error) {
    console.warn(`[doblaje] No se pudo volver a doblar un trozo del vídeo ${ctx.videoId}: ${messageOf(error)}`);
    return null;
  }
}

/** El «Audio original» con el diálogo doblado al idioma del anuncio (ver arriba). Nunca lanza: dice si está, si hay que esperar o por qué no. */
export async function dubbedAudio(ctx: DubContext): Promise<DubOutcome> {
  const higgsfield = ctx.higgsfield ?? getHiggsfield();
  const [video] = await getDb().select({ createdBy: schema.videos.createdBy }).from(schema.videos).where(eq(schema.videos.id, ctx.videoId));
  if (!video) return { kind: "failed", shown: dubFailure("el vídeo ya no existe"), detail: "sin vídeo" };
  const userId = video.createdBy;
  const sha = await sha256File(ctx.audio);
  const stems = path.join(ctx.dir, "doblaje");
  const output = path.join(ctx.dir, "audio-doblado.m4a");
  const target = dubLanguageOf(ctx.language);

  try {
    let [row]: Array<Dub | undefined> = await getDb()
      .select()
      .from(dubs)
      .where(and(eq(dubs.videoId, ctx.videoId), eq(dubs.sourceSha256, sha), eq(dubs.language, target.code)))
      .orderBy(desc(dubs.id))
      .limit(1);

    // Ya se vio que no hace falta doblar este audio: nada.
    if (row?.status === "skipped") return { kind: "skip" };
    // Ya doblado: del almacén, sin pagar otra vez.
    // Los de antes de la comprobación con Whisper (24/11/2026) se rehacen: uno dejó una frase en inglés.
    if (row?.status === "done" && row.storageKey && !(row.raw as { comprobado?: boolean } | null)?.comprobado) {
      await update(row.id, { status: "failed", error: "Doblaje sin comprobar (antes del 24/11/2026): se rehace" });
      row = undefined;
    }
    if (row?.status === "done" && row.storageKey) {
      await ctx.store.download(row.storageKey, output);
      ctx.notes.push(`Diálogo en ${target.name}: el doblaje ya hecho de este vídeo (sin gastar otra vez)`);
      return { kind: "ready", path: output };
    }
    // Una duda (o un envío cortado a medias): solo se vuelve a intentar si la persona pidió el montaje después.
    if (row && (row.status === "unknown" || row.status === "submitting")) {
      if (row.updatedAt.getTime() >= ctx.requestedAt.getTime()) return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} en duda` };
      await update(row.id, { status: "failed", error: row.error ?? "En duda; se volvió a pedir el montaje" });
      row = undefined;
    }

    if (!row || row.status === "failed") {
      const separated = await ctx.doblar(["separar", ctx.audio, stems, "--destino", ctx.language, ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!separated.ok) {
        // Aún no se ha gastado nada: se monta con el audio original y se avisa (el doblaje va por defecto).
        ctx.notes.push(`No se pudo separar la voz de la referencia (${(separated.error ?? "sin detalle").slice(0, 120)}): el diálogo va sin doblar`);
        return { kind: "skip" };
      }
      // ¿Hace falta? Sin diálogo, o con el diálogo ya en el idioma del anuncio, no se envía nada (no se gasta).
      const voz = separated.voz;
      if (voz === undefined || voz === null) {
        ctx.notes.push("No se pudo saber si la referencia tiene diálogo: no se dobla");
        return { kind: "skip" };
      }
      if (!voz.hay || voz.idioma === ctx.language) {
        const why = !voz.hay ? `sin diálogo (${voz.motivo ?? "sin palabras"})` : `el diálogo ya está en ${target.name}`;
        await getDb()
          .insert(dubs)
          .values({ videoId: ctx.videoId, userId, sourceSha256: sha, language: target.code, status: "skipped", quotedCredits: 0, error: why, raw: voz })
          .onConflictDoNothing();
        if (voz.hay) ctx.notes.push(`El diálogo de la referencia ya está en ${target.name}: no se dobla`);
        return { kind: "skip" };
      }
      ctx.notes.push(`Diálogo de la referencia en «${voz.idioma}»: se dobla al ${target.name}`);
      if (separated.rescatadas?.length) {
        ctx.notes.push(`Voz que estaba en la música, también doblada: ${separated.rescatadas.map((f) => `«${f.texto}» (${f.desde}–${f.hasta} s)`).join(", ")}`);
      }
      const bytes = await fs.readFile(path.join(stems, "dialogue-only.mp4"));
      const { mediaId } = await higgsfield.uploadMedia(userId, { bytes, filename: "dialogue-only.mp4", contentType: "video/mp4", type: "video" });
      const request = { mediaId, targetLanguage: target.code };
      const quote = await higgsfield.quoteDubbing(userId, request);
      const { credits } = await higgsfield.balance(userId);
      if (credits < quote.credits) {
        return {
          kind: "failed",
          shown: dubFailure(`no hay saldo en Higgsfield (hacen falta ${quote.credits} créditos y quedan ${credits})`),
          detail: "sin saldo",
        };
      }
      const [created] = await getDb()
        .insert(dubs)
        .values({ videoId: ctx.videoId, userId, sourceSha256: sha, language: target.code, status: "submitting", mediaId, quotedCredits: quote.credits })
        .returning();
      row = created;
      try {
        const sent = await higgsfield.submitDubbing(userId, request);
        await update(row.id, { status: "submitted", jobId: sent.jobIds[0], raw: { envio: sent.raw ?? null, origen: voz.idioma } });
        row = { ...row, status: "submitted", jobId: sent.jobIds[0] };
        ctx.notes.push(`Diálogo en alemán: doblaje enviado a Higgsfield (${quote.credits} créditos)`);
      } catch (error) {
        if (error instanceof HiggsfieldUnknownOutcomeError) {
          await update(row.id, { status: "unknown", error: "No se sabe si el envío llegó" });
          return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} en duda` };
        }
        await update(row.id, { status: "failed", error: messageOf(error) });
        const reason = error instanceof HiggsfieldRejectedError ? `Higgsfield no lo aceptó (${error.reason})` : messageOf(error);
        return { kind: "failed", shown: dubFailure(reason.slice(0, 250)), detail: messageOf(error) };
      }
    }

    // Enviado: se espera el resultado.
    const jobId = row.jobId;
    if (!jobId) return { kind: "failed", shown: DUB_UNKNOWN, detail: `doblaje ${row.id} sin trabajo` };
    const started = nowOf(ctx).getTime();
    let url: string | null = null;
    for (;;) {
      const [job] = await higgsfield.jobs(userId, [jobId], ctx.pollSeconds ?? 15);
      if (job?.status === "done") {
        url = job.urls[0] ?? null;
        break;
      }
      if (job?.status === "failed") {
        await update(row.id, { status: "failed", error: job.error ?? job.failure ?? "failed" });
        return { kind: "failed", shown: dubFailure(`Higgsfield no pudo doblarlo${job.error ? ` (${job.error})` : ""}. Vuelve a montar para intentarlo`), detail: job.error ?? "failed" };
      }
      const now = nowOf(ctx).getTime();
      if (now - row.createdAt.getTime() > DUB_MAX_MS) {
        await update(row.id, { status: "failed", error: "Higgsfield tardó más de una hora" });
        return { kind: "failed", shown: dubFailure("Higgsfield tardó más de una hora. Vuelve a montar para intentarlo"), detail: "más de una hora" };
      }
      if (now - started > DUB_WAIT_IN_RUN_MS) return { kind: "defer", delayMs: DUB_RECHECK_MS };
    }
    if (!url) return { kind: "failed", shown: dubFailure("Higgsfield no dio el resultado"), detail: "sin dirección" };

    // El resultado, mezclado sobre la música y los efectos originales.
    const dub = path.join(ctx.dir, "dub.mp4");
    const response = await (ctx.fetch ?? fetch)(url);
    if (!response.ok || !response.body) return { kind: "failed", shown: dubFailure("no se pudo descargar el doblaje"), detail: `HTTP ${response.status}` };
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(dub));
    const haveStems = await fs.stat(path.join(stems, "music.wav")).then(() => true, () => false);
    if (!haveStems) {
      // Enviado en un montaje anterior: se vuelve a separar (da lo mismo: mismo audio, mismo modelo).
      const separated = await ctx.doblar(["separar", ctx.audio, stems, "--destino", ctx.language, ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!separated.ok) return { kind: "failed", shown: dubFailure(separated.error ?? "no se pudo separar la voz"), detail: separated.error ?? "separar" };
    }
    const mixed = await ctx.doblar(["mezclar", stems, dub, output]);
    if (!mixed.ok) {
      await update(row.id, { status: "failed", error: mixed.error ?? "mezclar" });
      return { kind: "failed", shown: dubFailure(mixed.error ?? "no se pudo mezclar"), detail: mixed.error ?? "mezclar" };
    }

    // Comprobación con Whisper: que no quede nada en el idioma original; si queda, se vuelve a doblar ese trozo.
    const origen = (row.raw as { origen?: string | null } | null)?.origen ?? null;
    let voice = dub;
    let extra = 0;
    const repairs: Array<{ desde: number; hasta: number; texto: string; creditos: number }> = [];
    let left: NonNullable<DoblarResult["quedan"]> = [];
    let checked = false;
    for (let attempt = 0; ; attempt++) {
      const check = await ctx.doblar(["comprobar", output, ...(origen ? ["--origen", origen] : []), "--destino", ctx.language]);
      checked = check.ok && check.comprobado === true;
      left = check.quedan ?? [];
      if (!checked || left.length === 0 || attempt >= MAX_REPAIRS) break;
      const leak = left[0];
      const piece = await ctx.doblar(["tramo", stems, String(leak.desde), String(leak.hasta), path.join(ctx.dir, `tramo-${attempt}.mp4`), ...(ctx.referenceVideo ? ["--video", ctx.referenceVideo] : [])]);
      if (!piece.ok || piece.desde === undefined) break;
      const redone = await redubPiece(ctx, higgsfield, userId, target.code, path.join(ctx.dir, `tramo-${attempt}.mp4`), path.join(ctx.dir, `tramo-${attempt}-doblado.mp4`));
      if (!redone) break;
      extra += redone.credits;
      const grafted = path.join(ctx.dir, `voz-${attempt}.wav`);
      const graft = await ctx.doblar(["injertar", voice, redone.file, String(piece.desde), grafted]);
      if (!graft.ok) break;
      voice = grafted;
      repairs.push({ desde: leak.desde, hasta: leak.hasta, texto: leak.texto, creditos: redone.credits });
      const remixed = await ctx.doblar(["mezclar", stems, voice, output]);
      if (!remixed.ok) break;
    }
    if (!checked) ctx.notes.push("No se pudo comprobar con Whisper que no quede diálogo en el idioma original");
    if (repairs.length) ctx.notes.push(`Vuelto a doblar porque seguía en el idioma original: ${repairs.map((r) => `«${r.texto}» (${r.desde}–${r.hasta} s)`).join(", ")}`);
    if (left.length) ctx.notes.push(`Sigue en el idioma original: ${left.map((r) => `«${r.texto}» (${r.desde}–${r.hasta} s)`).join(", ")}`);
    const key = `doblajes/${ctx.videoId}/${row.id}.m4a`;
    await ctx.store.putFile(key, output, { contentType: "audio/mp4" });
    await update(row.id, {
      status: "done",
      storageKey: key,
      creditsSpent: row.quotedCredits + extra,
      error: left.length ? `Sigue en el idioma original: ${left.map((r) => r.texto).join(" · ")}`.slice(0, 500) : null,
      raw: { ...((row.raw as object | null) ?? {}), comprobado: checked, reparaciones: repairs, quedan: left },
    });
    ctx.notes.push(`Diálogo traducido al ${target.name}; la música es la original`);
    return { kind: "ready", path: output };
  } catch (error) {
    const shown = isHiggsfieldError(error) ? dubFailure(error.message) : dubFailure("error interno del doblaje");
    return { kind: "failed", shown, detail: messageOf(error) };
  }
}
