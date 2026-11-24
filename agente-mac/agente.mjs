#!/usr/bin/env node
// Agente del Mac de PRINCIPAL: descarga con yt-dlp los enlaces que se pegan en la web (Instagram,
// TikTok…) y los que necesita el montaje en la nube, y entrega el archivo. Todas las conexiones
// salen de este Mac, por HTTPS.
//
//   node agente.mjs
//
// Desde 1.8.0 también hace las llamadas a Claude del dueño con el Claude Code de este Mac.
//
// Configuración: ~/.principal-agente.json  { "url": "https://…", "token": "pra_…" }
// (o las variables PRINCIPAL_URL y PRINCIPAL_AGENTE_TOKEN). Ver README.md.

import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  acquireLock,
  BAD_TOKEN_MESSAGE,
  checkTools,
  cleanLeftovers,
  heartbeat,
  HEARTBEAT_MS,
  nextWait,
  readConfig,
  runOnce,
  TOOLS_RETRY_MS,
  VERSION,
} from "./lib.mjs";
import { CLAUDE_CHECK_MS, CLAUDE_SLOTS, checkClaude, runClaudeOnce } from "./claude.mjs";

const CONFIG_RETRY_MS = 30_000;
const LOCK_FILE = path.join(os.tmpdir(), "principal-agente.lock");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Un mismo aviso repetido (sin red, ficha revocada, falta yt-dlp…) se escribe una vez, no cada vez.
let lastLine = "";
const log = (text) => {
  if (text === lastLine) return;
  lastLine = text;
  console.log(`${new Date().toLocaleString("es-ES")}  ${text}`);
};

/** Espera a que exista una configuración válida; avisa una vez y vuelve a mirar cada 30 segundos. */
async function waitForConfig() {
  for (;;) {
    try {
      const config = await readConfig(process.env, fs);
      if (config) {
        if (config.tightened) log("~/.principal-agente.json lo podían leer otras personas de este Mac: se le han cerrado los permisos.");
        return config;
      }
      log("Falta ~/.principal-agente.json con la dirección de la web y la ficha (ver README.md).");
    } catch (error) {
      log(error instanceof Error ? error.message : "La configuración no vale.");
    }
    await sleep(CONFIG_RETRY_MS);
  }
}

// Los programas en marcha (yt-dlp, claude), para cortarlos (con lo que hayan lanzado) si el programa se para.
const running = new Set();
function spawnTracked(command, args, options) {
  const child = spawn(command, args, options);
  if (options?.detached) {
    running.add(child);
    child.once("close", () => running.delete(child));
  }
  return child;
}
function releaseLockNow() {
  try {
    if (readFileSync(LOCK_FILE, "utf8").trim() === String(process.pid)) rmSync(LOCK_FILE, { force: true });
  } catch {
    // Ya no está: nada que soltar.
  }
}
process.on("exit", releaseLockNow);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of running) {
      if (!child.pid) continue;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
    process.exit(0);
  });
}

log(`Agente del Mac de PRINCIPAL ${VERSION}`);
// Uno solo a la vez: un segundo agente se cierra sin tocar nada del primero.
if (!(await acquireLock(fs, LOCK_FILE))) {
  log("Ya hay otro agente en marcha en este Mac: este se cierra.");
  process.exit(0);
}
await cleanLeftovers(fs);
const config = await waitForConfig();
const deps = { fetch, spawn: spawnTracked, fs, sleep, log, env: process.env };

let tools = await checkTools(deps);
/** Sin yt-dlp o sin ffmpeg no se recoge nada: se vuelve a mirar cada minuto hasta que estén. */
async function waitForTools() {
  for (let warned = false; ; warned = true) {
    tools = await checkTools(deps);
    if (tools.missing.length === 0) {
      if (warned) log("yt-dlp y ffmpeg ya se pueden lanzar: se sigue.");
      return;
    }
    log(`No se puede lanzar ${tools.missing.join(" ni ")}: no se recoge ningún enlace hasta que esté. Se vuelve a mirar cada minuto.`);
    await sleep(TOOLS_RETRY_MS);
  }
}

// Además de las referencias y las canciones, trae los enlaces que pide el montaje en la nube y que
// la nube no puede descargar (referencias de edición de Instagram, «Audio original» de un enlace).
// Solo necesita yt-dlp y ffmpeg, que ya hacen falta para todo lo demás.
// Desde 1.5.0 también lee perfiles de Instagram (con Brave sin ventana y la sesión guardada) y de
// TikTok, para dar de alta un producto pegando solo la cuenta.
// Desde 1.6.0 busca en Pinterest las referencias de las imágenes cuando Pinterest no deja a la nube.
// Desde 1.7.0 busca datos de mercado reales (Amazon, anuncios de Meta, TikTok, YouTube) para
// «Buscar nicho / ángulo / audiencia».
config.puede = ["enlace_medio", "perfil", "pinterest", "datos"];
log("Listo para traer enlaces (también los que pide el montaje en la nube).");

// Desde 1.8.0 hace las llamadas a Claude del dueño con el Claude Code de este Mac (su plan, no la
// API), varias a la vez y aparte de los enlaces. Si Claude Code no tiene sesión, la web lo sabe por
// el latido y esas llamadas van por la API hasta que la tenga.
let claude = { bin: null, reason: "Comprobando Claude Code…" };
async function refreshClaude() {
  const before = claude.bin;
  claude = await checkClaude(deps);
  if (claude.bin && !before) log(`Claude Code ${claude.version} listo: las llamadas a Claude del dueño se hacen en este Mac.`);
  if (!claude.bin) log(claude.reason);
}
await refreshClaude();
setInterval(() => void refreshClaude(), CLAUDE_CHECK_MS);

let connected = null;
async function beat() {
  let state;
  try {
    const response = await heartbeat(config, deps, { ytDlp: tools.ytDlp, claude: claude.bin ? claude.version : null });
    state = response.ok ? "conectado" : response.status === 401 ? "ficha" : "error";
  } catch {
    state = "error";
  }
  if (state !== connected) {
    if (state === "conectado") log(`Conectado con ${config.url}`);
    else if (state === "ficha") log(BAD_TOKEN_MESSAGE);
    else log("Sin conexión con la web; se sigue intentando.");
  }
  connected = state;
}
await beat();
setInterval(beat, HEARTBEAT_MS);

/** Un hueco de llamadas a Claude: recoge una, la hace, y a por la siguiente. */
async function claudeSlot() {
  for (let wait = 0; ; ) {
    if (!claude.bin) {
      await sleep(15_000);
      continue;
    }
    let outcome = "offline";
    try {
      outcome = await runClaudeOnce(config, deps, claude);
    } catch (error) {
      log(`Algo falló con una llamada de Claude: ${error instanceof Error ? error.message.split(config.token).join("***") : "error desconocido"}`);
    }
    if (outcome === "auth") {
      // Perdió la sesión: deja de recoger y la web pasa a la API en el siguiente latido.
      claude = { bin: null, reason: "Claude Code ha perdido la sesión: lanza «bash agente-mac/conectar-claude.sh»." };
      log(claude.reason);
      void beat();
      continue;
    }
    wait = outcome === "idle" ? 2_000 : nextWait(outcome, wait);
    if (wait > 0) await sleep(wait);
  }
}
for (let slot = 0; slot < CLAUDE_SLOTS; slot++) void claudeSlot();

for (let wait = 0; ; ) {
  if (tools.missing.length > 0) await waitForTools();
  let outcome = "offline";
  try {
    outcome = await runOnce(config, deps);
  } catch (error) {
    log(`Algo falló con una tarea: ${error instanceof Error ? error.message.split(config.token).join("***") : "error desconocido"}`);
  }
  // yt-dlp no se pudo ni lanzar: se vuelve a comprobar qué hay antes de recoger nada más.
  if (outcome === "blocked") tools = await checkTools(deps);
  // Con trabajo hecho se pregunta enseguida por el siguiente; sin nada, a los 5 s; si la web no
  // responde o no reconoce la ficha, cada vez más despacio (hasta un minuto).
  wait = nextWait(outcome, wait);
  if (wait > 0) await sleep(wait);
}
