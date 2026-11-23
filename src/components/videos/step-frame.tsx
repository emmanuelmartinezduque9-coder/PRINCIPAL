"use client";

import { ArrowRight, Check, ImageIcon, ImageOff, Loader2, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AutoNotice } from "./auto-status";
import { GenerationNotice, Generating } from "./generation-status";
import {
  RUNNING_STATUSES,
  thumbUrl,
  type GenerationJson,
  type GenerationResult,
  type VideoViewJson,
} from "./labels";
import { RejectDialog } from "./reject-dialog";
import { ResultImage } from "./result-image";
import { useGenerationActions } from "./use-generation";

/** Estados del clip que ya no atan la imagen aprobada (como `CLIP_RELEASES_FRAME` en el servidor). */
const CLIP_RELEASES_FRAME = ["not_sent", "failed"];

/** Direcciones de un resultado, por orden de preferencia: la miniatura del servidor y, si falla, la original. */
const previewsOf = (result: GenerationResult) => [result.hasThumb ? thumbUrl(result.id) : null, result.url];

/** «Te quedan N regeneraciones» mientras queden. */
export function RegenerationsLeft({ left }: { left: number }) {
  if (left <= 0) return null;
  return (
    <p className="text-sm text-muted-foreground tabular-nums">{left === 1 ? "Te queda 1 regeneración" : `Te quedan ${left} regeneraciones`}</p>
  );
}

/**
 * Sin rondas que pedir y sin nada que aprobar (la última falló o se rechazó): qué hacer. Corregir el
 * desglose no da rondas nuevas, así que solo se ofrece empezar otro vídeo.
 */
export function NoRegenerationsLeft({ what }: { what: "imagen" | "clip" }) {
  return (
    <p className="text-sm text-pretty text-muted-foreground">
      {what === "imagen"
        ? "Has usado las 2 regeneraciones de esta imagen. Empieza un vídeo nuevo para probar otra."
        : "Has usado las 2 regeneraciones de este clip. Empieza un vídeo nuevo para probar otro."}
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
  busy,
  onApprove,
  onZoom,
}: {
  result: GenerationResult;
  index: number;
  approved: boolean;
  dimmed: boolean;
  canApprove: boolean;
  approving: boolean;
  /** Otra aprobación en marcha: las dos se desactivan a la vez. */
  busy: boolean;
  onApprove: () => void;
  onZoom: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-3">
      <div
        className={cn(
          "relative aspect-[9/16] overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow",
          approved && "ring-3 ring-success",
          dimmed && "opacity-45 grayscale",
        )}
      >
        {result.ok ? (
          <button
            type="button"
            onClick={onZoom}
            aria-label={`Ampliar la candidata ${index + 1}`}
            className="group absolute inset-0 cursor-zoom-in overflow-hidden outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ResultImage sources={previewsOf(result)} className="transition-transform duration-300 ease-out group-hover:scale-[1.02]" />
          </button>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <ImageOff className="size-6" role="img" aria-label="Sin imagen" />
          </div>
        )}
        {approved ? (
          <Badge className="pointer-events-none absolute top-3 left-3 gap-1 bg-success text-white">
            <Check aria-hidden />
            Aprobada
          </Badge>
        ) : null}
      </div>
      {canApprove && result.ok && !approved ? (
        <Button variant="outline" className="h-10 gap-2" disabled={busy} onClick={onApprove}>
          {approving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsUp data-icon="inline-start" />}
          Aprobar esta<span className="sr-only"> (candidata {index + 1})</span>
        </Button>
      ) : null}
    </li>
  );
}

/** La candidata ampliada: la original y, si no carga, la miniatura. */
function Zoomed({ result }: { result: GenerationResult }) {
  const sources = [result.url, result.hasThumb ? thumbUrl(result.id) : null].filter((src): src is string => Boolean(src));
  const [at, setAt] = useState(0);
  const src = sources[at];
  if (!src) {
    return (
      <div className="grid h-64 w-40 place-items-center text-muted-foreground">
        <ImageOff className="size-6" role="img" aria-label="Sin imagen" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={src} src={src} alt="" onError={() => setAt((i) => i + 1)} className="max-h-[85vh] w-auto max-w-full rounded-lg" />
  );
}

/** Las candidatas de la última ronda, con su ampliación. */
function Candidates({ view, generation, canAct }: { view: VideoViewJson; generation: GenerationJson; canAct: boolean }) {
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
      <ul className={cn("grid max-w-[600px] gap-5", current.results.length > 1 ? "grid-cols-2" : "max-w-[300px] grid-cols-1")} aria-label="Candidatas">
        {current.results.map((result, index) => (
          <Candidate
            key={result.id}
            result={result}
            index={index}
            approved={generation.approvedResultId === result.id}
            dimmed={rejected}
            canApprove={canAct && !rejected}
            approving={approve.isPending && approve.variables === result.id}
            busy={approve.isPending}
            onApprove={() => {
              if (!approve.isPending) approve.mutate(result.id);
            }}
            onZoom={() => setZoomed(result)}
          />
        ))}
      </ul>
      <Dialog open={zoomed !== null} onOpenChange={(open) => (open ? null : setZoomed(null))}>
        <DialogContent className="w-auto max-w-[calc(100%-2rem)] p-2 sm:max-w-fit">
          <DialogTitle className="sr-only">Candidata ampliada</DialogTitle>
          {zoomed ? <Zoomed key={zoomed.id} result={zoomed} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Hueco vacío o en marcha, con la forma de las candidatas (1 por defecto). */
function Placeholder({ running, count }: { running: boolean; count: number }) {
  const slots = Array.from({ length: Math.max(1, Math.min(count, 2)) }, (_, i) => i);
  return (
    <div className={cn("relative grid max-w-[600px] gap-5", slots.length > 1 ? "grid-cols-2" : "max-w-[300px] grid-cols-1")} aria-hidden={!running}>
      {slots.map((i) => (
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

/**
 * Paso «Imagen»: la imagen (1 por defecto; las que pida la tarjeta o el lote) grande y, al lado,
 * aprobar o rechazar. Se genera sola al terminar el desglose: sin precio ni botón de «Generar»
 * (regla fija del dueño, 23/11/2026). Un rechazo se regenera solo, dentro de sus rondas.
 */
export function StepFrame({ view, onGoToClip }: { view: VideoViewJson; onGoToClip: () => void }) {
  const { video, frame, clip, mine } = view;
  const current = frame.current;
  const { reject } = useGenerationActions(video.id, "frame");
  const running = current !== null && RUNNING_STATUSES.includes(current.status);
  const hasResults = current !== null && current.status === "done" && current.results.length > 0;
  // Con un clip apuntado o hecho, la imagen aprobada ya no cambia.
  const clipLocks = clip.current !== null && !CLIP_RELEASES_FRAME.includes(clip.current.status);
  const canAct = mine && !clipLocks;
  const reviewing = hasResults && current.rejectReason === null;
  // Nada que aprobar y sin rondas: la última falló o se rechazó y ya no quedan.
  const closed = current !== null && (current.status === "failed" || current.rejectReason !== null) && frame.regenerationsLeft <= 0;
  const several = hasResults && current.results.length > 1;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,600px)_340px] lg:gap-8">
      <div className="min-w-0">{hasResults ? <Candidates view={view} generation={frame} canAct={canAct} /> : <Placeholder running={running} count={view.frameCount} />}</div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6" aria-label="Imagen inicial">
        <GenerationNotice videoId={video.id} kind="frame" current={current} />
        <AutoNotice view={view} step="imagen" />

        {reviewing && frame.approvedResultId !== null ? (
          <Button className="h-11 gap-2" onClick={onGoToClip}>
            Siguiente: clip
            <ArrowRight data-icon="inline-end" />
          </Button>
        ) : null}

        {reviewing && canAct ? (
          <div className="panel flex flex-col gap-3 p-5">
            <RejectDialog
              label={several ? (current.results.length === 2 ? "Rechazar las dos" : "Rechazar todas") : "Rechazar"}
              title={several ? "¿Por qué no valen?" : "¿Por qué no vale?"}
              pending={reject.isPending}
              onReject={(reason) => reject.mutateAsync(reason)}
            />
            <RegenerationsLeft left={frame.regenerationsLeft} />
          </div>
        ) : null}

        {mine && closed ? <NoRegenerationsLeft what="imagen" /> : null}
      </aside>
    </div>
  );
}
