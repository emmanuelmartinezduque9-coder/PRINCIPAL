"use client";
import { OwnerRedo } from "./owner-redo";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageOff, Loader2, SearchX, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ActionBar } from "@/components/shell/action-bar";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { frameUrl, thumbUrl, type GenerationResult } from "@/components/videos/labels";
import { PinterestRefs } from "@/components/videos/pinterest-refs";
import { PlaceFrames, placePending } from "@/components/videos/place-frames";
import { RejectDialog } from "@/components/videos/reject-dialog";
import { ResultImage } from "@/components/videos/result-image";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { frameLocked, ready, type BatchRowJson, type BatchViewJson } from "./labels";

const previewsOf = (result: GenerationResult) => [result.hasThumb ? thumbUrl(result.id) : null, result.url];
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 font-sans text-[11px] leading-5 text-muted-foreground">{children}</kbd>;
}

/** Las filas con candidatas que enseñar: las propias con la última ronda de imagen terminada. */
const reviewable = (row: BatchRowJson) =>
  row.mine && row.frame.current?.status === "done" && row.frame.current.results.length > 0;

function ReviewItem({
  batchId,
  row,
  focused,
  saving,
  rejecting,
  onFocus,
  onApprove,
  onReject,
  onRejectOpen,
  onZoom,
  onPlaceChanged,
}: {
  batchId: number;
  row: BatchRowJson;
  onPlaceChanged: () => Promise<unknown>;
  focused: boolean;
  /** Lo que se está guardando de este vídeo: la candidata que se aprueba o el rechazo. */
  saving: number | "reject" | undefined;
  rejecting: boolean;
  onFocus: () => void;
  onApprove: (resultId: number) => void;
  onReject: (reason: string) => Promise<unknown>;
  onRejectOpen: (open: boolean) => void;
  onZoom: (result: GenerationResult) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const current = row.frame.current!;
  const approved = row.frame.approvedResultId;
  const rejected = current.rejectReason !== null;
  const canAct = ready.review(row) && saving === undefined;
  const locked = frameLocked(row);

  return (
    <li
      ref={ref}
      onClick={onFocus}
      aria-current={focused ? "true" : undefined}
      className={cn(
        "panel grid scroll-my-4 gap-5 p-4 transition-shadow md:grid-cols-[minmax(0,220px)_auto]",
        focused && "shadow-raised ring-2 ring-brand/60",
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate text-sm text-muted-foreground">{row.productName}</p>
          {row.note ? <p className="mt-1 text-sm text-pretty">{row.note}</p> : null}
        </div>
        <PinterestRefs pinterest={row.pinterest} compact />
        <div>
          {approved !== null ? (
            <Badge className="gap-1 bg-success text-white">
              <Check aria-hidden />
              Aprobada
            </Badge>
          ) : rejected ? (
            <Badge variant="secondary">Rechazadas</Badge>
          ) : (
            <Badge variant="outline">Por revisar</Badge>
          )}
        </div>
        {rejected ? <p className="text-sm text-muted-foreground">{current.rejectReason}</p> : null}
        {canAct ? (
          <RejectDialog
            label="Rechazar"
            title="¿Por qué no valen?"
            pending={rejecting}
            onOpenChange={onRejectOpen}
            onReject={onReject}
            className="mt-auto h-9 w-fit gap-2 px-3"
          />
        ) : null}
        <OwnerRedo batchId={batchId} row={row} />
        {locked ? <p className="text-xs text-muted-foreground">Ya tiene clip.</p> : null}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        <figure className="flex w-48 shrink-0 flex-col gap-1.5">
          <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frameUrl(row.id, 0, row.updatedAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          </div>
          <figcaption className="text-xs text-muted-foreground">Referencia</figcaption>
        </figure>
        {current.results.map((result, index) => {
          // La tecla de cada candidata cuenta solo las que tienen imagen (como el atajo 1/2).
          const key = current.results.filter((r) => r.ok).indexOf(result) + 1;
          const isApproved = approved === result.id;
          return (
            <div key={result.id} className="flex w-48 shrink-0 flex-col gap-1.5">
              <div
                className={cn(
                  "relative aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10",
                  isApproved && "ring-pick",
                  rejected && "opacity-45 grayscale",
                )}
              >
                {result.ok ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onZoom(result);
                    }}
                    aria-label={`Ampliar la candidata ${index + 1} de ${row.title}`}
                    className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ResultImage sources={previewsOf(result)} />
                  </button>
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                    <ImageOff className="size-5" role="img" aria-label="Sin imagen" />
                  </div>
                )}
              </div>
              {canAct && result.ok ? (
                <Button
                  variant={focused ? "default" : "outline"}
                  className="h-9 justify-between gap-2 px-3"
                  disabled={saving !== undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    onApprove(result.id);
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    {saving === result.id ? <Loader2 className="animate-spin" aria-hidden /> : <ThumbsUp aria-hidden />}
                    Aprobar
                  </span>
                  <span className="text-xs opacity-70" aria-hidden>
                    {key}
                  </span>
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <PlaceFrames
        videoId={row.id}
        title={row.title}
        updatedAt={row.updatedAt}
        mine={row.mine}
        places={row.places ?? []}
        onChanged={onPlaceChanged}
        onZoom={onZoom}
      />
    </li>
  );
}

/**
 * `/lotes/[id]/revisar`: las candidatas de cada vídeo del lote junto a su referencia. Con el
 * teclado: ↑/↓ (o J/K) cambian de vídeo, 1/2 aprueban esa candidata y R abre el rechazo; al aprobar
 * se pasa al siguiente por revisar.
 */
export function ReviewImages({ batchId }: { batchId: number }) {
  const client = useQueryClient();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => api<BatchViewJson>(`/api/lotes/${batchId}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const rows = (query.data?.rows ?? []).filter(reviewable);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [saving, setSaving] = useState<Record<number, number | "reject">>({});
  const [rejecting, setRejecting] = useState(false);
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [zoomed, setZoomed] = useState<GenerationResult | null>(null);

  // Un vídeo que se está guardando ya no cuenta como «por revisar» (aunque el tablero aún no se haya vuelto a pedir).
  const open = (row: BatchRowJson) => ready.review(row) && saving[row.id] === undefined;
  const firstPending = rows.find(open)?.id ?? rows[0]?.id ?? null;
  const focused = rows.some((row) => row.id === focusId) ? focusId : firstPending;
  const index = rows.findIndex((row) => row.id === focused);
  const pending = rows.filter((row) => open(row) || (row.places ?? []).some(placePending)).length;

  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ["batch", batchId] }), [client, batchId]);
  const mark = (videoId: number, value: number | "reject" | undefined) =>
    setSaving((all) => {
      const next = { ...all };
      if (value === undefined) delete next[videoId];
      else next[videoId] = value;
      return next;
    });
  /** Al siguiente por revisar, en cuanto se decide (sin esperar a que se guarde). */
  const advance = (row: BatchRowJson) => {
    const at = rows.findIndex((r) => r.id === row.id);
    const next = [...rows.slice(at + 1), ...rows.slice(0, at)].find((r) => r.id !== row.id && open(r));
    if (next) setFocusId(next.id);
  };

  async function approve(row: BatchRowJson, resultId: number) {
    if (!open(row)) return;
    mark(row.id, resultId);
    advance(row);
    try {
      await api(`/api/videos/${row.id}/imagen/aprobar`, { method: "POST", body: JSON.stringify({ resultId }) });
    } catch (error) {
      toast.error(message(error, "No se pudo aprobar."));
      setFocusId(row.id);
    } finally {
      await refresh();
      mark(row.id, undefined);
    }
  }

  const [approvingAll, setApprovingAll] = useState(false);
  /** «Aprobar todas»: lo normal, un clic. Luego, al lote: allí salen los clips y los montajes. */
  async function approveAll() {
    setApprovingAll(true);
    try {
      await api(`/api/lotes/${batchId}/aprobar-todas`, { method: "POST" });
      await refresh();
      router.push(`/lotes/${batchId}`);
    } catch (error) {
      toast.error(message(error, "No se pudieron aprobar."));
    } finally {
      setApprovingAll(false);
    }
  }

  async function reject(row: BatchRowJson, reason: string) {
    setRejecting(true);
    try {
      await api(`/api/videos/${row.id}/imagen/rechazar`, { method: "POST", body: JSON.stringify({ reason }) });
      mark(row.id, "reject");
      advance(row);
    } catch (error) {
      toast.error(message(error, "No se pudo rechazar."));
      throw error;
    } finally {
      setRejecting(false);
    }
    await refresh();
    mark(row.id, undefined);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (dialogOpen || rejectFor !== null || zoomed || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const row = rows[index];
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        if (index < rows.length - 1) setFocusId(rows[index + 1].id);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        if (index > 0) setFocusId(rows[index - 1].id);
      } else if (row && open(row) && /^[1-9]$/.test(event.key)) {
        const result = row.frame.current!.results.filter((r) => r.ok)[Number(event.key) - 1];
        if (result) {
          event.preventDefault();
          void approve(row, result.id);
        }
      } else if (row && open(row) && (event.key === "r" || event.key === "R")) {
        event.preventDefault();
        setRejectFor(row.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const back = { href: `/lotes/${batchId}`, label: query.data?.batch.name ?? "Lote" };

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-5" aria-label="Cargando">
        <Skeleton className="mt-7 h-9 w-64" />
        {[0, 1].map((i) => (
          <div key={i} className="panel flex gap-5 p-4">
            <Skeleton className="h-24 w-52" />
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="aspect-[9/16] w-48 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={{ href: "/lotes", label: "Lotes" }} title="Lote no encontrado" />
        <EmptyState
          icon={SearchX}
          title="Este lote no existe"
          action={
            <Link href="/lotes" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Ver los lotes
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <PageHeader back={back} title="Revisar imágenes" />

      {rows.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="No hay imágenes que revisar"
          action={
            <Link href={`/lotes/${batchId}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Volver al lote
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Vídeos con candidatas">
          {rows.map((row) => (
            <ReviewItem
              batchId={batchId}
              key={row.id}
              row={row}
              focused={row.id === focused}
              saving={saving[row.id]}
              rejecting={rejecting}
              onFocus={() => setFocusId(row.id)}
              onApprove={(resultId) => void approve(row, resultId)}
              onReject={(reason) => reject(row, reason)}
              onRejectOpen={setDialogOpen}
              onPlaceChanged={refresh}
              onZoom={setZoomed}
            />
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <ActionBar
          aside={
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="mr-2">vídeo</span>
              <Kbd>1</Kbd>
              <Kbd>2</Kbd>
              <span className="mr-2">aprobar</span>
              <Kbd>R</Kbd>
              <span>rechazar</span>
            </p>
          }
        >
          <span className="px-1 text-sm text-muted-foreground tabular-nums">{pending === 0 ? "Todo revisado" : `${pending} por revisar`}</span>
          <Link href={`/lotes/${batchId}`} className={cn(buttonVariants({ variant: pending === 0 ? "default" : "outline" }), "h-10 px-4")}>
            Volver al lote
          </Link>
          {pending > 0 ? (
            <Button className="h-10 gap-2 px-5" disabled={approvingAll} onClick={() => void approveAll()}>
              {approvingAll ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsUp data-icon="inline-start" />}
              Aprobar todas ({pending})
            </Button>
          ) : null}
        </ActionBar>
      ) : null}

      {/* Rechazo abierto con la tecla R para el vídeo enfocado. */}
      {rejectFor !== null ? (
        <RejectDialogFor
          row={rows.find((row) => row.id === rejectFor)}
          pending={rejecting}
          onClose={() => setRejectFor(null)}
          onReject={(row, reason) => reject(row, reason)}
        />
      ) : null}

      <Dialog open={zoomed !== null} onOpenChange={(open) => (open ? null : setZoomed(null))}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] p-2 sm:max-w-fit">
          <DialogTitle className="sr-only">Candidata ampliada</DialogTitle>
          {zoomed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoomed.url ?? thumbUrl(zoomed.id)} alt="" className="max-h-[85vh] w-auto max-w-full rounded-lg" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RejectDialogFor({
  row,
  pending,
  onClose,
  onReject,
}: {
  row: BatchRowJson | undefined;
  pending: boolean;
  onClose: () => void;
  onReject: (row: BatchRowJson, reason: string) => Promise<unknown>;
}) {
  if (!row) return null;
  return (
    <div className="sr-only">
      <RejectDialog
        label={`Rechazar ${row.title}`}
        title={`¿Por qué no valen? · ${row.title}`}
        pending={pending}
        open
        onOpenChange={(open) => (open ? null : onClose())}
        onReject={(reason) => onReject(row, reason).then(onClose)}
      />
    </div>
  );
}
