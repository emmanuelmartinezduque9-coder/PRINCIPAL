import { describe, expect, it, vi } from "vitest";
import { createHiggsfieldPort, DIAGNOSTIC_TOOLS, readBalance, readUploadTarget } from "@/connectors/higgsfield/adapter";
import { McpUnauthorizedError, type McpCaller } from "@/connectors/higgsfield/mcp";
import { HiggsfieldAuthError, HiggsfieldNotConnectedError, HiggsfieldUnavailableError } from "@/connectors/higgsfield/port";
import balanceFixture from "./fixtures/higgsfield/balance.json";
import mediaConfirmFixture from "./fixtures/higgsfield/media_confirm.json";
import mediaUploadFixture from "./fixtures/higgsfield/media_upload.json";

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

  it("el diagnóstico solo usa herramientas que no gastan, con los argumentos exactos del contrato", async () => {
    const reply = fixtureReply(balanceFixture) as { isError: boolean; text: string; data: unknown };
    const { port, mcpCalls } = setup([reply]);
    const report = await port.diagnostics(ANA);
    expect(report).toMatchObject({ tools: ["balance", "generate_video"], balance: { isError: false, data: { credits: 1234, plan: "plus" } } });
    expect(mcpCalls).toEqual([
      { name: "balance", args: {} },
      {
        name: "estimate_image_cost",
        args: {
          params: expect.objectContaining({ model: "nano_banana_pro", aspect_ratio: "9:16", resolution: "2k", count: 2, use_unlim: false }),
        },
      },
      {
        name: "estimate_video_cost",
        args: {
          params: expect.objectContaining({
            model: "seedance_2_5",
            mode: "omni_reference",
            aspect_ratio: "9:16",
            duration: 10,
            resolution: "480p",
            generate_audio: false,
            bitrate_mode: "high",
            use_unlim: false,
          }),
        },
      },
      { name: "show_generations", args: { only_completed: false, type: "video", size: 50 } },
    ]);
    expect(mcpCalls.some((c) => /^generate|^upload|^media_|^execute/.test(c.name))).toBe(false);
    expect(DIAGNOSTIC_TOOLS.map((t) => t.name)).toEqual(["balance", "estimate_image_cost", "estimate_video_cost", "show_generations"]);
  });

  it("si una herramienta del diagnóstico falla, se anota y siguen las demás", async () => {
    const calls: string[] = [];
    const caller: McpCaller = {
      async callTool(name) {
        calls.push(name);
        if (name === "estimate_video_cost") throw new Error("boom");
        return { isError: false, text: "{}", data: {} };
      },
      async listTools() {
        return [];
      },
      async close() {},
    };
    const port = createHiggsfieldPort({ open: async () => caller, refresh: vi.fn() });
    const report = await port.diagnostics(ANA);
    expect(report.estimate_video_cost).toEqual({ failed: "Error" });
    expect(calls).toHaveLength(4);
  });
});

describe("subir un archivo a Higgsfield", () => {
  const FILE = { bytes: Buffer.from("hola!"), filename: "ref.mp4", contentType: "video/mp4", type: "video" as const };

  /** Caller con respuestas por herramienta y un `fetch` falso que anota los PUT. */
  function uploadSetup(opts: { putStatus?: number; uploadReply?: Reply; putThrows?: boolean } = {}) {
    const mcpCalls: Array<{ name: string; args: unknown }> = [];
    const putRequests: Array<{ url: string; method: string; bytes: number; contentType: string | null }> = [];
    const caller: McpCaller = {
      async callTool(name, args) {
        mcpCalls.push({ name, args });
        const reply = name === "media_upload" ? (opts.uploadReply ?? fixtureReply(mediaUploadFixture)) : fixtureReply(mediaConfirmFixture);
        if (reply instanceof Error) throw reply;
        return reply;
      },
      async listTools() {
        return [];
      },
      async close() {},
    };
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as Uint8Array | undefined;
      putRequests.push({
        url: String(input),
        method: init?.method ?? "GET",
        bytes: body?.byteLength ?? 0,
        contentType: new Headers(init?.headers).get("content-type"),
      });
      if (opts.putThrows) throw new TypeError("fetch failed");
      return new Response(null, { status: opts.putStatus ?? 200 });
    }) as typeof fetch;
    const port = createHiggsfieldPort({ open: async () => caller, refresh: vi.fn(), fetch: fetchImpl });
    return { port, mcpCalls, putRequests };
  }

  it("uploadMedia pide la dirección, sube con PUT y confirma", async () => {
    const { port, mcpCalls, putRequests } = uploadSetup();
    expect(await port.uploadMedia(ANA, FILE)).toEqual({ mediaId: "m1" });
    expect(mcpCalls).toEqual([
      { name: "media_upload", args: { files: [{ filename: "ref.mp4", content_type: "video/mp4" }], method: "upload_url" } },
      { name: "media_confirm", args: { media_ids: ["m1"], type: "video" } },
    ]);
    expect(putRequests).toMatchObject([{ url: "https://upload.test/m1", method: "PUT", bytes: 5, contentType: "video/mp4" }]);
  });

  it("si el PUT no devuelve 200 no se confirma y lanza HiggsfieldUnavailableError", async () => {
    for (const opts of [{ putStatus: 403 }, { putStatus: 500 }, { putThrows: true }]) {
      const { port, mcpCalls } = uploadSetup(opts);
      await expect(port.uploadMedia(ANA, FILE)).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
      expect(mcpCalls.map((c) => c.name)).toEqual(["media_upload"]);
    }
  });

  it("una respuesta sin identificador o sin dirección https no sube nada", async () => {
    for (const data of [{}, { files: [{ media_id: "m1" }] }, { files: [{ media_id: "m1", upload_url: "http://upload.test/m1" }] }]) {
      const { port, putRequests } = uploadSetup({ uploadReply: { isError: false, text: "", data } });
      await expect(port.uploadMedia(ANA, FILE)).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
      expect(putRequests).toEqual([]);
    }
  });

  it("lee variantes razonables de la respuesta", () => {
    expect(readUploadTarget({ media_id: "a", upload_url: "https://u.test/a" })).toEqual({ mediaId: "a", uploadUrl: "https://u.test/a" });
    expect(readUploadTarget({ uploads: [{ id: "b", url: "https://u.test/b" }] })).toEqual({ mediaId: "b", uploadUrl: "https://u.test/b" });
    expect(readUploadTarget([{ mediaId: "c", uploadUrl: "https://u.test/c" }])).toEqual({ mediaId: "c", uploadUrl: "https://u.test/c" });
    expect(readUploadTarget(null)).toBeNull();
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
