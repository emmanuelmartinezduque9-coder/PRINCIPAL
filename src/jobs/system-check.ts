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
 * Hace la comprobación y guarda el resultado (`system.lastCheck`). Todo va en un solo paso: con
 * la misma clave (el mismo minuto) no se vuelve a llamar ni a pagar. Un fallo esperado (sin clave,
 * tope alcanzado, Claude caído) es un resultado `ok: false` y no se reintenta: una llamada que
 * pudo cobrarse no se repite sola.
 */
export async function runSystemCheck(
  ctx: JobContext,
  deps: { gateway: LlmGateway; now?: () => Date },
): Promise<SystemCheckResult> {
  const now = (deps.now ?? (() => new Date()))();
  const at = now.toISOString();
  const key = stepKey(ctx, "comprobar", { minute: at.slice(0, 16) });

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

    let answer;
    try {
      answer = await deps.gateway.call({
        tier: "small",
        stepKey: key,
        userId: ctx.userId,
        productId: null,
        rules,
        instructions: "Es una comprobación técnica. Responde solo con la palabra OK.",
        content: "Comprobación del sistema.",
        maxTokens: 16,
      });
    } catch (error) {
      const message = expectedMessage(error);
      if (message === null) throw error;
      stages.pasarela = { ok: false, detail: message };
      return failed(message);
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
  last: SystemCheckResult | null;
}

/** Si hay una comprobación encolada o en marcha, y el último resultado guardado. */
export async function systemCheckStatus(now: Date = new Date()): Promise<SystemCheckStatus> {
  const since = new Date(now.getTime() - STALE_RUNNING_MS);
  const [active] = await getDb()
    .select({ key: schema.jobSteps.key })
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
  return { running: Boolean(active), last: await getSetting<SystemCheckResult>(LAST_CHECK_SETTING) };
}

defineJob(
  SYSTEM_CHECK_JOB,
  async (_data: object, ctx) => {
    try {
      await runSystemCheck(ctx, { gateway: getGateway() });
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
