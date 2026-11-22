"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Bookmark, BookmarkPlus, ExternalLink, Loader2, VideoOff, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import type { ProductView } from "@/components/products/labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { modelLabel } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { bodiesKey, MAX_BODY_LABEL, type LibraryClipJson } from "./labels";

const message = (error: unknown) => (error instanceof Error ? error.message : "No se pudo guardar.");

/** Marcar y desmarcar un clip como cuerpo; al terminar se vuelven a pedir la biblioteca y los cuerpos del producto. */
function useBodyActions() {
  const client = useQueryClient();
  const refresh = (productId: number) => {
    void client.invalidateQueries({ queryKey: ["library"] });
    void client.invalidateQueries({ queryKey: bodiesKey(productId) });
  };
  const mark = useMutation({
    mutationFn: (input: { productId: number; clipId: number; label: string }) =>
      api(`/api/productos/${input.productId}/cuerpos`, { method: "POST", body: JSON.stringify({ clipId: input.clipId, label: input.label }) }),
    onSuccess: (_data, input) => refresh(input.productId),
    onError: (error) => toast.error(message(error)),
  });
  const unmark = useMutation({
    mutationFn: (input: { bodyId: number; productId: number }) => api(`/api/cuerpos/${input.bodyId}`, { method: "DELETE" }),
    onSuccess: (_data, input) => refresh(input.productId),
    onError: (error) => toast.error(message(error)),
  });
  return { mark, unmark };
}

/** «Usar como cuerpo de…»: producto (de los que aún no lo tienen) y un nombre corto opcional. */
function MarkForm({ clip, products, initialProductId }: { clip: LibraryClipJson; products: ProductView[]; initialProductId: number | null }) {
  const { mark } = useBodyActions();
  const labelId = useId();
  const free = products.filter((product) => !clip.bodies.some((body) => body.productId === product.id));
  const [chosen, setChosen] = useState<number | null>(initialProductId);
  const [label, setLabel] = useState("");
  // El producto elegido deja de estar libre en cuanto se marca: entonces no hay ninguno elegido.
  const productId = free.some((product) => product.id === chosen) ? chosen : free.length === 1 ? free[0].id : null;
  if (free.length === 0) return null;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (productId === null || mark.isPending) return;
        mark.mutate({ productId, clipId: clip.id, label: label.trim() }, { onSuccess: () => setLabel("") });
      }}
    >
      <h3 className="text-sm font-medium">Usar como cuerpo de…</h3>
      <Select value={productId === null ? "" : String(productId)} onValueChange={(value) => setChosen(Number(value))}>
        <SelectTrigger aria-label="Producto" className="h-9 w-full min-w-0">
          <SelectValue placeholder="Elige el producto" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {free.map((product) => (
              <SelectItem key={product.id} value={String(product.id)}>
                {product.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        id={labelId}
        aria-label="Nombre corto"
        placeholder="Nombre corto"
        value={label}
        maxLength={MAX_BODY_LABEL}
        onChange={(event) => setLabel(event.target.value)}
        className="h-9"
      />
      <Button type="submit" className="h-9 gap-2" disabled={productId === null || mark.isPending}>
        {mark.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <BookmarkPlus data-icon="inline-start" />}
        Usar como cuerpo
      </Button>
    </form>
  );
}

/**
 * El clip en grande y con sonido. Al lado, de qué productos es cuerpo (con «Quitar») y, si el clip
 * es de la biblioteca de quien mira, «Usar como cuerpo de…».
 */
export function ClipDialog({
  clip,
  products,
  filterProductId,
  onClose,
}: {
  clip: LibraryClipJson | null;
  products: ProductView[];
  /** El producto del filtro, para proponerlo al marcar. */
  filterProductId: number | null;
  onClose: () => void;
}) {
  const { unmark } = useBodyActions();
  const [broken, setBroken] = useState<number | null>(null);
  return (
    <Dialog open={clip !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {clip ? (
        <DialogContent className="grid max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-4 sm:max-w-[44rem] sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:p-5">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-80 overflow-hidden rounded-lg bg-neutral-950">
            {broken === clip.id ? (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/80">
                <VideoOff className="size-7" aria-hidden />
                No se pudo cargar el clip.
              </div>
            ) : (
              <video
                key={clip.id}
                src={clip.videoUrl}
                poster={clip.thumbUrl ?? undefined}
                controls
                autoPlay
                loop
                playsInline
                aria-label="Clip"
                onError={() => setBroken(clip.id)}
                className="absolute inset-0 size-full object-contain"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-5 sm:pt-1 sm:pr-6">
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="text-base">{clip.model ? modelLabel(clip.model) : "Clip"}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground tabular-nums">
                <time dateTime={clip.createdAt}>{format(new Date(clip.createdAt), "d MMM yyyy · HH:mm", { locale: es })}</time>
              </DialogDescription>
              {clip.prompt ? <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">{clip.prompt}</p> : null}
              {clip.video ? (
                <Link
                  href={`/productos/${clip.video.productId}/videos/${clip.video.id}?paso=clip`}
                  className="inline-flex w-fit items-center gap-1.5 rounded text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  Abrir su vídeo
                </Link>
              ) : null}
            </div>

            {clip.bodies.length > 0 ? (
              <ul aria-label="Cuerpo de" className="flex flex-col gap-1.5">
                {clip.bodies.map((body) => (
                  <li key={body.id} className="flex items-center gap-2 rounded-lg bg-muted/60 py-1.5 pr-1.5 pl-2.5">
                    <Bookmark className="size-4 shrink-0 fill-current text-foreground/70" aria-hidden />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium">{body.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{body.productName}</span>
                    </span>
                    {body.canRemove ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground"
                        aria-label={`Quitar de los cuerpos de ${body.productName}`}
                        title="Quitar"
                        disabled={unmark.isPending}
                        onClick={() => unmark.mutate({ bodyId: body.id, productId: body.productId })}
                      >
                        <X aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {clip.mine ? <MarkForm key={clip.id} clip={clip} products={products} initialProductId={filterProductId} /> : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
