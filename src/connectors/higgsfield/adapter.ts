import { McpUnauthorizedError, openMcp, type McpCaller } from "./mcp";
import { accessTokenFor, refreshNow } from "./oauth";
import {
  HiggsfieldAuthError,
  HiggsfieldUnavailableError,
  isHiggsfieldError,
  type HfBalance,
  type HiggsfieldPort,
} from "./port";

/**
 * `HiggsfieldPort` real: solo este archivo conoce los nombres de las herramientas MCP de
 * Higgsfield. Abre un cliente por llamada con el token de la persona, lo cierra siempre y, ante
 * un 401, refresca y repite UNA vez. Las respuestas se leen contra
 * `tests/fixtures/higgsfield/*.json` (forma supuesta hasta la PUERTA).
 */

const PROBE_PROMPT = "Diagnóstico de PRINCIPAL: solo presupuesto, no generar.";

/**
 * Herramientas que usa el diagnóstico, con sus argumentos exactos del contrato: solo lecturas y
 * presupuestos, que no gastan créditos (resolución del coordinador). Nunca una que genere.
 */
export const DIAGNOSTIC_TOOLS: ReadonlyArray<{ name: string; args: Record<string, unknown> }> = [
  { name: "balance", args: {} },
  {
    name: "estimate_image_cost",
    args: {
      params: {
        model: "nano_banana_pro",
        prompt: PROBE_PROMPT,
        aspect_ratio: "9:16",
        resolution: "2k",
        count: 2,
        use_unlim: false,
      },
    },
  },
  {
    name: "estimate_video_cost",
    args: {
      params: {
        model: "seedance_2_5",
        mode: "omni_reference",
        prompt: PROBE_PROMPT,
        aspect_ratio: "9:16",
        duration: 10,
        resolution: "480p",
        generate_audio: false,
        bitrate_mode: "high",
        use_unlim: false,
      },
    },
  },
  { name: "show_generations", args: { only_completed: false, type: "video", size: 50 } },
];

const num = (value: unknown): number | null => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Lee créditos y plan de la respuesta de `balance`. Admite variantes razonables de nombres y un
 * nivel de anidación; si no reconoce un número de créditos, `null` (nunca inventa un saldo).
 * Los créditos son enteros: una fracción se redondea hacia abajo.
 */
export function readBalance(data: unknown): HfBalance | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const layers = [root, ...["balance", "data", "result", "credits"].map((k) => root[k]).filter((v) => v && typeof v === "object")] as Array<
    Record<string, unknown>
  >;
  let credits: number | null = null;
  let plan: string | null = null;
  for (const layer of layers) {
    for (const key of ["credits", "available_credits", "credits_available", "balance", "total_credits", "total"]) {
      if (credits === null) credits = num(layer[key]);
    }
    for (const key of ["plan", "subscription_plan", "plan_name", "subscription", "tier"]) {
      const value = layer[key];
      if (plan !== null) break;
      if (typeof value === "string" && value.trim()) plan = value.trim();
      else if (value && typeof value === "object") {
        const named = (value as Record<string, unknown>).name ?? (value as Record<string, unknown>).plan;
        if (typeof named === "string" && named.trim()) plan = named.trim();
      }
    }
  }
  return credits === null ? null : { credits: Math.floor(credits), plan };
}

export function createHiggsfieldPort(
  deps: {
    open?: (userId: number) => Promise<McpCaller>;
    refresh?: (userId: number) => Promise<void>;
    fetch?: typeof fetch;
  } = {},
): HiggsfieldPort {
  const oauthDeps = deps.fetch ? { fetch: deps.fetch } : undefined;
  const open = deps.open ?? (async (userId: number) => openMcp(await accessTokenFor(userId, oauthDeps), oauthDeps));
  const refresh =
    deps.refresh ??
    (async (userId: number) => {
      await refreshNow(userId, oauthDeps);
    });

  async function withCaller<T>(userId: number, fn: (caller: McpCaller) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      let caller: McpCaller | null = null;
      try {
        caller = await open(userId);
        return await fn(caller);
      } catch (error) {
        if (error instanceof McpUnauthorizedError) {
          if (attempt === 0) {
            await refresh(userId);
            continue;
          }
          // Un token recién refrescado tampoco vale: no se insiste (ni se entra en bucle).
          console.warn(`[higgsfield] El servidor MCP rechazó también el token renovado (persona ${userId}).`);
          throw new HiggsfieldAuthError();
        }
        if (isHiggsfieldError(error)) throw error;
        console.warn(`[higgsfield] Fallo al hablar con el MCP (persona ${userId}): ${error instanceof Error ? error.name : "desconocido"}`);
        throw new HiggsfieldUnavailableError();
      } finally {
        await caller?.close().catch(() => {});
      }
    }
  }

  return {
    async balance(userId) {
      return withCaller(userId, async (caller) => {
        const result = await caller.callTool("balance", {});
        const balance = result.isError ? null : readBalance(result.data);
        if (!balance) {
          console.warn("[higgsfield] Respuesta de `balance` que no se entiende.");
          throw new HiggsfieldUnavailableError();
        }
        return balance;
      });
    },
    async diagnostics(userId) {
      return withCaller(userId, async (caller) => {
        const report: Record<string, unknown> = { tools: await caller.listTools() };
        for (const { name, args } of DIAGNOSTIC_TOOLS) {
          try {
            const result = await caller.callTool(name, args);
            report[name] = { isError: result.isError, data: result.data ?? result.text };
          } catch (error) {
            // Un 401 se trata fuera (refresco y una repetición); otro fallo no tapa las demás.
            if (error instanceof McpUnauthorizedError) throw error;
            report[name] = { failed: error instanceof Error ? error.name : "desconocido" };
          }
        }
        return report;
      });
    },
  };
}
