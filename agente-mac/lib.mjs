// Agente del Mac de PRINCIPAL: la parte que se puede probar sin red ni yt-dlp.
// Sin dependencias: solo Node 22 o más. Todo lo que toca el mundo (red, procesos, disco, reloj)
// llega en `deps`, así las pruebas lo sustituyen.

import os from "node:os";
import path from "node:path";

export const VERSION = "1.0.0";

/** Sitios de los que se descarga, con sus subdominios. La misma lista que el servidor. */
export const LINK_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"];

/** Cada cuánto dice el programa «sigo vivo». */
export const HEARTBEAT_MS = 30_000;
/** Cada cuánto pregunta si hay algo que descargar, cuando no hay nada. */
export const POLL_MS = 5_000;
/** Cada cuánto renueva la reserva de la tarea mientras yt-dlp descarga. */
export const LEASE_BEAT_MS = 60_000;
/** Lo más que se deja trabajar a yt-dlp con un enlace antes de cortarlo. */
export const YT_DLP_TIMEOUT_MS = 4 * 60_000;

const REQUEST_TIMEOUT_MS = 30_000;
const CHUNK_TIMEOUT_MS = 5 * 60_000;
const CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_MS = 5_000;
const KILL_WAIT_MS = 5_000;
const TOKEN = /^pra_[A-Za-z0-9_-]{43}$/;
const TMP_PREFIX = "principal-agente-";

/** Si el enlace es de uno de los sitios admitidos: solo `https`, sin usuario ni puerto. */
export function allowedUrl(url) {
  if (typeof url !== "string" || url.length > 2000) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  return LINK_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Argumentos de yt-dlp para descargar `url` en `outPath`. Siempre como lista (nunca por una
 * consola) y con `--` delante del enlace: nada de lo que venga en el enlace se lee como opción.
 * Usa la sesión de Brave de este Mac.
 */
export function ytDlpArgs(url, outPath) {
  return [
    "--cookies-from-browser", "brave", "--no-playlist", "--max-filesize", "100M",
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
    "-o", outPath, "--", url,
  ];
}

/** Los trozos de un archivo de `size` bytes: `[{ index, start, end }]`, con `end` sin incluir. */
export function chunkRanges(size, chunkBytes) {
  const ranges = [];
  for (let start = 0, index = 0; start < size; start += chunkBytes, index++) {
    ranges.push({ index, start, end: Math.min(start + chunkBytes, size) });
  }
  return ranges;
}

/**
 * Comprueba la configuración (`{ url, token }`) y la devuelve limpia. La ficha solo viaja por
 * HTTPS (o a este mismo ordenador, para pruebas). Los mensajes de error nunca incluyen la ficha.
 */
export function checkConfig(raw) {
  const url = typeof raw?.url === "string" ? raw.url.trim().replace(/\/+$/, "") : "";
  const token = typeof raw?.token === "string" ? raw.token.trim() : "";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Falta la dirección de la web (\"url\").");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) throw new Error("La dirección de la web tiene que empezar por https://");
  if (!TOKEN.test(token)) throw new Error("La ficha (\"token\") no tiene la forma de una ficha de PRINCIPAL. Crea una en Ajustes → Mac.");
  return { url: parsed.origin, token };
}

/**
 * La configuración: las variables `PRINCIPAL_URL` y `PRINCIPAL_AGENTE_TOKEN` si están las dos, o
 * el archivo `~/.principal-agente.json`. `null` si el archivo no existe todavía.
 */
export async function readConfig(env, fs, home = os.homedir()) {
  if (env.PRINCIPAL_URL && env.PRINCIPAL_AGENTE_TOKEN) return checkConfig({ url: env.PRINCIPAL_URL, token: env.PRINCIPAL_AGENTE_TOKEN });
  let text;
  try {
    text = await fs.readFile(path.join(home, ".principal-agente.json"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("No se pudo leer ~/.principal-agente.json.");
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("~/.principal-agente.json no es un JSON válido.");
  }
  return checkConfig(raw);
}

/** Quita la ficha de cualquier texto antes de escribirlo o enviarlo. */
function scrub(config, text) {
  return String(text).split(config.token).join("***");
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/** Una petición a la web con la ficha. Todas las conexiones salen de este Mac. */
function call(config, deps, method, route, { json, body, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const headers = { Authorization: `Bearer ${config.token}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  return deps.fetch(`${config.url}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(timeout),
  });
}

/** Latido del programa: está vivo, y con qué versiones. Devuelve la respuesta de la web. */
export function heartbeat(config, deps, info) {
  return call(config, deps, "POST", "/api/agente/latido", { json: { version: VERSION, ytDlp: info?.ytDlp ?? null } });
}

/** Borra las carpetas temporales que dejó una ejecución anterior que se cortó a medias. */
export async function cleanLeftovers(fs, tmpDir = os.tmpdir()) {
  const names = await fs.readdir(tmpDir).catch(() => []);
  for (const name of names) {
    if (name.startsWith(TMP_PREFIX)) await fs.rm(path.join(tmpDir, name), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Lanza yt-dlp y espera a que termine, renovando la reserva cada minuto. A los 4 minutos lo
 * corta. Devuelve `{ ok: true }`, `{ ok: false, error }` o `{ lost: true }` (la web retiró la tarea).
 */
async function download(config, deps, task, file) {
  const child = deps.spawn(config.ytDlp ?? "yt-dlp", ytDlpArgs(new URL(task.url).href, file), { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-2000);
  });
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  const stop = async () => {
    child.kill("SIGKILL");
    await Promise.race([exited, deps.sleep(KILL_WAIT_MS)]);
  };

  for (let waited = 0; ; ) {
    const result = await Promise.race([exited, deps.sleep(LEASE_BEAT_MS).then(() => null)]);
    if (result) {
      if (result.error) return { ok: false, error: `No se pudo lanzar yt-dlp: ${messageOf(result.error)}` };
      if (result.code === 0) return { ok: true };
      const detail = stderr.trim().split("\n").pop()?.trim();
      return { ok: false, error: detail ? `yt-dlp no pudo descargar el enlace: ${detail}` : "yt-dlp no pudo descargar el enlace" };
    }
    waited += LEASE_BEAT_MS;
    if (waited >= YT_DLP_TIMEOUT_MS) {
      await stop();
      return { ok: false, error: "yt-dlp tardó más de 4 minutos y se cortó" };
    }
    const beat = await call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`).catch(() => null);
    if (beat?.status === 409) {
      await stop();
      return { lost: true };
    }
  }
}

async function sizeOf(fs, file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

async function readRange(fs, file, range) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(range.end - range.start);
    await handle.read(buffer, 0, buffer.length, range.start);
    return buffer;
  } finally {
    await handle.close();
  }
}

/** Sube el archivo por trozos. Devuelve `"ok"`, `"lost"` (la tarea ya no es de este Mac) o `{ error }`. */
async function upload(config, deps, task, file, size) {
  for (const range of chunkRanges(size, task.chunkBytes)) {
    const bytes = await readRange(deps.fs, file, range);
    const route = `/api/agente/tareas/${task.taskId}/trozo?indice=${range.index}&subida=${encodeURIComponent(task.uploadId)}`;
    for (let attempt = 1; ; attempt++) {
      const response = await call(config, deps, "PUT", route, { body: bytes, timeout: CHUNK_TIMEOUT_MS }).catch(() => null);
      if (response?.ok) break;
      if (response?.status === 409) return "lost";
      // Un rechazo de la web (formato, tamaño…) no mejora repitiendo.
      if (response && response.status >= 400 && response.status < 500) return { error: `La web rechazó el archivo (${response.status})` };
      if (attempt >= CHUNK_ATTEMPTS) return { error: "No se pudo subir el archivo a la web" };
      await deps.sleep(CHUNK_RETRY_MS);
    }
  }
  return "ok";
}

/**
 * Una vuelta: pregunta si hay un enlace que traer y, si lo hay, lo descarga con yt-dlp, lo sube
 * por trozos y lo da por terminado. El archivo va a una carpeta temporal propia que se borra
 * siempre al acabar.
 *
 * `config`: `{ url, token }` (ya comprobados). `deps`: `{ fetch, spawn, fs, sleep, log }`.
 * Devuelve `"idle"` (no había nada), `"done"` (entregado) o `"failed"` (no se pudo, o la web
 * retiró la tarea). Nunca escribe la ficha.
 */
export async function runOnce(config, deps) {
  const log = (text) => deps.log(scrub(config, text));
  let response;
  try {
    response = await call(config, deps, "POST", "/api/agente/tareas/reclamar");
  } catch (error) {
    log(`No se pudo preguntar a la web: ${messageOf(error)}`);
    return "idle";
  }
  if (response.status === 204) return "idle";
  if (response.status === 401) {
    log("La web no reconoce la ficha de este Mac. Crea otra en Ajustes → Mac.");
    return "idle";
  }
  if (!response.ok) {
    log(`La web respondió ${response.status} al preguntar por tareas.`);
    return "idle";
  }
  const task = await response.json().catch(() => null);
  if (!task || !Number.isSafeInteger(task.taskId) || typeof task.uploadId !== "string" || !(task.chunkBytes > 0)) {
    log("La web mandó una tarea que no se entiende.");
    return "idle";
  }

  const finish = (result) => call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/terminar`, { json: { ...result, uploadId: task.uploadId } });
  /** Comunica el fallo (el detalle solo lo ve el dueño) y sigue con otra cosa. */
  const giveUp = async (error) => {
    log(`No se pudo traer el enlace: ${error}`);
    await finish({ ok: false, error: scrub(config, error).slice(0, 500) }).catch(() => {});
    return "failed";
  };
  const lost = () => {
    log("La web ha retirado esta tarea; se deja.");
    return "failed";
  };

  // Aunque la web ya lo comprobó, este Mac no lanza yt-dlp con un enlace de fuera de la lista.
  if (!allowedUrl(task.url)) return giveUp("El enlace no es de un sitio admitido");

  const dir = await deps.fs.mkdtemp(path.join(config.tmpDir ?? os.tmpdir(), TMP_PREFIX));
  const file = path.join(dir, "video.mp4");
  try {
    log(`Descargando ${task.url}`);
    const downloaded = await download(config, deps, task, file);
    if (downloaded.lost) return lost();
    if (!downloaded.ok) return await giveUp(downloaded.error);

    const size = await sizeOf(deps.fs, file);
    if (!size) return await giveUp("yt-dlp no dejó ningún archivo (puede que el vídeo pese más de 100 MB)");
    if (task.maxBytes > 0 && size > task.maxBytes) return await giveUp("El vídeo descargado pesa más de 100 MB");

    const sent = await upload(config, deps, task, file, size);
    if (sent === "lost") return lost();
    if (sent !== "ok") return await giveUp(sent.error);

    const done = await finish({ ok: true, totalBytes: size }).catch(() => null);
    if (done?.status === 409) return lost();
    if (!done?.ok) return await giveUp(`La web no dio por entregado el archivo (${done?.status ?? "sin respuesta"})`);
    log("Entregado.");
    return "done";
  } finally {
    await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
