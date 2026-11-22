"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { BodyPicker, HookStepper } from "@/components/library/body-picker";
import { Panel } from "@/components/shell/panel";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { createLatestSaver, type LatestSaver } from "@/lib/latest-saver";
import { cn } from "@/lib/utils";
import type { VideoKind } from "@/server/videos/brief";
import { KIND_LABELS, KINDS, kindOf, MAX_ADAPTATION, MAX_NOTE } from "./brief-labels";
import { appendDictation, DictateButton } from "./dictate-button";
import type { VideoViewJson } from "./labels";
import { Segmented } from "./segmented";

type BriefChanges = { kind?: VideoKind; adaptation?: string | null; note?: string | null; hookSeconds?: number; bodyClipIds?: number[] };

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
 * «Duración del gancho»: cada clic se ve al momento y se guarda cuando se deja de pulsar (así
 * pasar de 4 a 7 es un solo guardado y no tres). Lo que se pulsa mientras un guardado está en
 * marcha no se pierde: queda en cola y se guarda lo último en cuanto ese termina
 * (`createLatestSaver`). Mientras hay algo por guardar se enseña lo pulsado; después, lo del vídeo.
 */
function SavedHookSeconds({ value, onSave, disabled }: { value: number; onSave: (seconds: number) => Promise<boolean>; disabled: boolean }) {
  const [draft, setDraft] = useState<number | null>(null);
  // `onSave` cambia en cada pintado: la cola llama siempre a la última.
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  });
  const saver = useRef<LatestSaver<number> | null>(null);
  useEffect(() => {
    const created = createLatestSaver<number>((seconds) => save.current(seconds), { delayMs: 450, onIdle: () => setDraft(null) });
    saver.current = created;
    // Al salir de la pantalla, lo que estuviera esperando se guarda ya.
    return () => created.flush();
  }, []);
  return (
    <HookStepper
      value={draft ?? value}
      onChange={(seconds) => {
        setDraft(seconds);
        saver.current?.push(seconds);
      }}
      disabled={disabled}
    />
  );
}

/**
 * Tipo de vídeo, «Cambios específicos» (con dictado) y «Qué adaptación quieres» (solo con
 * adaptación). Con «Solo gancho», la duración del gancho y los cuerpos que van detrás (de los
 * cuerpos del producto). Si el vídeo es de un lote con indicaciones para su producto, se ven (no
 * se cambian aquí).
 */
export function BriefPanel({ view }: { view: VideoViewJson }) {
  const { video, mine, productNotes } = view;
  const save = useSaveBrief(video.id);
  const kind = kindOf(video.kind);
  const adapting = kind === "adaptacion_concepto";
  const hookOnly = kind === "solo_gancho";

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
        {hookOnly ? <SavedHookSeconds value={video.hookSeconds} onSave={(hookSeconds) => save({ hookSeconds })} disabled={!mine} /> : null}
        {productNotes ? (
          <p className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground" title={productNotes}>
            <Layers className="mt-0.5 size-4 shrink-0" role="img" aria-label="Indicaciones del lote" />
            <span className="line-clamp-2 whitespace-pre-line">{productNotes}</span>
          </p>
        ) : null}
      </div>
      {hookOnly && (mine || view.bodies.length > 0) ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Cuerpos</span>
          <BodyPicker productId={video.productId} value={video.bodyClipIds} onChange={(bodyClipIds) => void save({ bodyClipIds })} readOnly={!mine} />
        </div>
      ) : null}
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
