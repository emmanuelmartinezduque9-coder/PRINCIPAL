"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AutoQuestion } from "./auto-status";
import { editRunning } from "./edit-parts";
import { GenerationNotice } from "./generation-status";
import { RUNNING_STATUSES, type VideoViewJson } from "./labels";
import { StepClip } from "./step-clip";
import { StepEdit } from "./step-edit";

/**
 * Paso «Vídeo listo» (regla del dueño, 24/11/2026: «apruebo imágenes y me das el vídeo listo para
 * subir, con la edición, todo»). Clip, subida a 1080p, doblaje y montaje van por dentro: mientras
 * tanto, «Preparando tu vídeo…» con el avance, sin botones. Con el montaje, el vídeo editado para
 * verlo y descargarlo. El clip en bruto, plegado en «Detalles».
 */

function Preparing({ view }: { view: VideoViewJson }) {
  const clip = view.clip.current;
  const clipDone = clip?.status === "done";
  const stages = [
    { label: "Vídeo generado", done: clipDone, now: !clipDone && clip !== null && RUNNING_STATUSES.includes(clip.status) },
    { label: "Edición", done: view.edit.latest !== null, now: clipDone && (editRunning(view.edit) || view.edit.status === "none") },
  ];
  return (
    <section aria-label="Preparando tu vídeo" className="panel mx-auto flex w-full max-w-md flex-col items-center gap-5 px-6 py-10 text-center">
      <span role="status" className="flex items-center gap-2.5 text-base font-medium">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        {view.auto.state === "lote" && !clip ? "Tu lote está preparando este vídeo…" : "Preparando tu vídeo…"}
      </span>
      <ol className="flex flex-col gap-2 text-left text-sm" aria-label="Avance">
        {stages.map((stage) => (
          <li key={stage.label} className={cn("flex items-center gap-2.5", !stage.done && !stage.now && "text-muted-foreground")}>
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full",
                stage.done ? "bg-success text-white" : stage.now ? "bg-brand/15 text-brand-ink" : "bg-muted",
              )}
            >
              {stage.done ? <Check className="size-3" aria-hidden /> : stage.now ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            </span>
            {stage.label}
          </li>
        ))}
      </ol>
      <span className="text-xs text-muted-foreground">Puedes salir y volver: sigue solo.</span>
    </section>
  );
}

export function StepVideo({ view, onGoToFrame }: { view: VideoViewJson; onGoToFrame: () => void }) {
  const edited = view.edit.latest !== null || editRunning(view.edit) || view.edit.status === "fallido";
  return (
    <div className="flex flex-col gap-6">
      <AutoQuestion view={view} />
      {/* Un clip que falló (sin rondas o sin arreglo) se ve aquí, no solo en «Detalles». */}
      {view.auto.state !== "question" ? <GenerationNotice videoId={view.video.id} kind="clip" current={view.clip.current} /> : null}
      {edited ? <StepEdit view={view} /> : <Preparing view={view} />}
      <details className="group rounded-xl border px-4 py-3">
        <summary className="cursor-pointer text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          Detalles
        </summary>
        <div className="mt-4">
          <StepClip view={view} onGoToFrame={onGoToFrame} />
        </div>
      </details>
    </div>
  );
}
