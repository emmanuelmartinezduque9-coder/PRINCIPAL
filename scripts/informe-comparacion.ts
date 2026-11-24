#!/usr/bin/env -S npx tsx
// Informe de lectura, sin modificar las comparaciones ni decidir cuál es mejor.
import { writeFile } from "node:fs/promises";
import { asc, gte } from "drizzle-orm";
import { getDb, getPool, schema } from "../src/db/client";
import { MAC_STEPS, MAC_STEP_LABELS } from "../src/llm/mac-engines";

function option(name: string) {
  const at = process.argv.indexOf(name);
  if (at < 0) return undefined;
  const value = process.argv[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${name}.`);
  return value;
}
// Cada celda conserva el principio y el final: el JSON final suele estar al final de la respuesta.
function cell(value: string | null) {
  const text = value ?? "Pendiente";
  const clipped = text.length > 6000 ? `${text.slice(0, 4000)}\n[… recortado …]\n${text.slice(-2000)}` : text;
  return clipped.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
}
async function main() {
  const desde = option("--desde");
  const date = desde ? new Date(desde) : null;
  if (date && Number.isNaN(date.getTime())) throw new Error("Fecha --desde no válida; usa AAAA-MM-DD o una fecha ISO.");
  const salida = option("--salida") ?? "informe-comparacion.md";
  const table = schema.llmComparisons;
  const rows = await getDb().select().from(table).where(date ? gte(table.createdAt, date) : undefined).orderBy(asc(table.createdAt), asc(table.id));
  const parts = ["# Comparación Claude Code / Codex", `Generado: ${new Date().toISOString()}. Desde: ${desde ?? "el principio"}.`, "Tiempos en milisegundos. «Sin validar» conserva la incertidumbre tras un reinicio de la web. La columna veredicto se rellena a mano."];
  for (const step of MAC_STEPS) {
    parts.push(`## ${MAC_STEP_LABELS[step]}`, "| Llamada | Claude (ms) | Codex (ms) | Codex pasa Zod | Claude | Codex / error | veredicto |", "| --- | ---: | ---: | --- | --- | --- | --- |");
    for (const row of rows.filter((r) => r.paso === step)) {
      parts.push(`| #${row.agentTaskId} · ${row.createdAt.toISOString()} · ${cell(row.stepKey)} | ${row.claudeMs ?? "—"} | ${row.codexMs ?? "—"} | ${row.codexMs === null ? "Pendiente" : row.codexValid === null ? "Sin validar" : row.codexValid ? "Sí" : "No"} | ${cell(row.claudeText)} | ${cell(row.codexError ? `${row.codexText ?? ""}\nError: ${row.codexError}` : row.codexText)} | |`);
    }
  }
  await writeFile(salida, parts.join("\n\n").replace(/\n\n(?=\|)/g, "\n") + "\n");
  console.log(`Informe escrito en ${salida} (${rows.length} llamadas).`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => { if (process.env.DATABASE_URL) await getPool().end(); });
