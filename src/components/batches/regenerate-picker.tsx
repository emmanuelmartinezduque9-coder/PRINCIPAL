"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KIND_LABELS } from "@/components/videos/brief-labels";
import { frameUrl } from "@/components/videos/labels";
import { api } from "@/lib/api";
import type { VideoKind } from "@/server/videos/brief";

export interface RegenerateChoice {
  videoId: number;
  title: string;
  version: string;
  kind: VideoKind;
  hookSeconds: number;
}

interface ProductVideoJson {
  id: number;
  title: string;
  referenceStatus: string;
  kind: VideoKind;
  hookSeconds: number;
  editStatus: string | null;
  updatedAt: string;
  creatorName: string | null;
  mine: boolean;
}

/**
 * «Regenerar un vídeo» (como el «Regenerar concepto» de Codex): elige un vídeo anterior de este
 * producto, de cualquier lote o suelto, y la tarjeta reutiliza su referencia ya preparada, su
 * desglose y su tipo. Se generan imagen, clip y montaje nuevos.
 */
export function RegeneratePicker({ productId, disabled, onPick }: { productId: number | null; disabled: boolean; onPick: (choice: RegenerateChoice) => void }) {
  const [open, setOpen] = useState(false);
  const videos = useQuery({
    queryKey: ["product-videos", productId],
    queryFn: () => api<{ videos: ProductVideoJson[] }>(`/api/productos/${productId}/videos`),
    enabled: open && productId !== null,
  });
  const list = (videos.data?.videos ?? []).filter((video) => video.referenceStatus === "ready");
  return (
    <>
      <Button variant="ghost" className="h-9 gap-2 px-3 text-muted-foreground" disabled={disabled || productId === null} onClick={() => setOpen(true)}>
        <RotateCcw data-icon="inline-start" />
        Regenerar un vídeo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Regenerar un vídeo</DialogTitle>
            <DialogDescription>Usa la misma referencia y el mismo desglose; la imagen, el clip y el montaje salen nuevos.</DialogDescription>
          </DialogHeader>
          {videos.isLoading ? (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando vídeos…
            </p>
          ) : list.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">Este producto aún no tiene vídeos con la referencia preparada.</p>
          ) : (
            <ul className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4" aria-label="Vídeos del producto">
              {list.map((video) => (
                <li key={video.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ videoId: video.id, title: video.title, version: video.updatedAt, kind: video.kind, hookSeconds: video.hookSeconds });
                      setOpen(false);
                    }}
                    className="group flex w-full flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="relative block aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-shadow group-hover:ring-2 group-hover:ring-brand">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frameUrl(video.id, 0, video.updatedAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                      {video.editStatus === "hecho" ? (
                        <Badge className="pointer-events-none absolute top-1.5 left-1.5 gap-1 bg-success px-1.5 text-[10px] text-white">
                          <Check aria-hidden />
                          Montado
                        </Badge>
                      ) : null}
                    </span>
                    <span className="truncate text-xs font-medium">{video.title}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{KIND_LABELS[video.kind]?.short ?? video.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
