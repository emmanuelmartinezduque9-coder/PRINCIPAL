import { EventEmitter } from "node:events";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLAUDE_BEAT_MS,
  CLAUDE_TIMEOUT_MS,
  claudeArgs,
  claudeCandidates,
  claudeEnv,
  claudeInput,
  checkClaude,
  cleanClaudeToken,
  parseClaudeOutput,
  readClaudeToken,
  runClaudeOnce,
} from "../agente-mac/claude.mjs";
import { PROBE_TIMEOUT_MS, VERSION } from "../agente-mac/lib.mjs";

/** Las llamadas a Claude del dueño en el Mac (1.8.0): `claude` y la web son de mentira; el disco, de verdad. */

const TOKEN = "pra_" + "k".repeat(43);
const WEB = "https://principal.test";
const JOB = {
  system: "<regla>…</regla>\n\nPropón un ángulo.",
  content: [
    { type: "text", text: "Producto: cepillo." },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
  ],
  jsonSchema: { type: "object", properties: { angulo: { type: "string" } }, required: ["angulo"] },
  model: "claude-sonnet-5-5",
  effort: "medium",
  maxTokens: 2000,
  web: null,
};

const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const okOutput =
  line({ type: "system", subtype: "init" }) +
  line({ type: "assistant", message: { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" } }) +
  line({
    type: "result",
    subtype: "success",
    is_error: false,
    result: '{"angulo":"Ahorra tiempo"}',
    structured_output: { angulo: "Ahorra tiempo" },
    total_cost_usd: 0.0032,
    usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 10, cache_creation_input_tokens: 0 },
    modelUsage: { "claude-sonnet-5-5": {} },
  });

let tmp: string;
beforeEach(() => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "prueba-agente-claude-"));
});
afterEach(() => {
  fsSync.rmSync(tmp, { recursive: true, force: true });
});

describe("cómo se lanza claude", () => {
  it("sin herramientas, con el sistema en un archivo, el esquema, el modelo y el esfuerzo", () => {
    const args = claudeArgs(JOB, { system: "/tmp/x/sistema.txt" });
    expect(args).toEqual(expect.arrayContaining(["-p", "--no-session-persistence", "--strict-mcp-config"]));
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
    expect(args[args.indexOf("--effort") + 1]).toBe("medium");
    expect(args[args.indexOf("--system-prompt-file") + 1]).toBe("/tmp/x/sistema.txt");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1])).toEqual(JOB.jsonSchema);
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("con búsqueda: solo WebSearch y WebFetch, permitidas, con tope de vueltas", () => {
    const args = claudeArgs({ ...JOB, jsonSchema: null, web: { searches: 3, fetches: 2 } }, { system: "s" });
    expect(args[args.indexOf("--tools") + 1]).toBe("WebSearch,WebFetch");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("WebSearch,WebFetch");
    expect(Number(args[args.indexOf("--max-turns") + 1])).toBeGreaterThan(3);
    expect(args).not.toContain("--json-schema");
  });

  it("el mensaje (con la foto) va por la entrada en stream-json", () => {
    expect(JSON.parse(claudeInput(JOB))).toEqual({ type: "user", message: { role: "user", content: JOB.content } });
    expect(JSON.parse(claudeInput({ ...JOB, content: "hola" })).message.content).toEqual([{ type: "text", text: "hola" }]);
  });

  it("nunca pasa la clave de la API ni nada que desvíe a otra cuenta; sí la ficha de la suscripción", () => {
    const env = claudeEnv(
      { PATH: "/bin", HOME: "/Users/x", ANTHROPIC_API_KEY: "sk-ant-api", ANTHROPIC_BASE_URL: "http://proxy", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDECODE: "1" } as unknown as NodeJS.ProcessEnv,
      "sk-ant-oat01-suscripcion",
      JOB,
    ) as unknown as Record<string, string | undefined>;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-suscripcion");
    expect(env.CLAUDE_CONFIG_DIR).toContain(".principal-tools");
    // Cachés y datos de Claude Code dentro de ~/.principal-tools (en el SSD), no en otras carpetas del disco interno.
    for (const key of ["XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]) expect(env[key]?.startsWith(env.CLAUDE_CONFIG_DIR!)).toBe(true);
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe("2000");
    expect(env.PATH).toBe("/bin");
    expect((claudeEnv({ PATH: "/bin" } as unknown as NodeJS.ProcessEnv, null, JOB) as unknown as Record<string, string | undefined>).CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it("busca claude también donde lo deja la aplicación de escritorio (el más nuevo primero)", () => {
    const tree: Record<string, string[]> = {
      "/h/Library/Application Support/Claude/claude-code": ["2.1.99", "2.1.330"],
      "/h/Library/Application Support/Claude/claude-code/2.1.330": ["abc"],
      "/h/Library/Application Support/Claude/claude-code/2.1.99": ["def"],
      "/h/.local/share/claude/versions": ["2.1.251"],
    };
    const list = (dir: string) => {
      if (!tree[dir]) throw new Error("no");
      return tree[dir];
    };
    const found = claudeCandidates({} as NodeJS.ProcessEnv, "/h", list);
    expect(found[0]).toBe("/h/Library/Application Support/Claude/claude-code/2.1.330/abc/claude.app/Contents/MacOS/claude");
    expect(found[1]).toContain("2.1.99");
    expect(found[2]).toBe("/h/.local/share/claude/versions/2.1.251");
    expect(claudeCandidates({ PRINCIPAL_CLAUDE_BIN: "/x/claude" } as unknown as NodeJS.ProcessEnv, "/h", list)[0]).toBe("/x/claude");
  });

  it("la ficha pegada: la misma varias veces → una; distintas o rotas → se rechaza", () => {
    const one = "sk-ant-oat01-" + "A".repeat(95);
    const other = "sk-ant-oat01-" + "B".repeat(95);
    expect(cleanClaudeToken(` ${one}\n`)).toEqual({ token: one });
    // Lo que pasó el 24/11/2026: cinco veces la misma ficha seguida (647 caracteres).
    expect(cleanClaudeToken(one.repeat(5))).toEqual({ token: one });
    expect(cleanClaudeToken(`${one}\n${one}`)).toEqual({ token: one });
    expect(cleanClaudeToken(one + other).error).toMatch(/varias fichas distintas/);
    expect(cleanClaudeToken("hola").error).toMatch(/no parece/);
    expect(cleanClaudeToken("x" + one).error).toMatch(/Antes de la ficha/);
    expect(cleanClaudeToken("sk-ant-oat01-corta").error).toMatch(/incompleta/);
  });

  it("una ficha guardada repetida se lee bien (una sola)", async () => {
    const file = path.join(tmp, "claude.json");
    const one = "sk-ant-oat01-" + "C".repeat(95);
    fsSync.writeFileSync(file, JSON.stringify({ token: one.repeat(5) }), { mode: 0o600 });
    expect(await readClaudeToken(fs, file)).toBe(one);
  });

  it("sin la carpeta temporal (disco de datos del SSD desmontado) no se da por listo y dice por qué", async () => {
    const fakeFs = { ...fs, readFile: async () => { throw new Error("no"); }, mkdir: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); } };
    const okSpawn = () => {
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; kill: () => void };
      child.stdout = new PassThrough();
      child.kill = () => {};
      setTimeout(() => {
        child.stdout.end('{"loggedIn": true}');
        child.emit("close", 0);
      }, 0);
      return child;
    };
    const r = await checkClaude({ fs: fakeFs, spawn: okSpawn, exists: () => true, home: "/h", listDir: () => [] }, { PRINCIPAL_CLAUDE_BIN: "/x/claude" } as unknown as NodeJS.ProcessEnv);
    expect(r.bin).toBeNull();
    expect(r.reason).toMatch(/SSD está desmontado/);
  });

  it("yt-dlp tiene un minuto para arrancar al comprobarlo (el «onefile» tarda ~10 s en frío)", () => {
    expect(PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("la ficha de la suscripción se lee del archivo y se cierran sus permisos", async () => {
    const file = path.join(tmp, "claude.json");
    expect(await readClaudeToken(fs, file)).toBeNull();
    fsSync.writeFileSync(file, JSON.stringify({ token: "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz" }), { mode: 0o644 });
    expect(await readClaudeToken(fs, file)).toBe("sk-ant-oat01-abcdefghijklmnopqrstuvwxyz");
    fsSync.writeFileSync(file, JSON.stringify({ token: "basura" }));
    expect(await readClaudeToken(fs, file)).toBeNull();
    expect(fsSync.statSync(file).mode & 0o077).toBe(0);
  });
});

describe("lo que contesta claude", () => {
  it("bien: el texto, el JSON, los tokens y lo que habría costado en la API", () => {
    expect(parseClaudeOutput(okOutput)).toEqual({
      ok: true,
      answer: {
        text: '{"angulo":"Ahorra tiempo"}',
        structured: { angulo: "Ahorra tiempo" },
        model: "claude-sonnet-5-5",
        usage: { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 10, cacheWriteTokens: 0 },
        apiEquivalentMicros: 3200,
        webSources: [],
        stopReason: "end",
      },
    });
  });

  it("con búsqueda: las direcciones que de verdad leyó o encontró", () => {
    const out =
      line({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "WebSearch", input: { query: "x" } }, { type: "tool_use", id: "t2", name: "WebFetch", input: { url: "https://tienda.de/p" } }] } }) +
      line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: 'Links: [{"title":"A","url":"https://a.de/1"}]' }] }] } }) +
      line({ type: "result", subtype: "success", is_error: false, result: "hecho", usage: {}, modelUsage: {} });
    const parsed = parseClaudeOutput(out);
    expect(parsed.ok && (parsed as { answer: { webSources: string[] } }).answer.webSources.sort()).toEqual(["https://a.de/1", "https://tienda.de/p"]);
  });

  it("límite del plan, sin sesión y otros fallos se distinguen", () => {
    const fail = (result: string, extra: object = {}, error?: string) =>
      parseClaudeOutput(
        (error ? line({ type: "assistant", error, message: { content: [{ type: "text", text: result }] } }) : "") +
          line({ type: "result", subtype: "success", is_error: true, result, ...extra }),
      );
    expect(fail("Claude AI usage limit reached|1764000000")).toMatchObject({ ok: false, limit: true, auth: false });
    expect(fail("You've hit your limit · resets 5pm", {}, "rate_limit")).toMatchObject({ ok: false, limit: true });
    expect(fail("Failed to authenticate. API Error: 401 Invalid bearer token", {}, "authentication_failed")).toMatchObject({ ok: false, limit: false, auth: true });
    expect(fail("API Error: 500 Internal server error")).toMatchObject({ ok: false, limit: false, auth: false });
    expect(parseClaudeOutput("no es json")).toMatchObject({ ok: false });
  });

  it("se pasó de vueltas: la respuesta llega marcada como cortada", () => {
    const parsed = parseClaudeOutput(line({ type: "result", subtype: "error_max_turns", is_error: false, result: "a medias", usage: {}, modelUsage: {} }));
    expect(parsed).toMatchObject({ ok: true, answer: { stopReason: "max_turns", text: "a medias" } });
  });
});

describe("una vuelta de un hueco de llamadas", () => {
  interface Call {
    path: string;
    body: Record<string, unknown> | null;
  }

  function setup(options: { output?: string; exitCode?: number; claim?: Response; never?: boolean; finishStatus?: number; beatStatus?: number } = {}) {
    const calls: Call[] = [];
    const logs: string[] = [];
    const spawned: Array<{ bin: string; args: string[]; env: Record<string, string>; cwd: string; stdin: string; system: string | null }> = [];
    const task = { taskId: 9, kind: "claude_code", url: "claude-code:angulos:proponer", uploadId: "u".repeat(32), chunkBytes: 0, maxBytes: 0, job: JOB };
    const deps = {
      env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-api-no" },
      log: (text: string) => logs.push(text),
      sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms === CLAUDE_BEAT_MS ? 5 : 0)),
      fs,
      claudeTimeoutMs: options.never ? 3 * CLAUDE_BEAT_MS : CLAUDE_TIMEOUT_MS,
      kill: (child: EventEmitter) => setTimeout(() => child.emit("close", null), 0),
      fetch: async (url: string, init: RequestInit) => {
        const route = new URL(url).pathname;
        calls.push({ path: route, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
        if (route.endsWith("/reclamar")) return options.claim ?? new Response(JSON.stringify(task), { status: 200 });
        if (route.endsWith("/latido")) return new Response("{}", { status: options.beatStatus ?? 200 });
        return new Response("{}", { status: options.finishStatus ?? 200 });
      },
      spawn: (bin: string, args: string[], opts: { env: Record<string, string>; cwd: string }) => {
        const child = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; pid: number };
        child.stdin = new PassThrough();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.pid = 4242;
        let stdin = "";
        child.stdin.on("data", (chunk) => (stdin += chunk));
        child.stdin.on("finish", () => {
          const systemFile = args[args.indexOf("--system-prompt-file") + 1];
          spawned.push({ bin, args, env: opts.env, cwd: opts.cwd, stdin, system: fsSync.existsSync(systemFile) ? fsSync.readFileSync(systemFile, "utf8") : null });
          if (options.never) return;
          setTimeout(() => {
            child.stdout.end(options.output ?? okOutput);
            child.emit("close", options.exitCode ?? 0);
          }, 0);
        });
        return child;
      },
    };
    const config = { url: WEB, token: TOKEN, tmpDir: tmp };
    return { calls, logs, spawned, deps, config, task };
  }

  const claude = { bin: "/bin/claude", token: "sk-ant-oat01-suscripcion", version: "2.1.330" };

  it("pide solo llamadas de Claude, la hace con la suscripción y entrega la respuesta", async () => {
    const { calls, spawned, deps, config, task } = setup();
    expect(await runClaudeOnce(config, deps, claude)).toBe("done");
    expect(calls[0]).toEqual({ path: "/api/agente/tareas/reclamar", body: { solo: "claude_code" } });
    expect(spawned).toHaveLength(1);
    expect(spawned[0].env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(spawned[0].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(claude.token);
    expect(spawned[0].system).toBe(JOB.system);
    expect(JSON.parse(spawned[0].stdin).message.content).toEqual(JOB.content);
    expect(spawned[0].cwd.startsWith(tmp)).toBe(true);
    // La carpeta de trabajo se borra al terminar.
    expect(fsSync.existsSync(spawned[0].cwd)).toBe(false);
    const finish = calls.find((call) => call.path.endsWith("/terminar"))!;
    expect(finish.path).toBe(`/api/agente/tareas/${task.taskId}/terminar`);
    expect(finish.body).toMatchObject({ ok: true, uploadId: task.uploadId, resultado: { structured: { angulo: "Ahorra tiempo" }, apiEquivalentMicros: 3200 } });
  });

  it("sin llamadas en cola: idle, sin lanzar nada", async () => {
    const { spawned, deps, config } = setup({ claim: new Response(null, { status: 204 }) });
    expect(await runClaudeOnce(config, deps, claude)).toBe("idle");
    expect(spawned).toHaveLength(0);
  });

  it("límite del plan: se le dice a la web con `limite`", async () => {
    const out = line({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached" });
    const { calls, deps, config } = setup({ output: out, exitCode: 1 });
    expect(await runClaudeOnce(config, deps, claude)).toBe("failed");
    expect(calls.at(-1)!.body).toMatchObject({ ok: false, limite: true });
  });

  it("sin sesión: falla la llamada (la web sigue por la API) y el hueco deja de recoger", async () => {
    const out = line({ type: "assistant", error: "authentication_failed", message: { content: [] } }) + line({ type: "result", subtype: "success", is_error: true, result: "Failed to authenticate" });
    const { calls, deps, config } = setup({ output: out, exitCode: 1 });
    expect(await runClaudeOnce(config, deps, claude)).toBe("auth");
    expect(calls.at(-1)!.body).toMatchObject({ ok: false });
    expect(calls.at(-1)!.body!.limite).toBeUndefined();
  });

  it("si la web retira la llamada mientras piensa, se corta claude", async () => {
    const { calls, deps, config } = setup({ never: true, beatStatus: 409 });
    expect(await runClaudeOnce(config, deps, claude)).toBe("failed");
    expect(calls.some((call) => call.path.endsWith("/latido"))).toBe(true);
    expect(calls.some((call) => call.path.endsWith("/terminar"))).toBe(false);
  });

  it("si tarda más del tope, se corta y se dice", async () => {
    const { calls, deps, config } = setup({ never: true });
    expect(await runClaudeOnce(config, deps, claude)).toBe("failed");
    expect(calls.at(-1)!.body).toMatchObject({ ok: false, error: expect.stringContaining("tardó") });
  });
});

it("la versión del agente es la 1.8.0 o posterior", () => {
  const [major, minor] = VERSION.split(".").map(Number);
  expect(major > 1 || minor >= 8).toBe(true);
});
