/**
 * Imágenes de referencia subidas a mano (orden del dueño, 24/11/2026): su papel y cómo se guardan en
 * el borrador (huella + papel). Lógica pura, la comparten la pantalla y el borrador del lote.
 */

export const REFERENCE_ROLES = ["fondo", "ambiente", "ropa", "realismo", "otro"] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export interface ReferenceImage {
  sha256: string;
  role: ReferenceRole;
}

export const REFERENCE_ROLE_LABELS: Record<ReferenceRole, string> = {
  fondo: "Fondo / sala",
  ambiente: "Ambiente",
  ropa: "Ropa",
  realismo: "Realismo",
  otro: "Otra",
};

export const MAX_REFERENCE_IMAGES = 6;

export const referenceThumbUrl = (sha256: string) => `/api/pinterest/${sha256}`;

export const isReferenceImage = (value: unknown): value is ReferenceImage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ReferenceImage).sha256 === "string" &&
  /^[0-9a-f]{64}$/.test((value as ReferenceImage).sha256) &&
  (REFERENCE_ROLES as readonly string[]).includes((value as ReferenceImage).role);
