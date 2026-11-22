"use client";

import { Images, Loader2, Package } from "lucide-react";
import { avatarImageUrl, type AvatarJson } from "@/components/avatars/labels";
import { productLabel, type ProductView } from "@/components/products/labels";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AVATAR_MODE_LABELS, KIND_LABELS, KINDS } from "@/components/videos/brief-labels";
import type { ProductPhoto } from "@/components/videos/labels";
import { startingAvatar } from "@/lib/default-avatar";
import { cn } from "@/lib/utils";
import type { VideoKind } from "@/server/videos/brief";

/**
 * Quién sale en el selector de avatar: una foto del producto (su id), un avatar de la biblioteca
 * (`bib-<id>`), «Automático», «Sin sustitución» o «No aparece nadie».
 */
export const NONE = "nadie" as const;
export const KEEP = "sin_sustitucion" as const;
export const AUTO = "automatico" as const;
export type LibraryChoice = `bib-${number}`;
export type AvatarChoice = number | typeof NONE | typeof KEEP | typeof AUTO | LibraryChoice;

export const libraryChoice = (avatarId: number): LibraryChoice => `bib-${avatarId}`;
/** El id del avatar de la biblioteca de una elección, o `null`. */
export const libraryIdOf = (choice: AvatarChoice | null): number | null =>
  typeof choice === "string" && choice.startsWith("bib-") ? Number(choice.slice(4)) : null;

/** Lo que se manda al servidor para una elección: el modo, la foto y el avatar de la biblioteca. */
export function avatarBody(choice: AvatarChoice): { avatarMode: string; avatarPhotoId: number | null; avatarLibraryId: number | null } {
  if (typeof choice === "number") return { avatarMode: "elegido", avatarPhotoId: choice, avatarLibraryId: null };
  const library = libraryIdOf(choice);
  if (library !== null) return { avatarMode: "biblioteca", avatarPhotoId: null, avatarLibraryId: library };
  return { avatarMode: choice, avatarPhotoId: null, avatarLibraryId: null };
}

const parseChoice = (value: string): AvatarChoice =>
  value === NONE || value === KEEP || value === AUTO ? value : value.startsWith("bib-") ? (value as LibraryChoice) : Number(value);

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
  const library = libraryIdOf(choice);
  if (library !== null) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarImageUrl(library)} alt="Avatar" className={cn("size-6 rounded-full object-cover", className)} />;
  }
  const { label, icon: Icon } = AVATAR_MODE_LABELS[choice as typeof NONE | typeof KEEP | typeof AUTO];
  return <Icon className={cn("size-4 text-muted-foreground", className)} role="img" aria-label={label} />;
}

export function AvatarSelect({
  avatars,
  loading,
  value,
  onChange,
  label = "Avatar",
  className,
  library,
  autoOption = library !== undefined,
}: {
  avatars: ProductPhoto[];
  loading: boolean;
  value: AvatarChoice | null;
  onChange: (value: AvatarChoice) => void;
  label?: string;
  className?: string;
  /** Avatares de la biblioteca (no retirados) que también se pueden elegir. */
  library?: AvatarJson[];
  /** Ofrece «Automático». */
  autoOption?: boolean;
}) {
  if (loading) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando avatares" />;
  const modes: Array<typeof AUTO | typeof KEEP | typeof NONE> = [...(autoOption ? [AUTO] : []), KEEP, NONE];
  return (
    <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(parseChoice(v))}>
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
          {modes.map((mode) => {
            const { label, icon: Icon } = AVATAR_MODE_LABELS[mode];
            return (
              <SelectItem key={mode} value={mode}>
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {label}
              </SelectItem>
            );
          })}
        </SelectGroup>
        {library && library.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Biblioteca</SelectLabel>
            {library.map((avatar) => (
              <SelectItem key={avatar.id} value={libraryChoice(avatar.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarImageUrl(avatar.id)} alt="" className="size-6 rounded-full object-cover" />
                {avatar.name}
                {avatar.ageYears !== null ? <span className="text-muted-foreground tabular-nums">{avatar.ageYears}</span> : null}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  );
}

/** Una variante como la manda el servidor. */
export interface VariantJson {
  id: number;
  name: string;
  articlePhotoIds: number[];
  packagingPhotoId: number | null;
}

/** «Variante»: las fotos de siempre o una variante, con la miniatura de su primera foto. */
export function VariantSelect({
  variants,
  value,
  onChange,
  className,
}: {
  variants: VariantJson[];
  value: number | null;
  onChange: (variantId: number | null) => void;
  className?: string;
}) {
  const thumb = (variant: VariantJson) =>
    variant.articlePhotoIds[0] ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/fotos/${variant.articlePhotoIds[0]}`} alt="" className="size-6 rounded object-cover" />
    ) : (
      <Images className="size-4 text-muted-foreground" aria-hidden />
    );
  return (
    <Select value={value === null ? "todas" : String(value)} onValueChange={(v) => onChange(v === "todas" ? null : Number(v))}>
      <SelectTrigger aria-label="Variante" className={cn("h-9 w-full min-w-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="todas">
            <Images className="size-4 text-muted-foreground" aria-hidden />
            Fotos de siempre
          </SelectItem>
          {variants.map((variant) => (
            <SelectItem key={variant.id} value={String(variant.id)}>
              {thumb(variant)}
              {variant.name}
            </SelectItem>
          ))}
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
