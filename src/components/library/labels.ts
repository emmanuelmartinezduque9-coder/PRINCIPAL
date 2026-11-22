import type { Serialized } from "@/lib/api";
import type { ProductBody } from "@/server/videos/bodies";
import type { LibraryPage } from "@/server/videos/library";

/** La biblioteca tal como llega por JSON (`GET /api/biblioteca`). */
export type LibraryPageJson = Serialized<LibraryPage>;
export type LibraryClipJson = LibraryPageJson["clips"][number];
/** Un cuerpo de un producto (`GET /api/productos/[id]/cuerpos`). */
export type ProductBodyJson = Serialized<ProductBody>;

/** Clips por página en la pantalla (múltiplo de 2, 3, 4, 6 y 8: filas completas con las columnas habituales). */
export const LIBRARY_PAGE = 96;

/** Lo mismo que admite el servidor (`MAX_LABEL` en `src/server/videos/bodies.ts`). */
export const MAX_BODY_LABEL = 60;

/** Clave de la consulta de los cuerpos de un producto. */
export const bodiesKey = (productId: number) => ["bodies", productId] as const;

/** Dirección para descargar un cuerpo. */
export const bodyDownloadUrl = (bodyId: number) => `/api/cuerpos/${bodyId}/descargar`;
