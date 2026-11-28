import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { avatarTarget, pickAvatar, type AvatarTarget, type AvatarUsage, type ChoosableAvatar } from "@/lib/avatar-choice";
import type { AutoPersonAvatar, ReferencePerson } from "@/lib/video-people";
import { activeAvatarSummaries, readAvatarImage } from "@/server/avatars";
import { findRealAvatar } from "@/server/videos/pinterest";

export interface AssignmentContext { videoId: number; analysisId: number; productId: number; userId: number; batchId: number | null; fixedPrimaryId?: number | null; preserveOpening?: boolean }

/** Compute/search outside the transaction; recheck current reservations under a waiting lock. */
export async function assignPeople(context: AssignmentContext, people: ReferencePerson[], principal: AvatarTarget | null, countries: string[], find = findRealAvatar): Promise<AutoPersonAvatar[]> {
  const db = getDb();
  async function readState(connection: Pick<typeof db, "execute">) {
    const saved = await connection.execute<{ assignments: AutoPersonAvatar[] | null }>(sql`select result->'autoAvatars' as assignments from video_analyses where id = ${context.analysisId}`);
    const { rows: rawRows } = await connection.execute<{ id: number; product_id: number; batch_id: number | null; used_at: Date; ids: number[] }>(sql`
      select v.id, v.product_id, v.batch_id, coalesce(a.updated_at, v.created_at) as used_at,
        array(select distinct x::int from unnest(array[coalesce(a.auto_avatar_id, v.avatar_library_id)] ||
          array(select (p->>'avatarId')::int from jsonb_array_elements(coalesce(a.result->'autoAvatars', '[]'::jsonb)) p)) x where x is not null) as ids
      from videos v left join lateral (select auto_avatar_id, result, updated_at from video_analyses
        where video_id = v.id and status in ('done', 'running')
          and (status = 'done' or auto_avatar_id is not null or result ? 'autoAvatars') order by version desc limit 1) a on true
      where v.id <> ${context.videoId} and (coalesce(a.updated_at, v.created_at) > now() - interval '7 days'
        or v.batch_id = ${context.batchId} or v.product_id = ${context.productId}) order by used_at desc`);
    // Raw pg bigint columns are strings; normalize before comparing with application ids.
    const rows = rawRows.map((r) => ({ ...r, id: Number(r.id), product_id: Number(r.product_id), batch_id: r.batch_id === null ? null : Number(r.batch_id) }));
    const usage: AvatarUsage[] = rows.filter((r) => new Date(r.used_at).getTime() >= Date.now() - 7 * 86400_000 || (context.batchId !== null && r.batch_id === context.batchId)).flatMap((r) => r.ids.map((avatarId) => ({ avatarId, productId: r.product_id, batchId: r.batch_id, usedAt: new Date(r.used_at).getTime() })));
    return { saved: saved.rows[0]?.assignments, rows, usage };
  }
  type State = Awaited<ReturnType<typeof readState>>;
  function choose({ saved, rows, usage }: State, library: ChoosableAvatar[], relaxed = false) {
    const required = people.filter((p) => !context.preserveOpening || !p.opening);
    if (saved?.length === required.length && required.every((p) => saved.some((a) => a.personId === p.id))) return { assignments: saved };
    const assignments: AutoPersonAvatar[] = [];
    for (const [index, person] of people.entries()) {
      if (context.preserveOpening && person.opening) continue;
      if (index === 0 && context.fixedPrimaryId) {
        assignments.push({ personId: person.id, avatarId: context.fixedPrimaryId });
        continue;
      }
      const target = index === 0 ? principal : avatarTarget({ texts: [], personaRef: { ...person, present: true }, angleAudience: null });
      if (!target) throw new Error(`No se conoce el sexo/edad de ${person.id}; hace falta completar el desglose.`);
      const last = rows.find((r) => r.product_id === context.productId && r.ids.length)?.ids ?? [];
      // Sin Pinterest disponible (relaxed) solo se evita repetir dentro del mismo vídeo: mejor un avatar
      // poco usado de la biblioteca que parar el desglose y el lote.
      const excluded = relaxed ? assignments.map((a) => a.avatarId) : [...assignments.map((a) => a.avatarId), ...last, ...usage.filter((u) => context.batchId !== null && u.batchId === context.batchId).map((u) => u.avatarId)];
      const chosen = pickAvatar(target, library, countries, { usage, productId: context.productId, batchId: context.batchId, exclude: excluded });
      if (!chosen) {
        return { missing: { person, target, excluded } };
      }
      assignments.push({ personId: person.id, avatarId: chosen.id });
    }
    return { assignments };
  }

  let relaxed = false;
  for (let attempt = 0; ; attempt++) {
    if (attempt >= 3) relaxed = true;
    const library = await activeAvatarSummaries();
    let selection = choose(await readState(db), library, relaxed);
    if (selection.assignments) {
      // Only SQL and in-memory selection while holding the connection/lock. Another
      // analysis may have reserved a candidate while we were searching Pinterest.
      selection = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(28112026)`);
        const current = choose(await readState(tx), library, relaxed);
        if (!current.assignments) return current;
        const assignments = current.assignments;
        await tx.execute(sql`update video_analyses set auto_avatar_id = ${assignments[0]?.avatarId ?? null},
          result = coalesce(result, '{}'::jsonb) || ${JSON.stringify({ autoAvatars: assignments })}::jsonb, updated_at = now()
          where id = ${context.analysisId}`);
        return current;
      });
      if (selection.assignments) return selection.assignments;
    }
    const { person, target, excluded } = selection.missing!;
    const excludedPortraits = await Promise.all([...new Set(excluded)].map((id) => readAvatarImage(id)));
    if (relaxed) throw new Error(`No hay ningún avatar de ${person.id} en la biblioteca ni en Pinterest.`);
    try {
      const chosen = await find({ target, countries, userId: context.userId, productId: context.productId,
        key: `avatar:${context.analysisId}:${person.id}`, excludedHashes: excludedPortraits.map((p) => p.sha256), excludedPortraits });
      if (excluded.includes(chosen.id)) relaxed = true;
    } catch (error) {
      console.error(`[avatares] Pinterest no dio una persona real para ${person.id}; se usa el menos usado de la biblioteca:`, error);
      relaxed = true;
    }
    // find persists the real portrait. Reload the library/history before reserving;
    // simultaneous assignments can consume it and require another search.
  }
}
