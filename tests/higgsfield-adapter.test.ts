import { describe, expect, it, vi } from "vitest";
import { createHiggsfieldPort, readBalance } from "@/connectors/higgsfield/adapter";
import { McpUnauthorizedError, type McpCaller } from "@/connectors/higgsfield/mcp";
import { HiggsfieldAuthError, HiggsfieldNotConnectedError, HiggsfieldUnavailableError } from "@/connectors/higgsfield/port";
import balanceFixture from "./fixtures/higgsfield/balance.json";

const ANA = 7;

type Reply = { isError: boolean; text: string; data: unknown } | Error;

function fixtureReply(fixture: { isError: boolean; structuredContent: unknown }): Reply {
  return { isError: fixture.isError, text: JSON.stringify(fixture.structuredContent), data: fixture.structuredContent };
}

/** McpCaller simulado: cada apertura consume la siguiente respuesta de la lista (o lanza al abrir). */
function setup(replies: Array<Reply | "open401">) {
  const mcpCalls: Array<{ name: string; args: unknown }> = [];
  const opened: number[] = [];
  let closed = 0;
  const queue = [...replies];
  const open = vi.fn(async (userId: number): Promise<McpCaller> => {
    opened.push(userId);
    const next = queue.shift();
    if (next === "open401") throw new McpUnauthorizedError();
    return {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        if (next instanceof Error) throw next;
        if (!next) throw new Error("sin respuesta preparada");
        return next;
      },
      async listTools() {
        return ["balance", "generate_video"];
      },
      async close() {
        closed += 1;
      },
    };
  });
  const refresh = vi.fn(async () => {});
  const port = createHiggsfieldPort({ open, refresh });
  return { port, mcpCalls, opened, refresh, closedCount: () => closed };
}

describe("adaptador de Higgsfield", () => {
  it("balance llama a la herramienta `balance` sin argumentos y devuelve créditos y plan", async () => {
    const { port, mcpCalls, opened, closedCount } = setup([fixtureReply(balanceFixture)]);
    expect(await port.balance(ANA)).toEqual({ credits: 1234, plan: "plus" });
    expect(mcpCalls).toEqual([{ name: "balance", args: {} }]);
    expect(opened).toEqual([ANA]);
    expect(closedCount()).toBe(1);
  });

  it("un 401 del servidor refresca una vez y repite la lectura", async () => {
    const { port, refresh, mcpCalls } = setup([new McpUnauthorizedError(), fixtureReply(balanceFixture)]);
    expect(await port.balance(ANA)).toEqual({ credits: 1234, plan: "plus" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(ANA);
    expect(mcpCalls).toHaveLength(2);
  });

  it("un 401 al abrir también refresca; si vuelve a fallar, HiggsfieldAuthError sin bucles", async () => {
    const { port, refresh, closedCount } = setup(["open401", new McpUnauthorizedError()]);
    await expect(port.balance(ANA)).rejects.toBeInstanceOf(HiggsfieldAuthError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(closedCount()).toBe(1);
  });

  it("sin conexión o con la conexión caducada, el error llega tal cual", async () => {
    const open = vi.fn(async () => {
      throw new HiggsfieldNotConnectedError();
    });
    await expect(createHiggsfieldPort({ open, refresh: vi.fn() }).balance(ANA)).rejects.toBeInstanceOf(
      HiggsfieldNotConnectedError,
    );
    // El refresco tras un 401 dice que hay que reconectar: no se abre otra vez.
    const refresh = vi.fn(async () => {
      throw new HiggsfieldAuthError();
    });
    const reopen = vi.fn(async (): Promise<McpCaller> => {
      throw new McpUnauthorizedError();
    });
    await expect(createHiggsfieldPort({ open: reopen, refresh }).balance(ANA)).rejects.toBeInstanceOf(HiggsfieldAuthError);
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it("una respuesta que no se entiende lanza HiggsfieldUnavailableError: no inventa un saldo", async () => {
    for (const reply of [
      { isError: false, text: "hola", data: null },
      { isError: false, text: "{}", data: { plan: "plus" } },
      { isError: false, text: "", data: { credits: "mucho" } },
      { isError: true, text: "fallo", data: { credits: 5 } },
    ]) {
      const { port } = setup([reply]);
      await expect(port.balance(ANA)).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
    }
  });

  it("un fallo de red o del servidor es HiggsfieldUnavailableError y siempre cierra el cliente", async () => {
    const { port, closedCount } = setup([new Error("ECONNRESET")]);
    await expect(port.balance(ANA)).rejects.toThrow("Higgsfield no responde. Inténtalo dentro de unos minutos.");
    expect(closedCount()).toBe(1);
  });

  it("el diagnóstico solo usa herramientas que no gastan créditos", async () => {
    const { port, mcpCalls } = setup([fixtureReply(balanceFixture)]);
    const report = await port.diagnostics(ANA);
    expect(report).toMatchObject({ tools: ["balance", "generate_video"], balance: { credits: 1234, plan: "plus" } });
    expect(mcpCalls.map((c) => c.name)).toEqual(["balance"]);
  });
});

describe("lector del saldo", () => {
  it("acepta variantes razonables de nombre y anidación", () => {
    expect(readBalance({ credits: 10, subscription_plan: "pro" })).toEqual({ credits: 10, plan: "pro" });
    expect(readBalance({ balance: { available_credits: 3 } })).toEqual({ credits: 3, plan: null });
    expect(readBalance({ credits: "42", plan: { name: "Ultra" } })).toEqual({ credits: 42, plan: "Ultra" });
  });
  it("los créditos son enteros: una fracción se redondea hacia abajo, nunca hacia arriba", () => {
    expect(readBalance({ credits: 12.9 })).toEqual({ credits: 12, plan: null });
  });
  it("nada reconocible, negativo o infinito: null", () => {
    expect(readBalance(null)).toBeNull();
    expect(readBalance({ credits: -1 })).toBeNull();
    expect(readBalance({ credits: Infinity })).toBeNull();
  });
});
