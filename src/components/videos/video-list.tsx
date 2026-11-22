"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CircleAlert, Clapperboard, Loader2, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { frameUrl, referenceStatus, TONE_DOT, type VideoJson } from "./labels";

interface VideoRow {
  id: number;
  title: string;
  createdBy: number;
  creatorName: string | null;
  referenceStatus: string;
  createdAt: string;
  mine: boolean;
}

const GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6";

/** Portada 9:16: el primer fotograma si la referencia está lista; si no, un icono del estado. */
function Poster({ video }: { video: VideoRow }) {
  const status = referenceStatus(video.referenceStatus);
  return (
    <div className="relative grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {video.referenceStatus === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frameUrl(video.id, 0, video.createdAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : video.referenceStatus === "processing" || video.referenceStatus === "uploading" ? (
        <Loader2 className="size-6 animate-spin" aria-hidden />
      ) : video.referenceStatus === "failed" ? (
        <CircleAlert className="size-6 text-destructive" aria-hidden />
      ) : (
        <Upload className="size-6" aria-hidden />
      )}
      <span className="absolute bottom-2 left-2 inline-flex h-6 items-center gap-1.5 rounded-md bg-background/90 px-2 text-xs font-medium shadow-sm">
        <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[status.tone])} />
        {status.label}
      </span>
    </div>
  );
}

function VideoCard({ productId, video }: { productId: number; video: VideoRow }) {
  return (
    <li>
      <Link
        href={`/productos/${productId}/videos/${video.id}`}
        className="group flex flex-col gap-2 rounded-xl p-1.5 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-foreground/70"
      >
        <Poster video={video} />
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          <span className="truncate text-sm font-semibold tracking-tight">{video.title}</span>
          <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className={cn("truncate", video.mine && "text-foreground/80")}>
              {video.mine ? "Tuyo" : (video.creatorName ?? "Otra persona")}
            </span>
            <time dateTime={video.createdAt} className="shrink-0 tabular-nums">
              {format(new Date(video.createdAt), "d MMM", { locale: es })}
            </time>
          </span>
        </div>
      </Link>
    </li>
  );
}

/** «Nuevo vídeo»: lo crea y abre su flujo. */
function useNewVideo(productId: number) {
  const router = useRouter();
  return useMutation({
    mutationFn: () => api<{ video: VideoJson }>(`/api/productos/${productId}/videos`, { method: "POST" }),
    onSuccess: ({ video }) => router.push(`/productos/${productId}/videos/${video.id}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo crear el vídeo."),
  });
}

function NewVideoButton({ productId, className }: { productId: number; className?: string }) {
  const create = useNewVideo(productId);
  return (
    <Button className={cn("h-9 gap-1.5 px-3", className)} disabled={create.isPending} onClick={() => create.mutate()}>
      {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      Nuevo vídeo
    </Button>
  );
}

/** Pestaña «Vídeos» del producto: sus vídeos en portadas verticales y el botón para empezar uno. */
export function VideoList({ productId }: { productId: number }) {
  const query = useQuery({
    queryKey: ["videos", productId],
    queryFn: () => api<{ videos: VideoRow[] }>(`/api/productos/${productId}/videos`),
    // Mientras alguno se prepara, se refresca solo para ver cuándo queda listo.
    refetchInterval: (q) =>
      q.state.data?.videos.some((v) => v.referenceStatus === "processing" || v.referenceStatus === "uploading") ? 5000 : false,
  });
  const videos = query.data?.videos ?? [];

  if (query.isLoading) {
    return (
      <Panel title="Vídeos">
        <div className={GRID}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
          ))}
        </div>
      </Panel>
    );
  }

  if (query.isError) {
    return (
      <Panel title="Vídeos">
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          No se pudieron cargar los vídeos. Recarga la página.
        </p>
      </Panel>
    );
  }

  if (videos.length === 0) {
    return (
      <Panel title="Vídeos">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Clapperboard className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">Todavía no hay vídeos de este producto.</p>
          <NewVideoButton productId={productId} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Vídeos"
      actions={
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">{videos.length}</span>
          <NewVideoButton productId={productId} />
        </div>
      }
    >
      <ul className={cn(GRID, "-m-1.5")}>
        {videos.map((video) => (
          <VideoCard key={video.id} productId={productId} video={video} />
        ))}
      </ul>
    </Panel>
  );
}
