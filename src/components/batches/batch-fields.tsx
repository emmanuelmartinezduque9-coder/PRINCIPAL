"use client";

import { Loader2, Package } from "lucide-react";
import { productLabel, type ProductView } from "@/components/products/labels";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVATAR_MODE_LABELS, KIND_LABELS, KINDS } from "@/components/videos/brief-labels";
import type { ProductPhoto } from "@/components/videos/labels";
import { startingAvatar } from "@/lib/default-avatar";
import { cn } from "@/lib/utils";
import type { VideoKind } from "@/server/videos/brief";

/** «No aparece nadie» y «Sin sustitución» en el selector de avatar (las fotos van por su id). */
export const NONE = "nadie";
export const KEEP = "sin_sustitucion";
export type AvatarChoice = number | typeof NONE | typeof KEEP;

/** El avatar con el que empieza una fila: el habitual del producto (`startingAvatar`). */
export function defaultAvatarChoice(product: ProductView | undefined, avatars: ProductPhoto[]): AvatarChoice | null {
  if (!product) return null;
  const start = startingAvatar(product, avatars.map((photo) => photo.id));
  return start.avatarMode === "elegido" ? start.avatarPhotoId! : start.avatarMode;
}

/** Portada del producto (su primera foto de artículo) o un icono. */
export function ProductCover({ product, className }: { product: ProductView | undefined; className?: string }) {
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground", className)}>
      {product?.coverPhotoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/fotos/${product.coverPhotoId}`} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Package className="size-4" aria-hidden />
      )}
    </span>
  );
}

export function ProductSelect({
  products,
  value,
  onChange,
  label,
  className,
}: {
  products: ProductView[];
  value: number | null;
  onChange: (id: number) => void;
  label?: string;
  className?: string;
}) {
  return (
    <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-label={label} className={cn("h-9 w-full min-w-0", className)}>
        <SelectValue placeholder="Elige el producto" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {products.map((product) => (
            <SelectItem key={product.id} value={String(product.id)}>
              {productLabel(product)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** La foto del avatar o el icono del modo, en pequeño. */
export function AvatarBadge({ choice, className }: { choice: AvatarChoice | null; className?: string }) {
  if (choice === null) return <Loader2 className={cn("size-4 animate-spin text-muted-foreground", className)} aria-label="Cargando avatares" />;
  if (typeof choice === "number") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/fotos/${choice}`} alt="Avatar" className={cn("size-6 rounded-full object-cover", className)} />;
  }
  const { label, icon: Icon } = AVATAR_MODE_LABELS[choice];
  return <Icon className={cn("size-4 text-muted-foreground", className)} role="img" aria-label={label} />;
}

export function AvatarSelect({
  avatars,
  loading,
  value,
  onChange,
  label = "Avatar",
  className,
}: {
  avatars: ProductPhoto[];
  loading: boolean;
  value: AvatarChoice | null;
  onChange: (value: AvatarChoice) => void;
  label?: string;
  className?: string;
}) {
  if (loading) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando avatares" />;
  return (
    <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(v === NONE || v === KEEP ? v : Number(v))}>
      <SelectTrigger aria-label={label} className={cn("h-9 w-full min-w-0", className)}>
        <SelectValue placeholder="Avatar" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {avatars.map((photo, index) => (
            <SelectItem key={photo.id} value={String(photo.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/fotos/${photo.id}`} alt="" className="size-6 rounded-full object-cover" />
              Avatar {index + 1}
            </SelectItem>
          ))}
          {([KEEP, NONE] as const).map((mode) => {
            const { label, icon: Icon } = AVATAR_MODE_LABELS[mode];
            return (
              <SelectItem key={mode} value={mode}>
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {label}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Tipo de la fila: en la lista, el nombre entero; en la fila, el corto (cabe en la columna). */
export function KindSelect({
  value,
  onChange,
  className,
  label = "Tipo de vídeo",
}: {
  value: VideoKind;
  onChange: (kind: VideoKind) => void;
  className?: string;
  label?: string;
}) {
  const { short, long, icon: Icon } = KIND_LABELS[value];
  return (
    <Select value={value} onValueChange={(v) => onChange(v as VideoKind)}>
      <SelectTrigger aria-label={label} title={long} className={cn("h-9 w-full min-w-0", className)}>
        <SelectValue>
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {short}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {KINDS.map((kind) => {
            const { long, icon: Icon } = KIND_LABELS[kind];
            return (
              <SelectItem key={kind} value={kind}>
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {long}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
