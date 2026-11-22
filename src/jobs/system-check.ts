import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, getSetting, schema, setSetting } from "@/db/client";
import {
  getGateway,
  LlmCallError,
  LlmCapReachedError,
  LlmInvalidOutputError,
  LlmNotConfiguredError,
  LlmRefusalError,
  LlmTruncatedError,
  type LlmGateway,
} from "@/llm/gateway";
import { defineJob } from "@/jobs/registry";
import { runStep, stepKey, type JobContext } from "@/jobs/steps";
import { getActiveUser, type AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { loadRules, RULE_SLUGS } from "@/server/rules";
import { settledCostMicros } from "@/server/spend";

/**
 * Comprobación del sistema: una sola llamada real y diminuta que recorre cola → reglas → pasarela
 * → libro de gasto, para que el dueño vea desde la web que todo está conectado. Cuesta una
 * fracción de céntimo (modelo pequeño, 16 tokens de salida) y corre en el proceso en segundo
 * plano, como cualquier llamada a un modelo.
 */

export const SYSTEM_CHECK_JOB = "sistema.comprobar";
export const LAST_CHECK_SETTING = "system.lastCheck";

/** Reglas que se cargan juntas para la comprobación: las tres del criterio de ángulos. */
const CHECK_RULES = [RULE_SLUGS.angulos, RULE_SLUGS.ejemplos, RULE_SLUGS.metodo];

/** Una comprobación en marcha que lleva más de esto sin acabar se da por perdida. */
const STALE_RUNNING_MS = 10 * 60_000;

/** Encolada más de esto sin que el proceso en segundo plano la empiece: «no responde todavía». */
const WORKER_SILENT_MS = 30_000;

/**
 * Tokens de salida permitidos. Holgados a propósito: el modelo puede gastar parte pensando y
 * 16 se agotaban antes de contestar. Aun así, el peor caso cuesta una fracción de céntimo.
 */
const CHECK_MAX_TOKENS = 1024;

export interface CheckStage {
  ok: boolean;
  /** Frase corta para mostrar: la versión de las reglas, el error… */
  detail?: string;
}

export interface SystemCheckResult {
  ok: boolean;
  /** Modelo que respondió; vacío si no llegó a responder. */
  model: string;
  costMicros: number;
  /** Instante de la comprobación, en ISO. */
  at: string;
  /** Qué ha fallado, en claro. */
  error?: string;
  /** `null`: no se llegó a esa etapa. */
  stages: { cola: CheckStage; reglas: CheckStage | null; pasarela: CheckStage | null; libro: CheckStage | null };
}

/** Fallos de la pasarela que se cuentan como resultado de la comprobación, no como fallo del paso. */
const EXPECTED_FAILURES = [
  LlmNotConfiguredError,
  LlmCapReachedError,
  LlmCallError,
  LlmRefusalError,
  LlmTruncatedError,
  LlmInvalidOutputError,
];

function expectedMessage(error: unknown): string | null {
  return EXPECTED_FAILURES.some((type) => error instanceof type) ? (error as Error).message : null;
}

/**
 * Hace la comprobación y guarda el resultado (`system.lastCheck`). Solo para el dueño (se vuelve
 * a comprobar aquí). Todo va en un solo paso, con la clave de `requestId` (el identificador de la
 * pulsación; sin él, el minuto): repetir la misma no vuelve a llamar ni a pagar, y una pulsación
 * nueva hace una comprobación nueva aunque la anterior fallara. Un fallo esperado (sin clave,
 * tope alcanzado, Claude caído) es un resultado `ok: false` y no se reintenta: una llamada que
 * pudo cobrarse no se repite sola.
 */
export async function runSystemCheck(
  ctx: JobContext,
  deps: { gateway: LlmGateway; now?: () => Date; requestId?: string },
): Promise<SystemCheckResult> {
  if ((await getActiveUser(ctx.userId))?.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const now = (deps.now ?? (() => new Date()))();
  const at = now.toISOString();
  const key = stepKey(ctx, "comprobar", { request: deps.requestId ?? at.slice(0, 16) });

  const result = await runStep(ctx, key, async (): Promise<SystemCheckResult> => {
    const stages: SystemCheckResult["stages"] = { cola: { ok: true }, reglas: null, pasarela: null, libro: null };
    const failed = (error: string, model = "", costMicros = 0): SystemCheckResult => ({
      ok: false,
      model,
      costMicros,
      at,
      error,
      stages,
    });

    let rules;
    try {
      rules = await loadRules(CHECK_RULES);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las reglas.";
      stages.reglas = { ok: false, detail: message };
      return failed(message);
    }
    stages.reglas = { ok: true, detail: rules.map((rule) => `${rule.slug} v${rule.version}`).join(", ") };

    let answer: { model: string; costMicros: number; spendEntryId: number };
    try {
      answer = await deps.gateway.call({
        tier: "small",
        stepKey: key,
        userId: ctx.userId,
        productId: null,
        rules,
        instructions: "Es una comprobación técnica. Responde solo con la palabra OK.",
        content: "Comprobación del sistema.",
        maxTokens: CHECK_MAX_TOKENS,
      });
    } catch (error) {
      // Cortada pero con algo de texto: la conexión funciona y el gasto ya quedó apuntado.
      if (error instanceof LlmTruncatedError && error.partial?.text.trim()) {
        answer = error.partial;
      } else {
        const message = expectedMessage(error);
        if (message === null) throw error;
        stages.pasarela = { ok: false, detail: message };
        return failed(message);
      }
    }
    stages.pasarela = { ok: true, detail: answer.model };

    const booked = await settledCostMicros(answer.spendEntryId);
    const ledgerOk = booked !== null && booked === answer.costMicros;
    stages.libro = ledgerOk
      ? { ok: true }
      : { ok: false, detail: "El gasto de la llamada no quedó apuntado en el libro." };
    return {
      ok: ledgerOk,
      model: answer.model,
      costMicros: answer.costMicros,
      at,
      ...(ledgerOk ? {} : { error: stages.libro.detail }),
      stages,
    };
  });

  await setSetting(LAST_CHECK_SETTING, result);
  return result;
}

export interface SystemCheckStatus {
  running: boolean;
  /** Encolada hace más de 30 s y nadie la ha empezado: el proceso en segundo plano no responde. */
  workerSilent: boolean;
  last: SystemCheckResult | null;
}

/** Si hay una comprobación encolada o en marcha, y el último resultado guardado. Solo el dueño. */
export async function systemCheckStatus(user: AuthUser, now: Date = new Date()): Promise<SystemCheckStatus> {
  if (user.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  const since = new Date(now.getTime() - STALE_RUNNING_MS);
  const [active] = await getDb()
    .select({ status: schema.jobSteps.status, updatedAt: schema.jobSteps.updatedAt })
    .from(schema.jobSteps)
    .where(
      and(
        eq(schema.jobSteps.jobName, SYSTEM_CHECK_JOB),
        inArray(schema.jobSteps.status, ["queued", "running"]),
        gte(schema.jobSteps.updatedAt, since),
      ),
    )
    .orderBy(desc(schema.jobSteps.updatedAt))
    .limit(1);
  const workerSilent = active?.status === "queued" && now.getTime() - active.updatedAt.getTime() > WORKER_SILENT_MS;
  return { running: Boolean(active), workerSilent, last: await getSetting<SystemCheckResult>(LAST_CHECK_SETTING) };
}

defineJob(
  SYSTEM_CHECK_JOB,
  async (data: { requestId?: string }, ctx) => {
    try {
      await runSystemCheck(ctx, { gateway: getGateway(), requestId: data.requestId });
    } catch (error) {
      // Un fallo que no es de la llamada (base de datos, persona sin acceso…): que la pantalla lo diga.
      const failure: SystemCheckResult = {
        ok: false,
        model: "",
        costMicros: 0,
        at: new Date().toISOString(),
        error: "La comprobación no ha podido terminar. Inténtalo de nuevo.",
        stages: { cola: { ok: true }, reglas: null, pasarela: null, libro: null },
      };
      await setSetting(LAST_CHECK_SETTING, failure).catch(() => undefined);
      throw error;
    }
  },
  "Comprobación del sistema",
);
