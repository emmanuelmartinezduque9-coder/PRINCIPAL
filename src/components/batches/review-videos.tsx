"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Film, Loader2, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { publicationTime } from "@/components/phones/phones-view";
import { ActionBar } from "@/components/shell/action-bar";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RejectDialog } from "@/components/videos/reject-dialog";
import { api, type Serialized } from "@/lib/api";
import type { reviewBatch } from "@/server/videos/publications";

type ReviewVideo = Serialized<Awaited<ReturnType<typeof reviewBatch>>>[number];

const networkName = (network: string) => (network === "instagram" ? "Instagram" : "Facebook");

/** Qué pasa con cada red después de aprobar: en cola con su hora, publicándose, publicado (con enlace) o fallido. */
function PublicationState({ p }: { p: ReviewVideo["publications"][number] }) {
  const text =
    p.status === "en_cola"
      ? `en cola · ${publicationTime(p.scheduledFor)}`
      : p.status === "publicando"
        ? "publicándose ahora"
        : p.status === "publicada"
          ? "publicado"
          : p.status === "fallida"
            ? "no se pudo publicar (ver Móviles)"
            : "cancelado";
  return (
    <li className="flex items-center justify-between gap-2">
      <span>
        <span className="font-medium">{networkName(p.network)}</span> <span className="text-muted-foreground">{text}</span>
      </span>
      {p.status === "publicada" && p.resultUrl ? (
        <a href={p.resultUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-ink hover:underline">
          Ver <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

/**
 * «Revisar vídeos» de un lote con productos delegados a un móvil (como «Revisar imágenes»): los montajes
 * juntos, «Aprobar todos» de un clic y, en cada uno, «Rechazar» con lo que hay que cambiar (se vuelve a
 * montar solo con ese cambio). Al aprobar, cada vídeo entra en la cola de publicación del móvil.
 */
export function ReviewVideos({ batchId }: { batchId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const query = useQuery({
    queryKey: ["review-videos", batchId],
    queryFn: () => api<{ videos: ReviewVideo[] }>(`/api/lotes/${batchId}/revisar-videos`),
    refetchInterval: 5000,
  });
  async function act(videoId?: number, reason?: string) {
    setBusy(videoId ?? "all");
    try {
      await api(videoId ? `/api/videos/${videoId}/revisar-montaje` : `/api/lotes/${batchId}/revisar-videos`, {
        method: "POST",
        body: JSON.stringify({ action: reason ? "reject" : "approve", reason }),
      });
      await query.refetch();
      // «Aprobar todos»: de vuelta al lote, que publica solo.
      if (!videoId) router.push(`/lotes/${batchId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la revisión.");
      if (reason) throw error;
    } finally {
      setBusy(null);
    }
  }
  const videos = query.data?.videos ?? [];
  const pending = videos.filter((v) => v.editReview === "pendiente").length;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title="Revisar vídeos" back={{ href: `/lotes/${batchId}`, label: "Lote" }} />
      {query.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : videos.length === 0 ? (
        <EmptyState icon={Film} title="No hay vídeos por revisar" />
      ) : (
        <ul className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Vídeos montados">
          {videos.map((v) => (
            <li key={v.id} className="panel flex flex-col gap-3 p-4">
              <p className="text-sm font-medium">
                {v.productName} · {v.title}
              </p>
              <video
                controls
                playsInline
                preload="metadata"
                className="mx-auto aspect-[9/16] w-full max-w-[280px] rounded-xl bg-neutral-950 object-contain"
                src={`/api/videos/${v.id}/montaje/video`}
              />
              {v.editReview === "pendiente" ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-9 gap-1.5 px-3" disabled={busy !== null} onClick={() => void act(v.id)}>
                    {busy === v.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsUp data-icon="inline-start" />}
                    Aprobar
                  </Button>
                  <RejectDialog label="Rechazar" title="¿Qué quieres cambiar?" pending={busy !== null} onReject={(reason) => act(v.id, reason)} />
                </div>
              ) : v.editReview === "rechazado" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Rehaciéndolo con: «{v.reason}»
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-success">
                    <Check className="size-4" aria-hidden />
                    Aprobado
                  </p>
                  <ul className="flex flex-col gap-1">{v.publications.map((p, i) => <PublicationState key={i} p={p} />)}</ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending > 0 ? (
        <ActionBar aside={<span className="px-1 text-sm text-muted-foreground tabular-nums">{pending === 1 ? "1 vídeo por revisar" : `${pending} vídeos por revisar`}</span>}>
          <Button className="h-10 gap-2 px-5" disabled={busy !== null} onClick={() => void act()}>
            {busy === "all" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsUp data-icon="inline-start" />}
            Aprobar todos ({pending})
          </Button>
        </ActionBar>
      ) : null}
    </div>
  );
}
