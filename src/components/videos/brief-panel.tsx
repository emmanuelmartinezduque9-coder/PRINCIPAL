"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VideoKind } from "@/server/videos/brief";
import { KIND_LABELS, KINDS, kindOf, MAX_ADAPTATION, MAX_NOTE } from "./brief-labels";
import type { VideoViewJson } from "./labels";
import { Segmented } from "./segmented";

type BriefChanges = { kind?: VideoKind; adaptation?: string | null; note?: string | null };

/** Guarda en el vídeo; se ve al instante y, si el servidor no lo acepta, vuelve a como estaba. */
function useSaveBrief(videoId: number) {
  const client = useQueryClient();
  return async (changes: BriefChanges): Promise<boolean> => {
    const key = ["video", videoId];
    const before = client.getQueryData<VideoViewJson>(key);
    client.setQueryData<VideoViewJson>(key, (view) => (view ? { ...view, video: { ...view.video, ...changes } } : view));
    try {
      await api(`/api/videos/${videoId}`, { method: "PUT", body: JSON.stringify(changes) });
      return true;
    } catch (error) {
      if (before) client.setQueryData(key, before);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
      return false;
    } finally {
      void client.invalidateQueries({ queryKey: key });
    }
  };
}

/**
 * Un texto que se guarda al salir del campo (o con Intro si es de una línea). Mientras se escribe
 * vale lo escrito; después, lo que tenga el vídeo.
 */
function SavedText({
  value,
  onSave,
  multiline,
  label,
  max,
  readOnly,
  className,
}: {
  value: string | null;
  onSave: (text: string | null) => Promise<boolean>;
  multiline?: boolean;
  label: string;
  max: number;
  readOnly?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";
  async function commit() {
    if (draft === null) return;
    const clean = (multiline ? draft : draft.replace(/[\r\n]+/g, " ")).trim() || null;
    if (clean !== value) await onSave(clean);
    setDraft(null);
  }
  const common = {
    "aria-label": label,
    placeholder: label,
    value: shown,
    maxLength: max,
    readOnly,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onBlur: () => void commit(),
  };
  if (multiline) {
    return (
      <div className="flex flex-col gap-1">
        <Textarea {...common} rows={5} className={cn("max-h-96 resize-y", className)} />
        {shown.length > max * 0.9 ? (
          <span className="self-end text-xs text-muted-foreground tabular-nums">
            {shown.length.toLocaleString("es-ES")}/{max.toLocaleString("es-ES")}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <Input
      {...common}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cn("h-9", className)}
    />
  );
}

/** Tipo de vídeo, «Qué adaptación quieres» (solo con adaptación) y «Cambios específicos». */
export function BriefPanel({ view }: { view: VideoViewJson }) {
  const { video, mine } = view;
  const save = useSaveBrief(video.id);
  const kind = kindOf(video.kind);

  return (
    <Panel className="gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Segmented
          label="Tipo de vídeo"
          options={KINDS.map((value) => ({ value, label: KIND_LABELS[value].long, short: KIND_LABELS[value].short, icon: KIND_LABELS[value].icon }))}
          value={kind}
          onChange={(next) => {
            if (next !== kind) void save({ kind: next });
          }}
          disabled={!mine}
          className="shrink-0"
        />
        {mine || video.note ? (
          <SavedText
            label="Cambios específicos"
            max={MAX_NOTE}
            value={video.note}
            onSave={(note) => save({ note })}
            readOnly={!mine}
            className="min-w-0 flex-1"
          />
        ) : null}
      </div>
      {kind === "adaptacion_concepto" ? (
        <SavedText
          multiline
          label="Qué adaptación quieres"
          max={MAX_ADAPTATION}
          value={video.adaptation}
          onSave={(adaptation) => save({ adaptation })}
          readOnly={!mine}
        />
      ) : null}
    </Panel>
  );
}
