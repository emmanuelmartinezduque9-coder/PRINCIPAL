"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, CircleAlert, CircleHelp, Clapperboard, Coins, Download, Ellipsis, Eye, Film, ImageIcon, Link2, Link2Off, ListFilter, Loader2, Pencil, Play, RefreshCw, ScanSearch, Scissors, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ActionBar } from "@/components/shell/action-bar";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MusicPicker } from "@/components/songs/music-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarImageUrl } from "@/components/avatars/labels";
import { AVATAR_MODE_LABELS, KIND_LABELS } from "@/components/videos/brief-labels";
import { creditsLabel, formatCredits } from "@/components/videos/labels";
import { EditDownload, editDownloadUrl, EditNotice, EditPlayer, SelfCheck, StartEditButton, useStartEdit } from "@/components/videos/edit-parts";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import { requestLink, useMac } from "@/components/videos/use-mac";
import { api, ApiError } from "@/lib/api";
import { linkLabel } from "@/lib/links";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AutoAction, AutoStepper, PauseBanner, SendBatchButton } from "./auto-send";
import type { VariantJson } from "./batch-fields";
import { AutoAnalyzeSwitch, GroupHeader, RiskChip, RowActions } from "./board-parts";
import { BulkGenerate } from "./bulk-generate";
import { checkLink, EditReferenceField, rowSupportsEditReference } from "./edit-reference";
import {
  analysisState,
  editState,
  failedLink,
  generationState,
  needsReview,
  pollEvery,
  ready,
  linkNotice,
  referenceState,
  rowProblem,
  rowState,
  videoHref,
  type BatchRowJson,
  type BatchViewJson,
  type LocalUpload,
  type StepState,
  type Tone,
} from "./labels";
import { batchZipUrl, downloadInBackground, FinishedDownloads } from "./finished-downloads";
import { RowThumb } from "./row-thumb";
import { runPool } from "./run-pool";

const TONE: Record<Tone, { chip: string; dot: string }> = {
  off: { chip: "text-muted-foreground", dot: "bg-foreground/25" },
  busy: { chip: "bg-warning/12 text-foreground ring-1 ring-warning/20", dot: "bg-warning" },
  review: { chip: "bg-info/12 text-foreground ring-1 ring-info/25", dot: "bg-info" },
  ok: { chip: "bg-success/12 text-foreground ring-1 ring-success/20", dot: "bg-success" },
  error: { chip: "bg-destructive/10 text-foreground ring-1 ring-destructive/20", dot: "bg-destructive" },
};

/** Estado de un paso: punto de color + palabra; el error, en el título. */
function StepChip({ state }: { state: StepState }) {
  return (
    <span
      title={state.detail ?? undefined}
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap", TONE[state.tone].chip)}
    >
      {state.tone === "busy" ? (
        <Loader2 className="size-3 animate-spin text-warning-ink" aria-hidden />
      ) : state.tone === "off" ? null : (
        <span aria-hidden className={cn("size-1.5 rounded-full", TONE[state.tone].dot)} />
      )}
      {state.label}
    </span>
  );
}

/** Quién sale: la cara en redondo («Automático», con su chispa); los demás modos, su icono. */
function AvatarCell({ row }: { row: BatchRowJson }) {
  const library = row.libraryAvatar ?? row.autoAvatar;
  const auto = row.avatarMode === "automatico";
  const title = library ? (auto ? `Automático → ${library.name}` : library.name) : row.avatarMode === "elegido" && row.avatarPhotoId === null ? "Sin avatar elegido" : AVATAR_MODE_LABELS[row.avatarMode].label;
  const face = (() => {
    if (library) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={avatarImageUrl(library.id)} alt={title} className="size-8 rounded-full object-cover ring-1 ring-foreground/10" />;
    }
    if (row.avatarMode === "elegido" && row.avatarPhotoId !== null) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={`/api/fotos/${row.avatarPhotoId}`} alt="Avatar" className="size-8 rounded-full object-cover ring-1 ring-foreground/10" />;
    }
    if (row.avatarMode === "elegido") {
      return (
        <span className="grid size-8 place-items-center rounded-full border border-dashed border-warning text-warning-ink">
          <CircleHelp className="size-4" aria-label="Sin avatar" />
        </span>
      );
    }
    const { label, icon: Icon } = AVATAR_MODE_LABELS[row.avatarMode];
    return (
      <span className={cn("grid size-8 place-items-center rounded-full", auto ? "bg-brand/12 text-brand-ink ring-1 ring-brand/25" : "bg-muted text-muted-foreground")}>
        <Icon className="size-4" aria-label={label} />
      </span>
    );
  })();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex size-8" tabIndex={0}>
          {face}
          {auto && library ? (
            <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-brand text-brand-foreground ring-2 ring-card">
              <Sparkles className="size-2.5" aria-hidden />
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

/** La variante de la fila como muestra pequeña (solo si el producto tiene variantes). */
function VariantCell({ row, variants, coverPhotoId }: { row: BatchRowJson; variants: VariantJson[] | undefined; coverPhotoId: number | null }) {
  if (!variants || variants.length === 0) return null;
  const variant = variants.find((v) => v.id === row.variantId);
  const photo = variant ? (variant.articlePhotoIds[0] ?? variant.packagingPhotoId ?? null) : coverPhotoId;
  const name = variant?.name ?? "Fotos de siempre";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`Variante: ${name}`} className="relative grid size-7 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground ring-1 ring-foreground/10">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/fotos/${photo}`} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <ImageIcon className="size-3.5" aria-hidden />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

function CostCell({ row }: { row: BatchRowJson }) {
  const { higgsfieldCredits, claudeMicros } = row.costs;
  if (higgsfieldCredits === 0 && claudeMicros === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-end leading-tight tabular-nums">
      <span>{creditsLabel(higgsfieldCredits)}</span>
      {claudeMicros > 0 ? <span className="text-xs text-muted-foreground">{formatUsd(claudeMicros)}</span> : null}
    </div>
  );
}

const KIND_TINT: Record<BatchRowJson["kind"], string> = {
  replicar: "bg-muted text-muted-foreground",
  adaptacion_concepto: "bg-kind-adapt/12 text-kind-adapt",
  solo_gancho: "bg-kind-hook/12 text-kind-hook",
};

/**
 * El tipo del vídeo: icono y palabra corta, con el nombre entero en el título. Con «Solo gancho»,
 * «gancho + N» (N = cuerpos que lleva detrás) y, en el título, los segundos del gancho.
 */
function KindChip({ row }: { row: BatchRowJson }) {
  const { short, long, icon: Icon } = KIND_LABELS[row.kind];
  const hookOnly = row.kind === "solo_gancho";
  const bodies = row.bodies === 1 ? "1 cuerpo" : `${row.bodies} cuerpos`;
  return (
    <span
      title={hookOnly ? `${long} · ${row.hookSeconds} s · ${bodies}` : long}
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium tabular-nums", KIND_TINT[row.kind])}
    >
      <Icon className="size-3" aria-hidden />
      {hookOnly ? `Gancho + ${row.bodies}` : short}
    </span>
  );
}

/** De dónde viene la referencia cuando es un enlace pegado: el sitio y el código, con la dirección entera en el título. */
function LinkSource({ url }: { url: string }) {
  const { host, code } = linkLabel(url);
  return (
    <span title={url} className="inline-flex max-w-full min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <Link2 className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {host}
        {code ? <span className="text-foreground/70"> {code}</span> : null}
      </span>
    </span>
  );
}

/** «Reintentar»: vuelve a pedir al Mac el enlace que falló. */
function RetryLink({ row, url, onDone }: { row: BatchRowJson; url: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      await requestLink(row.id, url);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reintentar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" className="h-7 gap-1.5 px-2 text-xs" disabled={busy} onClick={() => void retry()}>
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
      Reintentar
    </Button>
  );
}

/**
 * «Cambiar enlace»: para una fila cuyo enlace falló o cuya referencia aún no está lista, pide al
 * Mac otro enlace (se valida como al pegar; el servidor acepta cualquier enlace admitido). `inline`:
 * botón con texto junto a «Enlace no disponible», en vez del lápiz de la columna de acciones.
 */
function ChangeLink({ row, onDone, inline = false }: { row: BatchRowJson; onDone: () => void; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const checked = checkLink(text);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    try {
      await requestLink(row.id, checked.url);
      setOpen(false);
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo cambiar el enlace.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setText(row.link?.url ?? "");
          setError(null);
        }
      }}
    >
      {inline ? (
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-7 gap-1.5 px-2 text-xs">
            <Pencil data-icon="inline-start" />
            Cambiar enlace
          </Button>
        </PopoverTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Cambiar enlace de ${row.title}`}>
                <Pencil aria-hidden />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Cambiar enlace</TooltipContent>
        </Tooltip>
      )}
      <PopoverContent className="flex w-96 flex-col gap-2" align="end">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              aria-label="Enlace nuevo"
              aria-invalid={error !== null || undefined}
              placeholder="Enlace de Instagram, TikTok…"
              value={text}
              spellCheck={false}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              className="h-9 pl-8"
            />
          </div>
          <Button type="submit" className="h-9 px-3" disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Cambiar
          </Button>
        </form>
        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** «Edición de referencia» de una fila ya creada: se guarda en el vídeo (`editReferenceUrl`). */
function EditReferenceCell({ row, onDone }: { row: BatchRowJson & { editReferenceUrl?: string | null }; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const value = row.editReferenceUrl ?? "";
  const label = value ? `Edición de referencia: ${linkLabel(value).host}` : "Edición de referencia";
  async function save(url: string | null) {
    try {
      await api(`/api/videos/${row.id}`, { method: "PUT", body: JSON.stringify({ editReferenceUrl: url }) });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8 text-muted-foreground", value && "bg-brand/10 text-brand-ink hover:bg-brand/15 hover:text-brand-ink")}
              aria-label={label}
            >
              <Clapperboard aria-hidden />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-96" align="end">
        {open ? <EditReferenceField value={value} onSave={save} onClose={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}


/**
 * Descargas sueltas: se abren en segundo plano (el servidor responde con el archivo adjunto o
 * redirige al almacén con el nombre puesto). Un respiro entre una y otra para que el navegador no
 * las bloquee.
 */
async function downloadClip(videoId: number): Promise<void> {
  downloadInBackground(`/api/videos/${videoId}/clip/descargar`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

/** Descarga la última versión montada de un vídeo («EisWerk - 03 - 2026-11-23.mp4»). */
async function downloadEdit(row: BatchRowJson): Promise<void> {
  const version = row.edit.latest?.version;
  if (version === undefined) return;
  downloadInBackground(editDownloadUrl(row.id, version));
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * Montaje de una fila: con versión montada, abre el reproductor (descargar y «Volver a montar»
 * dentro); sin ella, «Montar» si quien mira puede.
 */
function EditCell({ row, state, onDone }: { row: BatchRowJson; state: StepState; onDone: () => void }) {
  const start = useStartEdit(row.id, onDone);
  if (row.edit.latest) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Ver ${row.title} editado`}
            className="group/edit inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <StepChip state={state} />
            <Play className="size-3.5 text-success-ink transition-transform duration-150 group-hover/edit:scale-110" aria-hidden />
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[44rem]">
          <DialogHeader>
            <DialogTitle>{row.title}</DialogTitle>
          </DialogHeader>
          <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,320px)_1fr]">
            <EditPlayer videoId={row.id} edit={row.edit} />
            <div className="flex flex-col gap-3">
              <EditNotice edit={row.edit} />
              <EditDownload videoId={row.id} edit={row.edit} />
              <StartEditButton videoId={row.id} edit={row.edit} onDone={onDone} />
              <SelfCheck edit={row.edit} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!row.edit.canStart) return <StepChip state={state} />;
  return (
    <span className="inline-flex items-center gap-0.5">
      <StepChip state={state} />
      <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={`Montar ${row.title}`}
          disabled={start.isPending}
          onClick={() => {
            if (!start.isPending) start.mutate();
          }}
        >
          {start.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Scissors aria-hidden />}
        </Button>
      </TooltipTrigger>
        <TooltipContent>{row.edit.status === "fallido" ? "Volver a montar" : "Montar"}</TooltipContent>
      </Tooltip>
    </span>
  );
}

/** Esqueleto del tablero mientras carga: cabecera, pasos y un grupo con filas. */
function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Cargando el lote">
      <div className="flex flex-col gap-3 pt-7">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-56" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="panel flex flex-col gap-4 p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-xl" />
          <Skeleton className="h-6 w-48" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-20 w-11 rounded-md" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** `/lotes/[id]`: una fila por vídeo con el estado de cada paso y, abajo, la acción principal. */
export function BatchBoard({ batchId }: { batchId: number }) {
  const client = useQueryClient();
  const mac = useMac();
  const { uploads } = useReferenceUploads();
  const uploading = Object.values(uploads).some((upload) => upload.kind === "uploading");
  const query = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => api<BatchViewJson>(`/api/lotes/${batchId}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
    refetchInterval: (q) => pollEvery(q.state.data, uploading),
  });
  const productIds = (query.data?.groups ?? []).map((group) => group.productId);
  const variantQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ["variants", id],
      queryFn: () => api<{ variants: VariantJson[] }>(`/api/productos/${id}/variantes`),
      staleTime: 60_000,
    })),
  });
  const variantsOf = (productId: number) => variantQueries[productIds.indexOf(productId)]?.data?.variants;
  /** El último error de una acción en bloque en cada fila (se borra cuando la fila vuelve a ir bien). */
  // Con el estado de la fila en ese momento (`rowState`): en cuanto la fila cambia, el aviso ya no se enseña.
  const [notices, setNotices] = useState<Record<number, { message: string; at: string }>>({});
  /** La acción en bloque en marcha: solo una a la vez, así nunca hay más de 2 peticiones en vuelo. */
  const [running, setRunning] = useState<null | "breakdown" | "download" | "edited" | "generate">(null);
  const inFlight = useRef(false);
  const [downloaded, setDownloaded] = useState(0);
  /** «Por revisar»: solo las filas con algo que mirar. */
  const [onlyReview, setOnlyReview] = useState(false);
  /** «Generar imágenes/clips» abierto desde el menú «…». */
  const [bulk, setBulk] = useState<null | "frame" | "clip">(null);

  const back = { href: "/lotes", label: "Lotes" };
  if (query.isLoading) return <BoardSkeleton />;
  const data = query.data;
  if (query.isError || !data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title={notFound ? "Lote no encontrado" : "No se pudo abrir el lote"} />
        <EmptyState
          icon={SearchX}
          title={notFound ? "Este lote no existe" : "Algo ha fallado"}
          action={
            <Link href="/lotes" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Ver los lotes
            </Link>
          }
        />
      </div>
    );
  }

  const rows = data.rows;
  const auto = data.auto;
  const refresh = () => void client.invalidateQueries({ queryKey: ["batch", batchId] });
  const uploadOf = (row: BatchRowJson): LocalUpload => uploads[row.id] ?? { kind: "idle" };
  const forBreakdown = rows.filter(ready.breakdown);
  const forFrame = rows.filter(ready.frame);
  const forReview = rows.filter(ready.review);
  const forClip = rows.filter(ready.clip);
  const forDownload = rows.filter(ready.download);
  const forEdited = rows.filter(ready.edited);
  // Todos los vídeos con un montaje terminado (también los de otras personas que quien mira ve).
  const editedTotal = rows.filter((row) => row.edit.latest !== null).length;
  const credits = rows.reduce((sum, row) => sum + row.costs.higgsfieldCredits, 0);
  const note = (results: Record<number, string | null>) =>
    setNotices((all) => {
      const next = { ...all };
      for (const [key, message] of Object.entries(results)) {
        const row = rows.find((r) => r.id === Number(key));
        if (message === null || !row) delete next[Number(key)];
        else next[Number(key)] = { message, at: rowState(row) };
      }
      return next;
    });
  const done = rows.filter((row) => row.clipReady).length;
  const toReview = rows.filter((row) => needsReview(row, uploadOf(row)));
  const shown = onlyReview ? toReview : rows;
  /** Se puede cambiar el enlace: es suyo, quien mira tiene Mac, y el enlace falló o la referencia aún no está lista. */
  const canChangeLink = (row: BatchRowJson) =>
    row.mine && mac.own && (failedLink(row) !== null || (row.referenceStatus !== "ready" && row.referenceStatus !== "processing" && uploadOf(row).kind !== "uploading"));
  const anyBulk = forBreakdown.length + forFrame.length + forReview.length + forClip.length + forDownload.length + forEdited.length > 0;

  async function breakdownAll() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning("breakdown");
    const results = await runPool(forBreakdown, 2, (row) => api(`/api/videos/${row.id}/desglose`, { method: "POST" }));
    note(Object.fromEntries(forBreakdown.map((row, i) => [row.id, results[i].ok ? null : message((results[i] as { error: unknown }).error, "No se pudo desglosar.")])));
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) toast.error(failed === 1 ? "1 vídeo no se ha podido desglosar." : `${failed} vídeos no se han podido desglosar.`);
    setRunning(null);
    inFlight.current = false;
    refresh();
  }

  async function downloadAll(edited = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(edited ? "edited" : "download");
    setDownloaded(0);
    const report: Record<number, string | null> = {};
    // De uno en uno: cada vídeo se guarda antes de pedir el siguiente.
    for (const row of edited ? forEdited : forDownload) {
      try {
        if (edited) await downloadEdit(row);
        else await downloadClip(row.id);
        report[row.id] = null;
      } catch (error) {
        report[row.id] = message(error, edited ? "No se pudo descargar el vídeo editado." : "No se pudo descargar el clip.");
      }
      setDownloaded((n) => n + 1);
    }
    note(report);
    setRunning(null);
    inFlight.current = false;
  }

  /** «Música» de una fila: se guarda en el vídeo (no cambia el desglose ni la generación). */
  async function chooseSong(videoId: number, songId: number | null) {
    try {
      await api(`/api/videos/${videoId}`, { method: "PUT", body: JSON.stringify({ songId }) });
    } catch (error) {
      toast.error(message(error, "No se pudo guardar."));
    } finally {
      refresh();
    }
  }

  const generating = (on: boolean) => {
    inFlight.current = on;
    setRunning(on ? "generate" : null);
  };

  /** Lo mismo que decide `AutoAction`: hay algo que hacer ahora en el paso en que va el lote. */
  const autoActs = (auto.status === "preguntas" && (auto.questions > 0 || auto.readyToConfirm)) || (auto.status === "revision_imagenes" && forReview.length > 0);
  const finished = auto.status === "listo" || auto.status === "montado";
  const canDownloadAll = finished && forDownload.length > 0;
  const canDownloadEdited = forEdited.length > 0;
  const showBar = data.batch.mine && rows.length > 0 && (auto.status === "borrador" || autoActs || canDownloadAll || canDownloadEdited);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        back={back}
        title={data.batch.name}
        actions={
          data.batch.mine && rows.length > 0 && (anyBulk || toReview.length > 0 || onlyReview) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-1.5 px-3" aria-label="Más acciones" disabled={running !== null}>
                  {running !== null ? <Loader2 className="animate-spin" aria-hidden /> : <Ellipsis aria-hidden />}
                  Acciones
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56">
                {toReview.length > 0 || onlyReview ? (
                  <DropdownMenuItem onSelect={() => setOnlyReview((on) => !on)}>
                    <ListFilter aria-hidden />
                    {onlyReview ? "Ver todos" : `Por revisar (${toReview.length})`}
                  </DropdownMenuItem>
                ) : null}
                {forBreakdown.length > 0 ? (
                  <DropdownMenuItem onSelect={() => void breakdownAll()}>
                    <ScanSearch aria-hidden />
                    Desglosar ({forBreakdown.length})
                  </DropdownMenuItem>
                ) : null}
                {forFrame.length > 0 ? (
                  <DropdownMenuItem onSelect={() => setBulk("frame")}>
                    <Sparkles aria-hidden />
                    Generar imágenes ({forFrame.length})
                  </DropdownMenuItem>
                ) : null}
                {forReview.length > 0 ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/lotes/${batchId}/revisar`}>
                      <ImageIcon aria-hidden />
                      Revisar imágenes ({forReview.length})
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {forClip.length > 0 ? (
                  <DropdownMenuItem onSelect={() => setBulk("clip")}>
                    <Sparkles aria-hidden />
                    Generar clips ({forClip.length})
                  </DropdownMenuItem>
                ) : null}
                {forDownload.length > 0 ? (
                  <DropdownMenuItem onSelect={() => void downloadAll()}>
                    <Download aria-hidden />
                    Descargar clips ({forDownload.length})
                  </DropdownMenuItem>
                ) : null}
                {forEdited.length > 0 ? (
                  <DropdownMenuItem onSelect={() => void downloadAll(true)}>
                    <Scissors aria-hidden />
                    Descargar editados ({forEdited.length})
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5" title="Vídeos">
            <Film className="size-3.5" aria-hidden />
            {rows.length}
          </span>
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-muted px-2.5" title="Clips terminados">
            <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-foreground/10">
              <span className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} />
            </span>
            {done}/{rows.length}
          </span>
          {credits > 0 || auto.budgetCredits !== null ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5" title={auto.budgetCredits !== null ? "Comprometido / autorizado" : "Créditos"}>
              <Coins className="size-3.5" aria-hidden />
              {auto.budgetCredits !== null ? `${formatCredits(auto.committedCredits)}/${creditsLabel(auto.budgetCredits)}` : creditsLabel(credits)}
            </span>
          ) : null}
          <time dateTime={data.batch.createdAt} className="px-1">
            {format(new Date(data.batch.createdAt), "d MMM yyyy", { locale: es })}
          </time>
        </div>
      </PageHeader>

      {!data.batch.mine ? (
        <p role="status" className="flex items-center gap-2.5 rounded-xl bg-info/10 px-4 py-3 text-sm ring-1 ring-info/20">
          <Eye className="size-4 shrink-0 text-info-ink" aria-hidden />
          Solo lectura: cada vídeo lo continúa quien lo creó.
        </p>
      ) : null}

      {rows.length > 0 ? <AutoStepper auto={auto} /> : null}
      {data.batch.mine ? <PauseBanner batchId={batchId} auto={auto} rows={rows} /> : null}
      {/* Dónde están los vídeos terminados y cómo bajarlos al iPhone: arriba, destacado al terminar. */}
      <FinishedDownloads batchId={batchId} editedCount={editedTotal} total={rows.length} finished={auto.status === "montado"} />

      {/* Siempre montadas: un envío en bloque sigue enseñando sus resultados aunque ya no quede ninguna fila lista. */}
      <BulkGenerate kind="frame" rows={forFrame} disabled={running !== null} onRunning={generating} onResults={note} open={bulk === "frame"} onOpenChange={(o) => setBulk(o ? "frame" : null)} />
      <BulkGenerate kind="clip" rows={forClip} disabled={running !== null} onRunning={generating} onResults={note} open={bulk === "clip"} onOpenChange={(o) => setBulk(o ? "clip" : null)} />

      {rows.length === 0 ? (
        <EmptyState icon={Film} title="Este lote no tiene vídeos que puedas ver" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          tone="success"
          title="Nada por revisar"
          action={
            <Button variant="outline" className="h-9 px-4" onClick={() => setOnlyReview(false)}>
              Ver todos
            </Button>
          }
        />
      ) : (
        data.groups.map((group) => {
          const groupRows = shown.filter((row) => row.productId === group.productId);
          if (groupRows.length === 0) return null;
          const variants = variantsOf(group.productId);
          return (
            <section key={group.productId} aria-label={group.name} className="panel overflow-hidden">
              <GroupHeader batchId={batchId} group={group} editable={data.batch.mine} variants={variants} />
              {/* Columnas fijas: las tablas de todos los productos quedan alineadas. */}
              <Table className="min-w-[68rem] table-fixed">
                <TableHeader>
                  <TableRow className="bg-sunken/50 hover:bg-sunken/50">
                    <TableHead className="w-16 pl-5" />
                    <TableHead>Vídeo</TableHead>
                    <TableHead className="w-24">Quién</TableHead>
                    <TableHead className="w-24">Música</TableHead>
                    <TableHead className="w-36">Referencia</TableHead>
                    <TableHead className="w-28">Desglose</TableHead>
                    <TableHead className="w-26">Imagen</TableHead>
                    <TableHead className="w-36">Clip</TableHead>
                    <TableHead className="w-20 text-right">Coste</TableHead>
                    <TableHead className="w-36 pr-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupRows.map((row) => {
                    const upload = uploadOf(row);
                    const states = [
                      referenceState(row, upload),
                      analysisState(row),
                      generationState(row.frame, "frame"),
                      // Con el clip hecho, la columna enseña su montaje.
                      row.edit.status === "none" ? generationState(row.clip, "clip") : editState(row.edit),
                    ];
                    // El error de la última acción en bloque y, si no hay, el del enlace o el del paso que falló.
                    const notice = notices[row.id];
                    const failure = rowProblem(row, states);
                    const problem = (notice && notice.at === rowState(row) ? notice.message : null) ?? failure?.message ?? null;
                    const retryUrl = problem !== null && problem === failure?.message ? failure.link : null;
                    // «Enlace no disponible»: un estado neutro, con «Reintentar» y «Cambiar enlace» al lado.
                    const linkDown = problem !== null && problem === failure?.message && failure.neutral === true;
                    // Aparte, y sin ser un fallo de la fila: un enlace nuevo que no llegó sobre una referencia que sigue lista.
                    const aside = linkNotice(row);
                    return (
                      <TableRow key={row.id} className="group/tr">
                        <TableCell className="py-3 pl-5">
                          <Link href={videoHref(row)} tabIndex={-1} aria-hidden className="block transition-transform duration-150 group-hover/tr:-translate-y-px">
                            <RowThumb row={row} busy={upload.kind === "uploading"} className="h-20 w-[2.8rem] rounded-lg shadow-card" />
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={videoHref(row)} className="rounded font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                              {row.title}
                            </Link>
                            <KindChip row={row} />
                            <RiskChip risks={row.risks} />
                          </div>
                          {row.link ? (
                            <div className="mt-0.5 flex min-w-0">
                              <LinkSource url={row.link.url} />
                            </div>
                          ) : null}
                          {row.note ? <div className="mt-0.5 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{row.note}</div> : null}
                          {problem && linkDown ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p role="status" className="flex items-start gap-1 text-xs text-muted-foreground">
                                <Link2Off className="mt-px size-3.5 shrink-0" aria-hidden />
                                {problem}
                              </p>
                              {retryUrl ? <RetryLink row={row} url={retryUrl} onDone={refresh} /> : null}
                              {canChangeLink(row) ? <ChangeLink row={row} onDone={refresh} inline /> : null}
                            </div>
                          ) : problem ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p role="alert" className="flex items-start gap-1 text-xs text-destructive">
                                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                                {problem}
                              </p>
                              {retryUrl ? <RetryLink row={row} url={retryUrl} onDone={refresh} /> : null}
                            </div>
                          ) : null}
                          {aside ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p role="status" className="flex items-start gap-1 text-xs text-muted-foreground">
                                <Link2Off className="mt-px size-3.5 shrink-0" aria-hidden />
                                {aside.message}
                              </p>
                              {aside.link ? <RetryLink row={row} url={aside.link} onDone={refresh} /> : null}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AvatarCell row={row} />
                            <VariantCell row={row} variants={variants} coverPhotoId={group.coverPhotoId} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <MusicPicker compact value={row.song} readOnly={!row.songEditable} onChange={(song) => void chooseSong(row.id, song?.id ?? null)} />
                        </TableCell>
                        {states.map((state, index) => (
                          <TableCell key={index}>
                            {index === states.length - 1 ? <EditCell row={row} state={state} onDone={refresh} /> : <StepChip state={state} />}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <CostCell row={row} />
                        </TableCell>
                        <TableCell className="pr-5">
                          <div className="flex items-center justify-end gap-0.5">
                            {row.clipReady ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground"
                                    aria-label={`Descargar ${row.title}`}
                                    onClick={() => void downloadClip(row.id).catch((error: unknown) => toast.error(message(error, "No se pudo descargar el clip.")))}
                                  >
                                    <Download aria-hidden />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Descargar</TooltipContent>
                              </Tooltip>
                            ) : null}
                            {canChangeLink(row) && !linkDown ? <ChangeLink row={row} onDone={refresh} /> : null}
                            {row.mine && rowSupportsEditReference(row) ? <EditReferenceCell row={row} onDone={refresh} /> : null}
                            {data.batch.mine && row.mine ? <RowActions batchId={batchId} row={row} /> : null}
                            <Link
                              href={videoHref(row)}
                              aria-label={`Abrir ${row.title}`}
                              className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <ChevronRight className="size-4 transition-transform duration-150 group-hover/tr:translate-x-0.5" aria-hidden />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          );
        })
      )}

      {showBar ? (
        <ActionBar
          aside={
            auto.status === "borrador" ? (
              <AutoAnalyzeSwitch batchId={batchId} value={data.batch.autoAnalyze} editable={data.batch.mine} />
            ) : (
              <span className="px-1 text-sm text-muted-foreground tabular-nums">
                {done}/{rows.length} clips
              </span>
            )
          }
        >
          {auto.status === "borrador" ? (
            <SendBatchButton batchId={batchId} disabled={rows.length === 0 || uploading} />
          ) : (
            <AutoAction batchId={batchId} auto={auto} toReview={forReview.length} />
          )}
          {canDownloadAll ? (
            <Button variant={canDownloadEdited ? "outline" : "default"} className="h-10 gap-2 px-5" disabled={running !== null} onClick={() => void downloadAll()}>
              {running === "download" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {running === "download" ? `Descargando ${Math.min(downloaded + 1, forDownload.length)}/${forDownload.length}` : "Descargar clips"}
            </Button>
          ) : null}
          {canDownloadEdited ? (
            <a href={batchZipUrl(batchId)} download className={cn(buttonVariants(), "h-10 gap-2 px-5")}>
              <Scissors data-icon="inline-start" />
              Descargar terminados ({forEdited.length})
            </a>
          ) : null}
        </ActionBar>
      ) : null}
    </div>
  );
}
