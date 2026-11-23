"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, CircleAlert, CircleCheck, Layers, Package, PencilLine, Plus } from "lucide-react";
import Link from "next/link";
import type { ProductView } from "@/components/products/labels";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNewBatchDraft } from "./draft-provider";
import type { BatchSummaryJson } from "./labels";

function NewBatchLink({ className }: { className?: string }) {
  return (
    <Link href="/lotes/nuevo" className={cn(buttonVariants(), "h-10 gap-2 px-4", className)}>
      <Plus className="size-4" aria-hidden />
      Nuevo lote
    </Link>
  );
}

/** Las portadas de los productos del lote: una sola a todo el ancho, o un mosaico de hasta 4. */
function Covers({ ids, className }: { ids: number[]; className?: string }) {
  const tile = (id: number, index: number) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={`${id}-${index}`} src={`/api/fotos/${id}`} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]" />
  );
  return (
    <div className={cn("relative aspect-[16/10] overflow-hidden bg-muted text-muted-foreground", className)}>
      {ids.length === 0 ? (
        <span className="absolute inset-0 grid place-items-center">
          <Package className="size-6" aria-hidden />
        </span>
      ) : (
        <div className={cn("absolute inset-0 grid gap-px bg-border", ids.length === 1 ? "grid-cols-1" : "grid-cols-2", ids.length > 2 && "grid-rows-2")}>
          {ids.map((id, index) => (
            <div key={`${id}-${index}`} className={cn("overflow-hidden", ids.length === 3 && index === 0 && "row-span-2")}>
              {tile(id, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** «Continuar lote»: el borrador sin enviar, el primero y destacado, tal como se dejó. */
function DraftCard() {
  const { draft, hasDraft } = useNewBatchDraft();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<{ products: ProductView[] }>("/api/productos"), enabled: hasDraft });
  if (!hasDraft) return null;
  const count = draft.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const covers = draft.groups
    .map((group) => products.data?.products.find((product) => product.id === group.productId)?.coverPhotoId ?? null)
    .filter((id): id is number => id !== null)
    .slice(0, 4);
  return (
    <Link
      href="/lotes/nuevo"
      className="group/card panel relative flex items-center gap-5 overflow-hidden p-4 pr-6 outline-none ring-2 ring-brand/30 transition-shadow duration-200 hover:shadow-raised focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand/[0.07] to-transparent" />
      <Covers ids={covers} className="relative w-44 shrink-0 rounded-lg ring-1 ring-foreground/[0.06]" />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-ink">
          <PencilLine className="size-3" aria-hidden />
          Borrador
        </span>
        <p className="truncate text-lg font-semibold tracking-tight">{draft.name.trim() || "Continuar lote"}</p>
        <p className="text-sm text-muted-foreground tabular-nums">{count === 1 ? "1 vídeo" : `${count} vídeos`}</p>
      </div>
      <span className={cn(buttonVariants(), "relative h-10 gap-2 px-4")}>
        Continuar
        <ArrowRight className="size-4 transition-transform duration-150 group-hover/card:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

function BatchCard({ batch, showCreator }: { batch: BatchSummaryJson; showCreator: boolean }) {
  const pct = batch.videos > 0 ? Math.round((batch.done / batch.videos) * 100) : 0;
  const complete = batch.videos > 0 && batch.done === batch.videos;
  return (
    <li>
      <Link
        href={`/lotes/${batch.id}`}
        className="group/card panel flex h-full flex-col overflow-hidden outline-none transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Covers ids={batch.covers} className="border-b" />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate font-medium">{batch.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <time dateTime={batch.createdAt}>{format(new Date(batch.createdAt), "d MMM yyyy", { locale: es })}</time>
              {showCreator ? ` · ${batch.mine ? "Tú" : (batch.creatorName ?? "Otra persona")}` : null}
            </p>
          </div>
          {batch.edited > 0 ? (
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success-ink ring-1 ring-success/25">
              <CircleCheck className="size-3.5" aria-hidden />
              {batch.edited === 1 ? "1 vídeo terminado" : `${batch.edited} vídeos terminados`} · Descargar
            </p>
          ) : null}
          <div className="mt-auto flex items-center gap-3">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${batch.done} de ${batch.videos} clips terminados`}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", complete ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {batch.done}/{batch.videos}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** `/lotes`: el borrador (si lo hay) y, debajo, los lotes como tarjetas con las portadas de sus productos. */
export function BatchList() {
  const query = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<{ batches: BatchSummaryJson[] }>("/api/lotes"),
  });
  const { hasDraft } = useNewBatchDraft();
  const batches = query.data?.batches ?? [];
  const someoneElse = batches.some((batch) => !batch.mine);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lotes" actions={<NewBatchLink />} />

      <DraftCard />

      {query.isLoading ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4" aria-label="Cargando lotes">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="panel overflow-hidden">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-2 h-1.5 w-full" />
              </div>
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/10 px-5 py-4 text-sm">
          <CircleAlert className="size-4 text-destructive" aria-hidden />
          No se pudieron cargar los lotes. Recarga la página.
        </p>
      ) : batches.length === 0 ? (
        hasDraft ? null : <EmptyState icon={Layers} title="Todavía no hay lotes" action={<NewBatchLink />} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {batches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} showCreator={someoneElse} />
          ))}
        </ul>
      )}
    </div>
  );
}
