"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleHelp, Clapperboard, ImageIcon, Loader2, PackageCheck, Pause, Play, ScanEye, Send, SkipForward } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { creditsLabel } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AutoViewJson, BatchRowJson } from "./labels";

type Status = AutoViewJson["status"];

const STEPS = [
  { status: "preguntas", label: "Preguntas", icon: CircleHelp, count: (a: AutoViewJson) => a.steps.preguntas },
  { status: "imagenes", label: "Imágenes", icon: ImageIcon, count: (a: AutoViewJson) => a.steps.imagenes },
  { status: "revision_imagenes", label: "Revisión", icon: ScanEye, count: (a: AutoViewJson) => a.steps.revision },
  { status: "clips", label: "Clips", icon: Clapperboard, count: (a: AutoViewJson) => a.steps.clips },
  { status: "listo", label: "Listo", icon: PackageCheck, count: (a: AutoViewJson) => (a.status === "listo" ? a.total : a.steps.clips) },
] as const;

const ORDER: Status[] = ["borrador", "preguntas", "imagenes", "revision_imagenes", "clips", "listo"];

/** El paso en el que está (en pausa: el paso en el que se paró). */
const currentOf = (auto: AutoViewJson): Status => (auto.status === "pausado" ? ((auto.pause?.from as Status) ?? "imagenes") : auto.status);

/**
 * Preguntas · Imágenes · Revisión · Clips · Listo, como una pista con nodos: lo hecho en verde, el
 * paso actual resaltado (girando si el lote va solo, ámbar si está en pausa) y bajo cada paso
 * cuántos vídeos lleva.
 */
export function AutoStepper({ auto }: { auto: AutoViewJson }) {
  const current = currentOf(auto);
  const at = ORDER.indexOf(current);
  const paused = auto.status === "pausado";
  return (
    <ol aria-label="Pasos del lote" className="panel grid grid-cols-5 px-2 py-4">
      {STEPS.map((step, index) => {
        const position = ORDER.indexOf(step.status);
        const done = position < at || (step.status === "listo" && current === "listo");
        const now = position === at && current !== "listo";
        const Icon = now && paused ? Pause : done ? Check : step.icon;
        const count = step.count(auto);
        const spinning = now && !paused && current !== "preguntas" && current !== "revision_imagenes";
        return (
          <li key={step.status} aria-current={now ? "step" : undefined} className="relative flex min-w-0 flex-col items-center gap-2 px-2 text-center">
            {index > 0 ? (
              <span
                aria-hidden
                className={cn("absolute top-4 right-[calc(50%+1.25rem)] left-[calc(-50%+1.25rem)] h-0.5 rounded-full", position <= at ? "bg-success/60" : "bg-border")}
              />
            ) : null}
            <span
              className={cn(
                "relative grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-200",
                done
                  ? "bg-success text-white"
                  : now
                    ? paused
                      ? "bg-warning/20 text-warning-ink ring-2 ring-warning/50"
                      : "bg-brand text-brand-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--brand)_18%,transparent)]"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {spinning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className={cn("truncate text-sm font-medium", !now && !done && "text-muted-foreground")}>{step.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {current === "borrador" ? "—" : `${count}/${auto.total}`}
                {step.status === "preguntas" && now && auto.questions > 0 ? ` · ${auto.questions} ?` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** «Enviar lote»: desglosa lo que falte y pasa a «Preguntas». */
export function SendBatchButton({ batchId, disabled }: { batchId: number; disabled: boolean }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api(`/api/lotes/${batchId}/enviar`, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el lote.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button className="h-10 gap-2 px-5" disabled={busy || disabled} onClick={() => void send()}>
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
      Enviar lote
    </Button>
  );
}

/** La acción principal según el paso: responder, revisar o nada (el lote va solo). */
export function AutoAction({ batchId, auto, toReview }: { batchId: number; auto: AutoViewJson; toReview: number }) {
  if (auto.status === "preguntas" && (auto.questions > 0 || auto.readyToConfirm)) {
    return (
      <Link href={`/lotes/${batchId}/preguntas`} className={cn(buttonVariants(), "h-10 gap-2 px-5")}>
        {auto.readyToConfirm ? <Play className="size-4" aria-hidden /> : <CircleHelp className="size-4" aria-hidden />}
        {auto.readyToConfirm ? "Confirmar y generar" : `Preguntas del lote (${auto.questions})`}
      </Link>
    );
  }
  if (auto.status === "revision_imagenes" && toReview > 0) {
    return (
      <Link href={`/lotes/${batchId}/revisar`} className={cn(buttonVariants(), "h-10 gap-2 px-5")}>
        <ScanEye className="size-4" aria-hidden />
        Revisar imágenes ({toReview})
      </Link>
    );
  }
  return null;
}

/** La pausa: el motivo y «Continuar» (con los créditos de más, si hacen falta) o «Saltar» el vídeo que la causó. */
export function PauseBanner({ batchId, auto, rows }: { batchId: number; auto: AutoViewJson; rows: BatchRowJson[] }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState<null | "continue" | "skip">(null);
  const pause = auto.pause;
  if (auto.status !== "pausado" || !pause) return null;
  const row = pause.videoId === null ? null : (rows.find((r) => r.id === pause.videoId) ?? null);

  async function resume(kind: "continue" | "skip") {
    setBusy(kind);
    try {
      const body = kind === "skip" ? { skip: true } : pause!.extraCredits > 0 ? { extraCredits: pause!.extraCredits } : {};
      await api(`/api/lotes/${batchId}/continuar`, { method: "POST", body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo continuar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl bg-warning/10 px-5 py-4 ring-1 ring-warning/30">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/25 text-warning-ink">
        <Pause className="size-5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-pretty">{pause.reason}</p>
      <div className="flex shrink-0 items-center gap-2">
        {row ? (
          <Button variant="ghost" className="h-9 gap-1.5 px-3" disabled={busy !== null} onClick={() => void resume("skip")}>
            {busy === "skip" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <SkipForward data-icon="inline-start" />}
            Saltar {row.title}
          </Button>
        ) : null}
        <Button className="h-9 gap-1.5 px-4" disabled={busy !== null} onClick={() => void resume("continue")}>
          {busy === "continue" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          Continuar{pause.extraCredits > 0 ? ` · +${creditsLabel(pause.extraCredits)}` : ""}
        </Button>
      </div>
    </div>
  );
}
