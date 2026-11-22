"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  Film,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Shuffle,
  Sparkles,
  TriangleAlert,
  Type,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { FrameUse } from "@/server/videos/manifest";
import { checkImagePrompt, checkVideoPrompt, type PromptIssue } from "@/server/videos/prompt-check";
import { frameUrl, secondsLabel, type AnalysisJson, type RiskKind, type VideoJson, type VideoViewJson } from "./labels";
import { PromptEditor } from "./prompt-editor";
import { onRadioKeyDown, radioTabIndex } from "./radio-keys";

const RISK_LABELS: Record<RiskKind, string> = {
  funcion_inexistente: "Función que no tiene",
  reveal_adelantado: "Reveal adelantado",
  escala: "Escala",
  identidad: "Identidad",
  texto_en_pantalla: "Texto en pantalla",
  marca_ajena: "Marca ajena",
  otro: "Otro",
};

const FRAME_USE_LABELS: Record<FrameUse, string> = {
  start_image: "Primer fotograma",
  contextual_reference: "Referencia de la escena",
};

const IMAGE_RANGE: [number, number] = [4000, 5500];
const VIDEO_RANGE: [number, number] = [0, 4000];

// ───────────────────────── Pedir el desglose ─────────────────────────

function useRequestAnalysis(videoId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ analysisId: number }>(`/api/videos/${videoId}/desglose`, { method: "POST" }),
    onSuccess: ({ analysisId }) => {
      client.setQueryData<VideoViewJson>(["video", videoId], (view) =>
        view
          ? {
              ...view,
              analysis: { id: analysisId, version: (view.analysis?.version ?? 0) + 1, status: "queued",
                error: null,
                result: null,
                costMicros: null,
                referenceMediaId: view.video.referenceMediaId,
                avatarMode: view.video.avatarMode,
                autoAvatar: null,
                questions: [],
                stale: false,
                staleReason: null,
              },
            }
          : view,
      );
      void client.invalidateQueries({ queryKey: ["video", videoId] });
    },
  });
}

/** El motivo por el que no se pudo pedir el desglose (p. ej. «El desglose está en pausa (tope de gasto).»), junto al botón. */
function RequestError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {error.message}
    </p>
  );
}

function Requirement({ ok, icon: Icon, label }: { ok: boolean; icon: LucideIcon; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
        {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
      </span>
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className={cn(!ok && "text-muted-foreground")}>
        {label}
        <span className="sr-only">{ok ? " (hecho)" : " (falta)"}</span>
      </span>
    </li>
  );
}

/** Antes del primer desglose: qué falta y el botón. */
function StartPanel({ view, onGoToReference }: { view: VideoViewJson; onGoToReference: () => void }) {
  const { video, imageManifest, mine } = view;
  const request = useRequestAnalysis(video.id);
  // Preparada con otro gancho no cuenta: hay que volver a subirla.
  const reference = video.referenceStatus === "ready" && !view.referenceOutdated;
  const person = !["elegido", "biblioteca"].includes(video.avatarMode) || imageManifest.some((item) => item.role === "avatar");
  const article = imageManifest.some((item) => item.role === "articulo");
  const adapting = video.kind === "adaptacion_concepto";
  const adaptation = !adapting || !!video.adaptation?.trim();
  const ready = reference && person && article && adaptation;

  return (
    <Panel className="mx-auto w-full max-w-xl items-center py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <ul className="flex flex-col gap-2.5 text-left">
        <Requirement ok={reference} icon={Film} label="Vídeo de referencia" />
        <Requirement ok={person} icon={UserRound} label="Avatar, «Sin sustitución» o «No aparece nadie»" />
        <Requirement ok={article} icon={Package} label="Foto del artículo" />
        {adapting ? <Requirement ok={adaptation} icon={Shuffle} label="Qué adaptación quieres" /> : null}
      </ul>
      {mine ? (
        ready ? (
          <div className="flex flex-col items-center gap-2">
            <Button className="h-10 gap-2 px-5" disabled={request.isPending} onClick={() => request.mutate()}>
              {request.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              Hacer el desglose
            </Button>
            <span className="text-xs text-muted-foreground">Usa la IA de Claude; cuesta unos céntimos.</span>
            <RequestError error={request.error} />
          </div>
        ) : (
          <Button variant="outline" className="h-10 px-4" onClick={onGoToReference}>
            Completar la referencia
          </Button>
        )
      ) : null}
    </Panel>
  );
}

// ───────────────────────── Resultado ─────────────────────────

/** El fotograma más cercano a un segundo dado, para ilustrar cada plano. */
function nearestFrame(frames: VideoViewJson["frames"], seconds: number) {
  let best = frames[0];
  for (const frame of frames) if (Math.abs(frame.timeMs - seconds * 1000) < Math.abs(best.timeMs - seconds * 1000)) best = frame;
  return best;
}

/** Con `showFrames`, cada plano lleva el fotograma más cercano (no si el desglose es de otra referencia). */
function Shots({ view, analysis, showFrames }: { view: VideoViewJson; analysis: NonNullable<AnalysisJson["result"]>; showFrames: boolean }) {
  const { video, frames } = view;
  return (
    <ol className="flex flex-col gap-2" aria-label="Planos">
      {analysis.shots.map((shot, index) => {
        const frame = showFrames && frames.length > 0 ? nearestFrame(frames, shot.startS) : null;
        return (
          <li key={index} className="flex gap-3 rounded-lg border bg-background p-2.5">
            {frame ? (
              <div className="relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameUrl(video.id, frame.index, video.updatedAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {secondsLabel(shot.startS)} – {secondsLabel(shot.endS)}
              </span>
              <p className="flex gap-1.5">
                <Eye className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" role="img" aria-label="Qué se ve" />
                <span>{shot.seen}</span>
              </p>
              <p className="flex gap-1.5 text-muted-foreground">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0" role="img" aria-label="Qué pasa" />
                <span>{shot.action}</span>
              </p>
              {shot.onScreenText ? (
                <p className="flex gap-1.5">
                  <Type className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" role="img" aria-label="Texto en pantalla" />
                  <span className="italic">«{shot.onScreenText}»</span>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const ADAPTATION_ROWS = [
  ["physicalAction", "Acción"],
  ["visibleResult", "Resultado"],
  ["kept", "Se conserva"],
  ["changed", "Cambia"],
  ["why", "Por qué"],
] as const;

function Adaptation({ analysis }: { analysis: NonNullable<AnalysisJson["result"]> }) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Mapa de adaptación">
      {analysis.adaptation.map((item, index) => (
        <li key={index} className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <span className="text-muted-foreground line-through decoration-foreground/30">{item.original}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" role="img" aria-label="pasa a" />
            <span>{item.equivalent}</span>
          </p>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
            {ADAPTATION_ROWS.map(([field, label]) =>
              item[field] ? (
                <div key={field} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{item[field]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </li>
      ))}
    </ol>
  );
}

function Risks({ analysis }: { analysis: NonNullable<AnalysisJson["result"]> }) {
  if (analysis.risks.length === 0) return null;
  return (
    <ul className="grid gap-2 md:grid-cols-2" aria-label="Riesgos">
      {analysis.risks.map((risk, index) => (
        <li key={index} className="flex gap-2.5 rounded-lg bg-warning/10 px-3 py-2.5 text-sm ring-1 ring-warning/25">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
          <span className="min-w-0">
            <span className="font-semibold">{RISK_LABELS[risk.kind] ?? risk.kind}.</span> {risk.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** «La imagen se usa como»: dos opciones; se guarda al elegir. */
function FrameUsePicker({ video, readOnly }: { video: VideoJson; readOnly: boolean }) {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (frameUse: FrameUse) =>
      api<{ video: VideoJson }>(`/api/videos/${video.id}`, { method: "PUT", body: JSON.stringify({ frameUse }) }),
    onMutate: (frameUse) => {
      client.setQueryData<VideoViewJson>(["video", video.id], (v) => (v ? { ...v, video: { ...v.video, frameUse } } : v));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar."),
    onSettled: () => client.invalidateQueries({ queryKey: ["video", video.id] }),
  });
  const uses = Object.keys(FRAME_USE_LABELS) as FrameUse[];
  const selectedIndex = uses.indexOf(video.frameUse as FrameUse);
  const choose = (use: FrameUse) => {
    if (use !== video.frameUse) save.mutate(use);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span id={`uso-${video.id}`} className="text-sm font-semibold">
        La imagen se usa como
      </span>
      {readOnly ? (
        <span className="text-sm">{FRAME_USE_LABELS[video.frameUse as FrameUse] ?? video.frameUse}</span>
      ) : (
        <div role="radiogroup" aria-labelledby={`uso-${video.id}`} className="inline-flex rounded-lg bg-muted p-0.5">
          {uses.map((use, index) => {
            const on = index === selectedIndex;
            return (
              <button
                key={use}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={radioTabIndex(index, selectedIndex)}
                onClick={() => choose(use)}
                onKeyDown={(event) => onRadioKeyDown(event, (next) => choose(uses[next]))}
                className={cn(
                  "h-8 rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {FRAME_USE_LABELS[use]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Cambios de los prompts aún sin guardar (lo que no se ha tocado no está). */
export type PromptDraft = { imagePrompt?: string; videoPrompt?: string };
type SetDraft = React.Dispatch<React.SetStateAction<PromptDraft>>;

const isDirty = (draft: PromptDraft, video: VideoJson) =>
  (draft.imagePrompt !== undefined && draft.imagePrompt !== video.imagePrompt) ||
  (draft.videoPrompt !== undefined && draft.videoPrompt !== video.videoPrompt);

/** Los dos prompts, con su comprobación en vivo, y «Guardar cambios». */
function Prompts({ view, draft, setDraft }: { view: VideoViewJson; draft: PromptDraft; setDraft: SetDraft }) {
  const client = useQueryClient();
  const { video, mine } = view;
  const imagePrompt = draft.imagePrompt ?? video.imagePrompt ?? "";
  const videoPrompt = draft.videoPrompt ?? video.videoPrompt ?? "";
  const dirty = isDirty(draft, video);

  // La misma comprobación que el servidor, mientras se escribe.
  // Un prompt que aún no existe no da avisos (como en el servidor).
  const imageIssues: PromptIssue[] = useMemo(
    () => (mine && (video.imagePrompt !== null || draft.imagePrompt !== undefined) ? checkImagePrompt(imagePrompt, view.imageManifest) : view.imageIssues),
    [mine, video.imagePrompt, draft.imagePrompt, imagePrompt, view.imageManifest, view.imageIssues],
  );
  const videoIssues: PromptIssue[] = useMemo(
    () => (mine && (video.videoPrompt !== null || draft.videoPrompt !== undefined) ? checkVideoPrompt(videoPrompt, view.clipManifest) : view.videoIssues),
    [mine, video.videoPrompt, draft.videoPrompt, videoPrompt, view.clipManifest, view.videoIssues],
  );

  const save = useMutation({
    mutationFn: () =>
      api<{ video: VideoJson; imageIssues: PromptIssue[]; videoIssues: PromptIssue[] }>(`/api/videos/${video.id}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      }),
    onSuccess: (saved) => {
      client.setQueryData<VideoViewJson>(["video", video.id], (v) =>
        v ? { ...v, video: saved.video, imageIssues: saved.imageIssues, videoIssues: saved.videoIssues } : v,
      );
      setDraft({});
      toast.success("Cambios guardados.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudieron guardar los cambios."),
  });
  const submit = () => {
    if (dirty && !save.isPending) save.mutate();
  };

  return (
    <div className="flex flex-col gap-5">
      <FrameUsePicker video={video} readOnly={!mine} />
      <PromptEditor
        label="Imagen inicial"
        value={imagePrompt}
        onChange={(value) => setDraft((d) => ({ ...d, imagePrompt: value }))}
        issues={imageIssues}
        manifest={view.imageManifest}
        range={IMAGE_RANGE}
        readOnly={!mine}
        onSubmit={submit}
      />
      <PromptEditor
        label="Clip"
        value={videoPrompt}
        onChange={(value) => setDraft((d) => ({ ...d, videoPrompt: value }))}
        issues={videoIssues}
        manifest={view.clipManifest}
        range={VIDEO_RANGE}
        readOnly={!mine}
        onSubmit={submit}
      />
      {mine ? (
        <div className="flex items-center justify-end gap-3">
          {dirty ? (
            <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={() => setDraft({})} disabled={save.isPending}>
              Descartar
            </Button>
          ) : null}
          <Button className="h-9 gap-1.5 px-4" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────── Paso ─────────────────────────

/**
 * «Repetir desglose». Si hay cambios sin guardar en los prompts, primero pregunta: el desglose
 * nuevo trae sus propios prompts y esos cambios se perderían.
 */
function RepeatButton({ dirty, pending, onRepeat }: { dirty: boolean; pending: boolean; onRepeat: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-8 gap-1.5" disabled={pending} onClick={() => (dirty ? setAsking(true) : onRepeat())}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        Repetir desglose
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Repetir sin guardar los prompts?</DialogTitle>
            <DialogDescription>El desglose nuevo trae sus propios prompts.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-10 px-4" onClick={() => setAsking(false)}>
              Cancelar
            </Button>
            <Button
              className="h-10 px-4"
              onClick={() => {
                setAsking(false);
                onRepeat();
              }}
            >
              Repetir sin guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StepBreakdown({
  view,
  draft,
  setDraft,
  onGoToReference,
}: {
  view: VideoViewJson;
  /** Vive en el flujo: cambiar de paso no pierde lo escrito. */
  draft: PromptDraft;
  setDraft: SetDraft;
  onGoToReference: () => void;
}) {
  const { video, analysis, mine } = view;
  const request = useRequestAnalysis(video.id);

  if (!analysis) return <StartPanel view={view} onGoToReference={onGoToReference} />;

  // Con la referencia preparada para otro gancho no se puede repetir el desglose: primero, subirla de nuevo.
  const repeat = !mine ? null : view.referenceOutdated ? (
    <Button variant="outline" className="h-8 bg-background px-3" onClick={onGoToReference}>
      Ir a la referencia
    </Button>
  ) : (
    <RepeatButton
      dirty={isDirty(draft, video)}
      pending={request.isPending}
      onRepeat={() => {
        setDraft({});
        request.mutate();
      }}
    />
  );

  if (analysis.status === "queued" || analysis.status === "running") {
    return (
      <Panel>
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          Haciendo el desglose…
        </div>
      </Panel>
    );
  }

  const result = analysis.status === "done" ? analysis.result : null;
  const stale = analysis.stale && analysis.status === "done";
  const cost = analysis.costMicros !== null ? (
    <span className="text-sm text-muted-foreground tabular-nums" title="Lo que costó este desglose en Claude">
      {formatUsd(analysis.costMicros)}
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {analysis.status === "paused" || analysis.status === "failed" ? (
        <div
          role={analysis.status === "failed" ? "alert" : "status"}
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm",
            analysis.status === "failed" ? "bg-destructive/10" : "bg-warning/10",
          )}
        >
          {analysis.status === "failed" ? (
            <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
          ) : (
            <Loader2 className="size-4 shrink-0 animate-spin text-warning-ink" aria-hidden />
          )}
          <span className="min-w-0 flex-1">{analysis.error ?? "No se pudo hacer el desglose."}</span>
          {analysis.status === "failed" ? repeat : null}
        </div>
      ) : null}

      {stale ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/25">
          <TriangleAlert className="size-4 shrink-0 text-warning-ink" aria-hidden />
          <span className="min-w-0 flex-1">
            {view.referenceOutdated
              ? "El gancho ha cambiado: vuelve a subir el vídeo de referencia."
              : analysis.staleReason === "brief"
                ? "Las indicaciones del vídeo han cambiado."
                : "Este desglose es del vídeo de referencia anterior."}
          </span>
          {repeat}
        </div>
      ) : null}

      <RequestError error={request.error} />

      {result ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Panel
              title="Idea"
              actions={
                <div className="flex items-center gap-3">
                  {cost}
                  {stale ? null : repeat}
                </div>
              }
            >
              <p className={cn("text-lg leading-snug font-medium text-pretty", stale && "text-muted-foreground")}>{result.conceptLogic}</p>
              <Risks analysis={result} />
            </Panel>
            <Panel title="Planos" actions={<span className="text-sm text-muted-foreground tabular-nums">{result.shots.length}</span>}>
              <Shots view={view} analysis={result} showFrames={!stale} />
            </Panel>
            {result.adaptation.length > 0 ? (
              <Panel title="Adaptación">
                <Adaptation analysis={result} />
              </Panel>
            ) : null}
          </div>
          <Panel title="Prompts" className="xl:sticky xl:top-6">
            <Prompts view={view} draft={draft} setDraft={setDraft} />
          </Panel>
        </div>
      ) : video.imagePrompt !== null || video.videoPrompt !== null ? (
        <Panel title="Prompts">
          <Prompts view={view} draft={draft} setDraft={setDraft} />
        </Panel>
      ) : null}
    </div>
  );
}
