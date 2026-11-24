"use client";

import { Check, ImageOff, Loader2, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { frameUrl, thumbUrl, type GenerationResult, type VideoViewJson } from "./labels";
import { RejectDialog } from "./reject-dialog";
import { ResultImage } from "./result-image";

const previewsOf = (result: GenerationResult) => [result.hasThumb ? thumbUrl(result.id) : null, result.url];
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export type PlaceJson = NonNullable<VideoViewJson["places"]>[number];

/** Una apertura de un sitio extra por revisar: terminada, sin aprobar ni rechazar. */
export const placePending = (place: PlaceJson) =>
  place.frame.current?.status === "done" &&
  place.frame.current.rejectReason === null &&
  place.frame.approvedResultId === null &&
  place.frame.current.results.some((result) => result.ok);

/**
 * Las aperturas de los sitios extra de la referencia (regla de Emmanuel, 24/11/2026: cada toma
 * conserva su sitio), junto a la imagen inicial del mismo vídeo: cada una con el fotograma de su
 * sitio en la referencia, aprobar y rechazar. Sin pasos ni botones nuevos.
 */
export function PlaceFrames({
  videoId,
  title,
  updatedAt,
  mine,
  places,
  onChanged,
  onZoom,
}: {
  videoId: number;
  title: string;
  updatedAt: string;
  mine: boolean;
  places: PlaceJson[];
  onChanged: () => Promise<unknown>;
  onZoom?: (result: GenerationResult) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  if (places.length === 0) return null;
  async function send(place: PlaceJson, action: "aprobar" | "rechazar", body: Record<string, unknown>) {
    setSaving(`${place.tramo}:${action}`);
    try {
      await api(`/api/videos/${videoId}/imagen/${action}`, { method: "POST", body: JSON.stringify({ ...body, tramo: place.tramo }) });
    } catch (error) {
      toast.error(message(error, action === "aprobar" ? "No se pudo aprobar." : "No se pudo rechazar."));
      throw error;
    } finally {
      setSaving(null);
      await onChanged();
    }
  }
  return (
    <div className="flex flex-col gap-3 md:col-span-2">
      {places.map((place) => {
        const current = place.frame.current;
        const approved = place.frame.approvedResultId;
        const rejected = current?.rejectReason != null;
        const canAct = mine && placePending(place) && saving === null;
        return (
          <div key={place.tramo} className="flex flex-col gap-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">
                Sitio {place.tramo + 1} · desde {(place.startMs / 1000).toFixed(1).replace(".", ",")} s
              </p>
              <span className="text-sm text-muted-foreground">{place.place}</span>
              {approved !== null ? (
                <Badge className="gap-1 bg-success text-white">
                  <Check aria-hidden />
                  Aprobada
                </Badge>
              ) : rejected ? (
                <Badge variant="secondary">Rechazada</Badge>
              ) : current?.status === "done" ? (
                <Badge variant="outline">Por revisar</Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Generando
                </Badge>
              )}
              {canAct ? (
                <RejectDialog
                  label="Rechazar"
                  title="¿Por qué no vale?"
                  pending={saving === `${place.tramo}:rechazar`}
                  onReject={(reason) => send(place, "rechazar", { reason })}
                  className="h-8 w-fit gap-2 px-3"
                />
              ) : null}
            </div>
            {rejected ? <p className="text-sm text-muted-foreground">{current?.rejectReason}</p> : null}
            <div className="flex gap-3 overflow-x-auto pb-1">
              <figure className="flex w-40 shrink-0 flex-col gap-1.5">
                <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frameUrl(videoId, place.referenceFrameIndex, updatedAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                </div>
                <figcaption className="text-xs text-muted-foreground">Referencia de este sitio</figcaption>
              </figure>
              {(current?.status === "done" ? current.results : []).map((result, index) => (
                <div key={result.id} className="flex w-40 shrink-0 flex-col gap-1.5">
                  <div
                    className={cn(
                      "relative aspect-[9/16] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10",
                      approved === result.id && "ring-pick",
                      rejected && "opacity-45 grayscale",
                    )}
                  >
                    {result.ok ? (
                      <button
                        type="button"
                        onClick={() => onZoom?.(result)}
                        aria-label={`Ampliar la apertura ${index + 1} del sitio ${place.tramo + 1} de ${title}`}
                        className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <ResultImage sources={previewsOf(result)} />
                      </button>
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                        <ImageOff className="size-5" role="img" aria-label="Sin imagen" />
                      </div>
                    )}
                  </div>
                  {canAct && result.ok ? (
                    <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={() => void send(place, "aprobar", { resultId: result.id }).catch(() => {})}>
                      <ThumbsUp aria-hidden />
                      Aprobar
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

