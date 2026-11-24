import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexArgs, codexCandidates, codexEnv, executeCodex, matchesCodexSchema } from "../agente-mac/codex.mjs";
import { runClaudeOnce } from "../agente-mac/claude.mjs";

let tmp: string;
beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), "principal-codex-test-")); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });
const job = { engine: "codex", model: "sonnet", effort: "medium", system: "Reglas del paso", content: [{ type: "text", text: "Persona" }, { type: "image", source: { type: "base64", data: "aG9sYQ==", media_type: "image/png" } }, { type: "image", source: { type: "base64", data: "b3RyYQ==", media_type: "image/jpeg" } }], jsonSchema: { type: "object", properties: { valor: { type: "string" } }, required: ["valor"] }, maxTokens: 2000, web: null };

async function setup(options: { mode?: string; claudeFail?: boolean; engine?: string; timeout?: number } = {}) {
  const script = path.join(tmp, "fake.cjs");
  const capture = path.join(tmp, "capture.jsonl");
  // CLI de mentira en un proceso real: comprueba stdin, archivos, señales y aislamiento del entorno.
  await fs.writeFile(script, `
const fs = require('node:fs');
const [role, ...args] = process.argv.slice(2);
if (args[0] === 'login') {
  process.stderr.write(process.env.FAKE_MODE === 'auth' ? 'Not logged in' : process.env.FAKE_MODE === 'apikey' ? 'Logged in using API key' : 'Logged in using ChatGPT');
  process.exit(process.env.FAKE_MODE === 'auth' ? 1 : 0);
}
let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.CAPTURE_FILE, JSON.stringify({role,args,input,env:process.env,cwd:process.cwd(),files:fs.readdirSync(process.cwd()), images:args.flatMap((v,i)=>v==='-i'?[fs.readFileSync(args[i+1], 'utf8')]:[])})+'\\n');
  if (role === 'codex' && process.env.FAKE_MODE === 'hang') { setInterval(()=>{}, 1000); return; }
  const finish = () => {
    if (role === 'claude') {
      process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:process.env.FAKE_CLAUDE_FAIL==='1',result:process.env.FAKE_CLAUDE_FAIL==='1'?'Falló Claude':'{"valor":"claude"}',structured_output:process.env.FAKE_CLAUDE_FAIL==='1'?null:{valor:'claude'}})+'\\n');
    } else {
      fs.writeFileSync(args[args.indexOf('-o')+1], process.env.FAKE_MODE==='invalid'?'no es JSON':'{"valor":"codex"}');
      process.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:12,output_tokens:5,cached_input_tokens:3}})+'\\n');
    }
  };
  setTimeout(finish, role==='codex' && process.env.FAKE_MODE==='slow'?400:0);
});
`);
  const calls: Array<{ route: string; body: Record<string, unknown>; at: number }> = [];
  const logs: string[] = [];
  const task = { kind: "claude_code", taskId: 12, uploadId: "reserva", url: "claude-code:video.desglose:1:desglose:abc", job: { ...job, engine: options.engine ?? "codex" } };
  const config = { url: "https://web.test", token: "pra_test", tmpDir: tmp };
  const deps = {
    fs, exists: () => true, log: (s: string) => logs.push(s),
    env: { ...process.env, PRINCIPAL_CODEX_BIN: "/fake/codex", OPENAI_API_KEY: "no", CODEX_API_KEY: "no", OPENAI_BASE_URL: "http://no", CAPTURE_FILE: capture, FAKE_MODE: options.mode ?? "ok", FAKE_CLAUDE_FAIL: options.claudeFail ? "1" : "0" },
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    claudeTimeoutMs: options.timeout ?? 3000,
    spawn: (bin: string, args: string[], opts: Parameters<typeof spawn>[2]) => spawn(process.execPath, [script, bin.includes("codex") ? "codex" : "claude", ...args], opts),
    fetch: async (url: string, init: RequestInit) => {
      const route = new URL(url).pathname;
      const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      calls.push({ route, body, at: Date.now() });
      return Response.json(route.endsWith("/reclamar") ? task : {});
    },
  };
  const captured = async () => (await fs.readFile(capture, "utf8")).trim().split("\n").map((s) => JSON.parse(s));
  return { config, deps, calls, task, logs, captured };
}
const claude = { bin: "/fake/claude", token: null, version: "test" };

describe("Codex con el plan de ChatGPT", () => {
  it("argumentos, imágenes, esquema, stdin y entorno sin claves de API", async () => {
    const s = await setup();
    const result = await executeCodex(s.config, s.deps, job, async () => "ok");
    expect(result).toMatchObject({ ok: true, answer: { structured: { valor: "codex" }, model: "codex:desconocido", usage: { inputTokens: 12, outputTokens: 5 }, apiEquivalentMicros: null } });
    const [run] = await s.captured();
    expect(run.args).toEqual(expect.arrayContaining(["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--output-schema"]));
    expect(run.args.filter((x: string) => x === "-i")).toHaveLength(2);
    expect(run.images).toEqual(["hola", "otra"]);
    expect(run.files).toEqual([]);
    expect(run.input).toContain(job.system);
    expect(run.input).toContain("Persona");
    expect(run.env.OPENAI_API_KEY).toBeUndefined();
    expect(run.env.CODEX_API_KEY).toBeUndefined();
    expect(run.env.OPENAI_BASE_URL).toBeUndefined();
    await expect(fs.stat(run.cwd)).rejects.toThrow();
  });
  it("rechaza JSON bien formado que no cumple la forma pedida", () => {
    expect(matchesCodexSchema({ valor: 123 }, job.jsonSchema)).toBe(false);
    expect(matchesCodexSchema({}, job.jsonSchema)).toBe(false);
    expect(matchesCodexSchema({ valor: "bien" }, job.jsonSchema)).toBe(true);
  });
  it("solo pide esquema si lo hay y búsqueda si el paso la pide", () => {
    const files = { cwd: "/tmp/vacio", output: "/tmp/out", schema: "/tmp/schema", images: [] };
    expect(codexArgs({ ...job, jsonSchema: null }, files)).not.toContain("--output-schema");
    expect(codexArgs(job, files)).toContain('web_search="disabled"');
    expect(codexArgs({ ...job, web: { searches: 1 } }, files)).toContain('web_search="live"');
    expect(codexCandidates({ PRINCIPAL_CODEX_BIN: "/x" } as unknown as NodeJS.ProcessEnv, "/h")[0]).toBe("/x");
    expect(codexEnv({ OPENAI_API_KEY: "a", CODEX_API_KEY: "b", CODEX_HOME: "/otro", PATH: "/bin" } as unknown as NodeJS.ProcessEnv)).toEqual({ PATH: "/bin" });
  });
  it.each(["invalid", "auth", "apikey"])("cae a Claude si Codex falla (%s)", async (mode) => {
    const s = await setup({ mode });
    expect(await runClaudeOnce(s.config, s.deps, claude)).toBe("done");
    expect(s.calls.find((c) => c.route.endsWith("/terminar"))?.body).toMatchObject({ ok: true, resultado: { structured: { valor: "claude" } } });
    expect(s.logs.join(" ")).toContain("respaldo de Codex");
  });
  it("si Codex ni arranca, prueba Claude en la misma tarea", async () => {
    const s = await setup();
    const realSpawn = s.deps.spawn;
    s.deps.spawn = (bin, args, options) => {
      if (bin.includes("codex")) throw new Error("No arranca");
      return realSpawn(bin, args, options);
    };
    expect(await runClaudeOnce(s.config, s.deps, claude)).toBe("done");
    expect(s.calls.filter((c) => c.route.endsWith("/reclamar"))).toHaveLength(1);
    expect(s.logs.join(" ")).toContain("respaldo de Codex");
  });
  it("si ambos fallan, falla la tarea para que la web pueda usar la API", async () => {
    const s = await setup({ mode: "invalid", claudeFail: true });
    expect(await runClaudeOnce(s.config, s.deps, claude)).toBe("failed");
    expect(s.calls.find((c) => c.route.endsWith("/terminar"))?.body).toMatchObject({ ok: false });
  });
  it("comparar entrega Claude sin esperar y guarda la comparación después", async () => {
    const s = await setup({ engine: "comparar", mode: "slow" });
    const pending = runClaudeOnce(s.config, s.deps, claude);
    for (let i = 0; i < 100 && !s.calls.some((c) => c.route.endsWith("/terminar")); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(s.calls.some((c) => c.route.endsWith("/terminar"))).toBe(true);
    expect(s.calls.some((c) => c.route.endsWith("/comparaciones"))).toBe(false);
    expect(await pending).toBe("done");
    const finish = s.calls.find((c) => c.route.endsWith("/terminar"))!;
    const comparison = s.calls.find((c) => c.route.endsWith("/comparaciones"))!;
    expect(comparison.at - finish.at).toBeGreaterThan(100);
    expect(comparison.body).toMatchObject({ taskId: 12, uploadId: "reserva", claudeText: '{"valor":"claude"}', codexText: '{"valor":"codex"}', codexError: null });
  });
  it("comparar devuelve Codex cuando Claude falla", async () => {
    const s = await setup({ engine: "comparar", claudeFail: true });
    expect(await runClaudeOnce(s.config, s.deps, claude)).toBe("done");
    expect(s.calls.find((c) => c.route.endsWith("/terminar"))?.body).toMatchObject({ ok: true, resultado: { structured: { valor: "codex" } } });
  });
  it("corta Codex al tope y usa Claude", async () => {
    const s = await setup({ mode: "hang", timeout: 300 });
    expect(await runClaudeOnce(s.config, s.deps, claude)).toBe("done");
    expect(s.logs.join(" ")).toContain("tope");
  });
  it("comparar guarda el error de Codex aunque Claude ya haya respondido", async () => {
    const s = await setup({ engine: "comparar", mode: "invalid" });
    expect(await runClaudeOnce(s.config, s.deps, claude)).toBe("done");
    expect(s.calls.find((c) => c.route.endsWith("/comparaciones"))?.body).toMatchObject({ codexText: "no es JSON", codexError: expect.stringContaining("JSON") });
  });
});
