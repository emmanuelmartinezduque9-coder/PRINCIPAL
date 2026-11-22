"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { audioUrl, formatTime } from "./labels";

const BARS = 240;

/** Picos de la onda (0–1), sacados del audio en el navegador. Si el navegador no puede, `null`. */
async function loadPeaks(songId: number): Promise<number[] | null> {
  try {
    const response = await fetch(audioUrl(songId));
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const context = new OfflineAudioContext(1, 1, 22_050);
    const decoded = await context.decodeAudioData(buffer);
    const data = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BARS));
    const peaks: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let max = 0;
      // Se mira una de cada 16 muestras: de sobra para dibujar y mucho más rápido.
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.0001);
    return peaks.map((peak) => peak / top);
  } catch {
    return null;
  }
}

type Marker = "drop" | "start";

/**
 * La canción a lo ancho: la onda, lo que ya ha sonado, el inicio y el drop. Un clic salta a ese
 * punto. Con `editable`, los marcadores se arrastran (o se mueven con las flechas: 0,1 s; con
 * mayúsculas, 1 s) y al soltar se guarda.
 */
export function SongTimeline({
  songId,
  durationMs,
  dropMs,
  startMs,
  positionMs,
  editable,
  onSeek,
  onMarker,
}: {
  songId: number;
  durationMs: number;
  dropMs: number | null;
  startMs: number;
  /** Dónde va el reproductor en esta canción, o `null` si no está cargada. */
  positionMs: number | null;
  editable: boolean;
  onSeek: (ms: number) => void;
  onMarker: (marker: Marker, ms: number) => void;
}) {
  const peaks = useQuery({ queryKey: ["song-peaks", songId], queryFn: () => loadPeaks(songId), staleTime: Infinity, gcTime: 10 * 60_000 });
  const [dragging, setDragging] = useState<{ marker: Marker; ms: number } | null>(null);

  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / durationMs) * 100))}%`;
  /** Los ms bajo el puntero, medidos sobre la pista (`data-track`) que contiene al elemento. */
  const msAt = (element: Element, clientX: number) => {
    const rect = (element.closest("[data-track]") ?? element).getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * durationMs);
  };
  const shownDrop = dragging?.marker === "drop" ? dragging.ms : dropMs;
  const shownStart = dragging?.marker === "start" ? dragging.ms : startMs;
  const played = positionMs ?? 0;

  const handle = (marker: Marker, ms: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      if (!editable) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging({ marker, ms });
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (dragging?.marker === marker) setDragging({ marker, ms: msAt(event.currentTarget, event.clientX) });
    },
    onPointerUp: (event: React.PointerEvent) => {
      if (dragging?.marker !== marker) return;
      event.stopPropagation();
      setDragging(null);
      if (dragging.ms !== ms) onMarker(marker, dragging.ms);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (!editable) return;
      const step = (event.shiftKey ? 1000 : 100) * ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key] ?? 0);
      if (step === 0) return;
      event.preventDefault();
      onMarker(marker, Math.min(durationMs, Math.max(0, ms + step)));
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div
        data-track
        className="relative h-28 cursor-pointer touch-none rounded-lg bg-muted/60 select-none"
        onPointerDown={(event) => {
          if (event.button === 0) onSeek(msAt(event.currentTarget, event.clientX));
        }}
      >
        {/* Onda: barras en gris; lo que ya ha sonado, en el color del texto. */}
        <div className="absolute inset-x-2 inset-y-3 flex items-center gap-px" aria-hidden>
          {(peaks.data ?? Array.from({ length: BARS }, () => (peaks.isLoading ? 0.06 : 0.25))).map((peak, i) => (
            <span
              key={i}
              className={cn("min-h-px flex-1 rounded-full", (i / BARS) * durationMs < played ? "bg-foreground/80" : "bg-foreground/20")}
              style={{ height: `${Math.max(2, peak * 100)}%` }}
            />
          ))}
        </div>
        {positionMs !== null ? (
          <span aria-hidden className="pointer-events-none absolute inset-y-1 w-px bg-foreground" style={{ left: pct(played) }} />
        ) : null}
        <span
          role="slider"
          tabIndex={0}
          aria-label="Inicio"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={shownStart}
          aria-valuetext={formatTime(shownStart)}
          aria-readonly={!editable || undefined}
          title={`Inicio ${formatTime(shownStart)}`}
          {...handle("start", startMs)}
          className={cn(
            "absolute inset-y-0 -ml-2 flex w-4 justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            editable && "cursor-ew-resize",
          )}
          style={{ left: pct(shownStart) }}
        >
          <span className="h-full w-0.5 bg-sky-600 dark:bg-sky-400" />
          <span className="absolute bottom-0 size-2.5 translate-y-1/2 rotate-45 bg-sky-600 dark:bg-sky-400" />
        </span>
        {shownDrop !== null ? (
          <span
            role="slider"
            tabIndex={0}
            aria-label="Drop"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={shownDrop}
            aria-valuetext={formatTime(shownDrop)}
            aria-readonly={!editable || undefined}
            title={`Drop ${formatTime(shownDrop)}`}
            {...handle("drop", dropMs ?? 0)}
            className={cn(
              "absolute inset-y-0 -ml-3 flex w-6 justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              editable && "cursor-ew-resize",
            )}
            style={{ left: pct(shownDrop) }}
          >
            <span className="h-full w-0.5 bg-rose-600 dark:bg-rose-400" />
            <span className="absolute -top-2.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white tabular-nums dark:bg-rose-500">
              {formatTime(shownDrop)}
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{positionMs !== null ? formatTime(positionMs) : "0:00.0"}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}

/** La canción en pequeño: una línea con el drop marcado (para la lista). */
export function MiniTimeline({ durationMs, dropMs, startMs, className }: { durationMs: number; dropMs: number | null; startMs: number; className?: string }) {
  return (
    <span aria-hidden className={cn("relative block h-3 w-full", className)}>
      <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/20" />
      {startMs > 0 ? <span className="absolute top-0.5 h-2 w-px bg-sky-600 dark:bg-sky-400" style={{ left: `${(startMs / durationMs) * 100}%` }} /> : null}
      {dropMs !== null ? (
        <span className="absolute top-0 -ml-1.5 size-3 rounded-full bg-rose-600 ring-2 ring-card dark:bg-rose-400" style={{ left: `${(dropMs / durationMs) * 100}%` }} />
      ) : null}
    </span>
  );
}
