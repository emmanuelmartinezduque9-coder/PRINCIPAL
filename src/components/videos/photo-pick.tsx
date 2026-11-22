"use client";

import { Check, ImagePlus } from "lucide-react";
import Link from "next/link";
import { productTabHref, PHOTO_ROLE_LABELS } from "@/components/products/labels";
import { ROLE_ICONS, ROLE_TINT } from "@/components/products/photo-uploader";
import type { PhotoRole } from "@/lib/photo-roles";
import { cn } from "@/lib/utils";
import type { ProductPhoto } from "./labels";

/**
 * Elegir una foto del producto con un papel (avatar o entorno): las fotos con ese papel en
 * casillas; la elegida lleva un borde y una marca. Pulsar la elegida la quita. Sin fotos con ese
 * papel, un enlace a la pestaña Fotos. En solo lectura no se puede cambiar nada.
 */
export function PhotoPick({
  productId,
  role,
  photos,
  selectedId,
  onSelect,
  readOnly,
  dimmed,
}: {
  productId: number;
  role: Extract<PhotoRole, "avatar" | "entorno">;
  photos: ProductPhoto[];
  selectedId: number | null;
  onSelect: (photoId: number | null) => void;
  readOnly?: boolean;
  /** Se ve más apagado (p. ej. con «no aparece nadie»), pero se puede seguir eligiendo. */
  dimmed?: boolean;
}) {
  const options = photos.filter((photo) => photo.role === role);
  const Icon = ROLE_ICONS[role];
  const label = PHOTO_ROLE_LABELS[role];

  if (options.length === 0) {
    if (readOnly) return <p className="text-sm text-muted-foreground">—</p>;
    return (
      <Link
        href={productTabHref(productId, "fotos")}
        className="flex items-center gap-3 rounded-xl border-2 border-dashed px-3 py-4 text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", ROLE_TINT[role])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="flex-1">Añadir fotos de {label.toLowerCase()}</span>
        <ImagePlus className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    );
  }

  return (
    <ul role={readOnly ? undefined : "radiogroup"} aria-label={label} className={cn("grid grid-cols-3 gap-2", dimmed && "opacity-45")}>
      {options.map((photo, index) => {
        const selected = photo.id === selectedId;
        const image = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/fotos/${photo.id}`} alt="" className="absolute inset-0 size-full rounded-[inherit] object-cover" />
            {selected ? (
              <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-sm">
                <Check className="size-3.5" aria-hidden />
              </span>
            ) : null}
          </>
        );
        const ring = selected ? "ring-3 ring-foreground" : "ring-1 ring-foreground/10";
        return (
          <li key={photo.id}>
            {readOnly ? (
              <div className={cn("relative aspect-square rounded-lg bg-muted", ring, !selected && "opacity-40")} aria-label={selected ? `${label} elegido` : undefined}>
                {image}
              </div>
            ) : (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${label} ${index + 1}`}
                onClick={() => onSelect(selected ? null : photo.id)}
                className={cn(
                  "relative block aspect-square w-full rounded-lg bg-muted transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-3 focus-visible:ring-ring",
                  ring,
                )}
              >
                {image}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
