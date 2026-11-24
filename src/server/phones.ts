import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { HttpError } from "@/server/http";
import { getProductFor, saveProductDelegation } from "@/server/products";

export async function listPhones() {
  return getDb().select({ id: schema.phones.id, name: schema.phones.name, wdaUrl: schema.phones.wdaUrl, paused: schema.phones.paused, activity: schema.phones.activity, lastSeenAt: schema.phones.lastSeenAt, screenshotAt: schema.phones.screenshotAt }).from(schema.phones).orderBy(schema.phones.id);
}
const phoneInput = z.object({ name: z.string().trim().min(1).max(100).optional(), wdaUrl: z.url().nullable().optional(), paused: z.boolean().optional() }).strict();
export async function savePhone(user: AuthUser, id: number | null, raw: unknown) {
  const parsed = phoneInput.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Datos del móvil no válidos.");
  const input = parsed.data;
  if (user.role !== "dueno" && (id === null || input.name !== undefined || input.wdaUrl !== undefined)) throw new HttpError(403, "Solo el dueño puede configurar móviles.");
  if (input.wdaUrl && !["http:", "https:"].includes(new URL(input.wdaUrl).protocol)) throw new HttpError(400, "Dirección WDA no válida.");
  if (id === null) return getDb().insert(schema.phones).values({ ...input, name: input.name ?? "iPhone" }).returning({ id: schema.phones.id });
  const rows = await getDb().update(schema.phones).set(input).where(eq(schema.phones.id, id)).returning({ id: schema.phones.id });
  if (!rows.length) throw new HttpError(404, "Móvil no encontrado.");
  return rows;
}
const assignment = z.object({ phoneId: z.number().int().positive().nullable(), instagramAccount: z.string().trim().max(100).nullable(), facebookAccount: z.string().trim().max(100).nullable(), publishGapHours: z.number().int().min(1).max(12).default(3) }).strict();
export async function setProductPhone(user: AuthUser, productId: number, raw: unknown) {
  await getProductFor(user, productId);
  const parsed = assignment.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Móvil o cuentas no válidos.");
  const input = parsed.data;
  if (input.phoneId !== null) {
    const [phone] = await getDb().select({ id: schema.phones.id }).from(schema.phones).where(eq(schema.phones.id, input.phoneId));
    if (!phone) throw new HttpError(400, "Móvil no encontrado.");
  }
  await saveProductDelegation(productId, { ...input, instagramAccount: input.instagramAccount?.replace(/^@/, "").toLowerCase() || null, facebookAccount: input.facebookAccount?.toLowerCase() || null });
}

/** La última captura de la pantalla de un móvil (JPEG), o `null`. */
export async function phoneScreenshot(id: number): Promise<Buffer | null> {
  if (!Number.isSafeInteger(id)) return null;
  const [row] = await getDb().select({ screenshot: schema.phones.screenshot }).from(schema.phones).where(eq(schema.phones.id, id));
  return row?.screenshot ?? null;
}
