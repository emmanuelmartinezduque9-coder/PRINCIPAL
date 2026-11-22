"use client";

import { ArrowRight, Check, ImageIcon, ImageOff, Loader2, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GenerationNotice, Generating } from "./generation-status";
import { canRequestRound, RUNNING_STATUSES, thumbUrl, type GenerationJson, type GenerationResult, type VideoViewJson } from "./labels";
import { QuoteCard } from "./quote-card";
import { RejectDialog } from "./reject-dialog";
import { useGenerationActions } from "./use-generation";

/** Estados del clip que ya no atan la imagen aprobada (como `CLIP_RELEASES_FRAME` en el servidor). */
const CLIP_RELEASES_FRAME = ["not_sent", "failed"];

/** Lo que se ve de un resultado: la miniatura del servidor o, si no la hay, su dirección. */
const previewOf = (result: GenerationResult) => (result.hasThumb ? thumbUrl(result.id) : result.url);

/** «Te quedan N regeneraciones» o, a cero, qué hacer. */
export function RegenerationsLeft({ left, what }: { left: number; what: "imagen" | "clip" }) {
  if (left > 0) {
    return (
      <p className="text-sm text-muted-foreground tabular-nums">
        {left === 1 ? "Te queda 1 regeneración" : `Te quedan ${left} regeneraciones`}
      </p>
    );
  }
  return (
    <p className="text-sm text-pretty text-muted-foreground">
      Has usado las 2 regeneraciones {what === "imagen" ? "de esta imagen" : "de este clip"}. Corrige el desglose o empieza un vídeo nuevo.
    </p>
  );
}

/** Una candidata: grande, vertical; clic la amplía. Debajo, «Aprobar esta» o la marca de aprobada. */
function Candidate({
  result,
  index,
  approved,
  dimmed,
  canApprove,
  approving,
  onApprove,
  onZoom,
}: {
  result: GenerationResult;
  index: number;
  approved: boolean;
  dimmed: boolean;
  canApprove: boolean;
  approving: boolean;
  onApprove: () => void;
  onZoom: () => void;
}) {
  const src = result.ok ? previewOf(result) : null;
  return (
    <li className="flex min-w-0 flex-col gap-3">
      <div
        className={cn(
          "relative aspect-[9/16] overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow",
          approved && "ring-3 ring-emerald-500",
          dimmed && "opacity-45 grayscale",
        )}
      >
        {src ? (
          <button
            type="button"
            onClick={onZoom}
            aria-label={`Ampliar la candidata ${index + 1}`}
            className="group absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]" />
          </button>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <ImageOff className="size-6" aria-label="Sin imagen" />
          </div>
        )}
        {approved ? (
          <Badge className="pointer-events-none absolute top-3 left-3 gap-1 bg-emerald-500 text-white">
            <Check aria-hidden />
            Aprobada
          </Badge>
        ) : null}
      </div>
      {canApprove && result.ok && !approved ? (
        <Button variant="outline" className="h-10 gap-2" disabled={approving} onClick={onApprove}>
          {approving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsUp data-icon="inline-start" />}
          Aprobar esta
        </Button>
      ) : null}
    </li>
  );
}

/** Las candidatas de la última ronda, con su ampliación. */
function Candidates({
  view,
  generation,
  canAct,
}: {
  view: VideoViewJson;
  generation: GenerationJson;
  canAct: boolean;
}) {
  const current = generation.current!;
  const { approve } = useGenerationActions(view.video.id, "frame");
  const [zoomed, setZoomed] = useState<GenerationResult | null>(null);
  const rejected = current.rejectReason !== null;
  return (
    <div className="flex flex-col gap-3">
      {rejected ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Rechazadas:</span> {current.rejectReason}
        </p>
      ) : null}
      <ul className="grid max-w-[600px] grid-cols-2 gap-5" aria-label="Candidatas">
        {current.results.map((result, index) => (
          <Candidate
            key={result.id}
            result={result}
            index={index}
            approved={generation.approvedResultId === result.id}
            dimmed={rejected}
            canApprove={canAct && !rejected}
            approving={approve.isPending && approve.variables === result.id}
            onApprove={() => approve.mutate(result.id)}
            onZoom={() => setZoomed(result)}
          />
        ))}
      </ul>
      <Dialog open={zoomed !== null} onOpenChange={(open) => (open ? null : setZoomed(null))}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] p-2 sm:max-w-fit">
          <DialogTitle className="sr-only">Candidata ampliada</DialogTitle>
          {zoomed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoomed.url ?? previewOf(zoomed) ?? ""} alt="" className="max-h-[85vh] w-auto rounded-lg" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Hueco vacío o en marcha, con la forma de las dos candidatas. */
function Placeholder({ running }: { running: boolean }) {
  return (
    <div className="relative grid max-w-[600px] grid-cols-2 gap-5" aria-hidden={!running}>
      {[0, 1].map((i) => (
        <div key={i} className="grid aspect-[9/16] place-items-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground">
          {running ? null : <ImageIcon className="size-7 opacity-50" aria-hidden />}
        </div>
      ))}
      {running ? (
        <div className="absolute inset-0 grid place-items-center">
          <Generating />
        </div>
      ) : null}
    </div>
  );
}

/** Paso «Imagen»: las dos candidatas grandes y, al lado, el precio, aprobar o rechazar. */
export function StepFrame({ view, onGoToClip, onGoToBreakdown }: { view: VideoViewJson; onGoToClip: () => void; onGoToBreakdown: () => void }) {
  const { video, frame, clip, mine } = view;
  const current = frame.current;
  const { reject } = useGenerationActions(video.id, "frame");
  const running = current !== null && RUNNING_STATUSES.includes(current.status);
  const hasResults = current !== null && current.status === "done" && current.results.length > 0;
  // Con un clip apuntado o hecho, la imagen aprobada ya no cambia.
  const clipLocks = clip.current !== null && !CLIP_RELEASES_FRAME.includes(clip.current.status);
  const canAct = mine && !clipLocks;
  const reviewing = hasResults && current.rejectReason === null;
  const canRequest = mine && canRequestRound(frame);
  const closed = current !== null && (current.status === "failed" || current.rejectReason !== null);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,600px)_340px] lg:gap-8">
      <div className="min-w-0">{hasResults ? <Candidates view={view} generation={frame} canAct={canAct} /> : <Placeholder running={running} />}</div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6" aria-label="Imagen inicial">
        <GenerationNotice videoId={video.id} kind="frame" current={current} />

        {canRequest ? (
          <QuoteCard
            videoId={video.id}
            kind="frame"
            label={current && current.status !== "not_sent" ? "Volver a generar" : "Generar 2 imágenes"}
            refreshKey={`${current?.id ?? 0}-${current?.status ?? ""}-${current?.rejectReason ?? ""}-${video.imagePrompt?.length ?? 0}`}
            onGoToBreakdown={onGoToBreakdown}
          />
        ) : null}

        {reviewing && frame.approvedResultId !== null ? (
          <Button className="h-11 gap-2" onClick={onGoToClip}>
            Siguiente: clip
            <ArrowRight data-icon="inline-end" />
          </Button>
        ) : null}

        {reviewing && canAct ? (
          <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <RejectDialog label="Rechazar las dos" title="¿Por qué no valen?" pending={reject.isPending} onReject={(reason) => reject.mutateAsync(reason)} />
            <RegenerationsLeft left={frame.regenerationsLeft} what="imagen" />
          </div>
        ) : null}

        {mine && closed && !canRequest ? <RegenerationsLeft left={0} what="imagen" /> : null}
      </aside>
    </div>
  );
}
