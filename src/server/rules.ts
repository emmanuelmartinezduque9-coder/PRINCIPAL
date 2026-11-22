import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";

/**
 * Reglas del dueño (empezando por el criterio de ángulos de venta), guardadas por versiones.
 * Cada guardado crea una versión nueva y las anteriores no se tocan; la vigente es la de número
 * más alto. Solo este archivo lee o escribe `rule_docs` y `rule_versions`.
 */

export const RULE_SLUGS = {
  angulos: "angulos-de-venta",
  ejemplos: "angulos-ejemplos",
  metodo: "angulos-metodo-juanma",
} as const;

export interface RuleSnapshot {
  slug: string;
  version: number;
  body: string;
}

/** Espacio de cerrojos de las reglas (dos claves: no choca con los de una sola clave). */
const RULES_LOCK_SPACE = 0x52554c45; // "RULE"

const lockSlug = (tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, slug: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(${RULES_LOCK_SPACE}, hashtext(${slug}))`);

/** Reglas vigentes de esos `slug`, ordenadas por `slug` (orden estable para la caché). Falla si falta alguna. */
export async function loadRules(slugs: string[]): Promise<RuleSnapshot[]> {
  const wanted = [...new Set(slugs)].sort();
  if (wanted.length === 0) return [];
  const rows = await getDb()
    .selectDistinctOn([schema.ruleVersions.slug], {
      slug: schema.ruleVersions.slug,
      version: schema.ruleVersions.version,
      body: schema.ruleVersions.body,
    })
    .from(schema.ruleVersions)
    .where(inArray(schema.ruleVersions.slug, wanted))
    .orderBy(asc(schema.ruleVersions.slug), desc(schema.ruleVersions.version));
  const found = new Map(rows.map((row) => [row.slug, row]));
  return wanted.map((slug) => {
    const rule = found.get(slug);
    if (!rule) throw new Error(`Falta la regla «${slug}».`);
    return rule;
  });
}

/** Reglas con su versión vigente, en el orden del índice. */
export async function listRules(): Promise<
  Array<{ slug: string; title: string; description: string; version: number; updatedAt: Date }>
> {
  const { rows } = await getDb().execute<{
    slug: string;
    title: string;
    description: string;
    version: number;
    updated_at: Date;
  }>(sql`
    select d.slug, d.title, d.description, v.version, v.created_at as updated_at
    from rule_docs d
    join lateral (
      select version, created_at from rule_versions where slug = d.slug order by version desc limit 1
    ) v on true
    order by d.position, d.slug
  `);
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    version: Number(r.version),
    updatedAt: new Date(r.updated_at),
  }));
}

const notFound = (slug: string) => new HttpError(404, `No existe la regla «${slug}».`);

/** Regla con su texto vigente y el historial de versiones, la más reciente primero. */
export async function getRule(slug: string) {
  const db = getDb();
  const [doc] = await db.select().from(schema.ruleDocs).where(eq(schema.ruleDocs.slug, slug));
  if (!doc) throw notFound(slug);
  const rows = await db
    .select({
      version: schema.ruleVersions.version,
      body: schema.ruleVersions.body,
      note: schema.ruleVersions.note,
      createdAt: schema.ruleVersions.createdAt,
      authorName: schema.users.name,
    })
    .from(schema.ruleVersions)
    .leftJoin(schema.users, eq(schema.users.id, schema.ruleVersions.createdBy))
    .where(eq(schema.ruleVersions.slug, slug))
    .orderBy(desc(schema.ruleVersions.version));
  if (rows.length === 0) throw notFound(slug);
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    current: { slug, version: rows[0].version, body: rows[0].body },
    history: rows.map(({ version, note, createdAt, authorName }) => ({ version, note, createdAt, authorName })),
  };
}

/** Texto de una versión concreta. */
export async function getRuleVersion(slug: string, version: number): Promise<RuleSnapshot> {
  const [row] = await getDb()
    .select({ slug: schema.ruleVersions.slug, version: schema.ruleVersions.version, body: schema.ruleVersions.body })
    .from(schema.ruleVersions)
    .where(and(eq(schema.ruleVersions.slug, slug), eq(schema.ruleVersions.version, version)));
  if (!row) throw new HttpError(404, `No existe la versión ${version} de la regla «${slug}».`);
  return row;
}

/**
 * Guarda el texto como versión nueva (solo el dueño). Un texto vacío se rechaza; un texto idéntico
 * al vigente devuelve el vigente sin crear versión. Dos guardados a la vez se ordenan con un cerrojo.
 */
export async function saveRuleVersion(owner: AuthUser, slug: string, body: string, note: string): Promise<RuleSnapshot> {
  if (owner.role !== "dueno") throw new HttpError(403, "Solo el dueño puede hacer esto.");
  if (typeof body !== "string" || body.trim() === "") throw new HttpError(400, "La regla no puede quedar vacía.");
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
  return getDb().transaction(async (tx) => {
    await lockSlug(tx, slug);
    const [latest] = await tx
      .select({ version: schema.ruleVersions.version, body: schema.ruleVersions.body })
      .from(schema.ruleVersions)
      .where(eq(schema.ruleVersions.slug, slug))
      .orderBy(desc(schema.ruleVersions.version))
      .limit(1);
    if (!latest) throw notFound(slug);
    if (latest.body === body) return { slug, version: latest.version, body: latest.body };
    const version = latest.version + 1;
    await tx.insert(schema.ruleVersions).values({
      slug,
      version,
      body,
      note: cleanNote,
      // El dueño local (id 0) no tiene fila en `users`.
      createdBy: owner.id > 0 ? owner.id : null,
    });
    return { slug, version, body };
  });
}

interface IndexEntry {
  slug: string;
  title: string;
  description: string;
  file: string;
}

/**
 * Siembra las reglas de `reglas/indice.json`: crea el documento y su versión 1 solo si ese `slug`
 * no tiene versiones, así que nunca pisa lo que el dueño haya editado.
 */
export async function seedRules(dir: string = path.join(process.cwd(), "reglas")): Promise<void> {
  const entries = JSON.parse(await fs.readFile(path.join(dir, "indice.json"), "utf8")) as IndexEntry[];
  for (const [position, entry] of entries.entries()) {
    const body = await fs.readFile(path.join(dir, entry.file), "utf8");
    await getDb().transaction(async (tx) => {
      await lockSlug(tx, entry.slug);
      await tx
        .insert(schema.ruleDocs)
        .values({ slug: entry.slug, title: entry.title, description: entry.description, position })
        .onConflictDoUpdate({
          target: schema.ruleDocs.slug,
          set: { title: entry.title, description: entry.description, position },
        });
      const [existing] = await tx
        .select({ id: schema.ruleVersions.id })
        .from(schema.ruleVersions)
        .where(eq(schema.ruleVersions.slug, entry.slug))
        .limit(1);
      if (!existing) await tx.insert(schema.ruleVersions).values({ slug: entry.slug, version: 1, body, note: "Texto inicial" });
    });
  }
}
