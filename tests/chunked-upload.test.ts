import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { uploadInChunks } from "@/lib/chunked-upload";

/**
 * Servidor de subidas simulado (sin red): imita las rutas de la Tarea 5 con trozos de 5 MB.
 * `hooks` deja cortar una petición concreta (fallo de red, 5xx, 409, 410, 400…).
 */
const MB = 1024 * 1024;
const CHUNK = 5 * MB;
const VIDEO_ID = 7;
const BASE = `/api/videos/${VIDEO_ID}/referencia/subida`;

type Call = { method: string; url: string; index?: number };
type Hook = (call: Call, n: number) => Response | "network" | "store-then-network" | undefined;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeServer(hooks: { put?: Hook; progress?: Hook; start?: Hook; finish?: Hook } = {}) {
  const calls: Call[] = [];
  const sessions = new Map<string, { received: number; total: number }>();
  let sessionCount = 0;
  const counters = { put: 0, progress: 0, start: 0, finish: 0 };

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = String(input);
    const method = init?.method ?? "GET";
    const parsed = new URL(url, "http://localhost");
    const indexParam = parsed.searchParams.get("indice");
    const call: Call = { method, url: parsed.pathname, ...(indexParam !== null ? { index: Number(indexParam) } : {}) };
    calls.push(call);

    const run = (kind: keyof typeof counters, hook: Hook | undefined) => {
      counters[kind] += 1;
      return hook?.(call, counters[kind]);
    };

    if (method === "POST" && parsed.pathname === BASE) {
      const hooked = run("start", hooks.start);
      if (hooked === "network") throw new TypeError("Failed to fetch");
      if (hooked instanceof Response) return hooked;
      const body = JSON.parse(String(init?.body)) as { filename: string; totalBytes: number };
      sessionCount += 1;
      const id = `subida${sessionCount}`;
      sessions.set(id, { received: 0, total: Math.ceil(body.totalBytes / CHUNK) });
      return json(201, { uploadId: id, chunkBytes: CHUNK });
    }

    const id = parsed.pathname.slice(BASE.length + 1);
    const session = sessions.get(id);
    if (!session) return json(404, { error: "Subida no encontrada." });

    if (method === "PUT") {
      const hooked = run("put", hooks.put);
      if (hooked === "network") throw new TypeError("Failed to fetch");
      if (hooked instanceof Response) return hooked;
      const index = call.index!;
      if (index > session.received) return json(409, { error: "Faltan trozos anteriores." });
      if (index === session.received) session.received += 1;
      if (hooked === "store-then-network") throw new TypeError("Failed to fetch");
      return json(200, { received: session.received });
    }
    if (method === "GET") {
      const hooked = run("progress", hooks.progress);
      if (hooked === "network") throw new TypeError("Failed to fetch");
      if (hooked instanceof Response) return hooked;
      return json(200, { received: session.received, totalChunks: session.total });
    }
    if (method === "POST") {
      const hooked = run("finish", hooks.finish);
      if (hooked === "network") throw new TypeError("Failed to fetch");
      if (hooked instanceof Response) return hooked;
      if (session.received < session.total) return json(400, { error: "El vídeo no ha llegado entero. Inténtalo de nuevo." });
      return json(202, { ok: true });
    }
    return json(405, { error: "?" });
  }

  return {
    calls,
    fetch: handle as typeof fetch,
    putIndexes: () => calls.filter((c) => c.method === "PUT").map((c) => c.index),
  };
}

function videoFile(bytes: number) {
  return Object.assign(new Blob([new Uint8Array(bytes)], { type: "video/mp4" }), { name: "referencia.mp4" });
}

function setup(server: ReturnType<typeof fakeServer>, bytes = 12 * MB) {
  const sleeps: number[] = [];
  const progress: number[] = [];
  const run = uploadInChunks(videoFile(bytes), VIDEO_ID, {
    onProgress: (fraction) => progress.push(fraction),
    fetch: server.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { run, sleeps, progress };
}

describe("subida por trozos desde el navegador", () => {
  it("sube los trozos en orden y termina", async () => {
    const server = fakeServer();
    const { run, progress, sleeps } = setup(server);
    await run;
    expect(server.putIndexes()).toEqual([0, 1, 2]);
    const [start, ...rest] = server.calls;
    expect(start).toMatchObject({ method: "POST", url: BASE });
    expect(rest.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/subida1` });
    expect(progress.at(-1)).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("manda el nombre, el tamaño y cada trozo con sus bytes exactos", async () => {
    const bodies: Array<{ index: number; size: number }> = [];
    let startBody: unknown;
    const server = fakeServer();
    const spy: typeof fetch = async (input, init) => {
      if (init?.method === "PUT") bodies.push({ index: Number(new URL(String(input), "http://x").searchParams.get("indice")), size: (init.body as Blob).size });
      if (init?.method === "POST" && String(input) === BASE) startBody = JSON.parse(String(init.body));
      return server.fetch(input, init);
    };
    await uploadInChunks(videoFile(12 * MB), VIDEO_ID, { onProgress: () => {}, fetch: spy, sleep: async () => {} });
    expect(startBody).toEqual({ filename: "referencia.mp4", totalBytes: 12 * MB });
    expect(bodies).toEqual([
      { index: 0, size: CHUNK },
      { index: 1, size: CHUNK },
      { index: 2, size: 2 * MB },
    ]);
  });

  it("si se corta en el trozo 2, espera, pregunta cuántos hay y sigue sin reenviar los anteriores", async () => {
    const server = fakeServer({ put: (call, n) => (call.index === 2 && n === 3 ? "network" : undefined) });
    const { run, sleeps } = setup(server);
    await run;
    const putIndexes = server.putIndexes();
    expect(putIndexes).toEqual([0, 1, 2, 2]);
    expect(sleeps).toEqual([1000]);
    const progressAsked = server.calls.findIndex((c) => c.method === "GET");
    expect(progressAsked).toBeGreaterThan(0);
  });

  it("si el servidor ya tenía el trozo (se perdió la respuesta), no lo reenvía", async () => {
    const server = fakeServer({ put: (call) => (call.index === 1 && server.putIndexes().length === 2 ? "store-then-network" : undefined) });
    const { run } = setup(server);
    await run;
    // El progreso dice `received: 2`: el siguiente PUT es el índice 2.
    expect(server.putIndexes()).toEqual([0, 1, 2]);
  });

  it("un 5xx o un 409 también se reintentan preguntando el progreso", async () => {
    const server = fakeServer({
      put: (call, n) => {
        if (n === 1) return json(503, { error: "Servicio no disponible" });
        if (call.index === 1 && n === 3) return json(409, { error: "Faltan trozos anteriores." });
        return undefined;
      },
    });
    const { run, sleeps } = setup(server);
    await run;
    expect(server.putIndexes()).toEqual([0, 0, 1, 1, 2]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("tras 5 fallos seguidos del mismo trozo se rinde con un mensaje claro", async () => {
    const server = fakeServer({ put: (call) => (call.index === 1 ? "network" : undefined) });
    const { run, sleeps } = setup(server);
    await expect(run).rejects.toThrow("La conexión se ha cortado demasiadas veces. Vuelve a intentarlo con mejor cobertura.");
    // El primer intento y 5 reintentos, con esperas de 1, 2, 4, 8 y 16 s.
    expect(server.putIndexes()).toEqual([0, 1, 1, 1, 1, 1, 1]);
    expect(sleeps).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(server.calls.some((c) => c.method === "POST" && c.url !== BASE)).toBe(false);
  });

  it("los fallos se cuentan por trozo: uno que sale bien vuelve a empezar la cuenta", async () => {
    const server = fakeServer({ put: (call, n) => ([2, 3, 4, 5, 7, 8, 9, 10].includes(n) ? "network" : undefined) });
    const { run } = setup(server);
    await run;
    expect(server.putIndexes()).toEqual([0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });

  it("un 410 vuelve a empezar una sola vez", async () => {
    const gone = () => json(410, { error: "La subida se ha interrumpido. Vuelve a elegir el vídeo." });
    const once = fakeServer({ put: (call, n) => (n === 2 ? gone() : undefined) });
    await setup(once).run;
    expect(once.calls.filter((c) => c.method === "POST" && c.url === BASE)).toHaveLength(2);
    expect(once.putIndexes()).toEqual([0, 1, 0, 1, 2]);
    expect(once.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/subida2` });

    const twice = fakeServer({ put: (_call, n) => (n === 2 || n === 4 ? gone() : undefined) });
    const run = setup(twice).run;
    await expect(run).rejects.toThrow("La subida se ha interrumpido. Vuelve a elegir el vídeo.");
    await expect(run).rejects.toBeInstanceOf(ApiError);
    expect(twice.calls.filter((c) => c.method === "POST" && c.url === BASE)).toHaveLength(2);
  });

  it("un 410 al preguntar el progreso o al terminar también vuelve a empezar", async () => {
    const gone = () => json(410, { error: "La subida se ha interrumpido. Vuelve a elegir el vídeo." });
    const server = fakeServer({
      put: (_call, n) => (n === 2 ? "network" : undefined),
      progress: (_call, n) => (n === 1 ? gone() : undefined),
    });
    await setup(server).run;
    expect(server.calls.filter((c) => c.method === "POST" && c.url === BASE)).toHaveLength(2);

    const atFinish = fakeServer({ finish: (_call, n) => (n === 1 ? gone() : undefined) });
    await setup(atFinish).run;
    expect(atFinish.putIndexes()).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("el progreso nunca retrocede", async () => {
    const gone = () => json(410, { error: "La subida se ha interrumpido. Vuelve a elegir el vídeo." });
    const server = fakeServer({ put: (_call, n) => (n === 3 ? gone() : n === 5 ? "network" : undefined) });
    const { run, progress } = setup(server, 22 * MB);
    await run;
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThan(progress[i - 1]);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it("un 400 del servidor se enseña tal cual y no se reintenta", async () => {
    const message = "Formato de vídeo no admitido. Usa MP4, MOV o WebM.";
    const server = fakeServer({ put: () => json(400, { error: message }) });
    const { run, sleeps } = setup(server);
    await expect(run).rejects.toThrow(message);
    await expect(run).rejects.toMatchObject({ status: 400 });
    expect(server.putIndexes()).toEqual([0]);
    expect(sleeps).toEqual([]);
  });

  it("si no se puede empezar (Higgsfield sin conectar), el 409 se enseña sin reintentar", async () => {
    const server = fakeServer({ start: () => json(409, { error: "Conecta primero tu Higgsfield en Ajustes." }) });
    const { run, sleeps } = setup(server);
    await expect(run).rejects.toThrow("Conecta primero tu Higgsfield en Ajustes.");
    expect(sleeps).toEqual([]);
    expect(server.putIndexes()).toEqual([]);
  });

  it("un corte al empezar o al terminar se reintenta con espera", async () => {
    const server = fakeServer({ start: (_c, n) => (n === 1 ? "network" : undefined), finish: (_c, n) => (n === 1 ? json(502, {}) : undefined) });
    const { run, sleeps } = setup(server);
    await run;
    expect(sleeps).toEqual([1000, 1000]);
    expect(server.putIndexes()).toEqual([0, 1, 2]);
  });

  it("al cancelar se para sin reintentar", async () => {
    const controller = new AbortController();
    const server = fakeServer();
    const aborting: typeof fetch = async (input, init) => {
      if (init?.method === "PUT") {
        controller.abort();
        throw new DOMException("Cancelada", "AbortError");
      }
      return server.fetch(input, init);
    };
    const sleeps: number[] = [];
    const run = uploadInChunks(videoFile(12 * MB), VIDEO_ID, {
      onProgress: () => {},
      fetch: aborting,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      signal: controller.signal,
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(sleeps).toEqual([]);
  });
});
