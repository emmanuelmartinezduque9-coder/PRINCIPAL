"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleHelp, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VideoViewJson } from "./labels";

/**
 * El flujo automático del vídeo en pantalla (regla fija del dueño, 23/11/2026): sin avisos ni
 * botones de «¿generar?». Solo dice qué se está haciendo o, si se ha parado, la única pregunta
 * obligatoria (con «Seguir» cuando se responde aquí: recargó saldo, reintentar un fallo…).
 */

const WORKING: Record<"desglose" | "imagen" | "clip" | "montaje", string> = {
  desglose: "Haciendo el desglose…",
  imagen: "Generando la imagen… puedes salir y volver.",
  clip: "Generando el clip… puedes salir y volver.",
  montaje: "Montando el vídeo… puedes salir y volver.",
};

/** «Seguir»: quita la parada y pide el paso siguiente. */
function ResumeButton({ videoId }: { videoId: number }) {
  const client = useQueryClient();
  const resume = useMutation({
    mutationFn: () => api(`/api/videos/${videoId}/seguir`, { method: "POST" }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo seguir."),
    onSettled: () => client.invalidateQueries({ queryKey: ["video", videoId] }),
  });
  return (
    <Button className="h-9 gap-1.5 self-start px-4" disabled={resume.isPending} onClick={() => resume.mutate()}>
      {resume.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ArrowRight data-icon="inline-start" />}
      Seguir
    </Button>
  );
}

/** La pregunta con la que se paró el vídeo, si la hay (en cualquier paso). */
export function AutoQuestion({ view }: { view: VideoViewJson }) {
  const { auto, video, mine } = view;
  if (auto.state !== "question") return null;
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl bg-info/10 px-4 py-3 text-sm ring-1 ring-info/20">
      <p className="flex gap-2.5">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-info-ink" aria-hidden />
        <span className="text-pretty">{auto.text}</span>
      </p>
      {mine && auto.retry ? <ResumeButton videoId={video.id} /> : null}
    </div>
  );
}

/** Qué hace ahora el flujo con este paso: en marcha, la pregunta, o que lo lleva el lote. */
export function AutoNotice({ view, step }: { view: VideoViewJson; step: "imagen" | "clip" | "montaje" }) {
  const { auto, video } = view;
  if (auto.state === "question") return <AutoQuestion view={view} />;
  if (auto.state === "lote" && video.batchId !== null) {
    return (
      <p className="flex flex-col gap-2 text-sm text-muted-foreground">
        Este vídeo lo genera su lote, sin que tengas que pulsar nada.
        <Link href={`/lotes/${video.batchId}`} className={cn(buttonVariants({ variant: "outline" }), "h-9 self-start px-3")}>
          Ver el lote
        </Link>
      </p>
    );
  }
  // El desglose va por dentro: en «Imagen» se ve como que se está preparando la imagen.
  const preparing = step === "imagen" && auto.state === "working" && auto.step === "desglose";
  if ((auto.state === "working" && auto.step === step) || auto.state === "off" || preparing) {
    return (
      <p role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        {WORKING[step]}
      </p>
    );
  }
  return null;
}
