"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock, Download, Film, FishingHook, Link2, Link2Off, Loader2, MonitorOff, Plug, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { linkLabel, linkOf } from "@/lib/links";
import { cn } from "@/lib/utils";
import type { HiggsfieldStatus } from "@/server/higgsfield";
import type { AvatarMode } from "@/server/videos/brief";
import { AVATAR_MODE_LABELS, avatarModeOf } from "./brief-labels";
import { BriefPanel } from "./brief-panel";
import { clockTime, frameUrl, MAX_SEGMENT_MS, secondsLabel, type ProductPhoto, type VideoJson, type VideoViewJson } from "./labels";
import { PhotoPick } from "./photo-pick";
import { LibraryPick } from "./library-pick";
import { VariantSelect, type VariantJson } from "@/components/batches/batch-fields";
import type { ReferenceUpload } from "./upload-provider";
import { requestLink, useMac } from "./use-mac";

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

function Notice({ tone, icon: Icon, children, action }: { tone: "warn" | "error" | "neutral"; icon: typeof CircleAlert; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2.5 text-sm",
        tone === "error" ? "bg-destructive/10" : tone === "warn" ? "bg-warning/10" : "bg-muted",
      )}
    >
      <Icon className={cn("size-4 shrink-0", tone === "error" ? "text-destructive" : tone === "warn" ? "text-warning-ink" : "text-muted-foreground")} aria-hidden />
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

/**
 * «Pegar enlace»: el Mac de quien lo pide descarga el vídeo y lo entrega. Sin Mac conectado, el
 * campo queda desactivado y lo dice.
 */
function LinkField({ videoId, offline, onRequested }: { videoId: number; offline: boolean; onRequested: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (busy || offline) return;
    if (linkOf(url) === null) {
      setError("Solo se admiten enlaces de Instagram, TikTok, YouTube o Facebook.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestLink(videoId, url);
      setUrl("");
      onRequested();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo pedir el enlace.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="url"
            inputMode="url"
            aria-label="Pegar enlace"
            aria-invalid={error !== null || undefined}
            placeholder="Pegar enlace (Instagram, TikTok…)"
            value={url}
            disabled={offline || busy}
            spellCheck={false}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            className="h-10 pl-9"
          />
        </div>
        <Button type="submit" variant="outline" className="h-10 shrink-0 gap-2 px-4" disabled={offline || busy || url.trim() === ""}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          Traer vídeo
        </Button>
      </div>
      {offline ? (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MonitorOff className="size-3.5 shrink-0" aria-hidden />
          El Mac no responde (apagado o sin conexión): los enlaces los trae él. Enciéndelo o sube el archivo del vídeo.
        </p>
      ) : error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** El Mac está trayendo (o va a traer) el enlace pegado. `compact`: encima de una referencia que sigue lista. */
function LinkPending({ link, compact }: { link: NonNullable<VideoViewJson["link"]>; compact?: boolean }) {
  const { host, code } = linkLabel(link.url);
  const text = link.status === "queued" ? "En cola: el Mac lo traerá enseguida…" : "El Mac está descargando el vídeo…";
  if (compact) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warning/10 px-3 py-2.5 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin text-warning-ink" aria-hidden />
        <span className="min-w-0 flex-1">{text}</span>
        <span className="truncate text-xs text-muted-foreground" title={link.url}>
          {host} {code}
        </span>
      </div>
    );
  }
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl bg-muted/40 px-6 text-center text-sm text-muted-foreground" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="text-foreground">{text}</span>
      <span className="max-w-full truncate text-xs" title={link.url}>
        {host} {code}
      </span>
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
  const segment = video.segmentDurationMs ?? duration;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
        <Clock className="size-4 text-muted-foreground" role="img" aria-label="Duración" />
        {clockTime(duration)}
      </span>
      {video.kind === "solo_gancho" && segment < duration ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
          <FishingHook className="size-4" aria-hidden />
          Gancho: los primeros {secondsLabel(segment / 1000)}
        </span>
      ) : duration > MAX_SEGMENT_MS ? (
        <span className="text-muted-foreground">Se usan los primeros 30 segundos (el máximo del modelo).</span>
      ) : null}
    </div>
  );
}

/**
 * «Automático» (el desglose elige de la biblioteca alguien parecido a la persona de la
 * referencia), «Sin sustitución» (se conservan las personas de la referencia) y «No aparece
 * nadie»: junto a las fotos de avatar y la biblioteca, las otras formas de decir quién sale.
 * Elegir una foto o un avatar de la biblioteca sale de estos modos.
 */
function AvatarModes({
  mode,
  readOnly,
  autoLabel,
  onChange,
}: {
  mode: AvatarMode;
  readOnly: boolean;
  /** Con «Automático»: «→ mujer 7» si ya eligió. */
  autoLabel: string | null;
  onChange: (mode: AvatarMode) => void;
}) {
  const options = (["automatico", "sin_sustitucion", "nadie"] as const).filter((option) => !readOnly || option === mode);
  if (options.length === 0) return null;
  return (
    <div role="radiogroup" aria-label="Sin avatar" className="flex flex-col gap-2">
      {options.map((option) => {
        const on = mode === option;
        const { label, icon: Icon } = AVATAR_MODE_LABELS[option];
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={readOnly}
            onClick={() => onChange(on ? "elegido" : option)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              !readOnly && "hover:bg-muted/50",
              on && "border-foreground/60 bg-muted/40 font-medium",
            )}
          >
            <span
              aria-hidden
              className={cn("grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-foreground" : "border-foreground/30")}
            >
              {on ? <span className="size-2 rounded-full bg-foreground" /> : null}
            </span>
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            {label}
            {option === "automatico" && on && autoLabel ? <span className="ml-auto truncate text-muted-foreground">→ {autoLabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Paso ─────────────────────────

/**
 * Lo que va en el panel de la referencia, según la subida del navegador, el enlace pegado y el
 * estado del vídeo. `linkField`: el campo «Pegar enlace», para quien puede usarlo (`null` si no).
 */
function ReferenceBody({
  view,
  upload,
  canUpload,
  onFile,
  linkField,
  onRetryLink,
}: {
  view: VideoViewJson;
  upload: ReferenceUpload;
  canUpload: boolean;
  onFile: (file: File) => void;
  linkField: React.ReactNode;
  onRetryLink: (url: string) => void;
}) {
  const { video, link } = view;
  if (upload.kind === "uploading") return <UploadProgress upload={upload} />;
  const pending = link && link.status !== "failed" ? link : null;
  // El enlace que no se pudo traer; si el vídeo se quedó sin referencia, ese mismo texto ya es su error.
  const failedLink =
    link?.status === "failed" ? (
      <Notice
        tone="neutral"
        icon={Link2Off}
        action={
          canUpload && linkField ? (
            <Button variant="outline" className="h-8 gap-1.5 bg-background" onClick={() => onRetryLink(link.url)}>
              <RefreshCw aria-hidden />
              Reintentar
            </Button>
          ) : null
        }
      >
        {link.error}
      </Notice>
    ) : null;

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
          {view.referenceOutdated ? (
            <Notice tone="warn" icon={FishingHook} action={canUpload ? <ReplaceButton onFile={onFile} label="Subir de nuevo" /> : null}>
              El gancho ha cambiado: vuelve a subir el vídeo.
            </Notice>
          ) : null}
          {/* La referencia sigue lista mientras el Mac trae la nueva, y también si el enlace falla. */}
          {pending ? <LinkPending link={pending} compact /> : failedLink}
          <ReferenceFacts video={video} />
          <Frames view={view} />
          {canUpload && !pending ? linkField : null}
        </div>
      );
    default: {
      if (pending) {
        return (
          <div className="flex flex-col gap-3">
            {failedUpload}
            <LinkPending link={pending} />
            {/* Subir un archivo sigue siendo posible: deja sin efecto el enlace. */}
            {canUpload ? <UploadZone onFile={onFile} compact /> : null}
          </div>
        );
      }
      // «Subiendo» sin subida en este navegador: se recargó la página o se cerró a medias.
      const interrupted = video.referenceStatus === "uploading" && upload.kind === "idle";
      const failed = video.referenceStatus === "failed" && upload.kind === "idle" && video.referenceError && !failedLink;
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
          {failedLink}
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
          {linkField}
        </div>
      );
    }
  }
}

/** Botón «Cambiar vídeo» para sustituir una referencia lista. */
function ReplaceButton({ onFile, label = "Cambiar vídeo" }: { onFile: (file: File) => void; label?: string }) {
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
      <Button variant="outline" className="h-8 gap-1.5 bg-background" onClick={() => input.current?.click()}>
        <RefreshCw aria-hidden />
        {label}
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
  // «Pegar enlace» solo para quien puede tener un Mac (el dueño), en sus propios vídeos.
  const mac = useMac();
  const refresh = () => void client.invalidateQueries({ queryKey: ["video", video.id] });
  const linkField = canUpload && mac.own ? <LinkField videoId={video.id} offline={!mac.online} onRequested={refresh} /> : null;
  async function retryLink(url: string) {
    try {
      await requestLink(video.id, url);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reintentar.");
    }
  }

  async function choose(changes: {
    avatarPhotoId?: number | null;
    avatarLibraryId?: number | null;
    environmentPhotoId?: number | null;
    avatarMode?: AvatarMode;
    variantId?: number | null;
  }) {
    const key = ["video", video.id];
    const before = client.getQueryData<VideoViewJson>(key);
    // Se ve al instante; si el servidor no lo acepta, vuelve a como estaba.
    client.setQueryData<VideoViewJson>(key, (v) => {
      if (!v) return v;
      const next = { ...v.video, ...changes };
      if (typeof changes.avatarPhotoId === "number") next.avatarMode = "elegido";
      if (typeof changes.avatarLibraryId === "number") next.avatarMode = "biblioteca";
      if (next.avatarMode !== "elegido") next.avatarPhotoId = null;
      if (next.avatarMode !== "biblioteca") next.avatarLibraryId = null;
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
  const avatarMode = avatarModeOf(video.avatarMode);
  const auto = avatarMode === "automatico" && view.analysis && !view.analysis.stale ? view.analysis.autoAvatar : null;
  const variants = useQuery({
    queryKey: ["variants", video.productId],
    queryFn: () => api<{ variants: VariantJson[] }>(`/api/productos/${video.productId}/variantes`),
  });
  const variantList = variants.data?.variants ?? [];

  return (
    <div className="flex flex-col gap-6">
      <BriefPanel view={view} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Vídeo de referencia"
          actions={
            canUpload && video.referenceStatus === "ready" && !view.referenceOutdated && upload.kind !== "uploading" ? <ReplaceButton onFile={onUpload} /> : null
          }
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
          <ReferenceBody view={view} upload={upload} canUpload={canUpload} onFile={onUpload} linkField={linkField} onRetryLink={(url) => void retryLink(url)} />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Avatar">
            <PhotoPick
              productId={video.productId}
              role="avatar"
              photos={photos}
              selectedId={avatarMode === "elegido" ? video.avatarPhotoId : null}
              onSelect={(id) => void choose({ avatarPhotoId: id })}
              readOnly={!mine}
              dimmed={avatarMode !== "elegido"}
            />
            <LibraryPick
              selectedId={avatarMode === "biblioteca" ? video.avatarLibraryId : null}
              autoId={auto?.id ?? null}
              onSelect={(id) => void choose({ avatarLibraryId: id })}
              readOnly={!mine}
              dimmed={avatarMode !== "biblioteca" && avatarMode !== "automatico"}
            />
            <AvatarModes mode={avatarMode} readOnly={!mine} autoLabel={auto?.name ?? null} onChange={(mode) => void choose({ avatarMode: mode })} />
          </Panel>
          {variantList.length > 0 ? (
            <Panel title="Variante">
              {mine ? (
                <VariantSelect variants={variantList} value={video.variantId} onChange={(variantId) => void choose({ variantId })} />
              ) : (
                <p className="text-sm">{variantList.find((variant) => variant.id === video.variantId)?.name ?? "Fotos de siempre"}</p>
              )}
            </Panel>
          ) : null}
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
    </div>
  );
}
