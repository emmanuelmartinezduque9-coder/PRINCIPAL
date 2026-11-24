// Llamadas a Claude del dueño hechas con el Claude Code de este Mac (agente 1.8.0).
//
// La web deja en la cola del Mac las llamadas a Claude del dueño (desglose, prompts, elegir
// referencias, revisión con visión…). Este Mac las recoge (varias a la vez), las hace con
// `claude -p` y su plan de suscripción (nunca con la API: sin ANTHROPIC_API_KEY), sin herramientas
// (salvo buscar y leer en internet cuando la llamada lo pide), en una carpeta temporal y con un
// tope de tiempo, y devuelve el texto o el JSON.

import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { call, scrub } from "./lib.mjs";

/** Llamadas a la vez (cada una es un `claude` en marcha). */
export const CLAUDE_SLOTS = 4;
/** Lo más que dura una llamada; después se corta y la web sigue por la API. */
export const CLAUDE_TIMEOUT_MS = 10 * 60_000;
/** Cada cuánto se renueva la reserva mientras Claude piensa. */
export const CLAUDE_BEAT_MS = 60_000;
/** Cada cuánto se vuelve a mirar si Claude Code tiene sesión (y tras un fallo de sesión). */
export const CLAUDE_CHECK_MS = 5 * 60_000;
/** Ficha de la suscripción para programas sin pantalla (`claude setup-token`), solo legible por el dueño. */
export const CLAUDE_TOKEN_FILE = path.join(os.homedir(), ".principal-agente-claude.json");
/** Carpeta de configuración propia de las llamadas: ni los CLAUDE.md, ni la memoria, ni los plugins del dueño. */
export const CLAUDE_CONFIG_DIR = path.join(os.homedir(), ".principal-tools", "claude-config");
const MAX_OUT = 16 * 1024 * 1024;
const MAX_TEXT = 2 * 1024 * 1024;
const TMP_PREFIX = "principal-agente-claude-";
const KILL_WAIT_MS = 5_000;

/** Variables que podrían hacer que `claude` gaste la API o vaya por otro sitio: nunca pasan. */
const BLOCKED_ENV = /^(ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH_TOKEN$|CLAUDE_CONFIG_DIR$|CLAUDECODE$|CLAUDE_CODE_ENTRYPOINT$|CLAUDE_CODE_SESSION|CLAUDE_AGENT_SDK|AWS_BEARER_TOKEN_BEDROCK$)/;

/** Dónde puede estar `claude` (launchd no usa el PATH del terminal); el más nuevo primero. */
export function claudeCandidates(env = process.env, home = os.homedir(), list = (dir) => readdirSync(dir)) {
  const out = [];
  if (env.PRINCIPAL_CLAUDE_BIN) out.push(env.PRINCIPAL_CLAUDE_BIN);
  const byVersion = (a, b) => b.localeCompare(a, "en", { numeric: true });
  const tryList = (dir) => {
    try {
      return list(dir);
    } catch {
      return [];
    }
  };
  // La aplicación de escritorio: claude-code/<versión>/<id>/claude.app/Contents/MacOS/claude
  const desktop = path.join(home, "Library", "Application Support", "Claude", "claude-code");
  for (const version of tryList(desktop).sort(byVersion)) {
    for (const id of tryList(path.join(desktop, version))) out.push(path.join(desktop, version, id, "claude.app", "Contents", "MacOS", "claude"));
  }
  // El instalador nativo: ~/.local/share/claude/versions/<versión>
  const native = path.join(home, ".local", "share", "claude", "versions");
  for (const version of tryList(native).sort(byVersion)) out.push(path.join(native, version));
  out.push(path.join(home, ".claude", "local", "claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude", path.join(home, ".local", "bin", "claude"));
  return out;
}

/** El entorno de `claude`: el de este programa sin nada de la API, con la ficha de la suscripción si la hay. */
export function claudeEnv(env, token, job) {
  const out = {};
  for (const [key, value] of Object.entries(env)) if (!BLOCKED_ENV.test(key) && value !== undefined) out[key] = value;
  if (token) {
    out.CLAUDE_CODE_OAUTH_TOKEN = token;
    out.CLAUDE_CONFIG_DIR = CLAUDE_CONFIG_DIR;
    // Cachés y datos de Claude Code también ahí (en el Mac del dueño, ~/.principal-tools está en el
    // SSD): nada en otras carpetas del disco interno. Los temporales, en TMPDIR (el del agente).
    out.XDG_CONFIG_HOME = path.join(CLAUDE_CONFIG_DIR, "xdg", "config");
    out.XDG_CACHE_HOME = path.join(CLAUDE_CONFIG_DIR, "xdg", "cache");
    out.XDG_DATA_HOME = path.join(CLAUDE_CONFIG_DIR, "xdg", "data");
    out.XDG_STATE_HOME = path.join(CLAUDE_CONFIG_DIR, "xdg", "state");
  }
  if (job?.maxTokens) out.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(job.maxTokens);
  out.DISABLE_AUTOUPDATER = "1";
  out.DISABLE_TELEMETRY = "1";
  out.DISABLE_ERROR_REPORTING = "1";
  return out;
}

const TOKEN_PREFIX = "sk-ant-oat";
const TOKEN_SHAPE = /^sk-ant-oat[0-9]{0,3}-[A-Za-z0-9_-]{20,300}$/;

/**
 * La ficha de suscripción a partir de lo pegado: sin espacios ni saltos; si se pegó varias veces la
 * misma ficha seguida, una sola. `{ token }`, o `{ error }` (apto para enseñar) si no hay ninguna,
 * si hay fichas distintas o si no tiene la forma de una ficha.
 */
export function cleanClaudeToken(raw) {
  const text = String(raw ?? "").replace(/\s+/g, "");
  if (!text.includes(TOKEN_PREFIX)) return { error: "Eso no parece una ficha de Claude Code (empiezan por «sk-ant-oat»)." };
  if (!text.startsWith(TOKEN_PREFIX)) return { error: "Antes de la ficha hay algo más pegado: cópiala sola." };
  const pieces = [...new Set(text.split(TOKEN_PREFIX).filter(Boolean).map((rest) => TOKEN_PREFIX + rest))];
  if (pieces.length > 1) return { error: "Hay varias fichas distintas pegadas: pega solo la última que te dio Claude." };
  if (!TOKEN_SHAPE.test(pieces[0])) return { error: "La ficha está incompleta o le sobra algo: cópiala entera, de una vez." };
  return { token: pieces[0] };
}

/** La ficha de la suscripción guardada por `conectar-claude.sh`, o `null`. Cierra permisos si hace falta. */
export async function readClaudeToken(fs, file = CLAUDE_TOKEN_FILE) {
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  if (((await fs.stat(file)).mode & 0o077) !== 0) await fs.chmod(file, 0o600).catch(() => {});
  try {
    // También arregla una ficha guardada pegada varias veces (la misma, repetida).
    const cleaned = cleanClaudeToken(JSON.parse(text)?.token);
    return cleaned.token ?? null;
  } catch {
    return null;
  }
}

/** Los argumentos de `claude` para una llamada (`files`: dónde están el sistema y el esquema). */
export function claudeArgs(job, files) {
  const web = job.web && (job.web.searches > 0 || job.web.fetches > 0);
  const tools = web ? [job.web.searches > 0 ? "WebSearch" : null, job.web.fetches > 0 ? "WebFetch" : null].filter(Boolean).join(",") : "";
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    job.model,
    "--effort",
    job.effort,
    "--system-prompt-file",
    files.system,
    "--tools",
    tools,
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--no-session-persistence",
    "--permission-mode",
    "default",
  ];
  if (tools) args.push("--allowedTools", tools, "--max-turns", String(Math.min(40, 4 + (job.web.searches + job.web.fetches) * 2)));
  if (job.jsonSchema) args.push("--json-schema", JSON.stringify(job.jsonSchema));
  return args;
}

/** El mensaje de la persona tal como lo lee `claude` por la entrada (`stream-json`). */
export function claudeInput(job) {
  const content = typeof job.content === "string" ? [{ type: "text", text: job.content }] : job.content;
  return `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`;
}

const LIMIT = /usage limit|limit reached|rate.?limit|límite|session limit|weekly limit|out of (extra )?usage|5-hour limit/i;
const AUTH = /authenticat|log ?in|login|oauth|token.*(expired|invalid)|unauthori[sz]ed|setup-token/i;

/**
 * Lee lo que escribió `claude` (`stream-json`, una línea por evento). Devuelve
 * `{ ok: true, answer }` o `{ ok: false, error, limit, auth }`.
 */
export function parseClaudeOutput(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Una línea que no es JSON (un aviso): se ignora.
    }
  }
  const result = [...events].reverse().find((event) => event?.type === "result");
  const apiError = events.find((event) => event?.type === "assistant" && typeof event.error === "string")?.error ?? null;
  if (!result) return { ok: false, error: "Claude Code terminó sin respuesta.", limit: false, auth: false };
  const message = typeof result.result === "string" ? result.result : "";
  if (result.is_error || (result.subtype && result.subtype !== "success" && result.subtype !== "error_max_turns")) {
    const detail = `${apiError ?? ""} ${message} ${result.subtype ?? ""}`;
    const limit = apiError === "rate_limit" || result.api_error_status === 429 || LIMIT.test(detail);
    const auth = !limit && (apiError === "authentication_failed" || result.api_error_status === 401 || AUTH.test(detail));
    return { ok: false, error: (message || `Claude Code falló (${result.subtype ?? apiError ?? "sin detalle"})`).slice(0, 500), limit, auth };
  }

  // Direcciones que de verdad leyó o encontró (para comprobar fuentes citadas).
  const sources = new Set();
  const addUrls = (value) => {
    const textValue = typeof value === "string" ? value : JSON.stringify(value ?? "");
    for (const match of textValue.matchAll(/https?:\/\/[^\s"'<>)\]\\]+/g)) sources.add(match[0].replace(/[.,;]+$/, ""));
  };
  const toolNames = new Map();
  for (const event of events) {
    const content = event?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use") {
        toolNames.set(block.id, block.name);
        if (block.name === "WebFetch" && typeof block.input?.url === "string") sources.add(block.input.url);
      } else if (block?.type === "tool_result" && ["WebSearch", "WebFetch"].includes(toolNames.get(block.tool_use_id))) {
        addUrls(block.content);
      }
    }
  }
  const lastAssistant = [...events].reverse().find((event) => event?.type === "assistant" && Array.isArray(event.message?.content));
  const refusal = lastAssistant?.message?.stop_reason === "refusal";
  const usage = result.usage ?? {};
  const models = Object.keys(result.modelUsage ?? {});
  const cost = typeof result.total_cost_usd === "number" && Number.isFinite(result.total_cost_usd) ? Math.round(result.total_cost_usd * 1_000_000) : null;
  return {
    ok: true,
    answer: {
      text: message.slice(0, MAX_TEXT),
      structured: result.structured_output ?? null,
      model: models.find((name) => !/haiku/i.test(name)) ?? models[0] ?? "",
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
      apiEquivalentMicros: cost,
      webSources: [...sources].slice(0, 300),
      stopReason: refusal ? "refusal" : result.subtype === "error_max_turns" ? "max_turns" : "end",
    },
  };
}

/** Corta `claude` y lo que haya lanzado. */
function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Lanza `claude` con `args`, le da `input` por la entrada y espera, renovando la reserva cada minuto
 * con `beat()` (si devuelve `"lost"`, se corta). Devuelve `{ code, out, err }`, `{ lost: true }`,
 * `{ timedOut: true }` o `{ local: true, error }` (no se pudo ni lanzar).
 */
export async function runClaude(deps, bin, args, input, { env, cwd, beat, timeoutMs = CLAUDE_TIMEOUT_MS }) {
  let child;
  try {
    child = deps.spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], detached: true, env, cwd });
  } catch (error) {
    return { local: true, error: error instanceof Error ? error.message : String(error) };
  }
  let out = "";
  let err = "";
  child.stdout?.on("data", (chunk) => {
    if (out.length < MAX_OUT) out += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    err = (err + chunk).slice(-2000);
  });
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  child.stdin?.on("error", () => {});
  child.stdin?.end(input);
  const stop = async () => {
    (deps.kill ?? killGroup)(child);
    await Promise.race([exited, deps.sleep(KILL_WAIT_MS)]);
  };
  for (let waited = 0; ; ) {
    const done = await Promise.race([exited, deps.sleep(CLAUDE_BEAT_MS).then(() => null)]);
    if (done) {
      if (done.error) return { local: true, error: done.error instanceof Error ? done.error.message : String(done.error) };
      return { code: done.code, out, err };
    }
    waited += CLAUDE_BEAT_MS;
    if (waited >= timeoutMs) {
      await stop();
      return { timedOut: true };
    }
    if ((await beat()) === "lost") {
      await stop();
      return { lost: true };
    }
  }
}

/** Una carpeta de trabajo vacía para `claude` (sin nada del proyecto ni del dueño). */
export async function workDir(fs, tmpDir = os.tmpdir()) {
  return fs.mkdtemp(path.join(tmpDir, TMP_PREFIX));
}


// ───────────────────────── Con la web ─────────────────────────

/** Lanza un programa corto y devuelve `{ code, out }` (o `code: null` si no se pudo lanzar). */
function quick(deps, bin, args, env, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = deps.spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"], env });
    } catch {
      resolve({ code: null, out: "" });
      return;
    }
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, out });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      out = (out + chunk).slice(0, 4000);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ code: null, out });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

/**
 * Si este Mac puede hacer las llamadas: encuentra `claude` y mira que tenga sesión (`auth status`)
 * con la ficha de la suscripción, si la hay. Devuelve `{ bin, token, version }` o
 * `{ bin: null, reason }`. No gasta nada del plan.
 */
export async function checkClaude(deps, env = process.env, { verify = false } = {}) {
  const exists = deps.exists ?? existsSync;
  const token = await readClaudeToken(deps.fs);
  for (const bin of claudeCandidates(env, deps.home ?? os.homedir(), deps.listDir)) {
    if (!exists(bin)) continue;
    const version = await quick(deps, bin, ["--version"], claudeEnv(env, token));
    if (version.code !== 0) continue;
    if (token) await deps.fs.mkdir(CLAUDE_CONFIG_DIR, { recursive: true, mode: 0o700 }).catch(() => {});
    const status = await quick(deps, bin, ["auth", "status"], claudeEnv(env, token));
    let loggedIn = false;
    try {
      loggedIn = JSON.parse(status.out)?.loggedIn === true;
    } catch {
      loggedIn = false;
    }
    const v = version.out.trim().split(/\s/)[0].slice(0, 40) || "?";
    if (!loggedIn) return { bin: null, reason: `Claude Code ${v} no tiene sesión: lanza «bash agente-mac/conectar-claude.sh».` };
    // `auth status` no comprueba la ficha: al arrancar (o tras un fallo) se hace una llamada mínima de verdad.
    if (verify) {
      const probe = await verifyClaude(deps, bin, claudeEnv(env, token));
      if (!probe.ok) return { bin: null, reason: probe.auth ? `Claude Code rechaza la sesión (${probe.error}): lanza «bash agente-mac/conectar-claude.sh». Mientras, tus lotes van por la API.` : `Claude Code no responde (${probe.error}).`, auth: probe.auth };
    }
    return { bin, token, version: v };
  }
  return { bin: null, reason: "No se encuentra Claude Code en este Mac." };
}

/** La llamada más pequeña posible (Haiku, sin herramientas) para ver que la sesión vale de verdad. */
export async function verifyClaude(deps, bin, env) {
  const dir = await workDir(deps.fs);
  try {
    const system = path.join(dir, "sistema.txt");
    await deps.fs.writeFile(system, "Responde solo: ok", { mode: 0o600 });
    const job = { model: "haiku", effort: "low", jsonSchema: null, web: null, content: "ok" };
    const run = await runClaude(deps, bin, claudeArgs(job, { system }), claudeInput(job), { env, cwd: dir, timeoutMs: 2 * 60_000, beat: async () => "ok" });
    if (run.local) return { ok: false, auth: false, error: run.error };
    if (run.timedOut) return { ok: false, auth: false, error: "tardó más de 2 minutos" };
    const parsed = parseClaudeOutput(run.out ?? "");
    return parsed.ok ? { ok: true } : { ok: false, auth: parsed.auth, error: parsed.error.slice(0, 160) };
  } finally {
    await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Una vuelta de un hueco de llamadas: pide una llamada de Claude (`solo: "claude_code"`), la hace y
 * la entrega. Devuelve `"done"`, `"failed"`, `"idle"`, `"offline"`, `"unauthorized"` o `"auth"`
 * (Claude Code perdió la sesión: no se recoge nada más hasta volver a mirar).
 */
export async function runClaudeOnce(config, deps, claude) {
  const log = (text) => deps.log(scrub(config, text));
  let response;
  try {
    response = await call(config, deps, "POST", "/api/agente/tareas/reclamar", { json: { solo: "claude_code" } });
  } catch {
    return "offline";
  }
  if (response.status === 204) return "idle";
  if (response.status === 401) return "unauthorized";
  if (!response.ok) return "offline";
  const task = await response.json().catch(() => null);
  if (!task || task.kind !== "claude_code" || !Number.isSafeInteger(task.taskId) || typeof task.uploadId !== "string" || !task.job) {
    log("La web mandó una llamada de Claude que no se entiende.");
    return "offline";
  }
  const finish = (result) => call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/terminar`, { json: { ...result, uploadId: task.uploadId }, timeout: 120_000 });
  const fail = async (error, extra = {}) => {
    await finish({ ok: false, error: scrub(config, error).slice(0, 500), ...extra }).catch(() => {});
    return "failed";
  };
  const job = task.job;
  if (typeof job.model !== "string" || typeof job.effort !== "string" || typeof job.system !== "string") return fail("La llamada no trae modelo, esfuerzo o instrucciones.");

  const dir = await workDir(deps.fs, config.tmpDir);
  const started = Date.now();
  try {
    const system = path.join(dir, "sistema.txt");
    await deps.fs.writeFile(system, job.system, { mode: 0o600 });
    const run = await runClaude(deps, claude.bin, claudeArgs(job, { system }), claudeInput(job), {
      env: claudeEnv(deps.env ?? process.env, claude.token, job),
      cwd: dir,
      timeoutMs: deps.claudeTimeoutMs ?? CLAUDE_TIMEOUT_MS,
      beat: async () => {
        const beat = await call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`).catch(() => null);
        return beat?.status === 409 ? "lost" : "ok";
      },
    });
    if (run.lost) {
      log(`Claude: la web retiró la llamada ${task.url}.`);
      return "failed";
    }
    if (run.local) return fail(`No se pudo lanzar Claude Code: ${run.error}`);
    if (run.timedOut) return fail(`Claude Code tardó más de ${Math.round((deps.claudeTimeoutMs ?? CLAUDE_TIMEOUT_MS) / 60_000)} minutos y se cortó.`);
    const parsed = parseClaudeOutput(run.out);
    if (!parsed.ok) {
      log(`Claude: ${task.url} no salió (${parsed.limit ? "límite del plan" : parsed.auth ? "sin sesión" : "error"}): ${parsed.error}`);
      await fail(parsed.error, parsed.limit ? { limite: true } : {});
      return parsed.auth ? "auth" : "failed";
    }
    const done = await finish({ ok: true, resultado: parsed.answer }).catch(() => null);
    if (done?.status === 409) {
      log(`Claude: la web ya no esperaba ${task.url}.`);
      return "failed";
    }
    if (!done?.ok) {
      log(`Claude: la web no aceptó la respuesta de ${task.url} (${done?.status ?? "sin respuesta"}).`);
      return "failed";
    }
    log(`Claude: ${task.url} hecho en ${Math.round((Date.now() - started) / 1000)} s.`);
    return "done";
  } finally {
    await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
