#!/usr/bin/env node
// Agente del Mac de PRINCIPAL: descarga con yt-dlp los enlaces que se pegan en la web (Instagram,
// TikTok…) y los que necesita el montaje en la nube, y entrega el archivo. Todas las conexiones
// salen de este Mac, por HTTPS.
//
//   node agente.mjs
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

// El yt-dlp en marcha, para cortarlo (con lo que haya lanzado) si el programa se para.
let running = null;
function spawnTracked(command, args, options) {
  const child = spawn(command, args, options);
  if (options?.detached) {
    running = child;
    child.once("close", () => {
      if (running === child) running = null;
    });
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
    if (running?.pid) {
      try {
        process.kill(-running.pid, "SIGKILL");
      } catch {
        running.kill("SIGKILL");
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
const deps = { fetch, spawn: spawnTracked, fs, sleep, log };

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
config.puede = ["enlace_medio"];
log("Listo para traer enlaces (también los que pide el montaje en la nube).");

let connected = null;
async function beat() {
  let state;
  try {
    const response = await heartbeat(config, deps, { ytDlp: tools.ytDlp });
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
