import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isProblemType, type ProblemType } from "@/lib/mejoras";
import { BLOCKED, SYSTEM_REJECT_PREFIX } from "@/server/videos/generations";
import type { StageRecord } from "@/server/videos/mejoras/metrics";

/**
 * Lee de la base de datos lo que hace falta para las cuentas de `metrics.ts`: por vídeo y paso (imagen
 * inicial, clip o montaje), sus rondas, si se aceptó a la primera, sus rechazos con el tipo clasificado, sus
 * bloqueos de Higgsfield, los reportes de ese paso y el prompt de cada ronda.
 */

/** Cuántos días hacia atrás se miran. */
export const EVIDENCE_DAYS = 180;

type GenRow = {
  generation_id: number;
  video_id: number;
  product_id: number;
  kind: "frame" | "clip";
  round: number;
  status: string;
  error: string | null;
  reject_reason: string | null;
  intent_at: Date;
  prompt: string | null;
  approved: boolean;
  rejection_type: string | null;
};

/** Problemas reportados por vídeo y paso (`frame`, `clip` u `otro`). */
export async function reportedProblems(): Promise<Map<number, Array<{ stage: string; type: ProblemType }>>> {
  const { rows } = await getDb().execute<{ video_id: number; stage: string; problem_type: string }>(sql`
    select video_id, stage, problem_type from problem_reports
    where video_id is not null and problem_type is not null and fix_kind is distinct from 'uso'
      and created_at > now() - make_interval(days => ${EVIDENCE_DAYS})
  `);
  const out = new Map<number, Array<{ stage: string; type: ProblemType }>>();
  for (const row of rows) {
    if (!isProblemType(row.problem_type)) continue;
    const stage = row.stage === "imagen" ? "frame" : row.stage === "clip" ? "clip" : row.stage === "montaje" ? "montaje" : "otro";
    const list = out.get(Number(row.video_id)) ?? [];
    list.push({ stage, type: row.problem_type });
    out.set(Number(row.video_id), list);
  }
  return out;
}

/** Junta las filas de generaciones en un registro por vídeo y paso. Pura: se prueba sin base de datos. */
export function buildStageRecords(rows: GenRow[], reports: Map<number, Array<{ stage: string; type: ProblemType }>>): StageRecord[] {
  const groups = new Map<string, GenRow[]>();
  for (const row of rows) {
    const key = `${row.video_id}:${row.kind}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const records: StageRecord[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.round - b.round || a.generation_id - b.generation_id);
    const sent = list.filter((r) => r.status !== "not_sent");
    if (sent.length === 0) continue;
    const human = sent.filter((r) => r.reject_reason !== null && !r.reject_reason.startsWith(SYSTEM_REJECT_PREFIX));
    const approvedRow = sent.find((r) => r.approved);
    const problems: ProblemType[] = [];
    for (const r of human) problems.push(isProblemType(r.rejection_type) ? r.rejection_type : "otro");
    for (const r of sent) if (r.status === "failed" && r.error === BLOCKED) problems.push("bloqueo_higgsfield");
    const first = sent[0];
    for (const rep of reports.get(first.video_id) ?? []) if (rep.stage === first.kind) problems.push(rep.type);
    records.push({
      videoId: Number(first.video_id),
      productId: Number(first.product_id),
      stage: first.kind,
      firstAt: new Date(first.intent_at),
      decided: approvedRow !== undefined || human.length > 0,
      firstAccepted: approvedRow !== undefined && approvedRow.round === first.round && human.length === 0,
      regenerations: human.length,
      problems,
      prompts: sent.map((r) => r.prompt ?? ""),
    });
  }
  return records;
}

type RunRow = {
  video_id: number;
  product_id: number;
  created_at: Date;
  learned_corrections: number[] | null;
};

/**
 * Un registro por vídeo y montaje hecho (`edit_runs` terminados), dos veces: como `montaje` (correcciones de
 * rótulos) y como `doblaje` (de habla o canto). Rehacer el montaje cuenta como regeneración; los problemas son los
 * reportes del montaje. Pura: se prueba sin base de datos.
 */
export function buildEditRecords(rows: RunRow[], reports: Map<number, Array<{ stage: string; type: ProblemType }>>): StageRecord[] {
  const byVideo = new Map<number, RunRow[]>();
  for (const row of rows) byVideo.set(Number(row.video_id), [...(byVideo.get(Number(row.video_id)) ?? []), row]);
  const records: StageRecord[] = [];
  for (const [videoId, list] of byVideo) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const problems = (reports.get(videoId) ?? []).filter((rep) => rep.stage === "montaje").map((rep) => rep.type);
    const base = {
      videoId,
      productId: Number(list[0].product_id),
      firstAt: new Date(list[0].created_at),
      decided: true,
      firstAccepted: list.length === 1 && problems.length === 0,
      regenerations: list.length - 1,
      problems,
      prompts: [],
      applied: list.map((row) => (row.learned_corrections ?? []).map(Number)),
    };
    records.push({ ...base, stage: "montaje" }, { ...base, problems: [...problems], stage: "doblaje" });
  }
  return records;
}

/** Los registros de los últimos `EVIDENCE_DAYS` días. */
export async function loadStageRecords(): Promise<{ records: StageRecord[]; reports: Map<number, Array<{ stage: string; type: ProblemType }>> }> {
  const { rows } = await getDb().execute<GenRow>(sql`
    select g.id as generation_id, g.video_id, v.product_id, g.kind, g.round, g.status, g.error, g.reject_reason,
      g.intent_at, g.request->>'prompt' as prompt,
      exists (
        select 1 from generation_results r
        where r.generation_id = g.id
          and r.id = case when g.kind = 'frame' then v.approved_frame_result_id else v.approved_clip_result_id end
      ) as approved,
      case when rt.reason = g.reject_reason then rt.problem_type end as rejection_type
    from generations g
    join videos v on v.id = g.video_id
    left join rejection_types rt on rt.generation_id = g.id
    where g.kind in ('frame', 'clip') and g.intent_at > now() - make_interval(days => ${EVIDENCE_DAYS})
  `);
  const { rows: runs } = await getDb().execute<RunRow>(sql`
    select r.video_id, v.product_id, r.created_at, r.learned_corrections
    from edit_runs r join videos v on v.id = r.video_id
    where r.status = 'done' and r.created_at > now() - make_interval(days => ${EVIDENCE_DAYS})
  `);
  const reports = await reportedProblems();
  return { records: [...buildStageRecords(rows, reports), ...buildEditRecords(runs, reports)], reports };
}
