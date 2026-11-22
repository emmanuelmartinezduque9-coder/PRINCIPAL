import { describe, expect, it, vi } from "vitest";
import {
  createHiggsfieldPort,
  DIAGNOSTIC_TOOLS,
  readBalance,
  readHistory,
  readJobs,
  readQuote,
  readSubmit,
  readUploadTarget,
} from "@/connectors/higgsfield/adapter";
import { McpUnauthorizedError, type McpCaller } from "@/connectors/higgsfield/mcp";
import {
  HiggsfieldAuthError,
  HiggsfieldNotConnectedError,
  HiggsfieldRejectedError,
  HiggsfieldUnavailableError,
  HiggsfieldUnknownOutcomeError,
  type HfImageRequest,
  type HfVideoRequest,
} from "@/connectors/higgsfield/port";
import balanceFixture from "./fixtures/higgsfield/balance.json";
import estimateFixture from "./fixtures/higgsfield/estimate.json";
import generateBatchFixture from "./fixtures/higgsfield/generate_batch.json";
import jobsWaitFixture from "./fixtures/higgsfield/jobs_wait.json";
import showGenerationsFixture from "./fixtures/higgsfield/show_generations.json";
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

describe("generaciones en el adaptador", () => {
  const IMAGE: HfImageRequest = {
    model: "nano_banana_pro",
    prompt: "P",
    aspectRatio: "9:16",
    resolution: "2k",
    medias: [{ role: "image_references", value: "m1" }],
  };
  const VIDEO: HfVideoRequest = {
    model: "seedance_2_5",
    mode: "omni_reference",
    prompt: "P",
    aspectRatio: "9:16",
    duration: 10,
    resolution: "480p",
    generateAudio: false,
    bitrateMode: "high",
    medias: [
      { role: "video_references", value: "ref" },
      { role: "start_image", value: "job-f" },
      { role: "image_references", value: "m2" },
    ],
  };
  const accepted = (jobIds: string[]): Reply => ({
    isError: false,
    text: "",
    data: { jobs: jobIds.map((job_id, index) => ({ index, job_id })) },
  });

  it("quoteImages → estimate_image_cost", async () => {
    const { port, mcpCalls } = setup([fixtureReply(estimateFixture)]);
    expect(await port.quoteImages(ANA, IMAGE, 2)).toEqual({ credits: 4 });
    expect(mcpCalls[0]).toEqual({
      name: "estimate_image_cost",
      args: {
        params: {
          model: "nano_banana_pro",
          prompt: "P",
          aspect_ratio: "9:16",
          resolution: "2k",
          count: 2,
          use_unlim: false,
          medias: [{ role: "image_references", value: "m1" }],
        },
      },
    });
  });

  it("quoteVideo → estimate_video_cost con los parámetros fijos del clip", async () => {
    const { port, mcpCalls } = setup([fixtureReply(estimateFixture)]);
    expect(await port.quoteVideo(ANA, VIDEO)).toEqual({ credits: 4 });
    expect(mcpCalls[0]).toEqual({
      name: "estimate_video_cost",
      args: {
        params: {
          model: "seedance_2_5",
          mode: "omni_reference",
          prompt: "P",
          aspect_ratio: "9:16",
          duration: 10,
          resolution: "480p",
          generate_audio: false,
          bitrate_mode: "high",
          use_unlim: false,
          medias: VIDEO.medias,
        },
      },
    });
  });

  it("un presupuesto sin cifra, o con error, es HiggsfieldUnavailableError", async () => {
    for (const reply of [{ isError: false, text: "{}", data: { quote_ref: "q" } }, { isError: true, text: "no", data: { credits: 4 } }]) {
      const { port } = setup([reply]);
      await expect(port.quoteImages(ANA, IMAGE, 2)).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
    }
  });

  it("submitImages → generate_image_batch, una petición por candidata", async () => {
    const { port, mcpCalls } = setup([accepted(["a", "b"])]);
    const result = await port.submitImages(ANA, IMAGE, 2);
    expect(result).toMatchObject({ jobIds: ["a", "b"], rejected: [] });
    expect(result.raw).toEqual({ jobs: [{ index: 0, job_id: "a" }, { index: 1, job_id: "b" }] });
    expect(mcpCalls[0].name).toBe("generate_image_batch");
    const args = mcpCalls[0].args as { requests: Array<{ index: number; params: Record<string, unknown> }> };
    expect(args.requests.map((r) => [r.index, r.params.count, r.params.use_unlim])).toEqual([
      [0, 1, false],
      [1, 1, false],
    ]);
    expect(args.requests[1].params).toMatchObject({ model: "nano_banana_pro", prompt: "P", resolution: "2k", aspect_ratio: "9:16" });
  });

  it("submitVideo → generate_video_batch con Seedance 2.5", async () => {
    const { port, mcpCalls } = setup([accepted(["v"])]);
    expect(await port.submitVideo(ANA, VIDEO)).toMatchObject({ jobIds: ["v"], rejected: [] });
    expect(mcpCalls[0]).toEqual({
      name: "generate_video_batch",
      args: {
        requests: [
          {
            index: 0,
            params: {
              model: "seedance_2_5",
              mode: "omni_reference",
              prompt: "P",
              aspect_ratio: "9:16",
              duration: 10,
              resolution: "480p",
              generate_audio: false,
              bitrate_mode: "high",
              count: 1,
              use_unlim: false,
              medias: [
                { role: "video_references", value: "ref" },
                { role: "start_image", value: "job-f" },
                { role: "image_references", value: "m2" },
              ],
            },
          },
        ],
      },
    });
  });

  it("si Higgsfield acepta una de dos, lo dice con el motivo de la otra", async () => {
    const { port } = setup([fixtureReply(generateBatchFixture)]);
    expect(await port.submitImages(ANA, IMAGE, 2)).toMatchObject({
      jobIds: ["5b0e6a52-8a54-4c55-9d1f-1d2c3b4a5f60"],
      rejected: ["Insufficient credits for this request."],
    });
  });

  it("jobs → jobs_wait con índices y la espera pedida (0–15 s)", async () => {
    const { port, mcpCalls } = setup([fixtureReply(jobsWaitFixture), fixtureReply(jobsWaitFixture)]);
    await port.jobs(ANA, ["j1", "j2"], 0);
    expect(mcpCalls[0]).toEqual({ name: "jobs_wait", args: { jobs: [{ index: 0, job_id: "j1" }, { index: 1, job_id: "j2" }], timeout_seconds: 0 } });
    await port.jobs(ANA, ["j1"], 60);
    expect(mcpCalls[1].args).toMatchObject({ timeout_seconds: 15 });
  });

  it("jobs lee terminados, bloqueados, fallidos y pendientes", async () => {
    const { port } = setup([fixtureReply(jobsWaitFixture)]);
    expect(await port.jobs(ANA, ["j1", "j2", "j3", "j4", "j6"], 0)).toEqual([
      { jobId: "j1", status: "done", failure: null, error: null, urls: ["https://cdn.higgsfield.test/j1.png"] },
      { jobId: "j2", status: "failed", failure: "nsfw", error: "Content flagged.", urls: [] },
      { jobId: "j3", status: "pending", failure: null, error: null, urls: [] },
      { jobId: "j4", status: "failed", failure: "failed", error: "Generation failed.", urls: [] },
      // No aparece en la respuesta: sigue pendiente.
      { jobId: "j6", status: "pending", failure: null, error: null, urls: [] },
    ]);
  });

  it("un estado de trabajo que no se reconoce se trata como pendiente", () => {
    expect(readJobs(jobsWaitFixture.structuredContent, ["j5"])).toEqual([{ jobId: "j5", status: "pending", failure: null, error: null, urls: [] }]);
    // Sin `job_id`, por su índice; `ip_detected` también es un bloqueo.
    expect(readJobs({ jobs: [{ index: 0, status: "ip_detected" }] }, ["x"])).toMatchObject([{ jobId: "x", status: "failed", failure: "ip_detected" }]);
    expect(readJobs({ nada: true }, ["x"])).toBeNull();
  });

  it("una lectura de trabajos con error o ilegible es HiggsfieldUnavailableError (no un resultado desconocido)", async () => {
    for (const reply of [{ isError: true, text: "x", data: null }, { isError: false, text: "x", data: null }, new Error("ECONNRESET")]) {
      const { port } = setup([reply]);
      await expect(port.jobs(ANA, ["j1"], 0)).rejects.toBeInstanceOf(HiggsfieldUnavailableError);
    }
  });

  it("history → show_generations con todos los estados", async () => {
    const { port, mcpCalls } = setup([fixtureReply(showGenerationsFixture)]);
    const items = await port.history(ANA, "image", 50);
    expect(mcpCalls[0]).toEqual({ name: "show_generations", args: { only_completed: false, type: "image", size: 50 } });
    expect(items).toEqual([
      { jobId: "j10", type: "image", model: "nano_banana_pro", prompt: "P", createdAt: new Date("2026-11-22T08:00:05Z") },
      { jobId: "j9", type: "image", model: "nano_banana_pro", prompt: "P", createdAt: new Date(1795334400 * 1000) },
    ]);
  });

  it("un envío con `isError` lanza HiggsfieldRejectedError con el texto de Higgsfield", async () => {
    const { port } = setup([{ isError: true, text: "Insufficient credits.", data: null }]);
    const error = await port.submitImages(ANA, IMAGE, 2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HiggsfieldRejectedError);
    expect((error as HiggsfieldRejectedError).reason).toBe("Insufficient credits.");
    expect((error as HiggsfieldRejectedError).raw).toEqual({ texto: "Insufficient credits." });
  });

  it("una respuesta `unlim_choice` es un rechazo: no se envió nada", async () => {
    for (const data of [{ unlim_choice: { question: "Use unlimited?" } }, { status: "unlim_choice" }]) {
      const { port } = setup([{ isError: false, text: "", data }]);
      await expect(port.submitVideo(ANA, VIDEO)).rejects.toBeInstanceOf(HiggsfieldRejectedError);
    }
  });

  it("si Higgsfield rechaza todas las peticiones, es un rechazo con sus motivos", async () => {
    const { port } = setup([{ isError: false, text: "", data: { jobs: [{ index: 0, error: "bad prompt" }] } }]);
    await expect(port.submitVideo(ANA, VIDEO)).rejects.toMatchObject({ name: "HiggsfieldRejectedError", reason: "bad prompt" });
  });

  it("un corte de conexión o una respuesta ilegible en un envío lanza HiggsfieldUnknownOutcomeError", async () => {
    for (const reply of [new Error("ECONNRESET"), { isError: false, text: "ok", data: null }, { isError: false, text: "", data: { jobs: [] } }]) {
      const { port, refresh } = setup([reply]);
      await expect(port.submitImages(ANA, IMAGE, 2)).rejects.toBeInstanceOf(HiggsfieldUnknownOutcomeError);
      expect(refresh).not.toHaveBeenCalled();
    }
  });

  it("un 401 en un envío prueba que no se ejecutó: se refresca y se repite una vez", async () => {
    const { port, mcpCalls, refresh } = setup([new McpUnauthorizedError(), accepted(["a"])]);
    expect(await port.submitVideo(ANA, VIDEO)).toMatchObject({ jobIds: ["a"] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mcpCalls.map((c) => c.name)).toEqual(["generate_video_batch", "generate_video_batch"]);
    // Dos 401 seguidos: hay que volver a conectar (y no se envió nada).
    const twice = setup([new McpUnauthorizedError(), new McpUnauthorizedError()]);
    await expect(twice.port.submitVideo(ANA, VIDEO)).rejects.toBeInstanceOf(HiggsfieldAuthError);
  });

  it("lectores: variantes razonables", () => {
    expect(readQuote({ cost: { credits: 3.2 } })).toEqual({ credits: 4 });
    expect(readQuote({ total_credits: "6" })).toEqual({ credits: 6 });
    expect(readQuote({ quote_ref: "q" })).toBeNull();
    expect(readSubmit({ results: ["a", "b"] })).toEqual({ jobIds: ["a", "b"], rejected: [] });
    expect(readSubmit({ jobs: [{ index: 0, id: "a" }], rejected: [{ index: 1, reason: "no" }] })).toEqual({ jobIds: ["a"], rejected: ["no"] });
    expect(readSubmit({})).toBeNull();
    expect(readHistory({ data: { items: [{ job_id: "z", params: { model: "m", prompt: { ref: "x" } } }] } }, "video")).toEqual([
      { jobId: "z", type: "video", model: "m", prompt: null, createdAt: null },
    ]);
    expect(readHistory({ nada: 1 }, "video")).toBeNull();
  });
});
