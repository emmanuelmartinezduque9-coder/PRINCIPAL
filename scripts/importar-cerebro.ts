/**
 * --leer --salida <json>: solo lectura en este Mac.
 * --cargar <json>: únicamente JSON y base de datos; apto para railway ssh.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { historicalSchema, type HistoricalData } from "../src/server/videos/cerebro/importacion";

const ROOT = "/Volumes/T7/AUTOMATIZACION SEGA";
const own: Record<string, string | null> = {
  eiswerrk: "EisWerk", siilvenaa: null, haarzauberr: "HaarZauber", itswollzauber: "WollZauber",
  targetalarmm: "TargetAlarm", ziellwecker: "ZielAlarm",
  blitzkumpel: null, boucle_malice: "BoucleMalice", faltliebling: "FaltLiebling", glacemalice: "GlaceMalice",
  wichtelwitz: "WichtelWitz", reisekuscheln: "ReiseKuscheln", zehenwonne: "ZehenWonne",
};
type Row = Record<string, unknown>;
const obj = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const num = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
function instant(v: unknown): string | null {
  const date = typeof v === "number" ? new Date(v * 1000) : typeof v === "string" ? new Date(v) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function views(v: unknown): number | null {
  if (typeof v === "number") return num(v);
  const m = str(v)?.replace(/\s/g, "").match(/^([\d.,]+)(mil|k|m|mio\.?)?$/i);
  if (!m) return null;
  return Math.round(Number(m[1].replace(",", ".")) * (/^(m|mio\.?)$/i.test(m[2]) ? 1e6 : m[2] ? 1000 : 1));
}

/** Fuentes con adaptadores explícitos; los encargos se informan sin adjudicarlos a publicaciones. */
export async function readHistorical(root = ROOT): Promise<HistoricalData> {
  const data: HistoricalData = { version: 1, observations: [], requestedDna: [], discarded: [] };
  const { stdout } = await promisify(execFile)("rg", ["--files", root, "-g", "*.info.json", "-g", "profile-metrics.json", "-g", "morning-observations.json", "-g", "!._*"], { maxBuffer: 8 * 1024 * 1024 });
  const files = stdout.trim().split("\n").filter(Boolean).sort();
  files.push(path.join(root, "Analisis/EisWerk-virales-2026-11-20/ranking.json"),
    path.join(root, "ControlProductosCentral/actualizacion-instagram-20261104.json"));
  for (const file of files) {
    let bytes: Buffer, source: Row;
    try { bytes = await fs.readFile(file); source = obj(JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""))); }
    catch { data.discarded.push({ path: file, reason: "Fuente ausente o JSON inválido" }); continue; }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const add = (r: { handle: string; url: string; observed: unknown; published?: unknown; views?: unknown; comments?: unknown; likes?: unknown; caption?: unknown; rounded?: boolean; evidence?: Row; age?: number | null }) => {
      const observedAt = instant(r.observed);
      if (!observedAt) { data.discarded.push({ path: file, reason: "Sin fecha de observación documentada" }); return; }
      const publishedAt = instant(r.published);
      const handle = r.handle.replace(/^@/, "").toLowerCase();
      if (!/^[\w.]+$/.test(handle)) { data.discarded.push({ path: file, reason: "Cuenta no identificada" }); return; }
      const age = publishedAt ? (Date.parse(observedAt) - Date.parse(publishedAt)) / 3600000 : r.age ?? null;
      data.observations.push({
        network: "instagram", handle, kind: handle in own ? "propia" : "competidor", product: own[handle] ?? null,
        url: r.url, observedAt, publishedAt, caption: str(r.caption), views: views(r.views), comments: num(r.comments), likes: num(r.likes),
        rounded: r.rounded ?? false, ageHours: typeof r.observed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.observed) ? r.age ?? null : age !== null && age >= 0 ? age : null,
        source: file.endsWith(".info.json") ? "yt-dlp" : path.basename(file), path: file, sha256,
        evidence: { ...r.evidence, observed_precision: typeof r.observed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.observed) ? "día" : "instante" }, dna: null,
      });
    };
    if (file.endsWith(".info.json")) {
      const url = str(source.webpage_url) ?? "";
      if (!url.includes("instagram.com/")) { data.discarded.push({ path: file, reason: "No es Instagram" }); continue; }
      const handle = url.match(/instagram\.com\/([^/]+)\/(?:reel|p)\//)?.[1] ?? str(source.channel) ?? str(source.uploader) ?? "";
      add({ handle, url, observed: source.epoch, published: source.timestamp, views: source.view_count,
        comments: source.comment_count, likes: source.like_count, caption: source.description,
        evidence: { timestamp: source.timestamp, epoch: source.epoch, uploader_id: source.uploader_id } });
    } else if (file.endsWith("profile-metrics.json")) {
      const handle = str(source.account_url)?.match(/instagram\.com\/([^/]+)/)?.[1] ?? "";
      for (const value of arr(source.metrics)) {
        const r = obj(value);
        add({ handle, url: str(r.url) ?? "", observed: source.observed_at, views: r.views_display_approx ?? r.views_approx ?? r.views,
          rounded: true, evidence: { ...r, method: source.method } });
      }
    } else if (file.endsWith("ranking.json")) {
      for (const value of arr(source.top10)) {
        const r = obj(value);
        add({ handle: "eiswerrk", url: str(r.url) ?? "", observed: source.observed_date, views: r.views, rounded: true,
          evidence: { ...r, date_precision: "día" } });
      }
    } else if (Array.isArray(source.accounts)) {
      for (const value of source.accounts) {
        const account = obj(value);
        const handle = str(account.profile)?.match(/instagram\.com\/([^/]+)/)?.[1] ?? "";
        for (const value of arr(account.observations)) {
          const r = obj(value);
          add({ handle, url: `https://www.instagram.com/${handle}/reel/${r.reel}/`, observed: source.observed_at,
            published: r.published_at, views: r.views_display, likes: views(r.likes_display), rounded: /[a-z]/i.test(str(r.views_display) ?? ""),
            evidence: r });
        }
      }
    } else if (source.accounts) {
      for (const value of Object.values(obj(source.accounts))) {
        const account = obj(value);
        for (const value of arr(account.reels)) {
          const pair = arr(value), handle = str(account.handle) ?? "";
          add({ handle, url: `https://www.instagram.com/${handle}/reel/${pair[0]}/`, observed: source.checked, views: pair[1],
            evidence: { note: account.note }, rounded: Number(pair[1]) >= 10000 });
        }
      }
    } else {
      for (const value of [...arr(source.verified), ...arr(source.verified_delivery_metrics)]) {
        const r = obj(value), url = str(r.url) ?? (r.reel === "DfIDEW1sd8b" ? "https://www.instagram.com/ziellwecker/reel/DfIDEW1sd8b/" : "");
        const handle = url.match(/instagram\.com\/([^/]+)\//)?.[1] ?? "";
        add({ handle, url, observed: r.observed_at ?? source.observed_at ?? source.date_madrid,
          published: r.published_at ?? (url.includes("DfIDEW1sd8b") ? "2026-10-30T16:49:14Z" : null),
          views: r.views_display, rounded: true, age: str(r.age_display)?.match(/([\d.]+)\s*h/) ? Number(str(r.age_display)!.match(/([\d.]+)\s*h/)![1]) : null, evidence: { ...r, date_precision: r.observed_at || source.observed_at ? "instante" : "día" } });
      }
      if (!source.verified && !source.verified_delivery_metrics) data.discarded.push({ path: file, reason: "Revisión sin observación atribuible verificada" });
    }
  }
  // El vínculo entrega→publicación está verificado solo para este reel.
  const manifestPath = path.join(root, "SplitTesting-20261029/pilot-six/stage2-corrected/delivery-correcciones/manifest.json");
  try {
    const manifestBytes = await fs.readFile(manifestPath);
    const delivery = arr(obj(JSON.parse(manifestBytes.toString())).items).map(obj).find((r) => r.delivery_id === "ZielAlarm-20261029-02-corregido");
    if (delivery && typeof delivery.recipe === "string") {
      const recipeBytes = await fs.readFile(delivery.recipe);
      const hash = createHash("sha256").update(recipeBytes).digest("hex");
      if (hash !== delivery.recipe_sha256) throw new Error("SHA de receta incompatible");
      const item = obj(arr(obj(JSON.parse(recipeBytes.toString())).items)[0]);
      const text = arr(item.captions).map((c) => str(obj(obj(c).cue).text)).filter(Boolean).join("\n");
      for (const observation of data.observations.filter((r) => r.url.includes("DfIDEW1sd8b"))) {
        observation.dna = { angulo: "desconocido", fondo: "desconocido", texto: text, cancion: "desconocido" };
        observation.evidence.delivery = { path: manifestPath, sha256: createHash("sha256").update(manifestBytes).digest("hex"), delivery_id: delivery.delivery_id, recipe: delivery.recipe, recipe_sha256: hash };
      }
    }
  } catch (error) { data.discarded.push({ path: manifestPath, reason: String(error) }); }
  const orders = path.join(root, "TEST_PRODUCTOS_APP/emmanuel");
  for (const file of await fs.readdir(orders)) {
    if (/^[a-f0-9-]{36}\.json$/.test(file)) {
      const orderPath = path.join(orders, file);
      const bytes = await fs.readFile(orderPath);
      const order = obj(JSON.parse(bytes.toString("utf8")));
      data.requestedDna.push({ path: orderPath, sha256: createHash("sha256").update(bytes).digest("hex"),
        data: { id: order.id, reference: order.url, country: order.country, message: order.message,
          songs: order.songs ?? [], slots: order.slots ?? [], slot_backgrounds: order.slot_backgrounds ?? null,
          sales_angles: order.sales_angles ?? null, hook_selection: order.hook_selection ?? null,
          video_instructions: order.video_instructions ?? null, association_verified: false } });
      const requested = data.requestedDna[data.requestedDna.length - 1];
      const attachments = [];
      for (const related of [path.join(orders, file.replace(".json", ".progress.json")), path.join(orders, file.replace(".json", ""), "frame-admission-request.json")]) {
        try {
          const bytes = await fs.readFile(related), record = obj(JSON.parse(bytes.toString("utf8")));
          attachments.push({ path: related, sha256: createHash("sha256").update(bytes).digest("hex"),
            slots: record.slots ?? null, songs: record.songs ?? null, slot_backgrounds: record.slot_backgrounds ?? null,
            hooks: record.hook_selection ?? null, accounts: record.accounts ?? null, market: record.market ?? null,
            association_verified: false });
        } catch { /* Expediente opcional: no acredita publicación aunque exista. */ }
      }
      requested.data.attachments = attachments;
      data.discarded.push({ path: orderPath, reason: "ADN pedido sin asociación verificable con una publicación; no se une por referencia" });
    }
  }
  // La publicación conocida completa fechas de otras capturas, nunca sus contadores.
  const dates = new Map(data.observations.filter((r) => r.publishedAt).map((r) => [r.url.match(/\/(?:reel|p)\/([\w-]+)/)?.[1], r.publishedAt]));
  for (const r of data.observations) {
    r.publishedAt ??= dates.get(r.url.match(/\/(?:reel|p)\/([\w-]+)/)?.[1]) ?? null;
    if (r.publishedAt && r.evidence.observed_precision !== "día") { const age = (Date.parse(r.observedAt) - Date.parse(r.publishedAt)) / 3600000; r.ageHours = age >= 0 ? age : null; }
  }
  const unique = new Map<string, HistoricalData["observations"][number]>();
  for (const observation of data.observations) {
    const shortcode = observation.url.match(/\/(?:reel|p)\/([\w-]+)/)?.[1];
    const key = [observation.network, shortcode, observation.observedAt, observation.source, observation.sha256].join(":");
    const previous = unique.get(key);
    if (previous) {
      previous.evidence.duplicate_paths = [...arr(previous.evidence.duplicate_paths), observation.path];
      data.discarded.push({ path: observation.path, reason: "Captura idéntica duplicada (mismo SHA, reel y fecha)" });
    } else unique.set(key, observation);
  }
  data.observations = [...unique.values()];
  return historicalSchema.parse(data);
}
export function historicalReport(data: HistoricalData) {
  return { accounts: new Set(data.observations.map((r) => r.network + ":" + r.handle)).size,
    ownAccounts: new Set(data.observations.filter((r) => r.kind === "propia").map((r) => r.handle)).size,
    posts: new Set(data.observations.map((r) => r.url.match(/\/(?:reel|p)\/([\w-]+)/)?.[1])).size,
    metrics: data.observations.length, discarded: data.discarded.length };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--leer")) {
    const output = args[args.indexOf("--salida") + 1];
    if (!args.includes("--salida") || !output) throw new Error("Falta --salida <json>");
    const data = await readHistorical();
    await fs.writeFile(output, JSON.stringify(data, null, 2));
    console.log(JSON.stringify(historicalReport(data), null, 2));
  } else if (args.includes("--cargar")) {
    const file = args[args.indexOf("--cargar") + 1];
    const { loadHistorical } = await import("../src/server/videos/cerebro/importacion");
    console.log(JSON.stringify(await loadHistorical(JSON.parse(await fs.readFile(file, "utf8"))), null, 2));
    const { getPool } = await import("../src/db/client");
    await getPool().end();
  } else throw new Error("Usa --leer --salida <json> o --cargar <json>");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error(e); process.exitCode = 1; });
