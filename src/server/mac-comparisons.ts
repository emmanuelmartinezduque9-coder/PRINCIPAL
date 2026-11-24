import { trailingJson } from "@/llm/json-text";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb, schema } from "@/db/client";
import { HttpError } from "@/server/http";

// Se conserva el Zod original (también sus refinamientos). Tras un reinicio se deja NULL:
// es mejor enseñar «sin validar» que confundir JSON válido con el contrato del paso.
type Validator = { schema: z.ZodType | undefined; until: number };
const tasks = new Map<number, Validator>();
/** El esquema se liga al id de tarea: dos llamadas simultáneas al mismo paso no se pisan. */
export function bindMacSchema(taskId: number, schema: z.ZodType | undefined) {
  for (const [key, value] of tasks) if (value.until < Date.now()) tasks.delete(key);
  const value = { schema, until: Date.now() + 60 * 60_000 };
  tasks.set(taskId, value);
  watchComparison(taskId, value);
}
export async function saveMacComparison(agentId: number, body: unknown) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Comparación no válida.");
  const value = body as Record<string, unknown>;
  if (!Number.isSafeInteger(value.taskId) || (value.taskId as number) <= 0 || typeof value.uploadId !== "string") throw new HttpError(400, "Falta la reserva.");
  const isMs = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 2_147_483_647;
  if (!isMs(value.claudeMs) || !isMs(value.codexMs) || typeof value.claudeText !== "string" || typeof value.codexText !== "string" ||
      value.codexError !== null && typeof value.codexError !== "string") throw new HttpError(400, "Tiempos o salidas no válidos.");
  const db = getDb();
  const [task] = await db.select().from(schema.agentTasks).where(eq(schema.agentTasks.id, value.taskId as number));
  const [row] = await db.select().from(schema.llmComparisons).where(eq(schema.llmComparisons.agentTaskId, value.taskId as number));
  if (!task || task.kind !== "claude_code" || task.agentId !== agentId || !row || row.uploadId !== value.uploadId) throw new HttpError(409, "Esta comparación ya no es tuya.");
  const text = (v: unknown) => typeof v === "string" ? Buffer.from(v).subarray(0, 200_000).toString("utf8").replace(/\uFFFD$/, "") : null;
  const ms = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 2_147_483_647 ? v : null;
  const codexText = text(value.codexText);
  const validator = tasks.get(task.id);
  const codexTruncated = value.codexTruncated === true || Buffer.byteLength(typeof value.codexText === "string" ? value.codexText : "") > 200_000;
  const codexError = text(value.codexError);
  const codexValid = validateComparison(validator, { codexText, codexError, codexTruncated });
  const updated = await db.update(schema.llmComparisons).set({ claudeMs: ms(value.claudeMs), codexMs: ms(value.codexMs), claudeText: text(value.claudeText), codexText, codexError, codexValid, codexTruncated })
    .where(and(eq(schema.llmComparisons.id, row.id), eq(schema.llmComparisons.uploadId, value.uploadId))).returning({ id: schema.llmComparisons.id });
  if (updated.length === 0) throw new HttpError(409, "Esta comparación ya no es tuya.");
}

function validateComparison(validator: Validator | undefined, row: { codexText: string | null; codexError: string | null; codexTruncated: boolean }): boolean | null {
  if (row.codexError) return false;
  if (!validator || validator.until < Date.now() || row.codexTruncated) return null;
  if (!validator.schema) return true;
  try { return validator.schema.safeParse(JSON.parse(trailingJson(row.codexText ?? ""))).success; }
  catch { return false; }
}

/**
 * La llamada vive en el worker y el POST suele llegar al proceso web: el Zod no se comparte entre
 * procesos. El worker observa la fila sin bloquear el resultado de Claude y escribe su veredicto.
 * Si se reinicia, NULL conserva esa incertidumbre. Los temporizadores no impiden cerrar el proceso.
 */
function watchComparison(taskId: number, validator: Validator) {
  const poll = async () => {
    if (tasks.get(taskId) !== validator || validator.until < Date.now()) return;
    try {
      const [row] = await getDb().select().from(schema.llmComparisons).where(eq(schema.llmComparisons.agentTaskId, taskId));
      if (row && row.codexMs !== null) {
        const codexValid = validateComparison(validator, row);
        await getDb().update(schema.llmComparisons).set({ codexValid }).where(and(eq(schema.llmComparisons.id, row.id), eq(schema.llmComparisons.uploadId, row.uploadId)));
        return;
      }
    } catch { /* Un corte breve de la base no debe perder el veredicto ni fallar la llamada. */ }
    setTimeout(() => void poll(), 1500).unref();
  };
  setTimeout(() => void poll(), 1500).unref();
}
