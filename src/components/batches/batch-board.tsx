"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, CircleAlert, Download, Eye, ImageIcon, Link2, Link2Off, ListFilter, Loader2, RefreshCw, ScanSearch, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { MusicPicker } from "@/components/songs/music-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { avatarImageUrl } from "@/components/avatars/labels";
import { AVATAR_MODE_LABELS, KIND_LABELS } from "@/components/videos/brief-labels";
import { creditsLabel } from "@/components/videos/labels";
import { useReferenceUploads } from "@/components/videos/upload-provider";
import { requestLink } from "@/components/videos/use-mac";
import { api, ApiError } from "@/lib/api";
import { linkLabel } from "@/lib/links";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AutoAnalyzeSwitch, GroupHeader, RiskChip, RowActions } from "./board-parts";
import { BulkGenerate } from "./bulk-generate";
import {
  analysisState,
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
import { RowThumb } from "./row-thumb";
import { runPool } from "./run-pool";

const TONE: Record<Tone, { chip: string; dot: string }> = {
  off: { chip: "text-muted-foreground", dot: "bg-foreground/25" },
  busy: { chip: "bg-amber-500/12 text-foreground", dot: "bg-amber-500" },
  review: { chip: "bg-sky-500/12 text-foreground", dot: "bg-sky-500" },
  ok: { chip: "bg-emerald-500/12 text-foreground", dot: "bg-emerald-500" },
  error: { chip: "bg-destructive/10 text-foreground", dot: "bg-destructive" },
};

/** Estado de un paso: punto de color + palabra; el error, en el título. */
function StepChip({ state }: { state: StepState }) {
  return (
    <span
      title={state.detail ?? undefined}
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap", TONE[state.tone].chip)}
    >
      {state.tone === "busy" ? (
        <Loader2 className="size-3 animate-spin text-amber-600" aria-hidden />
      ) : state.tone === "off" ? null : (
        <span aria-hidden className={cn("size-1.5 rounded-full", TONE[state.tone].dot)} />
      )}
      {state.label}
    </span>
  );
}

function AvatarCell({ row }: { row: BatchRowJson }) {
  const library = row.libraryAvatar ?? row.autoAvatar;
  if (library) {
    const auto = row.avatarMode === "automatico";
    const title = auto ? `Automático → ${library.name}` : library.name;
    return (
      <span className="relative inline-block size-8" title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarImageUrl(library.id)} alt={title} className="size-8 rounded-full object-cover ring-1 ring-foreground/10" />
        {auto ? (
          <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-foreground/10">
            <Sparkles className="size-2.5" aria-hidden />
          </span>
        ) : null}
      </span>
    );
  }
  if (row.avatarMode !== "elegido") {
    const { label, icon: Icon } = AVATAR_MODE_LABELS[row.avatarMode];
    return (
      <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground" title={label}>
        <Icon className="size-4" aria-label={label} />
      </span>
    );
  }
  if (row.avatarPhotoId === null) return <span className="text-muted-foreground">—</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/fotos/${row.avatarPhotoId}`} alt="Avatar" className="size-8 rounded-full object-cover ring-1 ring-foreground/10" />;
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
  adaptacion_concepto: "bg-violet-500/12 text-violet-800 dark:text-violet-300",
  solo_gancho: "bg-teal-500/12 text-teal-800 dark:text-teal-300",
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
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium tabular-nums", KIND_TINT[row.kind])}
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

/** «Reintentar enlace»: vuelve a pedir al Mac el enlace que falló. */
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
      Reintentar enlace
    </Button>
  );
}

/** Nombre del archivo que manda el servidor (`<producto>-video-<id>.mp4`). */
function filenameOf(response: Response, fallback: string): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]);
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

async function downloadClip(videoId: number): Promise<void> {
  const response = await fetch(`/api/videos/${videoId}/clip/descargar`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? "No se pudo descargar el clip.", response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameOf(response, `video-${videoId}.mp4`);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** `/lotes/[id]`: una fila por vídeo con el estado de cada paso y, arriba, las acciones en bloque. */
export function BatchBoard({ batchId }: { batchId: number }) {
  const client = useQueryClient();
  const { uploads } = useReferenceUploads();
  const uploading = Object.values(uploads).some((upload) => upload.kind === "uploading");
  const query = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => api<BatchViewJson>(`/api/lotes/${batchId}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
    refetchInterval: (q) => pollEvery(q.state.data, uploading),
  });
  /** El último error de una acción en bloque en cada fila (se borra cuando la fila vuelve a ir bien). */
  // Con el estado de la fila en ese momento (`rowState`): en cuanto la fila cambia, el aviso ya no se enseña.
  const [notices, setNotices] = useState<Record<number, { message: string; at: string }>>({});
  /** La acción en bloque en marcha: solo una a la vez, así nunca hay más de 2 peticiones en vuelo. */
  const [running, setRunning] = useState<null | "breakdown" | "download" | "generate">(null);
  const inFlight = useRef(false);
  const [downloaded, setDownloaded] = useState(0);
  /** «Por revisar»: solo las filas con algo que mirar. */
  const [onlyReview, setOnlyReview] = useState(false);

  const back = { href: "/lotes", label: "Lotes" };
  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-label="Cargando el lote">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }
  const data = query.data;
  if (query.isError || !data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title={notFound ? "Lote no encontrado" : "No se pudo abrir el lote"} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-5" aria-hidden />
          </span>
          <Link href="/lotes" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
            Ver los lotes
          </Link>
        </div>
      </div>
    );
  }

  const rows = data.rows;
  const uploadOf = (row: BatchRowJson): LocalUpload => uploads[row.id] ?? { kind: "idle" };
  const forBreakdown = rows.filter(ready.breakdown);
  const forFrame = rows.filter(ready.frame);
  const forReview = rows.filter(ready.review);
  const forClip = rows.filter(ready.clip);
  const forDownload = rows.filter(ready.download);
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
    void client.invalidateQueries({ queryKey: ["batch", batchId] });
  }

  async function downloadAll() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning("download");
    setDownloaded(0);
    const report: Record<number, string | null> = {};
    // De uno en uno: cada clip se guarda antes de pedir el siguiente.
    for (const row of forDownload) {
      try {
        await downloadClip(row.id);
        report[row.id] = null;
      } catch (error) {
        report[row.id] = message(error, "No se pudo descargar el clip.");
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
      void client.invalidateQueries({ queryKey: ["batch", batchId] });
    }
  }

  const generating = (on: boolean) => {
    inFlight.current = on;
    setRunning(on ? "generate" : null);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={back}
        title={data.batch.name}
        actions={data.batch.mine ? <AutoAnalyzeSwitch batchId={batchId} value={data.batch.autoAnalyze} editable={data.batch.mine} /> : null}
      >
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
          <span>{rows.length === 1 ? "1 vídeo" : `${rows.length} vídeos`}</span>
          <span aria-hidden>·</span>
          <span>
            {done}/{rows.length} clips
          </span>
          {credits > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>{creditsLabel(credits)}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <time dateTime={data.batch.createdAt}>{format(new Date(data.batch.createdAt), "d MMM yyyy", { locale: es })}</time>
        </p>
      </PageHeader>

      {!data.batch.mine ? (
        <p role="status" className="flex items-center gap-2.5 rounded-xl bg-sky-500/10 px-4 py-3 text-sm ring-1 ring-sky-500/20">
          <Eye className="size-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden />
          Solo lectura: cada vídeo lo continúa quien lo creó.
        </p>
      ) : null}

      {/* Siempre montada: un envío en bloque sigue enseñando sus resultados aunque ya no quede ninguna fila lista. */}
      {rows.length > 0 ? (
        <div role="toolbar" aria-label="Acciones del lote" className="flex flex-wrap items-center gap-2 empty:hidden">
          {toReview.length > 0 || onlyReview ? (
            <Button
              variant={onlyReview ? "secondary" : "ghost"}
              className={cn("h-9 gap-1.5 px-3", onlyReview && "ring-1 ring-foreground/20")}
              aria-pressed={onlyReview}
              onClick={() => setOnlyReview((on) => !on)}
            >
              <ListFilter data-icon="inline-start" />
              Por revisar ({toReview.length})
            </Button>
          ) : null}
          {forBreakdown.length > 0 ? (
            <Button variant="outline" className="h-9 gap-1.5 px-3" disabled={running !== null} onClick={() => void breakdownAll()}>
              {running === "breakdown" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />}
              Desglosar ({forBreakdown.length})
            </Button>
          ) : null}
          <BulkGenerate kind="frame" rows={forFrame} disabled={running !== null} onRunning={generating} onResults={note} />
          {forReview.length > 0 ? (
            <Link href={`/lotes/${batchId}/revisar`} className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 px-3")}>
              <ImageIcon className="size-4" aria-hidden />
              Revisar imágenes ({forReview.length})
            </Link>
          ) : null}
          <BulkGenerate kind="clip" rows={forClip} disabled={running !== null} onRunning={generating} onResults={note} />
          {forDownload.length > 0 ? (
            <Button variant="outline" className="h-9 gap-1.5 px-3 sm:ml-auto" disabled={running !== null} onClick={() => void downloadAll()}>
              {running === "download" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {running === "download" ? `Descargando ${Math.min(downloaded + 1, forDownload.length)}/${forDownload.length}` : `Descargar clips (${forDownload.length})`}
            </Button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">Este lote no tiene vídeos que puedas ver.</div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">Nada por revisar.</div>
      ) : (
        data.groups.map((group) => {
          const groupRows = shown.filter((row) => row.productId === group.productId);
          if (groupRows.length === 0) return null;
          return (
            <section key={group.productId} aria-label={group.name} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <GroupHeader batchId={batchId} group={group} editable={data.batch.mine} />
              {/* Columnas fijas: las tablas de todos los productos quedan alineadas. */}
              <Table className="min-w-[72rem] table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14 pl-4" />
                    <TableHead>Vídeo</TableHead>
                    <TableHead className="w-20">Avatar</TableHead>
                    <TableHead className="w-24">Música</TableHead>
                    <TableHead className="w-52">Referencia</TableHead>
                    <TableHead className="w-28">Desglose</TableHead>
                    <TableHead className="w-28">Imagen</TableHead>
                    <TableHead className="w-24">Clip</TableHead>
                    <TableHead className="w-24 text-right">Coste</TableHead>
                    <TableHead className="w-32 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupRows.map((row) => {
                    const upload = uploadOf(row);
                    const states = [referenceState(row, upload), analysisState(row), generationState(row.frame, "frame"), generationState(row.clip, "clip")];
                    // El error de la última acción en bloque y, si no hay, el del enlace o el del paso que falló.
                    const notice = notices[row.id];
                    const failure = rowProblem(row, states);
                    const problem = (notice && notice.at === rowState(row) ? notice.message : null) ?? failure?.message ?? null;
                    const retryUrl = problem !== null && problem === failure?.message ? failure.link : null;
                    // Aparte, y sin ser un fallo de la fila: un enlace nuevo que no llegó sobre una referencia que sigue lista.
                    const aside = linkNotice(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4">
                          <Link href={videoHref(row)} tabIndex={-1} aria-hidden>
                            <RowThumb row={row} busy={upload.kind === "uploading"} className="h-16 w-9" />
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
                          {row.note ? <div className="mt-0.5 line-clamp-2 text-xs whitespace-pre-line text-foreground/80">{row.note}</div> : null}
                          {problem ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p role="alert" className="flex items-start gap-1 text-xs text-destructive">
                                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                                {problem}
                              </p>
                              {retryUrl ? (
                                <RetryLink row={row} url={retryUrl} onDone={() => void client.invalidateQueries({ queryKey: ["batch", batchId] })} />
                              ) : null}
                            </div>
                          ) : null}
                          {aside ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p role="status" className="flex items-start gap-1 text-xs text-muted-foreground">
                                <Link2Off className="mt-px size-3.5 shrink-0" aria-hidden />
                                {aside.message}
                              </p>
                              {aside.link ? (
                                <RetryLink row={row} url={aside.link} onDone={() => void client.invalidateQueries({ queryKey: ["batch", batchId] })} />
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <AvatarCell row={row} />
                        </TableCell>
                        <TableCell>
                          <MusicPicker
                            compact
                            value={row.song}
                            readOnly={!row.songEditable}
                            onChange={(song) => void chooseSong(row.id, song?.id ?? null)}
                          />
                        </TableCell>
                        {states.map((state, index) => (
                          <TableCell key={index}>
                            <StepChip state={state} />
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <CostCell row={row} />
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end">
                            {data.batch.mine && row.mine ? <RowActions batchId={batchId} row={row} /> : null}
                            <Link
                              href={videoHref(row)}
                              aria-label={`Abrir ${row.title}`}
                              className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <ChevronRight className="size-4" aria-hidden />
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
    </div>
  );
}
