import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getVideoFor } from "@/server/videos/videos";

/**
 * «Detalles técnicos» de un vídeo, solo para el dueño: cada generación con la petición que se
 * envió y la última respuesta de Higgsfield en crudo (`generations.raw`), para comparar con lo que
 * pasó de verdad (la PUERTA de la Tarea 11). Todo pasa por `redactTokens`: nada que parezca una
 * clave sale a la pantalla.
 */

const ONLY_OWNER = "Solo el dueño puede hacer esto.";
const HIDDEN = "[oculto]";

/** Campos cuyo nombre dice que llevan un secreto. */
const SECRET_KEY = /token|secret|passw|authorization|cookie|api[_-]?key|credential|signature|private[_-]?key/i;
const JWT = /eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g;
const BEARER = /\b(Bearer)\s+[^\s"',;]+/gi;
/** Un `data:` largo (las muestras del modo simulado) se resume: no aporta nada y ocupa mucho. */
const MAX_DATA_URL = 100;

function redactString(value: string): string {
  if (value.startsWith("data:") && value.length > MAX_DATA_URL) {
    const comma = value.indexOf(",");
    return `${value.slice(0, comma >= 0 && comma < MAX_DATA_URL ? comma + 1 : 30)}… (${value.length} caracteres)`;
  }
  // Una dirección con consulta puede llevar una firma (subidas prefirmadas): la consulta no se enseña.
  if (/^https?:\/\/\S+$/i.test(value) && value.includes("?")) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}?${HIDDEN}`;
    } catch {
      return HIDDEN;
    }
  }
  return value.replace(JWT, HIDDEN).replace(BEARER, (_match, scheme: string) => `${scheme} ${HIDDEN}`);
}

/** Copia de `value` sin nada que parezca una clave: campos con nombre de secreto, JWT, cabeceras `Bearer` y consultas de direcciones. */
export function redactTokens(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactTokens);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SECRET_KEY.test(key) && inner !== null && inner !== undefined ? HIDDEN : redactTokens(inner),
      ]),
    );
  }
  return value;
}

export interface GenerationDetail {
  id: number;
  kind: string;
  round: number;
  status: string;
  jobIds: string[];
  quotedCredits: number;
  creditsSpent: number | null;
  error: string | null;
  rejectReason: string | null;
  resolvedAs: string | null;
  intentAt: string;
  submitStartedAt: string | null;
  submittedAt: string | null;
  finishedAt: string | null;
  request: unknown;
  raw: unknown;
  results: Array<{ index: number; jobId: string; ok: boolean; url: string | null; error: string | null }>;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** Las generaciones de un vídeo que el dueño ve, de la más antigua a la más reciente. Si no es el dueño, 403. */
export async function generationDetails(user: AuthUser, videoId: number): Promise<GenerationDetail[]> {
  if (user.role !== "dueno") throw new HttpError(403, ONLY_OWNER);
  const video = await getVideoFor(user, videoId);
  const db = getDb();
  const rows = await db.select().from(schema.generations).where(eq(schema.generations.videoId, video.id)).orderBy(asc(schema.generations.id));
  const results =
    rows.length === 0
      ? []
      : await db
          .select({
            generationId: schema.generationResults.generationId,
            index: schema.generationResults.index,
            jobId: schema.generationResults.jobId,
            ok: schema.generationResults.ok,
            url: schema.generationResults.url,
            error: schema.generationResults.error,
          })
          .from(schema.generationResults)
          .where(inArray(schema.generationResults.generationId, rows.map((row) => row.id)))
          .orderBy(asc(schema.generationResults.index));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    round: row.round,
    status: row.status,
    jobIds: row.jobIds,
    quotedCredits: row.quotedCredits,
    creditsSpent: row.creditsSpent,
    error: row.error,
    rejectReason: row.rejectReason,
    resolvedAs: row.resolvedAs,
    intentAt: row.intentAt.toISOString(),
    submitStartedAt: iso(row.submitStartedAt),
    submittedAt: iso(row.submittedAt),
    finishedAt: iso(row.finishedAt),
    request: redactTokens(row.request),
    raw: redactTokens(row.raw ?? null),
    results: results
      .filter((result) => result.generationId === row.id)
      .map(({ index, jobId, ok, url, error }) => ({ index, jobId, ok, url: url === null ? null : (redactTokens(url) as string), error })),
  }));
}
