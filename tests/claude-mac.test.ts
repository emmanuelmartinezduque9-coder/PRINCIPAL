import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { getDb, getPool, getSetting, schema } from "@/db/client";
import { createGateway, LlmCapReachedError, type LlmCall, type MacBridge } from "@/llm/gateway";
import { agentHeartbeat, claimTask, createAgentToken } from "@/server/agent";
import type { AuthUser } from "@/server/auth";
import {
  CLAUDE_CODE_TASK,
  MAC_LIMIT_SETTING,
  macClaudeSummary,
  macRoute,
  runOnMac,
  setMacMode,
} from "@/server/claude-mac";
import { POST as heartbeatRoute } from "@/app/api/agente/latido/route";
import { POST as claimRoute } from "@/app/api/agente/tareas/reclamar/route";
import { POST as finishRoute } from "@/app/api/agente/tareas/[taskId]/terminar/route";
import { fakeMessages } from "./helpers/fake-llm";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/**
 * Las llamadas a Claude del dueño van al Claude Code de su Mac (0 $); si el Mac no puede, a la API.
 * El Mac es de mentira: reclama y entrega por las mismas rutas que el agente de verdad.
 */

let dueno: AuthUser;
let ana: AuthUser;
let token: string;
let agentId: number;

const schemaOut = z.object({ angulo: z.string() });

const req = (user: AuthUser, over: Partial<LlmCall<unknown>> = {}): LlmCall<{ angulo: string }> => ({
  tier: "medium",
  stepKey: "angulos:proponer",
  userId: user.id,
  productId: null,
  rules: [{ slug: "angulos-de-venta", version: 2, body: "Regla de ángulos." }],
  instructions: "Propón un ángulo.",
  content: [
    { type: "text", text: "Producto: cepillo." },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
  ],
  maxTokens: 2_000,
  schema: schemaOut,
  ...(over as object),
});

/** El bridge real pero sin esperas largas. */
const fastBridge: MacBridge = {
  route: (userId) => macRoute(userId),
  run: (input) => runOnMac(input, { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 20))) }),
};

const auth = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

async function claimAsMac(body: unknown = { solo: "claude_code" }): Promise<Response> {
  return claimRoute(new Request("http://web.test/api/agente/tareas/reclamar", { method: "POST", headers: auth(), body: JSON.stringify(body) }));
}

async function finishAsMac(taskId: number, body: unknown): Promise<Response> {
  return finishRoute(new Request(`http://web.test/api/agente/tareas/${taskId}/terminar`, { method: "POST", headers: auth(), body: JSON.stringify(body) }), {
    params: Promise.resolve({ taskId: String(taskId) }),
  });
}

async function beat(claude: string | null = "2.1.330"): Promise<void> {
  const response = await heartbeatRoute(
    new Request("http://web.test/api/agente/latido", { method: "POST", headers: auth(), body: JSON.stringify({ version: "1.8.0", ytDlp: "2026.11.01", claude }) }),
  );
  expect(response.status).toBe(200);
}

/** Un Mac de mentira: espera una llamada, la mira con `inspect` y la contesta con lo que devuelva `answer`. */
async function macAnswers(answer: (task: { taskId: number; uploadId: string; job: Record<string, unknown> }) => unknown): Promise<{ taskId: number; job: Record<string, unknown> }> {
  for (let i = 0; i < 300; i++) {
    const response = await claimAsMac();
    if (response.status === 200) {
      const task = (await response.json()) as { taskId: number; uploadId: string; kind: string; job: Record<string, unknown> };
      expect(task.kind).toBe("claude_code");
      const finished = await finishAsMac(task.taskId, { uploadId: task.uploadId, ...(answer(task) as object) });
      expect(finished.status).toBe(200);
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("No llegó ninguna llamada al Mac.");
}

const goodAnswer = {
  ok: true,
  resultado: {
    text: '{"angulo":"Ahorra tiempo"}',
    structured: { angulo: "Ahorra tiempo" },
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0 },
    apiEquivalentMicros: 3_200,
    webSources: [],
    stopReason: "end",
  },
};

async function ledger() {
  const { rows } = await getPool().query<{ status: string; cost: number; reserved: number; detail: Record<string, unknown>; step: string; model: string }>(
    `select status, cost_micros::int as cost, reserved_micros::int as reserved, detail, step_key as step, model from spend_entries order by id`,
  );
  return rows;
}

beforeEach(async () => {
  await truncateAll();
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  ({ agentId, token } = await createAgentToken(dueno, "Mac de prueba"));
  await beat();
});

describe("por dónde va una llamada", () => {
  it("el dueño con Mac conectado y Claude Code con sesión: al Mac", async () => {
    expect(await macRoute(dueno.id)).toEqual({ mode: "mac_primero", usable: true });
  });

  it("una colaboradora siempre va a la API", async () => {
    expect(await macRoute(ana.id)).toBeNull();
  });

  it("sin Claude Code con sesión en el Mac (agente antiguo): apagado", async () => {
    await beat(null);
    expect(await macRoute(dueno.id)).toEqual({ mode: "mac_primero", usable: false, reason: "apagado" });
  });

  it("Mac sin señales: apagado; «Solo API»: a la API", async () => {
    await agentHeartbeat(agentId, { version: "1.8.0", ytDlp: null, claude: "2.1.330" }, new Date(Date.now() - 5 * 60_000));
    await getDb().update(schema.agents).set({ lastSeenAt: new Date(Date.now() - 5 * 60_000) }).where(eq(schema.agents.id, agentId));
    expect(await macRoute(dueno.id)).toMatchObject({ usable: false, reason: "apagado" });
    await setMacMode(dueno, "api");
    expect(await macRoute(dueno.id)).toBeNull();
  });

  it("el latido avisa (y reanuda los trabajos en pausa) solo cuando Claude Code pasa a tener sesión", async () => {
    // beforeEach ya latió con Claude Code: no es nuevo.
    expect(await agentHeartbeat(agentId, { version: "1.8.0", ytDlp: null, claude: "2.1.330" })).toEqual({ claudeReady: false });
    expect(await agentHeartbeat(agentId, { version: "1.8.0", ytDlp: null, claude: null })).toEqual({ claudeReady: false });
    expect(await agentHeartbeat(agentId, { version: "1.8.0", ytDlp: null, claude: "2.1.330" })).toEqual({ claudeReady: true });
  });

  it("solo el dueño cambia el modo, y solo a uno válido", async () => {
    await expect(setMacMode(ana, "solo_mac")).rejects.toMatchObject({ status: 403 });
    await expect(setMacMode(dueno, "gratis")).rejects.toMatchObject({ status: 400 });
    await setMacMode(dueno, "solo_mac");
    expect(await macRoute(dueno.id)).toEqual({ mode: "solo_mac", usable: true });
  });
});

describe("llamada hecha en el Mac", () => {
  it("devuelve lo mismo que la API, a 0 $ en el libro, sin tocar la API", async () => {
    const api = fakeMessages([]);
    const gateway = createGateway({ client: api.client, mac: fastBridge });
    const [result, task] = await Promise.all([gateway.call(req(dueno)), macAnswers(() => goodAnswer)]);

    expect(result.data).toEqual({ angulo: "Ahorra tiempo" });
    expect(result.text).toBe('{"angulo":"Ahorra tiempo"}');
    expect(result.costMicros).toBe(0);
    expect(result.ruleVersions).toEqual({ "angulos-de-venta": 2 });
    expect(api.calls).toHaveLength(0);

    // Lo que viajó al Mac: el sistema (reglas + instrucciones), el mensaje con la foto, el esquema, modelo y esfuerzo.
    expect(task.job.system).toContain("Regla de ángulos.");
    expect(task.job.system).toContain("Propón un ángulo.");
    expect(task.job.content).toEqual(req(dueno).content);
    expect(task.job.jsonSchema).toMatchObject({ type: "object", properties: { angulo: { type: "string" } } });
    expect(task.job).toMatchObject({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 2_000, web: null });

    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "settled", cost: 0, reserved: 0, step: "angulos:proponer", model: "claude-sonnet-5-5" });
    expect(rows[0].detail).toMatchObject({ via: "mac", apiEquivalentMicros: 3_200, macTaskId: task.taskId });

    // La tarea ya no guarda el mensaje (ni la foto): solo la respuesta.
    const [stored] = await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.id, task.taskId));
    expect(stored.status).toBe("done");
    expect(JSON.stringify(stored.payload)).not.toContain("iVBORw0KGgo=");

    const summary = await macClaudeSummary(dueno);
    expect(summary).toMatchObject({ mode: "mac_primero", macCalls: 1, savedMicros: 3_200, apiFallbacks: 0 });
  });

  it("con búsqueda en internet: el Mac busca y las fuentes llegan como `webSources`", async () => {
    const gateway = createGateway({ client: fakeMessages([]).client, mac: fastBridge });
    const call = req(dueno, { web: { searches: 3, fetches: 2, country: "DE" } });
    const [result, task] = await Promise.all([
      gateway.call(call),
      macAnswers(() => ({
        ok: true,
        resultado: { ...goodAnswer.resultado, text: 'Mirado.\n```json\n{"angulo":"Regalo"}\n```', structured: null, webSources: ["https://ejemplo.de/a"] },
      })),
    ]);
    expect(result.data).toEqual({ angulo: "Regalo" });
    expect(result.webSources).toEqual(["https://ejemplo.de/a"]);
    expect(task.job.jsonSchema).toBeNull();
    expect(task.job.system).toContain("```json");
    expect(task.job.system).toContain("DE");
    expect(task.job.web).toEqual({ searches: 3, fetches: 2, country: "DE" });
  });

  it("la cola normal de enlaces nunca da una llamada de Claude (ni a un agente antiguo)", async () => {
    const gateway = createGateway({ client: fakeMessages([]).client, mac: fastBridge });
    const pending = gateway.call(req(dueno));
    for (let i = 0; i < 50; i++) {
      const [row] = await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.kind, CLAUDE_CODE_TASK));
      if (row) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(await claimTask(agentId, new Date(), { can: ["enlace_medio", "perfil", "pinterest", "datos"] })).toBeNull();
    expect((await claimAsMac({ puede: ["perfil"] })).status).toBe(204);
    await macAnswers(() => goodAnswer);
    await pending;
  });

  it("las llamadas de una colaboradora no van al Mac", async () => {
    const api = fakeMessages([{ text: '{"angulo":"API"}' }]);
    const result = await createGateway({ client: api.client, mac: fastBridge }).call(req(ana));
    expect(result.data).toEqual({ angulo: "API" });
    expect(api.calls).toHaveLength(1);
    expect(await getDb().select().from(schema.agentTasks)).toHaveLength(0);
  });
});

describe("cuando el Mac no puede", () => {
  it("límite del plan: esta va por la API (apuntado) y las siguientes, directas a la API un rato", async () => {
    const api = fakeMessages([{ text: '{"angulo":"API"}' }, { text: '{"angulo":"API 2"}' }]);
    const gateway = createGateway({ client: api.client, mac: fastBridge });
    const [result] = await Promise.all([gateway.call(req(dueno)), macAnswers(() => ({ ok: false, error: "Claude AI usage limit reached", limite: true }))]);
    expect(result.data).toEqual({ angulo: "API" });
    expect(api.calls).toHaveLength(1);
    expect(await getSetting(MAC_LIMIT_SETTING)).toBeTruthy();
    expect((await ledger())[0].detail).toMatchObject({ macFallback: "limite" });

    // La siguiente ni pasa por el Mac.
    expect(await macRoute(dueno.id)).toMatchObject({ usable: false, reason: "limite" });
    expect((await gateway.call(req(dueno))).data).toEqual({ angulo: "API 2" });
    expect(await getDb().select().from(schema.agentTasks)).toHaveLength(1);
    expect((await macClaudeSummary(dueno)).apiFallbacks).toBe(2);
  });

  it("un fallo del Mac: por la API, dentro del tope", async () => {
    const api = fakeMessages([{ text: '{"angulo":"API"}' }]);
    const gateway = createGateway({ client: api.client, mac: fastBridge });
    const [result] = await Promise.all([gateway.call(req(dueno)), macAnswers(() => ({ ok: false, error: "Claude Code tardó más de 10 minutos" }))]);
    expect(result.data).toEqual({ angulo: "API" });
    expect((await ledger())[0].detail).toMatchObject({ macFallback: "fallo" });
  });

  it("el Mac se apaga con la llamada en cola: se retira y va por la API", async () => {
    const api = fakeMessages([{ text: '{"angulo":"API"}' }]);
    const gateway = createGateway({ client: api.client, mac: fastBridge });
    const pending = gateway.call(req(dueno));
    for (let i = 0; i < 50; i++) {
      const rows = await getDb().select().from(schema.agentTasks);
      if (rows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await getDb().update(schema.agents).set({ lastSeenAt: new Date(Date.now() - 5 * 60_000) }).where(eq(schema.agents.id, agentId));
    expect((await pending).data).toEqual({ angulo: "API" });
    const [task] = await getDb().select().from(schema.agentTasks);
    expect(task).toMatchObject({ status: "failed", payload: null });
    // Un Mac que vuelve tarde ya no la puede entregar.
    expect((await claimAsMac()).status).toBe(204);
  });

  it("«Solo Mac» con el Mac apagado: el paso queda en pausa (no gasta API)", async () => {
    await setMacMode(dueno, "solo_mac");
    await beat(null);
    const api = fakeMessages([]);
    await expect(createGateway({ client: api.client, mac: fastBridge }).call(req(dueno))).rejects.toBeInstanceOf(LlmCapReachedError);
    expect(api.calls).toHaveLength(0);
    expect(await ledger()).toHaveLength(0);
  });

  it("una respuesta del Mac que no se entiende se rechaza (400) y la llamada no se da por hecha", async () => {
    const gateway = createGateway({ client: fakeMessages([{ text: '{"angulo":"API"}' }]).client, mac: fastBridge });
    const pending = gateway.call(req(dueno));
    let task: { taskId: number; uploadId: string } | null = null;
    for (let i = 0; i < 300 && !task; i++) {
      const response = await claimAsMac();
      if (response.status === 200) task = (await response.json()) as { taskId: number; uploadId: string };
      else await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await finishAsMac(task!.taskId, { uploadId: task!.uploadId, ok: true, resultado: { nada: 1 } })).status).toBe(400);
    expect((await finishAsMac(task!.taskId, { uploadId: "otra", ok: true, resultado: goodAnswer.resultado })).status).toBe(409);
    expect((await finishAsMac(task!.taskId, { uploadId: task!.uploadId, ...goodAnswer })).status).toBe(200);
    expect((await pending).data).toEqual({ angulo: "Ahorra tiempo" });
  });
});
