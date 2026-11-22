"use client";

import { Check, CircleAlert, Loader2, SearchX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { modelLabel, RUNNING_STATUSES, type CurrentGeneration, type GenerationKind } from "./labels";
import { ResultImage } from "./result-image";
import { useGenerationActions } from "./use-generation";

const UNKNOWN_TEXT =
  "No sabemos si Higgsfield recibió la petición. Lo estamos comprobando y no se vuelve a enviar, para no cobrarte dos veces.";

/** «Generando… puedes salir y volver.», centrado en el hueco donde aparecerá el resultado. */
export function Generating() {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      Generando… puedes salir y volver.
    </div>
  );
}

/** «No está», con la confirmación que enseña el riesgo («Si sí estaba, Higgsfield te cobrará las dos.»). */
function DismissButton({ risk, pending, onConfirm }: { risk: string; pending: boolean; onConfirm: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-1.5 px-3">
          <SearchX data-icon="inline-start" />
          No está
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿No está en tu Higgsfield?</DialogTitle>
          <DialogDescription>{risk}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-10 px-4">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            className="h-10 gap-2 px-4"
            disabled={pending}
            onClick={() => onConfirm().then(() => setOpen(false), () => {})}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <SearchX data-icon="inline-start" />}
            No está
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «14:32» (y la fecha si no es de hoy) de un candidato; `null` si el historial no trae fecha. */
function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${time}`;
}

/** Una duda atascada que ya puede resolver quien creó el vídeo: los parecidos con «Es este» y «No está». */
function StuckResolver({ videoId, kind, stuck }: { videoId: number; kind: GenerationKind; stuck: NonNullable<CurrentGeneration["stuck"]> }) {
  const { adopt, dismiss } = useGenerationActions(videoId, kind);
  const busy = adopt.isPending || dismiss.isPending;
  return (
    <div className="flex flex-col gap-3 border-t border-amber-500/25 pt-3">
      {stuck.candidates.length > 0 ? (
        <ul className="flex flex-wrap gap-3" aria-label="Parecidos en tu Higgsfield">
          {stuck.candidates.map((candidate, index) => {
            const when = whenLabel(candidate.createdAt);
            const model = candidate.model ? modelLabel(candidate.model) : null;
            return (
              <li key={candidate.jobId} className="flex w-28 flex-col gap-1.5">
                <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
                  <ResultImage sources={[candidate.thumbUrl]} />
                </div>
                {when || model ? (
                  <p className="flex flex-col text-xs leading-tight text-muted-foreground">
                    {when ? <span className="font-medium text-foreground tabular-nums">{when}</span> : null}
                    {model ? <span className="truncate">{model}</span> : null}
                  </p>
                ) : null}
                <Button
                  variant="secondary"
                  className="h-8 gap-1 px-2"
                  disabled={busy}
                  onClick={() => {
                    if (!busy) adopt.mutate(candidate.jobId);
                  }}
                >
                  {adopt.isPending && adopt.variables === candidate.jobId ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Check data-icon="inline-start" />
                  )}
                  Es este<span className="sr-only"> (parecido {index + 1})</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div>
        <DismissButton risk={stuck.risk} pending={dismiss.isPending} onConfirm={() => dismiss.mutateAsync()} />
      </div>
    </div>
  );
}

/**
 * El estado de la última ronda cuando no hay resultados que enseñar: la duda (`unknown`, en ámbar,
 * con la salida a mano si ya se puede) o el motivo de un fallo (`not_sent`, `failed`). En marcha
 * y terminada no dibuja nada: eso lo enseña el hueco del resultado.
 */
export function GenerationNotice({ videoId, kind, current }: { videoId: number; kind: GenerationKind; current: CurrentGeneration | null }) {
  if (!current || RUNNING_STATUSES.includes(current.status) || current.status === "done") return null;
  if (current.status === "unknown") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm ring-1 ring-amber-500/25">
        <p className="flex gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span className="text-pretty">{UNKNOWN_TEXT}</span>
        </p>
        {current.stuck?.canResolve ? <StuckResolver videoId={videoId} kind={kind} stuck={current.stuck} /> : null}
      </div>
    );
  }
  return (
    <p role="alert" className="flex gap-2.5 rounded-xl bg-destructive/10 px-4 py-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <span className="text-pretty">{current.error ?? "No se ha podido generar."}</span>
    </p>
  );
}
