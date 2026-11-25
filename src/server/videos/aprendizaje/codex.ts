import { createHash } from "node:crypto";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { prohibitsThirdParty } from "@/lib/mejoras";
import { listCerebroProducts } from "@/server/products";
import type { Stage } from "./preferencias";

/**
 * Las decisiones reales de Emmanuel en la automatización de Codex (`/Volumes/T7/AUTOMATIZACION SEGA`, su CEREBRO y las
 * skills de Codex), cargadas con su consentimiento expreso del 26/11/2026. Cada una entra como señal (`kind = codex`,
 * con su fecha, archivo y cita) y, si es una regla o instrucción suya, como preferencia con su ámbito real: del producto
 * en que la dio o general solo si él la dio para todos. Nada que prohíba marcas de terceros y nada inventado: la
 * directiva es la de su cita.
 */

const STAGES = ["desglose", "imagen", "pinterest", "clip", "rotulos", "doblaje", "montaje"] as const;
export const codexDecisionsSchema = z.object({
  version: z.literal(1),
  decisions: z.array(
    z.object({
      id: z.string().min(1).max(200),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      archivo: z.string().min(1).max(1000),
      linea: z.number().int().nullable().optional(),
      cita: z.string().min(1).max(2000),
      tipo: z.enum(["regla", "rechazo", "aprobacion", "instruccion"]),
      producto: z.string().nullable(),
      general: z.boolean(),
      evidencia_general: z.string().nullable().optional(),
      pasos: z.array(z.enum(STAGES)).min(1),
      directiva: z.string().min(1).max(600),
      directiva_en: z.string().min(1).max(600),
      tema: z.string().min(1).max(100),
    }),
  ),
});
export type CodexDecisions = z.infer<typeof codexDecisionsSchema>;

export interface CodexLoadReport {
  signals: number;
  preferences: number;
  general: number;
  byProduct: Record<string, number>;
  skipped: Array<{ id: string; reason: string }>;
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Idempotente: la misma decisión (por su id) no se carga dos veces. */
export async function loadCodexDecisions(input: unknown, ownerId: number): Promise<CodexLoadReport> {
  const data = codexDecisionsSchema.parse(input);
  const products = await listCerebroProducts();
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));
  const report: CodexLoadReport = { signals: 0, preferences: 0, general: 0, byProduct: {}, skipped: [] };
  const db = getDb();
  for (const d of data.decisions) {
    // Regla fija del dueño: en marketing orgánico se permiten marcas, tiendas, películas y personajes de terceros.
    if (prohibitsThirdParty(d.directiva) || prohibitsThirdParty(d.directiva_en)) {
      report.skipped.push({ id: d.id, reason: "Prohíbe o quita marcas de terceros (regla fija: se permiten)." });
      continue;
    }
    const general = d.general && !!d.evidencia_general?.trim();
    const product = d.producto ? byName.get(d.producto.toLowerCase()) ?? null : null;
    const ref = { fecha: d.fecha, archivo: d.archivo, linea: d.linea ?? null, cita: d.cita.slice(0, 600) };
    const polarity = d.tipo === "rechazo" ? -1 : d.tipo === "aprobacion" ? 1 : 0;
    const sourceKey = `codex:${createHash("sha1").update(d.id).digest("hex").slice(0, 16)}`;
    const [signal] = await db
      .insert(schema.learningSignals)
      .values({
        sourceKey,
        kind: "codex",
        stage: d.pasos[0],
        polarity,
        productId: product?.id ?? null,
        country: product?.countries[0] ?? "",
        userId: ownerId,
        text: d.cita.slice(0, 4000),
        value: { origen: "Codex", tipo: d.tipo, ...ref, directiva: d.directiva, general },
        topic: d.tema,
        occurredAt: d.fecha ? new Date(`${d.fecha}T12:00:00Z`) : new Date(),
        // Ya es una decisión suya con su directiva: no pasa por el destilado.
        distilledAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.learningSignals.sourceKey })
      .returning();
    if (signal) report.signals += 1;
    // Lo que aprobó o rechazó sin dar una regla queda como señal; preferencias, solo sus reglas e instrucciones.
    if (d.tipo !== "regla" && d.tipo !== "instruccion") continue;
    if (!general && !product) {
      report.skipped.push({ id: d.id, reason: d.producto ? `El producto «${d.producto}» no está en PRINCIPAL: queda como señal.` : "Sin producto ni evidencia de que sea general: queda como señal." });
      continue;
    }
    const scope = general ? "global" : "producto";
    const scopeValue = general ? "" : String(product!.id);
    const stages = [...new Set(d.pasos)].sort() as Stage[];
    const key = `codex:${slug(d.tema)}:${scope}:${scopeValue}:${stages.join(",")}:${sourceKey.slice(6, 12)}`;
    const ids = signal ? [signal.id] : [];
    const inserted = await db
      .insert(schema.learnedPreferences)
      .values({
        key,
        scope,
        scopeValue,
        stages,
        directive: d.directiva.slice(0, 1000),
        directiveEn: d.directiva_en.slice(0, 1000),
        polarity: 1,
        topic: slug(d.tema) || "codex",
        // Una regla que él mismo dio: empieza con confianza, y el peso sube o baja con lo que apruebe o corrija.
        supports: 2,
        weight: 0.75,
        sourceSignalIds: ids,
        origin: "codex",
        originRef: ref,
        explicitGeneral: general,
      })
      .onConflictDoNothing({ target: schema.learnedPreferences.key })
      .returning({ id: schema.learnedPreferences.id });
    if (inserted.length) {
      report.preferences += 1;
      if (general) report.general += 1;
      else report.byProduct[product!.name] = (report.byProduct[product!.name] ?? 0) + 1;
    }
  }
  return report;
}
