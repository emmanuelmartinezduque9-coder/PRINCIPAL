#!/usr/bin/env -S npx tsx
// Carga en el aprendizaje las decisiones de Emmanuel en la automatización de Codex (JSON de `decisiones.json`).
// Uso: npx tsx scripts/cargar-decisiones-codex.ts <decisiones.json>  (en producción, por `railway ssh`).
import { readFile } from "node:fs/promises";
import { getPool } from "../src/db/client";
import { macOwnerId } from "../src/server/agent-tasks";
import { loadCodexDecisions } from "../src/server/videos/aprendizaje/codex";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Falta el JSON de decisiones.");
  const owner = await macOwnerId();
  if (owner === null) throw new Error("No hay dueño.");
  const report = await loadCodexDecisions(JSON.parse(await readFile(file, "utf8")), owner);
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => getPool().end());
