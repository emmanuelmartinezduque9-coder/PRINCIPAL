// Agente del Mac de PRINCIPAL: la parte que se puede probar sin red ni yt-dlp.
// Sin dependencias: solo Node 22 o más. Todo lo que toca el mundo (red, procesos, disco, reloj)
// llega en `deps`, así las pruebas lo sustituyen.

import os from "node:os";
import path from "node:path";

export const VERSION = "1.3.0";

/** Sitios de los que se descarga, con sus subdominios. La misma lista que el servidor. */
export const LINK_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"];
/** Sitios de los que se descarga una canción: los mismos y SoundCloud. La misma lista que el servidor. */
export const SONG_LINK_HOSTS = [...LINK_HOSTS, "soundcloud.com"];

/**
 * Los únicos extractores de yt-dlp que se usan: el vídeo suelto de cada sitio (un reel o una
 * publicación de Instagram, un vídeo de TikTok o su enlace corto, un vídeo o un short de YouTube,
 * un vídeo o un reel de Facebook). Quedan fuera, a propósito, el extractor genérico (que descarga
 * cualquier dirección) y los que siguen redirecciones (`FacebookRedirectURL`…), además de perfiles,
 * listas y directos. Sin esto, un enlace de un sitio admitido que redirige a otra parte haría que
 * este Mac pidiera cualquier dirección —también de la red de casa— con sus cookies.
 * Los nombres están comprobados con yt-dlp 2026.10.26 (`yt-dlp --list-extractors`).
 */
export const YT_DLP_EXTRACTORS = "Instagram,TikTok,vm.tiktok,youtube,facebook,facebook:reel";
/**
 * Los extractores para una canción: los mismos y el de una pista suelta de SoundCloud (`soundcloud`;
 * no sus listas, usuarios ni búsquedas). YouTube Music (`music.youtube.com/watch?v=…`) ya lo lleva
 * `youtube`. Comprobados con yt-dlp 2026.10.26.
 */
export const YT_DLP_SONG_EXTRACTORS = `${YT_DLP_EXTRACTORS},soundcloud`;

/** Cada cuánto dice el programa «sigo vivo». */
export const HEARTBEAT_MS = 30_000;
/** Cada cuánto pregunta si hay algo que descargar, cuando no hay nada. */
export const POLL_MS = 5_000;
/** Lo más que espera entre preguntas cuando la web no responde o no reconoce la ficha. */
export const MAX_BACKOFF_MS = 60_000;
/** Cada cuánto vuelve a mirar si ya están yt-dlp y ffmpeg, cuando falta alguno. */
export const TOOLS_RETRY_MS = 60_000;
/** Cada cuánto renueva la reserva de la tarea mientras yt-dlp descarga. */
export const LEASE_BEAT_MS = 60_000;
/** Nombres de los archivos de una canción dentro de su carpeta temporal. */
export const SONG_FILE = "cancion.mp3";
export const TITLE_FILE = "titulo.txt";
/** Lo más largo que se manda del título de una canción. */
const MAX_TITLE = 200;
/** Lo más que se deja trabajar a yt-dlp con un enlace antes de cortarlo. */
export const YT_DLP_TIMEOUT_MS = 4 * 60_000;
/** Una carpeta temporal de otra ejecución solo se borra si lleva este tiempo sin tocarse. */
export const LEFTOVER_AGE_MS = 60 * 60_000;
/** Lo más que se deja trabajar al montador (con su autocomprobación) antes de cortarlo. */
export const MONTADOR_TIMEOUT_MS = 25 * 60_000;
/** Lo más que se deja trabajar a rea-video con la referencia de edición. */
export const REA_VIDEO_TIMEOUT_MS = 10 * 60_000;
/** Lo más que pesa cada clip que se descarga para montar, y la canción. */
export const MAX_CLIP_DOWNLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_SONG_DOWNLOAD_BYTES = 25 * 1024 * 1024;
/** Lo más que se espera a que termine de bajar un clip. */
const CLIP_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
/** Nombres dentro de la carpeta del montaje. */
export const SPEC_FILE = "ficha.json";
export const RESULT_FILE = "resultado.json";
export const OUTPUT_FILE = "salida.mp4";

/** Lo que se escribe cuando la web no reconoce la ficha (una vez, no en cada pregunta). */
export const BAD_TOKEN_MESSAGE = "Ficha revocada o incorrecta: la web no reconoce la de este Mac. Crea otra en Ajustes → Mac.";

const REQUEST_TIMEOUT_MS = 30_000;
const CHUNK_TIMEOUT_MS = 5 * 60_000;
const CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_MS = 5_000;
const KILL_WAIT_MS = 5_000;
const PROBE_TIMEOUT_MS = 15_000;
const TOKEN = /^pra_[A-Za-z0-9_-]{43}$/;
const TMP_PREFIX = "principal-agente-";

/** Direcciones de un sitio admitido que no son un vídeo sino un salto a otra dirección cualquiera. */
function isRedirector(url) {
  const host = url.hostname.toLowerCase();
  // l.facebook.com, lm.facebook.com, l.instagram.com: los «enlaces de salida» de Facebook e Instagram.
  if (/^lm?\.(facebook|instagram)\.com$/.test(host)) return true;
  return /^\/+(flx\/warn|l\.php|redirect|linkshim|plugins)(\/|$)/i.test(url.pathname);
}

/**
 * Si el enlace es de uno de los sitios admitidos (`hosts`, por defecto los de los vídeos): solo
 * `https`, sin usuario ni puerto, y que no sea una de sus direcciones de salto (`/flx/warn`,
 * `/l.php`, `l.facebook.com`, `l.instagram.com`…).
 */
export function allowedUrl(url, hosts = LINK_HOSTS) {
  if (typeof url !== "string" || url.length > 2000) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  if (!hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return false;
  return !isRedirector(parsed);
}

/** Como `allowedUrl`, para el enlace de una canción (admite además SoundCloud). */
export function allowedSongUrl(url) {
  return allowedUrl(url, SONG_LINK_HOSTS);
}

/**
 * Un clip que se descarga para montar: solo `https` de la red de distribución de Higgsfield
 * (`*.cloudfront.net`), sin usuario ni puerto, como en el servidor (`servableClipUrl`). Se pide sin
 * la ficha y sin seguir redirecciones.
 */
export function allowedClipUrl(url) {
  if (typeof url !== "string" || url.length > 4000) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname.toLowerCase().endsWith(".cloudfront.net") && !parsed.username && !parsed.password && !parsed.port;
}

/**
 * Dónde están en este Mac las herramientas del montaje: el montador (`montar_auto.py` y
 * `montador.py`), rea-video con su entorno y la caché de `uv` (fuera del disco externo).
 */
export function montajePaths(home = os.homedir()) {
  const tools = path.join(home, ".principal-tools");
  return {
    montadorDir: path.join(tools, "montador"),
    script: path.join(tools, "montador", "montar_auto.py"),
    reaDir: path.join(tools, "rea-video"),
    reaPython: path.join(tools, "rea-video", ".venv", "bin", "python"),
    uvCache: path.join(home, "Library", "Caches", "uv-principal"),
  };
}

/**
 * Argumentos de `uv` para lanzar el montaje automático con sus dependencias: siempre como lista,
 * con la ficha local y la carpeta de trabajo como argumentos (nada pasa por una consola).
 */
export function montadorArgs(script, specPath, workDir) {
  return [
    "run", "--no-project", "--with", "librosa", "--with", "soundfile", "--with", "numpy", "--with", "pillow",
    "python", script, specPath, workDir,
  ];
}

/** Argumentos de rea-video para desglosar la referencia de edición (`breakdown.json` en `outDir`). */
export function reaVideoArgs(videoPath, outDir) {
  return ["-m", "rea_video", "decompose", videoPath, "-o", outDir];
}

/**
 * El entorno de los programas que lanza el montaje: el de este proceso sin la ficha (si llegó por
 * `PRINCIPAL_AGENTE_TOKEN`) y con `extra`.
 */
export function childEnv(env, extra = {}) {
  const copy = { ...env, ...extra };
  delete copy.PRINCIPAL_AGENTE_TOKEN;
  return copy;
}

/**
 * Argumentos de yt-dlp para descargar `url` en `outPath`. Siempre como lista (nunca por una
 * consola) y con `--` delante del enlace: nada de lo que venga en el enlace se lee como opción.
 * Sin archivos de configuración (`--ignore-config`), solo con los extractores de
 * `YT_DLP_EXTRACTORS` y un único vídeo. Usa la sesión de Brave de este Mac.
 */
export function ytDlpArgs(url, outPath) {
  return [
    "--ignore-config", "--use-extractors", YT_DLP_EXTRACTORS,
    "--cookies-from-browser", "brave", "--no-playlist", "--playlist-items", "1", "--max-filesize", "100M",
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
    "-o", outPath, "--", url,
  ];
}

/**
 * Argumentos de yt-dlp para sacar el audio de `url` como MP3 (la mejor calidad) en la carpeta
 * `dir`: el archivo queda en `dir/cancion.mp3` y el título en `dir/titulo.txt`. Las mismas
 * garantías que `ytDlpArgs`: lista de argumentos, `--` delante del enlace, sin configuración, solo
 * los extractores de `YT_DLP_SONG_EXTRACTORS` y una sola pista, como mucho 25 MB.
 */
export function ytDlpAudioArgs(url, dir) {
  return [
    "--ignore-config", "--use-extractors", YT_DLP_SONG_EXTRACTORS,
    "--cookies-from-browser", "brave", "--no-playlist", "--playlist-items", "1", "--max-filesize", "25M",
    "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0",
    "--print-to-file", "after_move:%(title)s", path.join(dir, TITLE_FILE),
    "-o", path.join(dir, "cancion.%(ext)s"), "--", url,
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
 * el archivo `~/.principal-agente.json`. `null` si el archivo no existe todavía. El archivo
 * guarda la ficha: si lo puede leer alguien más que su dueño, se le cierran los permisos (600)
 * antes de usarlo (`tightened: true`).
 */
export async function readConfig(env, fs, home = os.homedir()) {
  if (env.PRINCIPAL_URL && env.PRINCIPAL_AGENTE_TOKEN) return checkConfig({ url: env.PRINCIPAL_URL, token: env.PRINCIPAL_AGENTE_TOKEN });
  const file = path.join(home, ".principal-agente.json");
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("No se pudo leer ~/.principal-agente.json.");
  }
  let tightened = false;
  if (((await fs.stat(file)).mode & 0o077) !== 0) {
    try {
      await fs.chmod(file, 0o600);
    } catch {
      throw new Error("~/.principal-agente.json lo pueden leer otras personas de este Mac y no se ha podido cerrar. Ejecuta: chmod 600 ~/.principal-agente.json");
    }
    tightened = true;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("~/.principal-agente.json no es un JSON válido.");
  }
  return tightened ? { ...checkConfig(raw), tightened } : checkConfig(raw);
}

/** Quita la ficha de cualquier texto antes de escribirlo o enviarlo. */
function scrub(config, text) {
  return String(text).split(config.token).join("***");
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Una petición a la web con la ficha. Todas las conexiones salen de este Mac, y a ninguna otra
 * parte: si la web contestara con una redirección, la petición falla en vez de seguirla (la ficha
 * no viaja a otra dirección).
 */
function call(config, deps, method, route, { json, body, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const headers = { Authorization: `Bearer ${config.token}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  return deps.fetch(`${config.url}${route}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
}

/** Latido del programa: está vivo, y con qué versiones. Devuelve la respuesta de la web. */
export function heartbeat(config, deps, info) {
  return call(config, deps, "POST", "/api/agente/latido", { json: { version: VERSION, ytDlp: info?.ytDlp ?? null } });
}

/**
 * Borra las carpetas temporales que dejó una ejecución anterior que se cortó a medias: solo las
 * que llevan más de una hora sin tocarse (una más reciente puede ser de otra copia en marcha).
 */
export async function cleanLeftovers(fs, tmpDir = os.tmpdir(), now = Date.now()) {
  const names = await fs.readdir(tmpDir).catch(() => []);
  for (const name of names) {
    if (!name.startsWith(TMP_PREFIX)) continue;
    const dir = path.join(tmpDir, name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && now - stat.mtimeMs > LEFTOVER_AGE_MS) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Un solo agente a la vez: apunta este proceso en `lockFile`. Devuelve `true` si lo consigue, o
 * `false` si ya hay otro en marcha (y entonces no se toca nada). Un apunte de un proceso que ya
 * no existe se sustituye.
 */
export async function acquireLock(fs, lockFile, pid = process.pid, isAlive = processAlive) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(lockFile, `${pid}\n`, { flag: "wx", mode: 0o600 });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const other = Number((await fs.readFile(lockFile, "utf8").catch(() => "")).trim());
    if (Number.isSafeInteger(other) && other > 0 && other !== pid && isAlive(other)) return false;
    await fs.rm(lockFile, { force: true });
  }
  return false;
}

/** Suelta el apunte si es el de este proceso. */
export async function releaseLock(fs, lockFile, pid = process.pid) {
  const owner = Number((await fs.readFile(lockFile, "utf8").catch(() => "")).trim());
  if (owner === pid) await fs.rm(lockFile, { force: true }).catch(() => {});
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: existe, pero es de otra persona.
    return error?.code === "EPERM";
  }
}

/** Lanza un programa y espera: `{ ok, out }`. Si no se puede lanzar (no está, sin permiso), `ok: false`. */
function probe(deps, command, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = deps.spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve({ ok: false, out: "" });
      return;
    }
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, out });
    }, PROBE_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => {
      out = (out + chunk).slice(0, 200);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, out });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out });
    });
  });
}

/**
 * Si este Mac puede descargar: `yt-dlp` y `ffmpeg` se pueden lanzar. Devuelve qué falta (vacío si
 * nada) y la versión de yt-dlp. Mientras falte algo, el agente no se lleva tareas: llevárselas
 * para fallarlas vaciaría la cola sin traer nada.
 */
export async function checkTools(deps, config = {}) {
  const ytDlp = await probe(deps, config.ytDlp ?? "yt-dlp", ["--version"]);
  const ffmpeg = await probe(deps, config.ffmpeg ?? "ffmpeg", ["-version"]);
  const missing = [];
  if (!ytDlp.ok) missing.push("yt-dlp");
  if (!ffmpeg.ok) missing.push("ffmpeg");
  return { missing, ytDlp: ytDlp.ok ? ytDlp.out.trim().split("\n")[0].slice(0, 40) || null : null };
}

/**
 * Si este Mac puede montar: está `montar_auto.py` en `~/.principal-tools/montador/` y `uv` se puede
 * lanzar. Devuelve qué falta (vacío si nada). Sin esto no se piden montajes a la web.
 */
export async function checkMontaje(deps, config = {}) {
  const paths = montajePaths(config.home);
  const missing = [];
  if (!(await deps.fs.stat(paths.script).then((stat) => stat.isFile()).catch(() => false))) missing.push("montar_auto.py");
  if (!(await probe(deps, config.uv ?? "uv", ["--version"])).ok) missing.push("uv");
  return { missing };
}

/** Corta yt-dlp y todo lo que haya lanzado (ffmpeg): el grupo de procesos entero. */
function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Lanza un programa (en su propio grupo de procesos) y espera a que termine, renovando la reserva
 * cada minuto. Pasado `timeoutMs` lo corta (a él y a sus hijos). Devuelve `{ ok: true }`,
 * `{ ok: false, error }` (con `messages.failed(detalle)` o `messages.timedOut`), `{ lost: true }`
 * (la web retiró la tarea) o `{ local: true, error }` (no se pudo ni lanzar: es cosa de este Mac).
 */
async function runTool(config, deps, task, command, args, { timeoutMs, messages, env, cwd }) {
  let child;
  try {
    const options = { stdio: ["ignore", "ignore", "pipe"], detached: true };
    if (env) options.env = env;
    if (cwd) options.cwd = cwd;
    child = deps.spawn(command, args, options);
  } catch (error) {
    return { local: true, error: messageOf(error) };
  }
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-2000);
  });
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code) => resolve({ code }));
  });
  const stop = async () => {
    (deps.kill ?? killGroup)(child);
    await Promise.race([exited, deps.sleep(KILL_WAIT_MS)]);
  };

  for (let waited = 0; ; ) {
    const result = await Promise.race([exited, deps.sleep(LEASE_BEAT_MS).then(() => null)]);
    if (result) {
      if (result.error) return { local: true, error: messageOf(result.error) };
      if (result.code === 0) return { ok: true };
      return { ok: false, error: messages.failed(stderr.trim().split("\n").pop()?.trim() ?? "") };
    }
    waited += LEASE_BEAT_MS;
    if (waited >= timeoutMs) {
      await stop();
      return { ok: false, error: messages.timedOut };
    }
    const beat = await call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`).catch(() => null);
    if (beat?.status === 409) {
      await stop();
      return { lost: true };
    }
  }
}

/** yt-dlp con `args` (ver `runTool`): a los 4 minutos se corta. */
function download(config, deps, task, args) {
  return runTool(config, deps, task, config.ytDlp ?? "yt-dlp", args, {
    timeoutMs: YT_DLP_TIMEOUT_MS,
    messages: {
      failed: (detail) => (detail ? `yt-dlp no pudo descargar el enlace: ${detail}` : "yt-dlp no pudo descargar el enlace"),
      timedOut: "yt-dlp tardó más de 4 minutos y se cortó",
    },
  });
}

/** El título que dejó yt-dlp: la primera línea, sin espacios de más y recortada; `null` si no hay. */
export async function readTitle(fs, file) {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  const title = text.split("\n")[0].replace(/\s+/g, " ").trim().slice(0, MAX_TITLE).trim();
  return title || null;
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
 * Devuelve:
 * - `"idle"`: no había nada.
 * - `"done"`: entregado.
 * - `"failed"`: no se pudo traer (y se le dijo a la web), o la web retiró la tarea.
 * - `"offline"`: la web no responde (o responde mal): conviene esperar más antes de volver a preguntar.
 * - `"unauthorized"`: la web no reconoce la ficha.
 * - `"blocked"`: este Mac no pudo ni lanzar yt-dlp. No se le dice a la web que el enlace falló:
 *   la reserva caduca sola y la tarea vuelve a la cola.
 * Nunca escribe la ficha.
 */
export async function runOnce(config, deps) {
  const log = (text) => deps.log(scrub(config, text));
  let response;
  try {
    // Lo que este Mac sabe hacer además de traer enlaces y canciones (montar, si tiene el montador).
    const can = Array.isArray(config.puede) && config.puede.length > 0 ? { json: { puede: config.puede } } : {};
    response = await call(config, deps, "POST", "/api/agente/tareas/reclamar", can);
  } catch (error) {
    log(`No se pudo preguntar a la web: ${messageOf(error)}`);
    return "offline";
  }
  if (response.status === 204) return "idle";
  if (response.status === 401) {
    log(BAD_TOKEN_MESSAGE);
    return "unauthorized";
  }
  if (!response.ok) {
    log(`La web respondió ${response.status} al preguntar por tareas.`);
    return "offline";
  }
  const task = await response.json().catch(() => null);
  if (!task || !Number.isSafeInteger(task.taskId) || typeof task.uploadId !== "string" || !(task.chunkBytes > 0)) {
    log("La web mandó una tarea que no se entiende.");
    return "offline";
  }

  const finish = (result) => call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/terminar`, { json: { ...result, uploadId: task.uploadId } });
  /** Comunica el fallo (el detalle solo lo ve el dueño) y sigue con otra cosa. */
  const giveUp = async (error) => {
    log(`${task.kind === "montaje" ? "No se pudo montar" : "No se pudo traer el enlace"}: ${error}`);
    await finish({ ok: false, error: scrub(config, error).slice(0, 500) }).catch(() => {});
    return "failed";
  };
  const lost = () => {
    log("La web ha retirado esta tarea; se deja.");
    return "failed";
  };

  if (task.kind === "montaje") return runMontaje(config, deps, task, { log, finish, giveUp, lost });

  // Una canción trae el audio (MP3); cualquier otra cosa, el vídeo de referencia.
  const song = task.kind === "cancion";
  // Aunque la web ya lo comprobó, este Mac no lanza yt-dlp con un enlace de fuera de la lista.
  if (!(song ? allowedSongUrl(task.url) : allowedUrl(task.url))) return giveUp("El enlace no es de un sitio admitido");

  // Carpeta temporal propia (solo la puede leer este usuario: `mkdtemp` la crea con 700).
  const dir = await deps.fs.mkdtemp(path.join(config.tmpDir ?? os.tmpdir(), TMP_PREFIX));
  const file = path.join(dir, song ? SONG_FILE : "video.mp4");
  const url = new URL(task.url).href;
  const maxMb = song ? 25 : 100;
  try {
    log(`Descargando ${task.url}`);
    const downloaded = await download(config, deps, task, song ? ytDlpAudioArgs(url, dir) : ytDlpArgs(url, file));
    if (downloaded.lost) return lost();
    if (downloaded.local) {
      // Cosa de este Mac, no del enlace: no se da por fallido.
      log(`No se pudo lanzar yt-dlp (${downloaded.error}). La tarea se deja para más tarde.`);
      return "blocked";
    }
    if (!downloaded.ok) return await giveUp(downloaded.error);

    const size = await sizeOf(deps.fs, file);
    const what = song ? "La canción" : "El vídeo";
    if (!size) return await giveUp(`yt-dlp no dejó ningún archivo (puede que ${what.toLowerCase()} pese más de ${maxMb} MB)`);
    if (task.maxBytes > 0 && size > task.maxBytes) return await giveUp(`${what} descargad${song ? "a" : "o"} pesa más de ${maxMb} MB`);

    const sent = await upload(config, deps, task, file, size);
    if (sent === "lost") return lost();
    if (sent !== "ok") return await giveUp(sent.error);

    const title = song ? await readTitle(deps.fs, path.join(dir, TITLE_FILE)) : null;
    const done = await finish(title ? { ok: true, totalBytes: size, title } : { ok: true, totalBytes: size }).catch(() => null);
    if (done?.status === 409) return lost();
    if (!done?.ok) return await giveUp(`La web no dio por entregado el archivo (${done?.status ?? "sin respuesta"})`);
    log("Entregado.");
    return "done";
  } finally {
    await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ───────────────────────── Montaje ─────────────────────────

/** Descarga `url` (un clip de Higgsfield) a `file`, sin la ficha, sin redirecciones y sin pasar de `maxBytes`. */
async function fetchToFile(deps, url, file, maxBytes) {
  let response;
  try {
    response = await deps.fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(CLIP_DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    return { error: `No se pudo descargar un clip (${messageOf(error)})` };
  }
  if (!response.ok || !response.body) return { error: `No se pudo descargar un clip (${response.status})` };
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return { error: "Un clip pesa demasiado" };
  const handle = await deps.fs.open(file, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxBytes) return { error: "Un clip pesa demasiado" };
      await handle.write(chunk);
    }
  } catch (error) {
    return { error: `No se pudo descargar un clip (${messageOf(error)})` };
  } finally {
    await handle.close();
  }
  return size > 0 ? { ok: true } : { error: "Un clip llegó vacío" };
}

/**
 * La ficha que manda la web, comprobada otra vez en este Mac: de 1 a 11 clips, todos de Higgsfield;
 * la canción, solo por la ruta de esta misma tarea. Devuelve el problema, o `null` si vale.
 */
export function checkSpec(task) {
  const spec = task?.spec;
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.clips) || spec.clips.length === 0 || spec.clips.length > 11) return "La ficha de montaje no se entiende";
  if (!spec.clips.every((clip) => clip && ["hook", "body", "clip"].includes(clip.role) && allowedClipUrl(clip.url))) return "La ficha trae un clip que no es de Higgsfield";
  if (spec.song != null && spec.song.url !== `/api/agente/tareas/${task.taskId}/cancion`) return "La ficha trae una canción que no es de esta tarea";
  if (spec.editReferenceUrl != null && typeof spec.editReferenceUrl !== "string") return "La ficha de montaje no se entiende";
  return null;
}

/** El resumen de la autocomprobación que se manda a la web (lo que dejó `montar_auto.py`). */
export function selfCheckOf(result, withReference) {
  const check = result?.autocomprobacion ?? {};
  const avisos = [...(Array.isArray(check.avisos) ? check.avisos : []), ...(Array.isArray(result?.avisos) ? result.avisos : [])];
  return {
    ok: check.ok === true,
    avisos: avisos.filter((aviso) => typeof aviso === "string").slice(0, 20),
    planos: Number.isSafeInteger(check.planos) ? check.planos : null,
    cortesEnBeat: typeof check.cortesEnBeat === "string" ? check.cortesEnBeat : null,
    intentos: Number.isSafeInteger(check.intentos) ? check.intentos : null,
    referencia: withReference,
  };
}

/**
 * Una tarea `montaje`: en una carpeta temporal propia descarga los clips (de Higgsfield, sin la
 * ficha) y la canción (de la web, con la ficha); si hay referencia de edición, la trae con yt-dlp
 * (mismos argumentos y lista de sitios) y la desglosa con rea-video; lanza `montar_auto.py` con la
 * ficha local; sube el MP4 por trozos con la sesión de la reserva y manda la autocomprobación.
 */
async function runMontaje(config, deps, task, { log, finish, giveUp, lost }) {
  const problem = checkSpec(task);
  if (problem) return giveUp(problem);
  const spec = task.spec;
  const paths = montajePaths(config.home);
  const env = childEnv(deps.env ?? process.env, { UV_CACHE_DIR: paths.uvCache, COPYFILE_DISABLE: "1" });
  const beat = async () => (await call(config, deps, "POST", `/api/agente/tareas/${task.taskId}/latido`).catch(() => null))?.status !== 409;

  const dir = await deps.fs.mkdtemp(path.join(config.tmpDir ?? os.tmpdir(), TMP_PREFIX));
  try {
    log(`Montando «${String(spec.title ?? spec.videoId).slice(0, 80)}»`);
    const clips = [];
    for (const [index, clip] of spec.clips.entries()) {
      const file = path.join(dir, `clip-${index}.mp4`);
      const got = await fetchToFile(deps, new URL(clip.url).href, file, MAX_CLIP_DOWNLOAD_BYTES);
      if (got.error) return await giveUp(got.error);
      if (!(await beat())) return lost();
      clips.push({ role: clip.role, path: file });
    }

    let song = null;
    if (spec.song) {
      const response = await call(config, deps, "GET", spec.song.url, { timeout: 2 * 60_000 }).catch(() => null);
      if (response?.status === 409) return lost();
      if (!response?.ok) return await giveUp(`No se pudo traer la canción (${response?.status ?? "sin respuesta"})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_SONG_DOWNLOAD_BYTES) return await giveUp("La canción no es válida");
      const file = path.join(dir, "cancion.audio");
      await deps.fs.writeFile(file, bytes, { mode: 0o600 });
      song = { ...spec.song, path: file };
    }

    const avisos = [];
    let breakdown = null;
    if (spec.editReferenceUrl) {
      if (!allowedUrl(spec.editReferenceUrl)) {
        avisos.push("La referencia de edición no es de un sitio admitido: se monta sin ella");
      } else {
        const refFile = path.join(dir, "referencia.mp4");
        log(`Trayendo la referencia de edición ${spec.editReferenceUrl}`);
        const got = await download(config, deps, task, ytDlpArgs(new URL(spec.editReferenceUrl).href, refFile));
        if (got.lost) return lost();
        if (got.ok && (await sizeOf(deps.fs, refFile))) {
          const reaOut = path.join(dir, "rea");
          const rea = await runTool(config, deps, task, paths.reaPython, reaVideoArgs(refFile, reaOut), {
            timeoutMs: REA_VIDEO_TIMEOUT_MS,
            env,
            cwd: paths.reaDir,
            messages: { failed: (detail) => `rea-video no pudo analizar la referencia${detail ? `: ${detail}` : ""}`, timedOut: "rea-video tardó demasiado con la referencia" },
          });
          if (rea.lost) return lost();
          const file = path.join(reaOut, "breakdown.json");
          if (rea.ok && (await sizeOf(deps.fs, file))) breakdown = file;
          else avisos.push(`${rea.error ?? "rea-video no dejó el desglose de la referencia"}: se monta sin ella`);
        } else {
          avisos.push("No se pudo traer la referencia de edición: se monta sin ella");
        }
      }
    }

    const work = path.join(dir, "trabajo");
    await deps.fs.mkdir(work, { mode: 0o700 });
    const specPath = path.join(dir, SPEC_FILE);
    await deps.fs.writeFile(specPath, JSON.stringify({ ...spec, clips, song, referencia: breakdown ? { breakdown } : null, avisos }), { mode: 0o600 });
    log("Lanzando el montador.");
    const ran = await runTool(config, deps, task, config.uv ?? "uv", montadorArgs(paths.script, specPath, work), {
      timeoutMs: MONTADOR_TIMEOUT_MS,
      env,
      cwd: paths.montadorDir,
      messages: { failed: (detail) => `El montador falló${detail ? `: ${detail}` : ""}`, timedOut: "El montador tardó más de 25 minutos y se cortó" },
    });
    if (ran.lost) return lost();
    if (ran.local) {
      // Cosa de este Mac: la reserva caduca sola y la tarea vuelve a la cola.
      log(`No se pudo lanzar el montador (${ran.error}). La tarea se deja para más tarde.`);
      return "blocked";
    }
    let result = null;
    try {
      result = JSON.parse(await deps.fs.readFile(path.join(work, RESULT_FILE), "utf8"));
    } catch {
      result = null;
    }
    if (!result) return await giveUp(ran.error ?? "El montador no dejó resultado");
    if (result.ok !== true) return await giveUp(typeof result.error === "string" && result.error ? result.error : "El montador no pudo montar el vídeo");

    const output = path.join(work, OUTPUT_FILE);
    const size = await sizeOf(deps.fs, output);
    if (!size) return await giveUp("El montador no dejó el vídeo");
    if (task.maxBytes > 0 && size > task.maxBytes) return await giveUp("El vídeo montado pesa más de 200 MB");
    const sent = await upload(config, deps, task, output, size);
    if (sent === "lost") return lost();
    if (sent !== "ok") return await giveUp(sent.error);
    const done = await finish({ ok: true, totalBytes: size, selfCheck: selfCheckOf(result, breakdown !== null) }).catch(() => null);
    if (done?.status === 409) return lost();
    if (!done?.ok) return await giveUp(`La web no dio por entregado el vídeo (${done?.status ?? "sin respuesta"})`);
    log("Montaje entregado.");
    return "done";
  } finally {
    await deps.fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Cuánto esperar antes de la siguiente vuelta, según cómo fue la última y lo que ya se esperaba:
 * con trabajo hecho, nada; sin nada, 5 s; si la web no responde o no reconoce la ficha, cada vez
 * el doble, hasta un minuto.
 */
export function nextWait(outcome, previous = 0) {
  if (outcome === "done" || outcome === "failed") return 0;
  if (outcome === "offline" || outcome === "unauthorized") return Math.min(MAX_BACKOFF_MS, Math.max(POLL_MS, previous) * 2);
  if (outcome === "blocked") return TOOLS_RETRY_MS;
  return POLL_MS;
}
