"use client";

import { useQuery } from "@tanstack/react-query";
import { BookmarkPlus, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_HOOK_SECONDS, MAX_VIDEO_BODIES, MIN_HOOK_SECONDS } from "@/components/videos/brief-labels";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ClipPreview, useHoverPreview } from "./clip-preview";
import { bodiesKey, type ProductBodyJson } from "./labels";

/** Los cuerpos de un producto (los comparten el selector, el tablero y la biblioteca). */
export function useProductBodies(productId: number | null) {
  return useQuery({
    queryKey: bodiesKey(productId ?? 0),
    queryFn: () => api<{ bodies: ProductBodyJson[] }>(`/api/productos/${productId}/cuerpos`),
    enabled: productId !== null,
    staleTime: 30_000,
  });
}

/**
 * «Duración del gancho»: de 2 a 8 segundos, con − y + o con las flechas del teclado. En los
 * extremos el botón que ya no puede seguir se apaga.
 */
export function HookStepper({ value, onChange, disabled, className }: { value: number; onChange: (seconds: number) => void; disabled?: boolean; className?: string }) {
  const set = (next: number) => {
    const clamped = Math.min(MAX_HOOK_SECONDS, Math.max(MIN_HOOK_SECONDS, next));
    if (clamped !== value && !disabled) onChange(clamped);
  };
  const button =
    "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className={cn("inline-flex h-8 w-fit shrink-0 items-center rounded-lg bg-muted p-0.5", className)}>
      <button type="button" tabIndex={-1} aria-label="Un segundo menos" className={button} disabled={disabled || value <= MIN_HOOK_SECONDS} onClick={() => set(value - 1)}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label="Duración del gancho"
        aria-valuenow={value}
        aria-valuemin={MIN_HOOK_SECONDS}
        aria-valuemax={MAX_HOOK_SECONDS}
        aria-valuetext={`${value} segundos`}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
          if (step !== undefined) {
            event.preventDefault();
            set(value + step);
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            set(event.key === "Home" ? MIN_HOOK_SECONDS : MAX_HOOK_SECONDS);
          }
        }}
        className="min-w-10 rounded-md px-1 text-center text-sm font-medium tabular-nums outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {value} s
      </span>
      <button type="button" tabIndex={-1} aria-label="Un segundo más" className={button} disabled={disabled || value >= MAX_HOOK_SECONDS} onClick={() => set(value + 1)}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Una miniatura de cuerpo: al pasar por encima se ve el vídeo; elegida, lleva su número de orden. */
function BodyThumb({
  body,
  order,
  count,
  readOnly,
  full,
  onToggle,
  onMove,
}: {
  body: ProductBodyJson;
  /** Posición entre los elegidos (1, 2…) o `null` si no está elegido. */
  order: number | null;
  count: number;
  readOnly: boolean;
  /** Ya no caben más: los no elegidos no se pueden añadir. */
  full: boolean;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const preview = useHoverPreview();
  const picked = order !== null;
  const frame = cn(
    "relative block aspect-[9/16] w-full overflow-hidden rounded-md bg-muted outline-none",
    picked ? "ring-2 ring-foreground" : "ring-1 ring-foreground/10",
  );
  const media = (
    <>
      <ClipPreview thumbUrl={body.thumbUrl} videoUrl={body.videoUrl} active={preview.active} className={cn(!picked && "opacity-55 transition-opacity group-hover/body:opacity-100")} />
      {picked ? (
        <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background tabular-nums">
          {order}
        </span>
      ) : null}
    </>
  );
  const move = "grid h-5 flex-1 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30";
  return (
    <li className="group/body flex w-20 flex-col gap-1">
      {readOnly ? (
        <div className={cn(frame, "focus-visible:ring-3 focus-visible:ring-ring/50")} role="img" tabIndex={0} {...preview.handlers} aria-label={`${order}. ${body.label}`}>
          {media}
        </div>
      ) : (
        <button
          type="button"
          aria-pressed={picked}
          aria-label={picked ? `Quitar el cuerpo ${body.label} (va el ${order}.º)` : `Añadir el cuerpo ${body.label}`}
          disabled={!picked && full}
          onClick={onToggle}
          {...preview.handlers}
          className={cn(frame, "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed")}
        >
          {media}
        </button>
      )}
      <span className={cn("line-clamp-2 min-h-7 text-[11px] leading-[0.875rem] break-words", picked ? "font-medium" : "text-muted-foreground")} title={body.label}>
        {body.label}
      </span>
      {picked && !readOnly && count > 1 ? (
        <span className="flex gap-0.5">
          <button type="button" className={move} aria-label={`Mover ${body.label} antes`} disabled={order === 1} onClick={() => onMove(-1)}>
            <ChevronLeft className="size-3.5" aria-hidden />
          </button>
          <button type="button" className={move} aria-label={`Mover ${body.label} después`} disabled={order === count} onClick={() => onMove(1)}>
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : null}
    </li>
  );
}

/**
 * Los cuerpos que van detrás del gancho: miniaturas de los cuerpos del producto. Un clic añade uno
 * al final o lo quita; los elegidos van primero, numerados, y se reordenan con las flechas. Sin
 * cuerpos en el producto, lleva a la biblioteca para marcarlos. En solo lectura se ven los elegidos.
 */
export function BodyPicker({
  productId,
  value,
  onChange,
  readOnly = false,
  className,
}: {
  productId: number;
  value: number[];
  onChange: (ids: number[]) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const query = useProductBodies(productId);
  if (query.isLoading) {
    return (
      <div className={cn("flex gap-2", className)} aria-label="Cargando los cuerpos">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[9/16] w-20 rounded-md" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className={cn("text-sm text-destructive", className)}>
        No se pudieron cargar los cuerpos.
      </p>
    );
  }
  const all = query.data?.bodies ?? [];
  const byId = new Map(all.map((body) => [body.id, body]));
  // Un cuerpo desmarcado después deja de contar.
  const picked = value.filter((id) => byId.has(id));
  const rest = all.filter((body) => !picked.includes(body.id));
  const shown = readOnly ? picked.map((id) => byId.get(id)!) : [...picked.map((id) => byId.get(id)!), ...rest];

  if (shown.length === 0) {
    if (readOnly) return null;
    return (
      <Link
        href={`/biblioteca?producto=${productId}`}
        className={cn(
          "inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <BookmarkPlus className="size-4" aria-hidden />
        Marcar cuerpos en Biblioteca
      </Link>
    );
  }

  const move = (id: number, by: -1 | 1) => {
    const at = picked.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= picked.length) return;
    const next = [...picked];
    [next[at], next[to]] = [next[to], next[at]];
    onChange(next);
  };

  return (
    <ul aria-label="Cuerpos" className={cn("flex flex-wrap gap-x-2 gap-y-3", className)}>
      {shown.map((body) => {
        const at = picked.indexOf(body.id);
        return (
          <BodyThumb
            key={body.id}
            body={body}
            order={at < 0 ? null : at + 1}
            count={picked.length}
            readOnly={readOnly}
            full={picked.length >= MAX_VIDEO_BODIES}
            onToggle={() => onChange(at < 0 ? [...picked, body.id] : picked.filter((id) => id !== body.id))}
            onMove={(by) => move(body.id, by)}
          />
        );
      })}
    </ul>
  );
}
