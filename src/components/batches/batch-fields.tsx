"use client";

import { Check, ChevronDown, Images, Loader2, Package, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { avatarImageUrl, GROUP_LABELS, type AvatarJson } from "@/components/avatars/labels";
import { productLabel, type ProductView } from "@/components/products/labels";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AVATAR_MODE_LABELS, KIND_LABELS, KINDS } from "@/components/videos/brief-labels";
import type { ProductPhoto } from "@/components/videos/labels";
import { AVATAR_GROUPS, fold, type AvatarGroup } from "@/lib/avatar-groups";
import { batchCardAvatar } from "@/lib/default-avatar";
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

/** El avatar con el que empieza una fila: «Automático» (`batchCardAvatar`); uno concreto solo si se elige. */
export function defaultAvatarChoice(product: ProductView | undefined): AvatarChoice | null {
  if (!product) return null;
  return batchCardAvatar(product);
}

const photoUrl = (photoId: number) => `/api/fotos/${photoId}`;

/** Portada del producto (su primera foto de artículo) o un icono. */
export function ProductCover({ product, className }: { product: ProductView | undefined; className?: string }) {
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground ring-1 ring-foreground/[0.06]", className)}>
      {product?.coverPhotoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(product.coverPhotoId)} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Package className="size-1/3 max-h-6 max-w-6 min-h-4 min-w-4" aria-hidden />
      )}
    </span>
  );
}

/* ───────────────────────── Producto ───────────────────────── */

/**
 * Elegir el producto: una cuadrícula de portadas con búsqueda. El botón es la portada y el nombre
 * (o, sin producto, una invitación a elegirlo).
 */
export function ProductPicker({
  products,
  value,
  onChange,
  label = "Producto",
  className,
}: {
  products: ProductView[];
  value: number | null;
  onChange: (id: number) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = products.find((product) => product.id === value);
  const found = useMemo(() => {
    const q = fold(query.trim());
    return q ? products.filter((product) => fold(productLabel(product)).includes(q)) : products;
  }, [products, query]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={chosen ? `${label}: ${productLabel(chosen)}` : label}
          className={cn(
            "group/pp inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 -mx-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted",
            className,
          )}
        >
          <span className={cn("truncate", chosen ? "text-lg font-semibold tracking-tight" : "text-base font-medium text-muted-foreground")}>
            {chosen ? productLabel(chosen) : "Elige el producto"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/pp:rotate-180" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[30rem] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input autoFocus type="search" aria-label="Buscar producto" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0" />
          </div>
        </div>
        <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto p-2" aria-label="Productos">
          {found.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(product.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "group/item flex w-full flex-col gap-1.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  product.id === value && "bg-muted",
                )}
              >
                <ProductCover product={product} className={cn("aspect-square size-auto w-full rounded-md", product.id === value && "ring-pick")} />
                <span className="truncate px-0.5 text-xs font-medium">{productLabel(product)}</span>
              </button>
            </li>
          ))}
          {found.length === 0 ? <li className="col-span-3 py-8 text-center text-sm text-muted-foreground">Nada con «{query}»</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Compatibilidad: el antiguo selector de producto es ahora la cuadrícula de portadas. */
export const ProductSelect = ProductPicker;

/* ───────────────────────── Variantes ───────────────────────── */

/** Una variante como la manda el servidor. */
export interface VariantJson {
  id: number;
  name: string;
  articlePhotoIds: number[];
  packagingPhotoId: number | null;
}

/** Una muestra con foto, como las de color de una tienda: elegida, con anillo de marca. */
function Swatch({
  photoId,
  label,
  selected,
  onClick,
  className,
  readOnly,
}: {
  photoId: number | null;
  label: string;
  selected: boolean;
  onClick?: () => void;
  className?: string;
  readOnly?: boolean;
}) {
  const face = (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground ring-1 ring-foreground/10 transition-[box-shadow,transform] duration-150",
        !readOnly && "group-hover/sw:-translate-y-px group-hover/sw:shadow-raised",
        selected && "ring-pick",
        className,
      )}
    >
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(photoId)} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Images className="size-4" aria-hidden />
      )}
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {readOnly ? (
          <span role="img" aria-label={label} className="inline-flex">
            {face}
          </span>
        ) : (
          <button type="button" aria-label={label} aria-pressed={selected} onClick={onClick} className="group/sw rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {face}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const variantPhoto = (variant: VariantJson | undefined) => variant?.articlePhotoIds[0] ?? variant?.packagingPhotoId ?? null;

/**
 * Las variantes de un producto como muestras con foto: primero «Fotos de siempre» (la portada) y
 * luego cada variante. Sin variantes no se enseña nada.
 */
export function VariantSwatches({
  variants,
  coverPhotoId,
  value,
  onChange,
  className,
  swatchClassName,
}: {
  variants: VariantJson[];
  coverPhotoId: number | null;
  value: number | null;
  onChange: (variantId: number | null) => void;
  className?: string;
  swatchClassName?: string;
}) {
  if (variants.length === 0) return null;
  return (
    <div role="group" aria-label="Variante" className={cn("flex flex-wrap items-center gap-2", className)}>
      <Swatch photoId={coverPhotoId} label="Fotos de siempre" selected={value === null} onClick={() => onChange(null)} className={swatchClassName} />
      {variants.map((variant) => (
        <Swatch key={variant.id} photoId={variantPhoto(variant)} label={variant.name} selected={value === variant.id} onClick={() => onChange(variant.id)} className={swatchClassName} />
      ))}
    </div>
  );
}

/**
 * La variante de una tarjeta: su muestra en pequeño; al pulsarla, las mismas muestras en un
 * recuadro. Con `field`, un botón con la muestra y el nombre (para formularios).
 */
export function VariantPicker({
  variants,
  coverPhotoId = null,
  value,
  onChange,
  field = false,
  className,
}: {
  variants: VariantJson[];
  coverPhotoId?: number | null;
  value: number | null;
  onChange: (variantId: number | null) => void;
  field?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (variants.length === 0) return null;
  const chosen = variants.find((variant) => variant.id === value);
  const name = chosen?.name ?? "Fotos de siempre";
  const photo = chosen ? variantPhoto(chosen) : coverPhotoId;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Variante: ${name}`}
              className={cn(
                "group/vp inline-flex shrink-0 items-center gap-2 rounded-lg outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                field ? "h-9 border bg-background px-1.5 pr-2.5 text-sm hover:bg-muted dark:bg-input/30" : "p-0.5 hover:bg-muted",
                className,
              )}
            >
              <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground ring-1 ring-foreground/10">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(photo)} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <Images className="size-3.5" aria-hidden />
                )}
              </span>
              {field ? (
                <>
                  <span className="truncate">{name}</span>
                  <ChevronDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
                </>
              ) : null}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {field ? null : <TooltipContent>{name}</TooltipContent>}
      </Tooltip>
      <PopoverContent className="w-auto max-w-80 p-3" align="start" onOpenAutoFocus={(event) => event.preventDefault()}>
        <VariantSwatches
          variants={variants}
          coverPhotoId={coverPhotoId}
          value={value}
          onChange={(variantId) => {
            onChange(variantId);
            setOpen(false);
          }}
          swatchClassName="size-12"
        />
        <p className="mt-2.5 text-xs font-medium text-muted-foreground">{name}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Compatibilidad (pantalla del vídeo): la variante como campo con muestra y nombre. */
export function VariantSelect({
  variants,
  value,
  onChange,
  className,
  coverPhotoId = null,
}: {
  variants: VariantJson[];
  value: number | null;
  onChange: (variantId: number | null) => void;
  className?: string;
  coverPhotoId?: number | null;
}) {
  return <VariantPicker field variants={variants} coverPhotoId={coverPhotoId} value={value} onChange={onChange} className={cn("w-56", className)} />;
}

/* ───────────────────────── Avatar ───────────────────────── */

type ModeChoice = typeof AUTO | typeof KEEP | typeof NONE;

/** La cara elegida en redondo; «Automático», una chispa de marca; los demás modos, su icono. */
export function AvatarFace({ choice, className }: { choice: AvatarChoice | null; className?: string }) {
  const base = cn("relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full", className);
  if (choice === null) {
    return (
      <span className={cn(base, "bg-muted")}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando avatares" />
      </span>
    );
  }
  const src = typeof choice === "number" ? photoUrl(choice) : libraryIdOf(choice) !== null ? avatarImageUrl(libraryIdOf(choice)!) : null;
  if (src) {
    return (
      <span className={cn(base, "bg-muted ring-1 ring-foreground/10")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Avatar" className="absolute inset-0 size-full object-cover" />
      </span>
    );
  }
  const { label, icon: Icon } = AVATAR_MODE_LABELS[choice as ModeChoice];
  return (
    <span className={cn(base, choice === AUTO ? "bg-brand/12 text-brand-ink ring-1 ring-brand/25" : "bg-muted text-muted-foreground ring-1 ring-foreground/10")}>
      <Icon className="size-4" role="img" aria-label={label} />
    </span>
  );
}

/** Compatibilidad: el icono pequeño del avatar de una fila. */
export const AvatarBadge = AvatarFace;

const AGE_RANGES = [
  { key: "joven", label: "< 25", test: (age: number) => age < 25 },
  { key: "adulto", label: "25–40", test: (age: number) => age >= 25 && age < 40 },
  { key: "medio", label: "40–60", test: (age: number) => age >= 40 && age < 60 },
  { key: "mayor", label: "60+", test: (age: number) => age >= 60 },
] as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Una cara de la cuadrícula (3:4), con la edad en la esquina y el anillo si es la elegida. */
function FaceTile({ src, label, age, selected, product, onClick }: { src: string; label: string; age?: number | null; selected: boolean; product?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        "group/face relative aspect-[3/4] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 outline-none transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-raised focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "ring-pick",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover/face:scale-[1.03]" />
      {age !== undefined && age !== null ? (
        <span className="absolute top-1 right-1 rounded-full bg-black/55 px-1.5 text-[11px] leading-4 font-medium text-white tabular-nums backdrop-blur-sm">{age}</span>
      ) : null}
      {product ? (
        <span className="absolute top-1 left-1 grid size-4 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm" title="Foto del producto">
          <Package className="size-2.5" aria-hidden />
        </span>
      ) : null}
      {selected ? (
        <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm">
          <Check className="size-3" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

/** Un modo sin cara («Automático», «Sin sustitución», «Nadie»): icono y nombre corto. */
function ModeTile({ mode, selected, onClick, big = false }: { mode: ModeChoice; selected: boolean; onClick: () => void; big?: boolean }) {
  const { label, icon: Icon } = AVATAR_MODE_LABELS[mode];
  const short = mode === NONE ? "Nadie" : label;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium ring-1 outline-none transition-[box-shadow,background-color] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
        big
          ? "aspect-[3/4] flex-col bg-gradient-to-b from-brand/15 to-brand/5 text-brand-ink ring-brand/25 hover:from-brand/20"
          : "h-9 flex-1 bg-muted/60 text-muted-foreground ring-foreground/10 hover:bg-muted hover:text-foreground",
        selected && "ring-pick",
      )}
    >
      <Icon className={big ? "size-5" : "size-3.5"} aria-hidden />
      <span className={cn(big && "px-1 text-center leading-tight")}>{short}</span>
    </button>
  );
}

/**
 * Elegir quién sale: un recuadro con la cuadrícula de caras (las fotos de avatar del producto y
 * los avatares de la biblioteca), filtrable por grupo y edad. «Automático» es la primera casilla;
 * «Sin sustitución» y «Nadie», dos casillas pequeñas debajo. El botón es la cara elegida.
 */
export function AvatarPicker({
  avatars,
  loading,
  value,
  onChange,
  label = "Avatar",
  className,
  library,
  autoOption = library !== undefined,
  field = false,
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
  /** Botón de formulario (cara y nombre) en vez de solo la cara. */
  field?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<AvatarGroup | null>(null);
  const [age, setAge] = useState<string | null>(null);
  const groups = AVATAR_GROUPS.filter((g) => library?.some((avatar) => avatar.group === g));
  const ages = AGE_RANGES.filter((range) => library?.some((avatar) => avatar.ageYears !== null && range.test(avatar.ageYears)));
  const shown = (library ?? []).filter((avatar) => {
    if (group && avatar.group !== group) return false;
    const range = AGE_RANGES.find((r) => r.key === age);
    return !range || (avatar.ageYears !== null && range.test(avatar.ageYears));
  });
  const pick = (choice: AvatarChoice) => {
    onChange(choice);
    setOpen(false);
  };
  const chosenName = (() => {
    if (value === null) return label;
    if (typeof value === "number") return `Avatar ${avatars.findIndex((photo) => photo.id === value) + 1}`;
    const id = libraryIdOf(value);
    if (id !== null) return library?.find((avatar) => avatar.id === id)?.name ?? "Avatar";
    return AVATAR_MODE_LABELS[value as ModeChoice].label;
  })();

  if (loading && !field) return <AvatarFace choice={null} className={className} />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={loading}
              aria-label={`${label}: ${chosenName}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full outline-none transition-[box-shadow,background-color] focus-visible:ring-3 focus-visible:ring-ring/50",
                field ? "h-9 w-full rounded-lg border bg-background pr-2.5 pl-1 text-sm hover:bg-muted dark:bg-input/30" : "p-0.5 hover:ring-2 hover:ring-foreground/15 aria-expanded:ring-2 aria-expanded:ring-brand/50",
                className,
              )}
            >
              <AvatarFace choice={loading ? null : value} className={field ? "size-7" : undefined} />
              {field ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-left">{chosenName}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </>
              ) : null}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {field ? null : <TooltipContent>{chosenName}</TooltipContent>}
      </Tooltip>
      <PopoverContent className="flex w-[27rem] flex-col gap-3 p-3" align="end">
        {groups.length > 1 || ages.length > 1 ? (
          <div className="flex flex-col gap-2">
            {groups.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grupo">
                <Chip active={group === null} onClick={() => setGroup(null)}>
                  Todos
                </Chip>
                {groups.map((g) => (
                  <Chip key={g} active={group === g} onClick={() => setGroup(group === g ? null : g)}>
                    {GROUP_LABELS[g]}
                  </Chip>
                ))}
              </div>
            ) : null}
            {ages.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Edad">
                {ages.map((range) => (
                  <Chip key={range.key} active={age === range.key} onClick={() => setAge(age === range.key ? null : range.key)}>
                    {range.label}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="-mx-1 max-h-[22rem] overflow-y-auto px-1 py-1">
          <div className="grid grid-cols-5 gap-2">
            {autoOption ? <ModeTile big mode={AUTO} selected={value === AUTO} onClick={() => pick(AUTO)} /> : null}
            {avatars.map((photo, index) => (
              <FaceTile key={photo.id} product src={photoUrl(photo.id)} label={`Avatar ${index + 1} del producto`} selected={value === photo.id} onClick={() => pick(photo.id)} />
            ))}
            {shown.map((avatar) => (
              <FaceTile
                key={avatar.id}
                src={avatarImageUrl(avatar.id)}
                label={avatar.name}
                age={avatar.ageYears}
                selected={libraryIdOf(value) === avatar.id}
                onClick={() => pick(libraryChoice(avatar.id))}
              />
            ))}
          </div>
          {library && library.length > 0 && shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Ningún avatar con ese filtro</p> : null}
        </div>
        <div className="flex gap-2 border-t pt-3">
          <ModeTile mode={KEEP} selected={value === KEEP} onClick={() => pick(KEEP)} />
          <ModeTile mode={NONE} selected={value === NONE} onClick={() => pick(NONE)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Compatibilidad: el avatar como campo de formulario (cara y nombre). */
export function AvatarSelect(props: Omit<React.ComponentProps<typeof AvatarPicker>, "field">) {
  return <AvatarPicker {...props} field />;
}

/* ───────────────────────── Tipo ───────────────────────── */

/**
 * Tipo de vídeo como control segmentado con iconos (Replicar · Adaptación · Gancho). Con
 * `compact`, solo los iconos (el nombre, al pasar por encima).
 */
export function KindSegmented({
  value,
  onChange,
  className,
  label = "Tipo de vídeo",
  compact = false,
}: {
  value: VideoKind;
  onChange: (kind: VideoKind) => void;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <ToggleGroup type="single" aria-label={label} value={value} onValueChange={(v) => v && onChange(v as VideoKind)} className={className}>
      {KINDS.map((kind) => {
        const { short, long, icon: Icon } = KIND_LABELS[kind];
        const item = (
          <ToggleGroupItem key={kind} value={kind} aria-label={long} className={cn(compact && "px-2")}>
            <Icon className={cn(value === kind && (kind === "adaptacion_concepto" ? "text-kind-adapt" : kind === "solo_gancho" ? "text-kind-hook" : "text-brand"))} />
            {compact ? null : short}
          </ToggleGroupItem>
        );
        return compact ? (
          <Tooltip key={kind}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{long}</TooltipContent>
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup>
  );
}

/** Compatibilidad: el antiguo desplegable de tipo es ahora el control segmentado. */
export const KindSelect = KindSegmented;
