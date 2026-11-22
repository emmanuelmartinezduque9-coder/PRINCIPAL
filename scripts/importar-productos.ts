/**
 * Importador de una sola vez: los productos y sus fotos del sistema antiguo, desde el paquete de
 * exportación (`productos.json` + `fotos/<slug>/…`), a la base de datos de PRINCIPAL.
 *
 *   npx tsx scripts/importar-productos.ts --paquete <carpeta> --dueno <correo del dueño>
 *       [--estados 'active,active*'] [--aplicar --confirmo-base <host:puerto/base>]
 *
 * Sin `--aplicar` es una prueba: dice qué crearía u omitiría y no cambia nada. Con `--aplicar`
 * escribe, y solo si `--confirmo-base` es el `host:puerto/base` de `DATABASE_URL` (lo muestra la
 * prueba). Antes de nada comprueba que la base es la de PRINCIPAL y no la de Finanzas (en Railway
 * las dos pueden compartir host y llamarse `railway`). Se puede repetir: un producto se reconoce por
 * su nombre exacto (sin distinguir mayúsculas) y una foto por el sha256 de su contenido; nunca se
 * crea un duplicado, ni se borra o cambia nada de lo que ya hay (a un producto existente solo se le
 * añaden las fotos que le faltan).
 *
 * Pasa por los mismos módulos que la web (`createProduct`, `importProductPhotos` y sus reglas), así
 * que valida exactamente igual. Guía: `docs/importacion/importador.md`.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { databaseUrl, getPool } from "../src/db/client";
import { looksLikeFinanzas } from "../src/db/migrate";
import { getActiveUserByEmail, type AuthUser } from "../src/server/auth";
import { HttpError } from "../src/server/http";
import {
  checkPhotoBytes,
  importProductPhotos,
  isPhotoRole,
  listPhotoHashes,
  MAX_PHOTOS_PER_PRODUCT,
  type PhotoRole,
} from "../src/server/photos";
import { createProduct, listProductsFor, validateProductInput } from "../src/server/products";

// ───────────────────────── Argumentos ─────────────────────────

/** Estados del paquete. `active*` es «activa por defecto»: `active` con `statusBasis: "implicito"`. */
export const STATUSES = ["active", "active*", "retired", "hidden", "unclear"] as const;
const DEFAULT_STATUSES = ["active", "active*"];

export interface ImportOptions {
  paquete: string;
  dueno: string;
  aplicar: boolean;
  estados: Set<string>;
  confirmoBase: string | null;
}

/** Error de uso o de una comprobación previa: se explica y no se toca nada. */
export class ImportAbort extends Error {}

const USAGE =
  "Uso: npx tsx scripts/importar-productos.ts --paquete <carpeta> --dueno <correo> " +
  "[--estados 'active,active*'] [--aplicar --confirmo-base <host:puerto/base>]";

export function parseArgs(argv: string[]): ImportOptions {
  const values = new Map<string, string>();
  let aplicar = false;
  const withValue = new Set(["--paquete", "--dueno", "--estados", "--confirmo-base"]);
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].startsWith("--") ? argv[i].indexOf("=") : -1;
    const [flag, inline] = eq > 0 ? [argv[i].slice(0, eq), argv[i].slice(eq + 1)] : [argv[i], undefined];
    if (flag === "--aplicar" && inline === undefined) {
      aplicar = true;
    } else if (withValue.has(flag)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) throw new ImportAbort(`Falta el valor de ${flag}.\n${USAGE}`);
      values.set(flag, value);
    } else {
      throw new ImportAbort(`Opción desconocida: ${flag}\n${USAGE}`);
    }
  }
  const paquete = values.get("--paquete");
  if (!paquete) throw new ImportAbort(`Falta --paquete (la carpeta con productos.json).\n${USAGE}`);
  const dueno = values.get("--dueno");
  if (!dueno) throw new ImportAbort(`Falta --dueno (el correo de la cuenta del dueño).\n${USAGE}`);
  const estados = new Set(
    (values.get("--estados") ?? DEFAULT_STATUSES.join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const unknown = [...estados].filter((s) => !(STATUSES as readonly string[]).includes(s));
  if (unknown.length) throw new ImportAbort(`Estado desconocido: ${unknown.join(", ")}. Valen: ${STATUSES.join(", ")}.`);
  if (estados.size === 0) throw new ImportAbort(`--estados está vacío. Valen: ${STATUSES.join(", ")}.`);
  return { paquete, dueno, aplicar, estados, confirmoBase: values.get("--confirmo-base") ?? null };
}

// ───────────────────────── Paquete ─────────────────────────

interface PackagePhoto {
  role: string;
  label: string;
  file: string | null;
  sha256: string | null;
  primary?: boolean;
  missing?: string;
}

interface PackageProduct {
  slug: string;
  name: string;
  status: string;
  statusBasis?: string;
  language?: string | null;
  countries?: string[] | null;
  summary?: string | null;
  photos?: PackagePhoto[];
}

/** Estado del producto tal como se filtra: `active` implícito cuenta como `active*`. */
export function effectiveStatus(p: Pick<PackageProduct, "status" | "statusBasis">): string {
  return p.status === "active" && p.statusBasis === "implicito" ? "active*" : p.status;
}

async function readPackage(dir: string): Promise<PackageProduct[]> {
  const file = path.join(dir, "productos.json");
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    throw new ImportAbort(`No encuentro ${file}. ¿Es --paquete la carpeta de la exportación?`);
  }
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new ImportAbort("productos.json no es una lista de productos.");
  return data as PackageProduct[];
}

// ───────────────────────── Fotos ─────────────────────────

/** Primero las principales; dentro de cada grupo, por papel (artículo, embalaje, avatar, otro) y orden del paquete. */
const ROLE_ORDER: Record<string, number> = { articulo: 0, embalaje: 1, avatar: 2, entorno: 3, otro: 4 };

interface ValidPhoto {
  label: string;
  role: PhotoRole;
  bytes: Buffer;
  sha256: string;
}

interface PhotoPlan {
  toAdd: ValidPhoto[];
  rejected: { label: string; reason: string }[];
  noFile: { label: string; reason: string }[];
  alreadyThere: number;
  repeated: number;
  overLimit: number;
}

const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

/** Comprueba una foto del paquete con las reglas de la app y su sha256; devuelve la foto o el motivo del rechazo. */
async function loadPhoto(root: string, photo: PackagePhoto): Promise<ValidPhoto | { reason: string }> {
  if (!isPhotoRole(photo.role)) return { reason: `papel desconocido «${photo.role}»` };
  const full = path.resolve(root, photo.file!);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { reason: "la ruta sale de la carpeta del paquete" };
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(full);
  } catch {
    return { reason: `no está en el paquete (${photo.file})` };
  }
  const actual = sha256(bytes);
  if (!photo.sha256 || actual !== photo.sha256.toLowerCase()) {
    return { reason: "el sha256 del archivo no coincide con el de productos.json" };
  }
  try {
    checkPhotoBytes(bytes);
  } catch (error) {
    if (error instanceof HttpError) return { reason: error.message };
    throw error;
  }
  return { label: photo.label, role: photo.role, bytes, sha256: actual };
}

async function planPhotos(root: string, photos: PackagePhoto[], existing: Set<string>, existingCount: number): Promise<PhotoPlan> {
  const plan: PhotoPlan = { toAdd: [], rejected: [], noFile: [], alreadyThere: 0, repeated: 0, overLimit: 0 };
  const ordered = photos
    .map((photo, index) => ({ photo, index }))
    .sort(
      (a, b) =>
        Number(!!b.photo.primary) - Number(!!a.photo.primary) ||
        (ROLE_ORDER[a.photo.role] ?? 9) - (ROLE_ORDER[b.photo.role] ?? 9) ||
        a.index - b.index,
    )
    .map(({ photo }) => photo);
  const seen = new Set<string>();
  let room = Math.max(0, MAX_PHOTOS_PER_PRODUCT - existingCount);
  for (const photo of ordered) {
    if (!photo.file) {
      plan.noFile.push({ label: photo.label, reason: photo.missing || "sin archivo en el paquete" });
      continue;
    }
    const loaded = await loadPhoto(root, photo);
    if ("reason" in loaded) {
      plan.rejected.push({ label: photo.label, reason: loaded.reason });
    } else if (existing.has(loaded.sha256)) {
      plan.alreadyThere += 1;
    } else if (seen.has(loaded.sha256)) {
      plan.repeated += 1; // la misma imagen con otro papel en el paquete: se guarda una vez
    } else if (room === 0) {
      plan.overLimit += 1;
    } else {
      seen.add(loaded.sha256);
      plan.toAdd.push(loaded);
      room -= 1;
    }
  }
  return plan;
}

// ───────────────────────── Importación ─────────────────────────

type Outcome = "created" | "exists" | "skipped" | "failed";

export interface ProductResult {
  slug: string;
  name: string;
  outcome: Outcome;
  reason?: string;
  added: number;
}

/** Productos que ya hay, por nombre en minúsculas, con sus fotos cargadas al primer uso. */
interface Known {
  id: number | null; // null: se crearía en esta misma prueba
  name: string;
  hashes: Set<string> | null;
  photoCount: number; // puede ser mayor que `hashes.size` si ya hay dos fotos iguales
}

const key = (name: string) => name.normalize("NFC").trim().toLowerCase();

/**
 * `host:puerto/base` de `DATABASE_URL`, sin usuario ni contraseña. En Railway las bases públicas
 * comparten host (`*.proxy.rlwy.net`) y suelen llamarse `railway`: lo que las distingue es el puerto.
 */
export function databaseTarget(): string {
  try {
    const url = new URL(databaseUrl());
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${name}`;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Falta DATABASE_URL")) {
      throw new ImportAbort("Falta DATABASE_URL (la dirección de la base de datos de PRINCIPAL).");
    }
    throw new ImportAbort("DATABASE_URL no es una dirección válida.");
  }
}

/** Igual que `databaseTarget`: el host sin distinguir mayúsculas; puerto y base, tal cual. */
function normalizeTarget(text: string): string {
  const value = text.trim();
  const slash = value.indexOf("/");
  return slash < 0 ? value.toLowerCase() : value.slice(0, slash).toLowerCase() + value.slice(slash);
}

/** Tablas que solo tiene la base de PRINCIPAL. */
const PRINCIPAL_TABLES = ["products", "product_photos", "rule_versions", "spend_entries", "videos"];

/**
 * Se niega (ImportAbort) si la base no es la de PRINCIPAL: tiene tablas de Finanzas, le falta alguna
 * tabla propia de PRINCIPAL, no tiene el registro de migraciones de Drizzle o no tiene aplicada la
 * última migración de esta copia del código (mismo instante y misma huella). Abre su propia conexión.
 */
export async function checkPrincipalDatabase(
  url: string,
  migrationsFolder = path.resolve(process.cwd(), "drizzle"),
): Promise<void> {
  const latest = readMigrationFiles({ migrationsFolder }).at(-1);
  if (!latest) throw new Error(`No hay migraciones en ${migrationsFolder}.`);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    const tables = rows.map((row) => row.tablename);
    if (looksLikeFinanzas(tables)) {
      throw new ImportAbort("Esta base de datos es la de Finanzas, no la de PRINCIPAL. Nada cambiado.");
    }
    const missing = PRINCIPAL_TABLES.filter((table) => !tables.includes(table));
    if (missing.length) {
      throw new ImportAbort(`Esta base de datos no es la de PRINCIPAL (le falta: ${missing.join(", ")}). Nada cambiado.`);
    }
    const journal = await client.query<{ present: boolean }>(
      "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
    );
    if (!journal.rows[0]?.present) {
      throw new ImportAbort("Esta base de datos no tiene el registro de migraciones de PRINCIPAL. Nada cambiado.");
    }
    const applied = await client.query(
      "select 1 from drizzle.__drizzle_migrations where hash = $1 and created_at = $2",
      [latest.hash, latest.folderMillis],
    );
    if (applied.rowCount === 0) {
      throw new ImportAbort(
        "La base de PRINCIPAL no tiene la última migración de esta copia del código: actualiza la copia " +
          "(git pull) o espera a que Railway publique la versión nueva. Nada cambiado.",
      );
    }
  } finally {
    await client.end();
  }
}

async function findOwner(email: string): Promise<AuthUser> {
  const owner = await getActiveUserByEmail(email);
  if (!owner) {
    throw new ImportAbort(`No hay ninguna cuenta activa con el correo ${email} en esta base de datos. Revisa --dueno.`);
  }
  if (owner.role !== "dueno") throw new ImportAbort(`La cuenta ${email} no es la del dueño. Usa el correo del dueño.`);
  return owner;
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export async function main(argv: string[], io: { out: (line: string) => void } = { out: console.log }): Promise<number> {
  const out = io.out;
  try {
    const options = parseArgs(argv);
    const target = databaseTarget();
    if (options.aplicar) {
      if (!options.confirmoBase) {
        throw new ImportAbort(
          "Para escribir hace falta --confirmo-base <host:puerto/base> (lo muestra la prueba). Nada cambiado.",
        );
      }
      if (normalizeTarget(options.confirmoBase) !== target) {
        throw new ImportAbort("--confirmo-base no coincide con el host:puerto/base de DATABASE_URL. Nada cambiado.");
      }
    }
    await checkPrincipalDatabase(databaseUrl());
    const root = path.resolve(options.paquete);
    const all = await readPackage(root);
    const owner = await findOwner(options.dueno);
    const apply = options.aplicar;

    out(`Importar productos · ${apply ? "APLICAR (se escribe en la base)" : "PRUEBA (no se cambia nada)"} · base ${target}`);
    out(`Dueño: ${owner.name} <${owner.email}> · estados: ${[...options.estados].join(", ")}`);
    out(
      "Regla sin fotos: un producto sin ninguna foto válida se crea igual si tiene frase (las fotos se añaden después); " +
        "sin frase no se puede crear (la app la exige) y se omite.",
    );
    out("");

    const known = new Map<string, Known>();
    for (const p of [...(await listProductsFor(owner))].sort((a, b) => a.id - b.id)) {
      if (!known.has(key(p.name))) known.set(key(p.name), { id: p.id, name: p.name, hashes: null, photoCount: 0 });
    }

    const chosen = all.filter((p) => options.estados.has(effectiveStatus(p)));
    const results: ProductResult[] = [];
    const totals = { added: 0, alreadyThere: 0, repeated: 0, rejected: 0, noFile: 0, overLimit: 0 };
    const verb = apply
      ? { created: "CREADO  ", exists: "EXISTE  ", skipped: "OMITIDO ", failed: "FALLO   " }
      : { created: "CREARÍA ", exists: "EXISTE  ", skipped: "OMITIRÍA", failed: "FALLO   " };

    for (const p of chosen) {
      const label = `${p.name} (${p.slug})`;
      const result: ProductResult = { slug: p.slug, name: p.name, outcome: "skipped", added: 0 };
      results.push(result);
      try {
        let input;
        try {
          input = validateProductInput({
            name: p.name ?? "",
            summary: p.summary ?? "",
            language: p.language ?? undefined,
            countries: p.countries && p.countries.length > 0 ? p.countries : undefined,
          });
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          result.reason = error.message;
          out(`${verb.skipped} ${label} · ${error.message}`);
          continue;
        }

        let entry = known.get(key(input.name));
        const isNew = !entry;
        if (!entry) {
          entry = { id: null, name: input.name, hashes: new Set(), photoCount: 0 };
          known.set(key(input.name), entry);
        } else if (!entry.hashes) {
          const hashes = await listPhotoHashes(owner, entry.id!);
          entry.hashes = new Set(hashes);
          entry.photoCount = hashes.length;
        }
        const existingHashes = entry.hashes!;
        const plan = await planPhotos(root, p.photos ?? [], existingHashes, entry.photoCount);

        if (apply && isNew) {
          try {
            entry.id = (await createProduct(owner, input)).id;
          } catch (error) {
            known.delete(key(input.name));
            throw error;
          }
        }
        let added = 0;
        if (apply) {
          for (const photo of plan.toAdd) {
            // Una a una: si una falla, las anteriores quedan guardadas y se sabe cuántas van.
            try {
              await importProductPhotos(owner, entry.id!, [{ bytes: photo.bytes, role: photo.role }]);
              added += 1;
            } catch (error) {
              if (!(error instanceof HttpError)) throw error;
              plan.rejected.push({ label: photo.label, reason: error.message });
              continue;
            }
            existingHashes.add(photo.sha256);
            entry.photoCount += 1;
          }
        } else {
          added = plan.toAdd.length;
          plan.toAdd.forEach((photo) => existingHashes.add(photo.sha256));
          entry.photoCount += added;
        }

        result.outcome = isNew ? "created" : "exists";
        result.added = added;
        totals.added += added;
        totals.alreadyThere += plan.alreadyThere;
        totals.repeated += plan.repeated;
        totals.rejected += plan.rejected.length;
        totals.noFile += plan.noFile.length;
        totals.overLimit += plan.overLimit;

        const parts = [count(added, apply ? "foto añadida" : "foto a añadir", apply ? "fotos añadidas" : "fotos a añadir")];
        if (plan.alreadyThere) parts.push(`${plan.alreadyThere} ya estaban`);
        if (plan.repeated) parts.push(`${plan.repeated} repetidas en el paquete`);
        if (plan.rejected.length) parts.push(`${plan.rejected.length} rechazadas`);
        if (plan.noFile.length) parts.push(`${plan.noFile.length} sin archivo`);
        if (plan.overLimit) parts.push(`${plan.overLimit} fuera del máximo de ${MAX_PHOTOS_PER_PRODUCT}`);
        const notes: string[] = [];
        if (!isNew && entry.name !== p.name) notes.push(`ya existe como «${entry.name}»`);
        if (!p.language) notes.push(`idioma sin dato → ${input.language}`);
        if (!p.countries || p.countries.length === 0) notes.push(`países sin dato → ${input.countries.join("/")}`);
        if (isNew && entry.photoCount === 0) notes.push("sin fotos: se añaden después");
        out(`${isNew ? verb.created : verb.exists} ${label} · ${parts.join(", ")}${notes.length ? ` · ${notes.join("; ")}` : ""}`);
        for (const r of plan.rejected) out(`           foto ${r.label}: ${r.reason}`);
        for (const n of plan.noFile) out(`           foto ${n.label}: ${n.reason}`);
      } catch (error) {
        result.outcome = "failed";
        result.reason = describe(error);
        out(`${verb.failed} ${label} · ${redact(result.reason)}`);
      }
    }

    const by = (o: Outcome) => results.filter((r) => r.outcome === o).length;
    out("");
    out(
      `Resumen: ${by("created")} ${apply ? "creados" : "a crear"}, ${by("exists")} ya existían, ` +
        `${by("skipped")} omitidos, ${by("failed")} con fallo; ${all.length - chosen.length} fuera de los estados elegidos.`,
    );
    out(
      `Fotos: ${totals.added} ${apply ? "añadidas" : "a añadir"}, ${totals.alreadyThere} ya estaban, ` +
        `${totals.repeated} repetidas en el paquete, ${totals.rejected} rechazadas, ${totals.noFile} sin archivo, ` +
        `${totals.overLimit} fuera del máximo.`,
    );
    if (!apply) out(`Prueba: no se ha cambiado nada. Para escribir: añade --aplicar --confirmo-base ${target}`);
    return by("failed") > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof ImportAbort) {
      out(error.message);
      return 2;
    }
    out(`Error: ${redact(describe(error))}`);
    return 1;
  }
}

/** El mensaje de un error y el de su causa (Drizzle envuelve el fallo de conexión en «Failed query»). */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message || error.cause.name : "";
  return cause && !error.message.includes(cause) ? `${error.message.split("\n")[0]} (${cause})` : error.message;
}

/** Quita de un texto la dirección completa de la base y su contraseña, por si un error las incluyera. */
export function redact(text: string): string {
  const url = process.env.DATABASE_URL;
  if (!url) return text;
  let clean = text.split(url).join("<DATABASE_URL>");
  try {
    const password = decodeURIComponent(new URL(url).password);
    if (password) clean = clean.split(password).join("<contraseña>");
  } catch {
    // dirección no válida: no hay contraseña que quitar
  }
  return clean;
}

// Solo al lanzarlo con `tsx`, no al importarlo desde las pruebas.
if (/importar-productos\.[cm]?[jt]s$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .finally(async () => {
      // Sin DATABASE_URL no llegó a abrirse ninguna conexión.
      if (process.env.DATABASE_URL) await getPool().end();
    });
}
