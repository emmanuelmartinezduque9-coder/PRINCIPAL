"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, Loader2, RotateCcw, Scissors, Sparkles, VideoOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/videos/dictate-button";
import { api } from "@/lib/api";
import type { Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EditView } from "@/server/videos/edits";

/**
 * Piezas del montaje automático (el vídeo editado en la nube) que comparten el tablero del lote y
 * la página del vídeo: el reproductor, la descarga y «Montar» / «Volver a montar».
 */

export type EditJson = Serialized<EditView>;

/** El vídeo montado (una versión), para el reproductor. */
export const editUrl = (videoId: number, version: number) => `/api/videos/${videoId}/montaje/video?v=${version}`;
/** La misma versión como descarga (`<producto>-video-<id>-editado.mp4`). */
export const editDownloadUrl = (videoId: number, version: number) => `/api/videos/${videoId}/montaje/video?v=${version}&descargar=1`;

/** Hay un montaje en la cola o montándose. */
export const editRunning = (edit: EditJson) => edit.status === "en_cola" || edit.status === "montando";

/** «Montar» / «Volver a montar»: pone el montaje en la cola de la nube; `onDone` refresca lo que lo enseña. */
export function useStartEdit(videoId: number, onDone?: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/videos/${videoId}/montaje`, { method: "POST" }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo montar."),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["video", videoId] });
      onDone?.();
    },
  });
}

/** El botón de montar: «Montar» la primera vez; si ya hay uno, «Volver a montar». */
export function StartEditButton({ videoId, edit, onDone, className }: { videoId: number; edit: EditJson; onDone?: () => void; className?: string }) {
  const start = useStartEdit(videoId, onDone);
  if (!edit.canStart) return null;
  const again = edit.latest !== null || edit.status === "fallido";
  return (
    <Button
      variant={edit.latest ? "outline" : "default"}
      className={cn("h-11 gap-2", className)}
      disabled={start.isPending}
      onClick={() => {
        if (!start.isPending) start.mutate();
      }}
    >
      {start.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : again ? <RotateCcw data-icon="inline-start" /> : <Scissors data-icon="inline-start" />}
      {again ? "Volver a montar" : "Montar"}
    </Button>
  );
}

/** Lo más largo que se acepta en «¿Qué quieres cambiar?» (el servidor, `MAX_CHANGE_CHARS`). */
const MAX_CHANGE_CHARS = 2_000;

/**
 * «¿Qué quieres cambiar?» (texto o dictado) y «Volver a montar con este cambio»: Claude lo aplica al montaje
 * (rótulos, orden y tiempos, emojis, CTA, música, doblaje) y el vídeo se vuelve a montar. Sin confirmaciones.
 * Lo puede pedir cualquiera que vea el vídeo; queda como reporte en «Mejoras».
 */
export function EditChange({ videoId, edit, onDone, className }: { videoId: number; edit: EditJson; onDone?: () => void; className?: string }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => api(`/api/videos/${videoId}/montaje/cambio`, { method: "POST", body: JSON.stringify({ instruccion: text.trim() }) }),
    onSuccess: () => {
      setText("");
      toast.success("Volviendo a montar con tu cambio.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo pedir el cambio."),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["video", videoId] });
      onDone?.();
    },
  });
  if (!edit.latest || editRunning(edit)) return null;
  const ready = text.trim().length > 0 && !send.isPending;
  return (
    <form
      className={cn("flex flex-col gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) send.mutate();
      }}
    >
      <label htmlFor={`cambio-${videoId}`} className="text-sm font-medium">
        ¿Qué quieres cambiar?
      </label>
      <div className="relative">
        <Textarea
          id={`cambio-${videoId}`}
          value={text}
          maxLength={MAX_CHANGE_CHARS}
          placeholder="P. ej. «el primer rótulo que diga Berlin en vez de USA»"
          onChange={(event) => setText(event.target.value)}
          className="min-h-20 pr-10"
        />
        <DictateButton iconOnly className="absolute top-1.5 right-1.5" onText={(spoken) => setText((prev) => (prev ? `${prev} ${spoken}` : spoken))} />
      </div>
      <Button type="submit" className="h-11 gap-2" disabled={!ready}>
        {send.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
        Volver a montar con este cambio
      </Button>
    </form>
  );
}

/** Reproductor vertical de la última versión montada. */
export function EditPlayer({ videoId, edit, className }: { videoId: number; edit: EditJson; className?: string }) {
  const [broken, setBroken] = useState<number | null>(null);
  const latest = edit.latest;
  return (
    <div className={cn("relative aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-foreground/10", className)}>
      {latest && broken !== latest.version ? (
        <video
          key={latest.version}
          src={editUrl(videoId, latest.version)}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          aria-label="Vídeo montado"
          onError={() => setBroken(latest.version)}
        />
      ) : (
        <div role={latest ? "alert" : undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/75">
          {editRunning(edit) ? <Loader2 className="size-7 animate-spin" aria-hidden /> : latest ? <VideoOff className="size-7" aria-hidden /> : <Scissors className="size-7" aria-hidden />}
          {editRunning(edit) ? (edit.status === "montando" ? "Montando…" : "En cola para montar") : latest ? "No se pudo cargar el vídeo." : null}
        </div>
      )}
    </div>
  );
}

/** Descargar la última versión montada. */
export function EditDownload({ videoId, edit, className }: { videoId: number; edit: EditJson; className?: string }) {
  if (!edit.latest) return null;
  return (
    <a href={editDownloadUrl(videoId, edit.latest.version)} download className={cn(buttonVariants(), "h-11 gap-2", className)}>
      <Download data-icon="inline-start" />
      Descargar editado
    </a>
  );
}

/** Lo que dijo el último montaje: en marcha, o por qué falló. */
export function EditNotice({ edit }: { edit: EditJson }) {
  if (editRunning(edit)) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-sm ring-1 ring-warning/20">
        <Loader2 className="size-4 shrink-0 animate-spin text-warning-ink" aria-hidden />
        {edit.status === "montando" ? "Montando en la nube" : "En cola para montar"}
      </p>
    );
  }
  if (edit.status === "fallido" && edit.error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/8 px-3 py-2.5 text-sm ring-1 ring-destructive/20">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        {edit.error}
      </p>
    );
  }
  return null;
}

/** El resumen de la autocomprobación del montador: planos, cortes en beat y avisos. */
export function SelfCheck({ edit }: { edit: EditJson }) {
  const check = edit.latest?.selfCheck;
  if (!edit.latest) return null;
  const seconds = (edit.latest.durationMs / 1000).toFixed(1).replace(".", ",");
  return (
    <div className="flex flex-col gap-2 text-sm">
      <dl className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Duración</dt>
          <dd className="font-medium">{seconds} s</dd>
        </div>
        {check?.planos != null ? (
          <div className="flex gap-1">
            <dt className="text-muted-foreground">Planos</dt>
            <dd className="font-medium">{check.planos}</dd>
          </div>
        ) : null}
        {check?.cortesEnBeat ? (
          <div className="flex gap-1">
            <dt className="text-muted-foreground">En beat</dt>
            <dd className="font-medium">{check.cortesEnBeat}</dd>
          </div>
        ) : null}
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Versión</dt>
          <dd className="font-medium">{edit.latest.version}</dd>
        </div>
      </dl>
      {/* Sin avisos a la vista (regla fija 2 del dueño): lo que anotó el montaje queda plegado. */}
      {check && check.avisos.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Detalles técnicos</summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {check.avisos.map((aviso, index) => (
              <li key={index}>{aviso}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
