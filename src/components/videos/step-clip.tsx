"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clapperboard, Download, FishingHook, ImageIcon, Loader2, ThumbsUp, VideoOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClipPreview, useHoverPreview } from "@/components/library/clip-preview";
import { bodyDownloadUrl } from "@/components/library/labels";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ClipResolution } from "@/server/videos/videos";
import { GenerationNotice, Generating } from "./generation-status";
import { AutoNotice } from "./auto-status";
import { canRequestRound, RUNNING_STATUSES, secondsLabel, thumbUrl, type VideoJson, type VideoViewJson } from "./labels";
import { onRadioKeyDown, radioTabIndex } from "./radio-keys";
import { RejectDialog } from "./reject-dialog";
import { NoRegenerationsLeft, RegenerationsLeft } from "./step-frame";
import { useGenerationActions } from "./use-generation";
import { ReportButton } from "@/components/mejoras/report-button";

const RESOLUTIONS: Array<{ value: ClipResolution; note?: string }> = [
  { value: "480p", note: "la más barata" },
  { value: "720p" },
  { value: "1080p" },
];

/** Guardar la resolución del clip. La caché del vídeo solo cambia con lo que devuelve el servidor. */
function useSaveResolution(video: VideoJson) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (clipResolution: ClipResolution) =>
      api<{ video: VideoJson }>(`/api/videos/${video.id}`, { method: "PUT", body: JSON.stringify({ clipResolution }) }),
    onSuccess: ({ video: saved }) => {
      client.setQueryData<VideoViewJson>(["video", video.id], (v) => (v ? { ...v, video: saved } : v));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar."),
    onSettled: () => client.invalidateQueries({ queryKey: ["video", video.id] }),
  });
}

/**
 * Resolución del clip: se guarda al elegir; mientras se guarda, la opción elegida ya se ve marcada y
 * los demás clics se ignoran (así no se cruzan dos guardados).
 */
function ResolutionPicker({ video, save }: { video: VideoJson; save: ReturnType<typeof useSaveResolution> }) {
  const shown = save.isPending && save.variables ? save.variables : video.clipResolution;
  const selected = Math.max(0, RESOLUTIONS.findIndex((r) => r.value === shown));
  const choose = (value: ClipResolution) => {
    if (save.isPending || value === shown) return;
    save.mutate(value);
  };
  return (
    <div role="radiogroup" aria-label="Resolución" aria-busy={save.isPending} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {RESOLUTIONS.map(({ value, note }, index) => {
        const on = index === selected;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={radioTabIndex(index, selected)}
            onClick={() => choose(value)}
            onKeyDown={(event) => onRadioKeyDown(event, (next) => choose(RESOLUTIONS[next].value))}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center rounded-md px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="tabular-nums">{value}</span>
            {note ? <span className="text-[11px] leading-tight font-normal text-muted-foreground">{note}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * «Resolución del clip», antes de que se genere (va en el desglose: el clip se pide solo en cuanto
 * se aprueba la imagen). 480p por defecto (regla del motor: luego se sube a 1080p).
 */
export function ClipResolutionField({ video, readOnly }: { video: VideoJson; readOnly: boolean }) {
  const save = useSaveResolution(video);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">Resolución del clip</span>
      {readOnly ? <span className="text-sm tabular-nums">{video.clipResolution}</span> : <ResolutionPicker video={video} save={save} />}
    </div>
  );
}

/** El reproductor vertical: el clip, o la imagen aprobada de fondo mientras no lo hay. */
function Player({ view }: { view: VideoViewJson }) {
  const current = view.clip.current;
  const running = current !== null && RUNNING_STATUSES.includes(current.status);
  const result = current?.status === "done" ? current.results.find((r) => r.ok && r.url) : undefined;
  const poster = view.frame.approvedResultId !== null ? thumbUrl(view.frame.approvedResultId) : undefined;
  const rejected = current?.rejectReason ?? null;
  const [broken, setBroken] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {result && rejected ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Rechazado:</span> {rejected}
        </p>
      ) : null}
      <div
        className={cn(
          "relative aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-foreground/10",
          result && view.clip.approvedResultId === result.id && "ring-3 ring-success",
        )}
      >
        {result && broken === result.id ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/80">
            <VideoOff className="size-7" aria-hidden />
            No se pudo cargar el clip.
          </div>
        ) : result ? (
          <video
            key={result.id}
            src={result.url!}
            poster={result.hasThumb ? thumbUrl(result.id) : undefined}
            controls
            playsInline
            loop
            className={cn("absolute inset-0 size-full object-contain", rejected && "opacity-45 grayscale")}
            aria-label="Clip"
            onError={() => setBroken(result.id)}
          />
        ) : (
          <>
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
            ) : null}
            <div className="absolute inset-0 grid place-items-center text-white/80">
              {running ? (
                <div className="rounded-xl bg-background/90 px-5 py-4">
                  <Generating />
                </div>
              ) : (
                <Clapperboard className="size-8" aria-hidden />
              )}
            </div>
          </>
        )}
        {result && view.clip.approvedResultId === result.id ? (
          <Badge className="pointer-events-none absolute top-3 left-3 gap-1 bg-success text-white">
            <Check aria-hidden />
            Aprobado
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

type BodyJson = VideoViewJson["bodies"][number];

/** Un cuerpo en la lista del clip: su número, su miniatura (con vista previa al pasar) y su descarga. */
function BodyRow({ body, order }: { body: BodyJson; order: number }) {
  const preview = useHoverPreview();
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-4 shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums">{order}</span>
      <span className="relative h-16 w-9 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10" {...preview.handlers}>
        <ClipPreview thumbUrl={body.thumbUrl} videoUrl={body.previewUrl ?? body.videoUrl} active={preview.active} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm" title={body.label}>
        {body.label}
      </span>
      <a
        href={bodyDownloadUrl(body.id)}
        download
        aria-label={`Descargar el cuerpo ${body.label}`}
        title="Descargar"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9 shrink-0 text-muted-foreground")}
      >
        <Download aria-hidden />
      </a>
    </li>
  );
}

/** «Solo gancho»: los cuerpos que van detrás del gancho, en orden, cada uno con su descarga (se unen al montar). */
function Bodies({ bodies }: { bodies: BodyJson[] }) {
  if (bodies.length === 0) return null;
  return (
    <section aria-label="Cuerpos" className="panel flex flex-col px-4 py-2">
      <h3 className="pt-1.5 pb-0.5 text-sm font-medium">Cuerpos</h3>
      <ol className="flex flex-col divide-y">
        {bodies.map((body, index) => (
          <BodyRow key={body.id} body={body} order={index + 1} />
        ))}
      </ol>
    </section>
  );
}

/**
 * «Gancho N s»: lo que dura de verdad el gancho. Si el clip sale más largo (Seedance no baja de
 * 4 s), lo dice: lo que sobra es lo que hay que recortar al montar.
 */
function HookLength({ hook }: { hook: NonNullable<VideoViewJson["hook"]> }) {
  const longer = hook.clipSeconds * 1000 > hook.hookMs;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm tabular-nums">
      <FishingHook className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-medium">Gancho {secondsLabel(hook.hookMs / 1000)}</span>
      {longer ? <span className="text-muted-foreground">de un clip de {hook.clipSeconds} s</span> : null}
    </p>
  );
}

/** Paso «Clip»: reproductor vertical y, al lado, resolución y precio, aprobar, rechazar y descargar. */
export function StepClip({
  view,
  onGoToFrame,
}: {
  view: VideoViewJson;
  onGoToFrame: () => void;
}) {
  const { video, clip, mine } = view;
  const current = clip.current;
  const { approve, reject } = useGenerationActions(video.id, "clip");
  const result = current?.status === "done" ? current.results.find((r) => r.ok && r.url) : undefined;
  const reviewing = result !== undefined && current!.rejectReason === null;
  // Sin rondas posibles y nada que aprobar: «Has usado las 2 regeneraciones…».
  const canRequest = mine && canRequestRound(clip);
  // Un clip fallido deja cambiar la imagen: sin imagen aprobada, primero hay que aprobar una.
  const needsFrame = view.frame.approvedResultId === null;
  const closed = current !== null && (current.status === "failed" || current.rejectReason !== null);
  const approved = result !== undefined && clip.approvedResultId === result.id;
  const downloadable = clip.approvedResultId !== null || result !== undefined;
  const hookOnly = video.kind === "solo_gancho";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,360px)_340px] lg:gap-8">
      <div className="min-w-0">
        <Player view={view} />
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6" aria-label="Clip">
        <GenerationNotice videoId={video.id} kind="clip" current={current} />

        {canRequest && needsFrame ? (
          <Button variant="outline" className="h-11 gap-2" onClick={onGoToFrame}>
            <ImageIcon data-icon="inline-start" />
            Aprobar la imagen
          </Button>
        ) : (
          // Sin precio ni «Generar clip»: se pide solo en cuanto la imagen está aprobada.
          <AutoNotice view={view} step="clip" />
        )}

        {reviewing && mine ? (
          <div className="panel flex flex-col gap-3 p-5">
            {approved ? null : (
              <Button
                className="h-11 gap-2"
                disabled={approve.isPending}
                onClick={() => {
                  if (!approve.isPending) approve.mutate(result.id);
                }}
              >
                {approve.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ThumbsUp data-icon="inline-start" />}
                Aprobar
              </Button>
            )}
            <RejectDialog label="Rechazar" title="¿Por qué no vale?" pending={reject.isPending} onReject={(reason) => reject.mutateAsync(reason)} />
            <RegenerationsLeft left={clip.regenerationsLeft} />
          </div>
        ) : null}

        {downloadable ? (
          <a
            href={`/api/videos/${video.id}/clip/descargar`}
            download
            className={cn(buttonVariants({ variant: approved ? "default" : "outline" }), "h-11 gap-2")}
          >
            <Download data-icon="inline-start" />
            {hookOnly ? "Descargar gancho" : "Descargar"}
          </a>
        ) : null}

        {view.hook ? <HookLength hook={view.hook} /> : null}
        {hookOnly || video.kind === "adaptacion_concepto" ? <Bodies bodies={view.bodies} /> : null}

        {mine && closed && !canRequest ? <NoRegenerationsLeft what="clip" /> : null}
        <ReportButton target={{ stage: "clip", videoId: video.id, generationId: current?.id ?? null }} className="self-start" />
      </aside>
    </div>
  );
}
