"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VideoKind } from "@/server/videos/brief";
import { KIND_LABELS, KINDS, kindOf, MAX_ADAPTATION, MAX_NOTE } from "./brief-labels";
import { appendDictation, DictateButton } from "./dictate-button";
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
 * Un texto de varias líneas que se guarda al salir del campo. Mientras se escribe vale lo
 * escrito; después, lo que tenga el vídeo. Con `dictate`, «Dictar» añade lo dictado y lo guarda.
 */
function SavedText({
  value,
  onSave,
  label,
  max,
  rows,
  readOnly,
  dictate,
}: {
  value: string | null;
  onSave: (text: string | null) => Promise<boolean>;
  label: string;
  max: number;
  rows: number;
  readOnly?: boolean;
  dictate?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";
  async function save(text: string) {
    const clean = text.trim() || null;
    if (clean !== value) await onSave(clean);
    setDraft(null);
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {dictate && !readOnly ? <DictateButton onText={(text) => void save(appendDictation(shown, text).slice(0, max))} /> : null}
      </div>
      <Textarea
        id={id}
        value={shown}
        maxLength={max}
        rows={rows}
        readOnly={readOnly}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) void save(draft);
        }}
        className="max-h-96 resize-y"
      />
      {shown.length > max * 0.9 ? (
        <span className="self-end text-xs text-muted-foreground tabular-nums">
          {shown.length.toLocaleString("es-ES")}/{max.toLocaleString("es-ES")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Tipo de vídeo, «Cambios específicos» (con dictado) y «Qué adaptación quieres» (solo con
 * adaptación). Si el vídeo es de un lote con indicaciones para su producto, se ven (no se cambian aquí).
 */
export function BriefPanel({ view }: { view: VideoViewJson }) {
  const { video, mine, productNotes } = view;
  const save = useSaveBrief(video.id);
  const kind = kindOf(video.kind);
  const adapting = kind === "adaptacion_concepto";

  return (
    <Panel className="gap-4">
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
        {productNotes ? (
          <p className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground" title={productNotes}>
            <Layers className="mt-0.5 size-4 shrink-0" role="img" aria-label="Indicaciones del lote" />
            <span className="line-clamp-2 whitespace-pre-line">{productNotes}</span>
          </p>
        ) : null}
      </div>
      {mine || video.note || adapting ? (
        <div className={cn("grid gap-4", adapting && "lg:grid-cols-2")}>
          {mine || video.note ? (
            <SavedText label="Cambios específicos" max={MAX_NOTE} rows={adapting ? 5 : 3} value={video.note} onSave={(note) => save({ note })} readOnly={!mine} dictate />
          ) : null}
          {adapting ? (
            <SavedText
              label="Qué adaptación quieres"
              max={MAX_ADAPTATION}
              rows={5}
              value={video.adaptation}
              onSave={(adaptation) => save({ adaptation })}
              readOnly={!mine}
              dictate
            />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
