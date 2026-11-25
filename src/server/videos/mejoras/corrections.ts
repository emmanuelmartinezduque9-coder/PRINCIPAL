import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { prohibitsThirdParty, type ProblemType } from "@/lib/mejoras";

/**
 * Correcciones aprendidas (`learned_corrections`): instrucciones cortas que el motor añade al final del
 * prompt de la imagen inicial o del clip. Son datos versionados: una versión nunca se edita; cambiarla
 * crea la versión siguiente y retira la anterior. Solo este archivo escribe la tabla.
 */

/**
 * `frame` y `clip`: prompts de Higgsfield (en inglés). `montaje`: la lectura y adaptación de los rótulos de la
 * referencia (`edicion-referencia.ts`). `doblaje`: la decisión de habla o canto (`doblaje.ts`). La traducción hablada
 * la hace el modelo `dubbing` de Higgsfield sin texto nuestro: ahí no entra ninguna instrucción.
 */
export type CorrectionStage = "frame" | "clip" | "montaje" | "doblaje";
export const CORRECTION_STAGES: readonly CorrectionStage[] = ["frame", "clip", "montaje", "doblaje"];

/** Como mucho tantas correcciones por prompt (las más recientes), para no ahogar el prompt del desglose. */
export const MAX_DIRECTIVES = 4;
/** Largo máximo de una instrucción. */
export const MAX_DIRECTIVE_CHARS = 300;

export type Correction = typeof schema.learnedCorrections.$inferSelect;

/** Correcciones activas de ese paso que valen para ese producto (las suyas y las de todos), más recientes primero. */
export async function activeCorrections(stage: CorrectionStage, productId: number | null): Promise<Correction[]> {
  const t = schema.learnedCorrections;
  const rows = await getDb()
    .select()
    .from(t)
    .where(
      and(
        eq(t.stage, stage),
        eq(t.status, "activa"),
        productId === null ? isNull(t.productId) : or(isNull(t.productId), eq(t.productId, productId)),
      ),
    )
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(MAX_DIRECTIVES * 2);
  // Regla fija del dueño: nada aprendido puede prohibir marcas, tiendas, películas o personajes de terceros.
  return rows.filter((c) => !prohibitsThirdParty(c.directive)).slice(0, MAX_DIRECTIVES);
}

/** Texto que se añade al final del prompt: las instrucciones aprendidas, o vacío si no hay. */
export function directivesSuffix(corrections: Pick<Correction, "directive">[]): string {
  const lines = corrections.map((c) => c.directive.trim()).filter(Boolean);
  return lines.length === 0 ? "" : ` ${lines.join(" ")}`;
}

/** Bloque para las instrucciones en español de Claude (rótulos del montaje y habla o canto). */
export function instructionsBlock(corrections: Pick<Correction, "directive">[]): string {
  const lines = corrections.map((c) => c.directive.trim()).filter(Boolean);
  return lines.length === 0 ? "" : `\n\nCorrecciones aprendidas de problemas reportados (cúmplelas siempre):\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

/**
 * Lo que añade el motor en ese paso y producto, y qué correcciones son (para apuntarlas en el montaje). Si la base
 * de datos falla, no para nada: se sigue sin correcciones.
 */
export async function learnedFor(stage: CorrectionStage, productId: number | null): Promise<{ text: string; ids: number[] }> {
  try {
    const active = await activeCorrections(stage, productId);
    const text = stage === "frame" || stage === "clip" ? directivesSuffix(active) : instructionsBlock(active);
    return { text, ids: active.map((c) => c.id) };
  } catch (error) {
    console.error(`[mejoras] No se pudieron leer las correcciones aprendidas: ${error instanceof Error ? error.message : String(error)}`);
    return { text: "", ids: [] };
  }
}

/** Lo que añade el motor al prompt de imagen o clip de ese producto. */
export async function learnedSuffix(stage: "frame" | "clip", productId: number): Promise<string> {
  return (await learnedFor(stage, productId)).text;
}

/** Limpia una instrucción: una sola línea, sin comillas sueltas, con punto final y con el tope de largo. */
export function cleanDirective(text: string): string {
  let line = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/^["'«]+|["'»]+$/g, "");
  if (line.length > MAX_DIRECTIVE_CHARS) line = line.slice(0, MAX_DIRECTIVE_CHARS).replace(/\s+\S*$/, "");
  if (line && !/[.!]$/.test(line)) line += ".";
  return line;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Crea la versión 1 de una corrección nueva. */
export async function createCorrection(
  tx: Tx,
  input: { stage: CorrectionStage; problemType: ProblemType; productId: number | null; directive: string; note: string; sourceReportId: number | null; createdBy: number | null },
): Promise<Correction> {
  const [row] = await tx
    .insert(schema.learnedCorrections)
    .values({
      key: `c${input.sourceReportId ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      version: 1,
      stage: input.stage,
      problemType: input.problemType,
      productId: input.productId,
      directive: cleanDirective(input.directive),
      note: input.note.slice(0, 500),
      sourceReportId: input.sourceReportId,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

/** Versión nueva de una corrección (otro texto); la anterior se retira. */
export async function reviseCorrection(tx: Tx, previous: Correction, directive: string, note: string, createdBy: number | null): Promise<Correction> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"correccion:" + previous.key}))`);
  const [last] = await tx
    .select()
    .from(schema.learnedCorrections)
    .where(eq(schema.learnedCorrections.key, previous.key))
    .orderBy(desc(schema.learnedCorrections.version))
    .limit(1);
  await tx
    .update(schema.learnedCorrections)
    .set({ status: "retirada", retiredAt: new Date() })
    .where(and(eq(schema.learnedCorrections.key, previous.key), eq(schema.learnedCorrections.status, "activa")));
  const [row] = await tx
    .insert(schema.learnedCorrections)
    .values({
      key: previous.key,
      version: last.version + 1,
      stage: previous.stage,
      problemType: previous.problemType,
      productId: previous.productId,
      directive: cleanDirective(directive),
      note: note.slice(0, 500),
      sourceReportId: previous.sourceReportId,
      createdBy,
    })
    .returning();
  return row;
}

/** Retira (o vuelve a activar) la última versión de una corrección. */
export async function setCorrectionActive(key: string, active: boolean): Promise<void> {
  const t = schema.learnedCorrections;
  const [last] = await getDb().select().from(t).where(eq(t.key, key)).orderBy(desc(t.version)).limit(1);
  if (!last) return;
  await getDb()
    .update(t)
    .set(active ? { status: "activa", retiredAt: null } : { status: "retirada", retiredAt: new Date() })
    .where(eq(t.id, last.id));
}

/** Todas las versiones de todas las correcciones, por clave y versión. */
export async function allCorrections(): Promise<Correction[]> {
  const t = schema.learnedCorrections;
  return getDb().select().from(t).orderBy(asc(t.key), asc(t.version));
}
