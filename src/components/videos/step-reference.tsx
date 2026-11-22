"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock, Film, Loader2, Plug, RefreshCw, Upload, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HiggsfieldStatus } from "@/server/higgsfield";
import { clockTime, frameUrl, MAX_SEGMENT_MS, secondsLabel, type ProductPhoto, type VideoJson, type VideoViewJson } from "./labels";
import { PhotoPick } from "./photo-pick";
import type { ReferenceUpload } from "./upload-provider";

const ACCEPT = "video/mp4,video/quicktime,video/webm";

// ───────────────────────── Piezas ─────────────────────────

function useHiggsfield(enabled: boolean) {
  return useQuery({
    queryKey: ["higgsfield", "estado"],
    queryFn: () => api<HiggsfieldStatus>("/api/higgsfield/estado"),
    enabled,
    staleTime: 60_000,
  });
}

/** Elegir un vídeo: con un clic (o Intro) o arrastrándolo encima. */
function UploadZone({ onFile, compact }: { onFile: (file: File) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      data-dropzone
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 text-center transition-colors",
        compact ? "py-8" : "min-h-80 py-12",
        over ? "border-foreground/60 bg-foreground/[0.04]" : "border-border",
      )}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir vídeo"
        data-testid="video-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Film className="size-5" aria-hidden />
      </span>
      <Button className="h-10 gap-2 px-4" onClick={() => input.current?.click()}>
        <Upload aria-hidden />
        {over ? "Suelta aquí" : "Subir vídeo"}
      </Button>
      <span className="text-xs text-muted-foreground">MP4, MOV o WebM · 100 MB</span>
    </div>
  );
}

function Notice({ tone, icon: Icon, children, action }: { tone: "warn" | "error"; icon: typeof CircleAlert; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2.5 text-sm",
        tone === "error" ? "bg-destructive/10" : "bg-amber-500/10",
      )}
    >
      <Icon className={cn("size-4 shrink-0", tone === "error" ? "text-destructive" : "text-amber-600")} aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

function UploadProgress({ upload }: { upload: Extract<ReferenceUpload, { kind: "uploading" }> }) {
  const percent = Math.floor(upload.fraction * 100);
  return (
    <div className="flex min-h-80 flex-col justify-center gap-4 rounded-xl bg-muted/40 px-8 py-12" data-testid="upload-progress">
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <span className="truncate">{upload.file.name}</span>
        </span>
        <span className="text-2xl font-semibold tabular-nums" data-testid="upload-percent">
          {percent} %
        </span>
      </div>
      <Progress value={percent} aria-label="Progreso de la subida" />
      <span className="text-sm text-muted-foreground">No cierres la pestaña</span>
    </div>
  );
}

function Processing() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl bg-muted/40 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      Preparando el vídeo…
    </div>
  );
}

/** Los fotogramas de la referencia, en vertical y en orden, con su segundo. */
function Frames({ view }: { view: VideoViewJson }) {
  const { video, frames } = view;
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-8" aria-label="Fotogramas">
      {frames.map((frame) => (
        <li key={frame.index} className="relative aspect-[9/16] overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frameUrl(video.id, frame.index, video.updatedAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          <span className="absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[11px] font-medium tabular-nums">
            {secondsLabel(frame.timeMs / 1000)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReferenceFacts({ video }: { video: VideoJson }) {
  const duration = video.referenceDurationMs ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
        <Clock className="size-4 text-muted-foreground" role="img" aria-label="Duración" />
        {clockTime(duration)}
      </span>
      {duration > MAX_SEGMENT_MS ? (
        <span className="text-muted-foreground">Se usan los primeros 30 segundos (el máximo del modelo).</span>
      ) : null}
    </div>
  );
}

// ───────────────────────── Paso ─────────────────────────

/** Lo que va en el panel de la referencia, según la subida del navegador y el estado del vídeo. */
function ReferenceBody({
  view,
  upload,
  canUpload,
  onFile,
}: {
  view: VideoViewJson;
  upload: ReferenceUpload;
  canUpload: boolean;
  onFile: (file: File) => void;
}) {
  const { video } = view;
  if (upload.kind === "uploading") return <UploadProgress upload={upload} />;

  const failedUpload =
    upload.kind === "failed" ? (
      <Notice
        tone="error"
        icon={CircleAlert}
        action={
          canUpload ? (
            <Button variant="outline" className="h-8 gap-1.5 bg-background" onClick={() => onFile(upload.file)}>
              <RefreshCw aria-hidden />
              Reintentar
            </Button>
          ) : null
        }
      >
        {upload.message}
      </Notice>
    ) : null;

  switch (video.referenceStatus) {
    case "processing":
      return <Processing />;
    case "ready":
      return (
        <div className="flex flex-col gap-4">
          {failedUpload}
          <ReferenceFacts video={video} />
          <Frames view={view} />
        </div>
      );
    default: {
      // «Subiendo» sin subida en este navegador: se recargó la página o se cerró a medias.
      const interrupted = video.referenceStatus === "uploading" && upload.kind === "idle";
      const failed = video.referenceStatus === "failed" && upload.kind === "idle" && video.referenceError;
      if (!canUpload) {
        return (
          <div className="flex flex-col gap-3">
            {failedUpload}
            <div className="grid min-h-60 place-items-center rounded-xl bg-muted/40 text-muted-foreground">
              <Film className="size-6" role="img" aria-label="Sin vídeo de referencia" />
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-3">
          {failedUpload}
          {failed ? (
            <Notice tone="error" icon={CircleAlert}>
              {video.referenceError}
            </Notice>
          ) : null}
          {interrupted ? (
            <Notice tone="warn" icon={CircleAlert}>
              La subida se ha interrumpido. Vuelve a elegir el vídeo.
            </Notice>
          ) : null}
          <UploadZone onFile={onFile} />
        </div>
      );
    }
  }
}

/** Botón «Cambiar vídeo» para sustituir una referencia lista. */
function ReplaceButton({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Elegir otro vídeo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button variant="outline" className="h-8 gap-1.5" onClick={() => input.current?.click()}>
        <RefreshCw aria-hidden />
        Cambiar vídeo
      </Button>
    </>
  );
}

export function StepReference({
  view,
  photos,
  upload,
  onUpload,
}: {
  view: VideoViewJson;
  photos: ProductPhoto[];
  upload: ReferenceUpload;
  onUpload: (file: File) => void;
}) {
  const client = useQueryClient();
  const { video, mine } = view;
  const higgsfield = useHiggsfield(mine);
  const status = higgsfield.data;
  const connected = !!status?.connected && !status.needsReconnect;
  const canUpload = mine && connected;
  const busy = upload.kind === "uploading" || video.referenceStatus === "processing";

  async function choose(changes: { avatarPhotoId?: number | null; environmentPhotoId?: number | null; noPerson?: boolean }) {
    const key = ["video", video.id];
    const before = client.getQueryData<VideoViewJson>(key);
    // Se ve al instante; si el servidor no lo acepta, vuelve a como estaba.
    client.setQueryData<VideoViewJson>(key, (v) => {
      if (!v) return v;
      const next = { ...v.video, ...changes };
      if (changes.noPerson === true) next.avatarPhotoId = null;
      if (typeof changes.avatarPhotoId === "number") next.noPerson = false;
      return { ...v, video: next };
    });
    try {
      await api(`/api/videos/${video.id}`, { method: "PUT", body: JSON.stringify(changes) });
    } catch (error) {
      if (before) client.setQueryData(key, before);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      void client.invalidateQueries({ queryKey: key });
    }
  }

  const needsConnection = mine && higgsfield.isSuccess && !connected && !busy;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel
        title="Vídeo de referencia"
        actions={canUpload && video.referenceStatus === "ready" && upload.kind !== "uploading" ? <ReplaceButton onFile={onUpload} /> : null}
      >
        {needsConnection ? (
          <Notice
            tone="warn"
            icon={Plug}
            action={
              <Link href="/ajustes" className={cn(buttonVariants({ variant: "outline" }), "h-8 bg-background")}>
                Ir a Ajustes
              </Link>
            }
          >
            {status?.needsReconnect ? "Vuelve a conectar tu Higgsfield para subir el vídeo." : "Conecta tu Higgsfield para subir el vídeo."}
          </Notice>
        ) : null}
        <ReferenceBody view={view} upload={upload} canUpload={canUpload} onFile={onUpload} />
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel title="Avatar">
          <PhotoPick
            productId={video.productId}
            role="avatar"
            photos={photos}
            selectedId={video.noPerson ? null : video.avatarPhotoId}
            onSelect={(id) => void choose({ avatarPhotoId: id })}
            readOnly={!mine}
            dimmed={video.noPerson}
          />
          {mine || video.noPerson ? (
            <label
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
                mine && "cursor-pointer hover:bg-muted/50",
                video.noPerson && "border-foreground/60 bg-muted/40",
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={video.noPerson}
                disabled={!mine}
                onChange={(event) => void choose({ noPerson: event.target.checked })}
              />
              <UserRoundX className="size-4 text-muted-foreground" aria-hidden />
              En este vídeo no aparece nadie
            </label>
          ) : null}
        </Panel>
        <Panel title="Entorno" actions={<span className="text-xs text-muted-foreground">Opcional</span>}>
          <PhotoPick
            productId={video.productId}
            role="entorno"
            photos={photos}
            selectedId={video.environmentPhotoId}
            onSelect={(id) => void choose({ environmentPhotoId: id })}
            readOnly={!mine}
          />
        </Panel>
      </div>
    </div>
  );
}
