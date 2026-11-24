import type { z } from "zod";
import { bindMacSchema } from "@/server/mac-comparisons";
import { DEFAULT_MAC_ENGINES, MAC_STEPS, macStepOf, type MacEngines } from "@/llm/mac-engines";
import crypto from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getDb, getSetting, schema, setSetting } from "@/db/client";
import type { MacAnswer, MacBridge, MacJob, MacOutcome, MacRoute } from "@/llm/gateway";
import { authRequired, getActiveUser, LOCAL_USER, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { monthRange } from "@/server/spend";

/**
 * Claude del dueño en su Mac (`claude_code`, agente 1.8.0). Las llamadas a Claude del dueño (desglose,
 * prompts, elegir referencias, revisión con visión, clasificar reportes, nichos…) no van a la API:
 * la pasarela (`src/llm/gateway.ts`) deja aquí una tarea con el sistema, el mensaje (con sus fotos),
 * el esquema de salida, el modelo y el esfuerzo, y espera. El agente del Mac la recoge (solo si dice
 * `solo: "claude_code"` al reclamar), la hace con el Claude Code de ese Mac y su plan de suscripción
 * (`claude -p`, sin herramientas salvo la búsqueda en internet si la llamada la pide) y devuelve el
 * texto o el JSON. Para quien llama a la pasarela no cambia nada: el mismo contrato.
 *
 * - Quién: solo el dueño con un Mac suyo con ficha en vigor. Las demás personas siguen con la API.
 * - Modo (Ajustes → Mac): `mac_primero` (por defecto: Mac; si está apagado, sin plan o falla, la API
 *   dentro de los topes, y se apunta), `solo_mac` (si el Mac no puede, el paso queda en pausa y sigue
 *   solo cuando vuelve) o `api` (como antes).
 * - Coste: lo hecho en el Mac se apunta en el libro a 0 $ con `detail.via = "mac"` y lo que habría
 *   costado en la API (`apiEquivalentMicros`), para ver el ahorro.
 * - La tarea lleva el mensaje en `payload` mientras espera (fotos en base64; nunca secretos) y se vacía
 *   al terminar: solo queda la respuesta.
 */

export const CLAUDE_CODE_TASK = "claude_code";
export type MacMode = "mac_primero" | "solo_mac" | "api";
export const MAC_MODES: readonly MacMode[] = ["mac_primero", "solo_mac", "api"];
export const MAC_MODE_SETTING = "claude.mac.mode";
/** Hasta cuándo no se manda nada al Mac porque Claude Code dijo que se llegó al límite del plan. */
export const MAC_LIMIT_SETTING = "claude.mac.limitUntil";
/** Tras un «límite del plan», el Mac descansa este tiempo (después se vuelve a probar). */
export const LIMIT_PAUSE_MS = 30 * 60_000;
/** Señal del Mac en este tiempo = encendido (lo mismo que «Conectado» en Ajustes). */
export const MAC_ONLINE_MS = 90_000;
/** Cada cuánto mira la pasarela si el Mac ya contestó. */
export const POLL_MS = 1_500;
/** Lo más que espera la pasarela a una tarea (cola + respuesta); después, la API (o pausa con «solo Mac»). */
export const MAX_WAIT_MS = 25 * 60_000;
/** Si una tarea en cola no la recoge nadie en este tiempo aunque el Mac dé señales (agente antiguo), se deja. */
export const UNCLAIMED_MS = 3 * 60_000;
/** Lo más que pesa el mensaje que se manda al Mac (fotos incluidas); uno mayor va a la API. */
export const MAX_JOB_BYTES = 24 * 1024 * 1024;
/** Lo más que pesa la respuesta del Mac. */
export const MAX_ANSWER_CHARS = 2 * 1024 * 1024;

const MAX_ERROR = 500;
const TASK_LOST = "Esta tarea ya no es tuya.";
const agentTasks = schema.agentTasks;
const agents = schema.agents;
const entries = schema.spendEntries;
const isId = (value: number) => Number.isSafeInteger(value) && value > 0;
const clip = (value: unknown, length: number) => (typeof value === "string" ? value.trim().slice(0, length) : "");
const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ───────────────────────── Modo (Ajustes) ─────────────────────────

export async function getMacMode(): Promise<MacMode> {
  const value = await getSetting<string>(MAC_MODE_SETTING);
  return MAC_MODES.includes(value as MacMode) ? (value as MacMode) : "mac_primero";
}

export async function setMacMode(owner: AuthUser, mode: unknown): Promise<MacMode> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  if (!MAC_MODES.includes(mode as MacMode)) throw new HttpError(400, "Modo no válido.");
  await setSetting(MAC_MODE_SETTING, mode);
  return mode as MacMode;
}

export const MAC_ENGINES_SETTING = "claude.mac.engines";
export async function getMacEngines(): Promise<MacEngines> {
  const saved = await getSetting<Partial<MacEngines>>(MAC_ENGINES_SETTING);
  const out = { ...DEFAULT_MAC_ENGINES };
  for (const step of MAC_STEPS) if (["claude", "codex", "comparar"].includes(saved?.[step] ?? "")) out[step] = saved![step]!;
  return out;
}
export async function setMacEngines(owner: AuthUser, value: unknown): Promise<void> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== MAC_STEPS.length ||
    !MAC_STEPS.every((step) => ["claude", "codex", "comparar"].includes((value as MacEngines)[step]))) throw new HttpError(400, "Motores no válidos.");
  await setSetting(MAC_ENGINES_SETTING, value);
}

async function limitedUntil(now: Date): Promise<Date | null> {
  const value = await getSetting<string>(MAC_LIMIT_SETTING);
  const until = typeof value === "string" ? new Date(value) : null;
  return until && !Number.isNaN(until.getTime()) && until > now ? until : null;
}

/** El último latido de un Mac (ficha en vigor) de `userId`, o `null` si no tiene ninguno. */
async function lastSeenOf(userId: number): Promise<{ has: boolean; lastSeenAt: Date | null; claude: string | null; codex: string | null }> {
  const rows = await getDb()
    .select({ lastSeenAt: agents.lastSeenAt, info: agents.info })
    .from(agents)
    .where(and(eq(agents.createdBy, userId), isNull(agents.revokedAt)))
    .orderBy(sql`${agents.lastSeenAt} desc nulls last`)
    .limit(1);
  return { has: rows.length > 0, lastSeenAt: rows[0]?.lastSeenAt ?? null, claude: rows[0]?.info?.claude ?? null, codex: rows[0]?.info?.codex ?? null };
}

const isOnline = (lastSeenAt: Date | null, now: Date) => lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() <= MAC_ONLINE_MS;

/** Si `userId` es el dueño (o el dueño local sin inicio de sesión). */
async function isOwner(userId: number): Promise<boolean> {
  if (userId === LOCAL_USER.id) return !authRequired();
  if (!isId(userId)) return false;
  return (await getActiveUser(userId))?.role === "dueno";
}

/**
 * Por dónde va una llamada de `userId`: `null` si va a la API como siempre (no es el dueño, no tiene
 * Mac o eligió «Solo API»). Si no, el modo y si el Mac se puede usar ahora (o por qué no).
 */
export async function macRoute(userId: number, now: Date = new Date(), stepKey = ""): Promise<MacRoute | null> {
  if (!(await isOwner(userId))) return null;
  const mac = await lastSeenOf(userId);
  if (!mac.has) return null;
  const mode = await getMacMode();
  if (mode === "api") return null;
  const engine = (await getMacEngines())[macStepOf(stepKey)];
  if (engine === "claude" && await limitedUntil(now)) return { mode, usable: false, reason: "limite" };
  // Codex/comparar admite cualquiera de los dos; Claude conserva su requisito de sesión.
  if (!isOnline(mac.lastSeenAt, now) || (!mac.claude && (engine === "claude" || !mac.codex))) return { mode, usable: false, reason: "apagado" };
  return { mode, usable: true };
}

// ───────────────────────── La pasarela espera al Mac ─────────────────────────

type Stored = { job: MacJob } | { result: MacAnswer } | { failure: { limit: boolean } } | null;

/**
 * Deja la llamada en la cola del Mac de `userId` y espera la respuesta. Nunca lanza por el Mac: si no
 * llega, dice por qué (`apagado`, `limite`, `fallo`, `grande`) y la tarea queda cerrada (el Mac que la
 * tuviera se entera en su siguiente latido y corta).
 */
export async function runOnMac(
  input: { userId: number; stepKey: string; job: MacJob; schema?: z.ZodType },
  deps: { now?: () => Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MacOutcome> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? sleepMs;
  const bytes = Buffer.byteLength(JSON.stringify(input.job));
  if (bytes > MAX_JOB_BYTES) return { ok: false, reason: "grande", detail: `El mensaje pesa ${Math.round(bytes / 1048576)} MB.` };

  const db = getDb();
  const started = now();
  const [task] = await db
    .insert(agentTasks)
    .values({
      kind: CLAUDE_CODE_TASK,
      url: `claude-code:${input.stepKey}`.slice(0, 300),
      payload: { job: input.job },
      createdBy: input.userId,
      createdAt: started,
      updatedAt: started,
    })
    .returning({ id: agentTasks.id });
  const taskId = task.id;
  if (input.job.engine === "comparar") bindMacSchema(taskId, input.schema);

  const giveUp = async (reason: "apagado" | "fallo", detail: string): Promise<MacOutcome> => {
    await db
      .update(agentTasks)
      .set({ status: "failed", error: detail.slice(0, MAX_ERROR), payload: null, leaseExpiresAt: null, uploadId: null, updatedAt: now() })
      .where(and(eq(agentTasks.id, taskId), inArray(agentTasks.status, ["queued", "leased"])));
    // Si justo terminó entretanto, vale su respuesta.
    const [row] = await db.select({ status: agentTasks.status, payload: agentTasks.payload }).from(agentTasks).where(eq(agentTasks.id, taskId));
    const stored = row?.payload as Stored;
    if (row?.status === "done" && stored && "result" in stored) return { ok: true, taskId, answer: stored.result };
    return { ok: false, reason, detail };
  };

  for (;;) {
    const [row] = await db
      .select({ status: agentTasks.status, payload: agentTasks.payload, error: agentTasks.error, leaseExpiresAt: agentTasks.leaseExpiresAt, createdBy: agentTasks.createdBy })
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId));
    if (!row) return { ok: false, reason: "fallo", detail: "La tarea del Mac ha desaparecido." };
    const stored = row.payload as Stored;
    if (row.status === "done" && stored && "result" in stored) return { ok: true, taskId, answer: stored.result };
    if (row.status === "failed" || row.status === "done") {
      const limit = !!(stored && "failure" in stored && stored.failure.limit);
      return { ok: false, reason: limit ? "limite" : "fallo", detail: row.error ?? "El Mac no dio detalles." };
    }
    const current = now();
    const waited = current.getTime() - started.getTime();
    if (waited > MAX_WAIT_MS) return giveUp("fallo", "El Mac tardó demasiado en contestar.");
    if (row.status === "queued") {
      const seen = await lastSeenOf(input.userId);
      if (!isOnline(seen.lastSeenAt, current) || (!seen.claude && !seen.codex)) return giveUp("apagado", "El Mac se apagó (o Claude Code perdió la sesión) antes de recoger la llamada.");
      if (waited > UNCLAIMED_MS && !(await busyWithClaude(input.userId, current))) {
        return giveUp("fallo", "El Mac no recoge llamadas de Claude (¿agente sin actualizar a 1.8.0?).");
      }
    } else if (row.status === "leased" && row.leaseExpiresAt && row.leaseExpiresAt < current) {
      return giveUp("fallo", "El Mac dejó de dar señales con la llamada a medias.");
    }
    await sleep(POLL_MS);
  }
}

/** Si el Mac de `userId` ha recogido alguna llamada de Claude hace poco (está trabajando, no es que no sepa). */
async function busyWithClaude(userId: number, now: Date): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: agentTasks.id })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.kind, CLAUDE_CODE_TASK),
        eq(agentTasks.createdBy, userId),
        gte(agentTasks.leasedAt, new Date(now.getTime() - UNCLAIMED_MS)),
      ),
    )
    .limit(1);
  return !!row;
}

// ───────────────────────── Protocolo con el Mac ─────────────────────────

export interface ClaimedClaudeCode {
  taskId: number;
  kind: "claude_code";
  /** `claude-code:<paso>`: solo para el registro del Mac. */
  url: string;
  /** La sesión de esta reserva: va al terminar (un intento anterior no puede entregar). */
  uploadId: string;
  chunkBytes: 0;
  maxBytes: 0;
  job: MacJob;
}

/** El Mac de `createdBy` se lleva la llamada de Claude más antigua de su cola, o `null`. */
export async function claimClaudeCodeTask(createdBy: number, lease: PgUpdateSetSource<typeof agentTasks>, now: Date): Promise<ClaimedClaudeCode | null> {
  return getDb().transaction(async (tx) => {
    const [task] = await tx
      .select({ id: agentTasks.id, payload: agentTasks.payload, url: agentTasks.url })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.kind, CLAUDE_CODE_TASK),
          eq(agentTasks.status, "queued"),
          eq(agentTasks.createdBy, createdBy),
          sql`(${agentTasks.availableAt} is null or ${agentTasks.availableAt} <= ${now})`,
        ),
      )
      .orderBy(asc(agentTasks.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!task) return null;
    const stored = task.payload as Stored;
    if (!stored || !("job" in stored)) {
      await tx.update(agentTasks).set({ status: "failed", error: "La llamada no tiene mensaje.", updatedAt: now }).where(eq(agentTasks.id, task.id));
      return null;
    }
    const uploadId = crypto.randomBytes(16).toString("hex");
    if (stored.job.engine === "comparar") {
      const stepKey = task.url.replace(/^claude-code:/, "");
      await tx.insert(schema.llmComparisons).values({ agentTaskId: task.id, uploadId, stepKey, paso: macStepOf(stepKey) })
        .onConflictDoUpdate({ target: schema.llmComparisons.agentTaskId, set: { uploadId, claudeMs: null, codexMs: null, claudeText: null, codexText: null, codexError: null, codexValid: null, codexTruncated: false } });
    }
    await tx.update(agentTasks).set({ ...lease, uploadId }).where(eq(agentTasks.id, task.id));
    return { taskId: task.id, kind: "claude_code", url: task.url, uploadId, chunkBytes: 0, maxBytes: 0, job: stored.job };
  });
}

export type ClaudeCodeResult =
  | { ok: true; uploadId: string; resultado: unknown }
  | { ok: false; uploadId: string; error: string; limite?: boolean };

const num = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0);

/** Lo que manda el Mac, limpio; `null` si no tiene la forma de una respuesta. */
export function answerOf(raw: unknown): MacAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.text !== "string" || value.text.length > MAX_ANSWER_CHARS) return null;
  const usage = (value.usage ?? {}) as Record<string, unknown>;
  const stop = value.stopReason === "max_turns" || value.stopReason === "refusal" ? value.stopReason : "end";
  const cost = typeof value.apiEquivalentMicros === "number" && Number.isFinite(value.apiEquivalentMicros) && value.apiEquivalentMicros >= 0 ? Math.round(value.apiEquivalentMicros) : null;
  const sources = Array.isArray(value.webSources) ? value.webSources.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u) && u.length < 2_000).slice(0, 300) : [];
  const structured = value.structured === undefined ? null : value.structured;
  if (structured !== null && JSON.stringify(structured).length > MAX_ANSWER_CHARS) return null;
  return {
    text: value.text,
    structured,
    model: clip(value.model, 100),
    usage: {
      inputTokens: num(usage.inputTokens),
      outputTokens: num(usage.outputTokens),
      cacheReadTokens: num(usage.cacheReadTokens),
      cacheWriteTokens: num(usage.cacheWriteTokens),
    },
    apiEquivalentMicros: cost,
    webSources: [...new Set(sources)],
    stopReason: stop,
  };
}

/** El Mac termina una llamada: bien, se guarda la respuesta (sin el mensaje); mal, el motivo. */
export async function finishClaudeCodeTask(agentId: number, taskId: number, result: ClaudeCodeResult, now: Date = new Date()): Promise<void> {
  const [task] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.id, taskId), eq(agentTasks.kind, CLAUDE_CODE_TASK)));
  if (!task || task.agentId !== agentId) throw new HttpError(409, TASK_LOST);
  if (task.status === "done" && result.ok) return;
  if (task.status !== "leased" || task.uploadId !== result.uploadId) throw new HttpError(409, TASK_LOST);
  const mine = and(eq(agentTasks.id, task.id), eq(agentTasks.status, "leased"), eq(agentTasks.uploadId, result.uploadId));
  let changes: Partial<typeof agentTasks.$inferInsert>;
  if (result.ok) {
    const answer = answerOf(result.resultado);
    if (!answer) throw new HttpError(400, "La respuesta de Claude Code no se entiende.");
    changes = { status: "done", error: null, payload: { result: answer } };
  } else {
    const limit = result.limite === true;
    changes = { status: "failed", error: clip(result.error, MAX_ERROR) || "El Mac no dio detalles.", payload: { failure: { limit } } };
    if (limit) await setSetting(MAC_LIMIT_SETTING, new Date(now.getTime() + LIMIT_PAUSE_MS).toISOString());
  }
  const closed = await getDb()
    .update(agentTasks)
    .set({ ...changes, leaseExpiresAt: null, uploadId: null, updatedAt: now })
    .where(mine)
    .returning({ id: agentTasks.id });
  if (closed.length === 0) throw new HttpError(409, TASK_LOST);
}

/** Cierra como fallida una llamada (reserva caducada, sin Mac…): sin el mensaje. */
export async function failClaudeCodeTask(task: { id: number }, condition: SQL | undefined, reason: string, now: Date): Promise<void> {
  await getDb()
    .update(agentTasks)
    .set({ status: "failed", error: reason, payload: null, leaseExpiresAt: null, uploadId: null, updatedAt: now })
    .where(and(eq(agentTasks.id, task.id), condition));
}

// ───────────────────────── Ajustes: lo hecho en el Mac este mes ─────────────────────────

export interface MacClaudeSummary {
  engines: MacEngines;
  mode: MacMode;
  /** Hasta cuándo descansa el Mac por el límite del plan (ISO), o `null`. */
  limitUntil: string | null;
  month: string;
  /** Llamadas hechas en el Mac este mes y lo que habrían costado en la API. */
  macCalls: number;
  savedMicros: number;
  /** Llamadas del dueño que fueron a la API porque el Mac no pudo. */
  apiFallbacks: number;
}

export async function macClaudeSummary(owner: AuthUser, now: Date = new Date()): Promise<MacClaudeSummary> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const range = monthRange(now);
  const inMonth = and(gte(entries.createdAt, range.start), lt(entries.createdAt, range.end), eq(entries.provider, "claude"));
  const [mac] = await getDb()
    .select({
      calls: sql<number>`count(*)::int`.mapWith(Number),
      saved: sql<number>`coalesce(sum((${entries.detail}->>'apiEquivalentMicros')::bigint), 0)::bigint`.mapWith(Number),
    })
    .from(entries)
    .where(and(inMonth, sql`${entries.detail}->>'via' = 'mac'`));
  const [fallback] = await getDb()
    .select({ calls: sql<number>`count(*)::int`.mapWith(Number) })
    .from(entries)
    .where(and(inMonth, sql`${entries.detail} ? 'macFallback'`));
  const until = await limitedUntil(now);
  return {
    engines: await getMacEngines(),
    mode: await getMacMode(),
    limitUntil: until?.toISOString() ?? null,
    month: range.start.toISOString().slice(0, 7),
    macCalls: mac?.calls ?? 0,
    savedMicros: mac?.saved ?? 0,
    apiFallbacks: fallback?.calls ?? 0,
  };
}

/** El puente real que usa la pasarela. */
export const macBridge: MacBridge = {
  route: (userId, stepKey) => macRoute(userId, new Date(), stepKey),
  run: (input) => runOnMac(input),
};
