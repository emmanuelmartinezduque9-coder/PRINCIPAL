// Codex usa la sesión de ChatGPT del dueño: ni claves de API ni configuración/MCP del usuario.
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runClaude, workDir, CLAUDE_TIMEOUT_MS } from "./claude.mjs";

export function codexCandidates(env = process.env, home = os.homedir()) {
  return [env.PRINCIPAL_CODEX_BIN, path.join(home, ".local/npm-global/bin/codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex"].filter(Boolean);
}
export function codexEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && !/^(OPENAI_|CODEX_|AZURE_OPENAI_|ANTHROPIC_)/.test(key)));
}
export function codexArgs(job, files) {
  const args = ["exec", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", files.cwd,
    "-c", 'model_provider="openai"', "-c", 'forced_login_method="chatgpt"',
    "-c", "features.shell_tool=false", "-c", "features.apps=false", "-c", "features.browser_use=false", "-c", "features.computer_use=false",
    "-c", `web_search="${job.web ? "live" : "disabled"}"`, "--json", "-o", files.output];
  // Sin los plugins y herramientas del perfil del dueño: esta llamada solo redacta/ve fotos. Nunca
  // `features.code_mode_host=false`: apaga también la búsqueda web (probado con codex-cli 0.172.0).
  for (const feature of ["view_image", "plugins", "remote_plugin", "multi_agent", "multi_agent_v2", "image_generation", "code_mode", "in_app_browser", "sleep_tool", "skill_search"]) args.push("-c", `features.${feature}=false`);
  args.push("-c", "features.skip_host_skill_discovery=true");
  for (const image of files.images) args.push("-i", image);
  if (job.jsonSchema) args.push("--output-schema", files.schema);
  args.push("-");
  return args;
}
export function codexInput(job) {
  const blocks = typeof job.content === "string" ? [{ type: "text", text: job.content }] : job.content;
  return `Instrucciones del sistema:\n${job.system}\n\nNo uses herramientas salvo la búsqueda web si está habilitada. Responde a la persona; no realices acciones.\n\nMensaje de la persona:\n${blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n")}\n`;
}
/** Comprobación local del contrato JSON; Zod en la web conserva la última palabra. */
export function matchesCodexSchema(value, schema, root = schema) {
  if (schema === true) return true;
  if (!schema || schema === false || typeof schema !== "object") return false;
  if (schema.$ref) {
    if (!schema.$ref.startsWith("#/")) return false;
    const target = schema.$ref.slice(2).split("/").reduce((obj, part) => obj?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], root);
    return target ? matchesCodexSchema(value, target, root) : false;
  }
  const equal = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
  };
  if (schema.enum && !schema.enum.some((entry) => equal(entry, value))) return false;
  if (Object.hasOwn(schema, "const") && !equal(schema.const, value)) return false;
  const test = (part) => matchesCodexSchema(value, part, root);
  if (schema.anyOf && !schema.anyOf.some(test)) return false;
  if (schema.oneOf && schema.oneOf.filter(test).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every(test)) return false;
  if (schema.not && test(schema.not)) return false;
  if (schema.if && !test(test(schema.if) ? schema.then ?? true : schema.else ?? true)) return false;
  const isType = (type) => type === "null" ? value === null : type === "array" ? Array.isArray(value) : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value) : type === "integer" ? Number.isInteger(value) : typeof value === type;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(isType)) return false;
  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength || schema.maxLength !== undefined && length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) return false;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) return false;
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum || schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) return false;
    if (schema.multipleOf && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-8) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems || schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && value.some((item, index) => value.slice(0, index).some((other) => equal(item, other)))) return false;
    if (!value.every((item, index) => matchesCodexSchema(item, schema.prefixItems?.[index] ?? schema.items ?? true, root))) return false;
  } else if (value !== null && typeof value === "object") {
    if (schema.required?.some((key) => !Object.hasOwn(value, key))) return false;
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties || schema.maxProperties !== undefined && keys.length > schema.maxProperties) return false;
    for (const key of keys) {
      const property = schema.properties?.[key];
      if (property !== undefined) { if (!matchesCodexSchema(value[key], property, root)) return false; }
      else if (schema.additionalProperties !== undefined && !matchesCodexSchema(value[key], schema.additionalProperties, root)) return false;
    }
  }
  return true;
}

export function parseCodexOutput(text, events, job) {
  let structured = null;
  if (job.jsonSchema) {
    try {
      structured = JSON.parse(text);
      if (!matchesCodexSchema(structured, job.jsonSchema)) return { ok: false, text, error: "El JSON de Codex no pasa el esquema de la llamada." };
    }
    catch { return { ok: false, text, error: "Codex no devolvió JSON válido." }; }
  }
  if (!text.trim()) return { ok: false, text, error: "Codex terminó sin respuesta." };
  let usage = {};
  let model = "desconocido";
  for (const line of events.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.usage) usage = event.usage;
      if (typeof event.model === "string") model = event.model;
    } catch { /* Los avisos de la CLI no son eventos. */ }
  }
  return { ok: true, answer: { text, structured, model: `codex:${model}`, usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, cacheReadTokens: usage.cached_input_tokens ?? 0, cacheWriteTokens: 0 }, apiEquivalentMicros: null, webSources: [], stopReason: "end" } };
}

/** Se rechaza también una sesión guardada con API key aunque no haya claves en el entorno. */
export async function checkCodex(deps, env = process.env, { beat = async () => "ok", timeoutMs = 60_000 } = {}) {
  const clean = codexEnv(env);
  for (const bin of codexCandidates(env, deps.home ?? os.homedir())) {
    if (!(deps.exists ?? existsSync)(bin)) continue;
    const status = await runClaude(deps, bin, ["login", "status"], "", { env: clean, beat, timeoutMs });
    if (status.code === 0 && /ChatGPT/i.test(`${status.out}\n${status.err}`) && !/API key/i.test(`${status.out}\n${status.err}`)) return { bin };
    return { bin: null, reason: "Codex no tiene sesión de ChatGPT: ejecuta codex login en el Mac." };
  }
  return { bin: null, reason: "No se encuentra Codex en este Mac." };
}

export async function executeCodex(config, deps, job, beat) {
  let dir;
  const started = Date.now();
  const timeout = deps.claudeTimeoutMs ?? CLAUDE_TIMEOUT_MS;
  try {
    const ready = await checkCodex(deps, deps.env ?? process.env, { beat, timeoutMs: Math.min(60_000, timeout) });
    if (!ready.bin) return { ok: false, error: ready.reason };
    dir = await workDir(deps.fs, config.tmpDir);
    const cwd = path.join(dir, "vacio");
    await deps.fs.mkdir(cwd);
    const files = { cwd, output: path.join(dir, "respuesta.txt"), schema: path.join(dir, "esquema.json"), images: [] };
    if (job.jsonSchema) await deps.fs.writeFile(files.schema, JSON.stringify(job.jsonSchema), { mode: 0o600 });
    for (const block of Array.isArray(job.content) ? job.content : []) {
      if (block.type !== "image") continue;
      if (block.source?.type !== "base64") throw new Error("Codex necesita la foto en base64.");
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[block.source.media_type];
      if (!ext) throw new Error("Formato de foto no admitido por Codex.");
      const image = path.join(dir, `foto-${files.images.length}.${ext}`);
      await deps.fs.writeFile(image, Buffer.from(block.source.data, "base64"), { mode: 0o600 });
      files.images.push(image);
    }
    const run = await runClaude(deps, ready.bin, codexArgs(job, files), codexInput(job), { env: codexEnv(deps.env ?? process.env), cwd, beat, timeoutMs: Math.max(1, timeout - (Date.now() - started)) });
    if (run.lost) return { ok: false, lost: true, error: "La web retiró la llamada." };
    if (run.timedOut) return { ok: false, error: "Codex tardó más del tope y se cortó." };
    if (run.local || run.code !== 0) return { ok: false, error: `Codex no pudo responder: ${run.error ?? run.err ?? "error"}` };
    const text = await deps.fs.readFile(files.output, "utf8");
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error("Respuesta de Codex demasiado grande.");
    return parseCodexOutput(text, run.out, job);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (dir) await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
