"use client";

import { avatarImageUrl } from "@/components/avatars/labels";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Coins, CornerDownLeft, Loader2, PartyPopper, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { creditsLabel, formatCredits } from "@/components/videos/labels";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { videoHref, type BatchQuestionJson, type BatchQuoteJson, type BatchRowJson, type BatchViewJson } from "./labels";
import { RowThumb } from "./row-thumb";

const SKIP = "__saltar__";
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Una pregunta: la miniatura del vídeo, la pregunta y sus respuestas (botones, fotos o texto). */
function QuestionItem({ batchId, question, row }: { batchId: number; question: BatchQuestionJson; row: BatchRowJson | undefined }) {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function answer(value: string) {
    if (saving) return;
    setSaving(value);
    try {
      await api(`/api/lotes/${batchId}/preguntas`, { method: "POST", body: JSON.stringify({ videoId: question.videoId, key: question.key, value }) });
      setText("");
      await Promise.all([client.invalidateQueries({ queryKey: ["batch-questions", batchId] }), client.invalidateQueries({ queryKey: ["batch", batchId] })]);
    } catch (error) {
      toast.error(message(error, "No se pudo guardar la respuesta."));
    } finally {
      setSaving(null);
    }
  }

  const choices = question.options.filter((option) => option.value !== SKIP);
  const skip = question.options.find((option) => option.value === SKIP);
  return (
    <li className="panel grid grid-cols-[4.5rem_minmax(0,1fr)] gap-5 p-5 transition-shadow duration-200 hover:shadow-raised">
      {row ? (
        <Link href={videoHref(row)} tabIndex={-1} aria-hidden>
          <RowThumb row={row} className="h-32 w-[4.5rem] rounded-lg shadow-card" />
        </Link>
      ) : (
        <span />
      )}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs text-muted-foreground">
            {row ? `${row.title} · ${row.productName}` : `Vídeo ${question.videoId}`}
          </span>
          <p className="font-medium text-pretty">{question.text}</p>
        </div>
        {choices.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Respuestas">
            {choices.map((option) =>
              option.photoId || option.avatarId ? (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void answer(option.value)}
                  aria-label={option.label}
                  title={option.label}
                  className={cn(
                    "relative overflow-hidden rounded-xl ring-1 ring-foreground/10 outline-none transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-raised hover:ring-2 hover:ring-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                    option.avatarId ? "h-28 w-21" : "size-24",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={option.avatarId ? avatarImageUrl(option.avatarId) : `/api/fotos/${option.photoId}`} alt="" className="size-full object-cover" />
                  {option.label !== "Avatar" ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-0.5 text-[11px] font-medium text-white">
                      {option.label}
                    </span>
                  ) : null}
                  {saving === option.value ? (
                    <span className="absolute inset-0 grid place-items-center bg-background/60">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    </span>
                  ) : null}
                </button>
              ) : (
                <Button key={option.value} variant="outline" className="h-10 px-4" disabled={saving !== null} onClick={() => void answer(option.value)}>
                  {saving === option.value ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  {option.label}
                </Button>
              ),
            )}
          </div>
        ) : null}
        {question.freeText ? (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) void answer(text.trim());
            }}
          >
            <Input
              value={text}
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
              placeholder={choices.length > 0 ? "Otra respuesta" : "Respuesta"}
              aria-label={`Respuesta a: ${question.text}`}
              className="h-9"
            />
            <Button type="submit" variant="secondary" size="icon" className="size-9 shrink-0" aria-label="Responder" disabled={!text.trim() || saving !== null}>
              {saving !== null && saving === text.trim() ? <Loader2 className="animate-spin" aria-hidden /> : <CornerDownLeft aria-hidden />}
            </Button>
          </form>
        ) : null}
        {question.href || skip ? (
          <div className="flex flex-wrap items-center gap-2">
            {question.href ? (
              <Link href={question.href} className={cn(buttonVariants({ variant: "ghost" }), "h-8 gap-1 px-2.5")}>
                Abrir
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
            {skip ? (
              <Button variant="ghost" className="h-8 px-2.5 text-muted-foreground" disabled={saving !== null} onClick={() => void answer(SKIP)}>
                {saving === SKIP ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {skip.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** El presupuesto del lote con todo respondido y la única confirmación. */
function BudgetPanel({ batchId, ready, waiting }: { batchId: number; ready: boolean; waiting: number }) {
  const router = useRouter();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const quote = useQuery({
    queryKey: ["batch-quote", batchId],
    queryFn: () => api<BatchQuoteJson>(`/api/lotes/${batchId}/presupuesto`, { method: "POST" }),
    enabled: ready,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const data = quote.data;
  const failed = data?.rows.find((row) => row.error !== null);
  const short = data && data.balance !== null && data.total > data.balance ? data.total - data.balance : 0;

  async function confirm() {
    if (!data) return;
    setConfirming(true);
    try {
      await api(`/api/lotes/${batchId}/confirmar`, { method: "POST", body: JSON.stringify({ expectedCredits: data.total }) });
      await client.invalidateQueries({ queryKey: ["batch", batchId] });
      router.push(`/lotes/${batchId}`);
    } catch (error) {
      toast.error(message(error, "No se pudo confirmar."));
      void quote.refetch();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <aside className="panel flex flex-col gap-4 p-5 lg:sticky lg:top-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-brand/10 text-brand-ink"><Coins className="size-4" aria-hidden /></span>
        Presupuesto
      </h2>
      {!ready ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {waiting > 0 ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {waiting > 0 ? `Desglosando ${waiting}…` : "Responde las preguntas."}
        </p>
      ) : quote.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Calculando">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : quote.isError || !data ? (
        <p role="alert" className="text-sm text-destructive">
          {message(quote.error, "No se pudo calcular el precio.")}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums">
            <dt className="text-muted-foreground">Imágenes</dt>
            <dd className="text-right">{formatCredits(data.frames)}</dd>
            <dt className="text-muted-foreground">Clips (estimado)</dt>
            <dd className="text-right">~{formatCredits(data.clips)}</dd>
            <div className="col-span-2 my-1 border-t" aria-hidden />
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-semibold">~{creditsLabel(data.total)}</dd>
            {data.balance !== null ? (
              <>
                <dt className="text-muted-foreground">Saldo</dt>
                <dd className={cn("text-right", short > 0 && "font-medium text-destructive")}>{formatCredits(data.balance)}</dd>
              </>
            ) : null}
          </dl>
          {failed ? (
            <p role="alert" className="text-sm text-destructive">
              {failed.error}
            </p>
          ) : null}
          {short > 0 ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              Te faltan {creditsLabel(short)}
            </p>
          ) : null}
          <Button className="h-11 gap-2 text-[0.95rem]" disabled={confirming || failed !== undefined || quote.isFetching} onClick={() => void confirm()}>
            {confirming ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            Generar lote · ~{creditsLabel(data.total)}
          </Button>
        </>
      )}
    </aside>
  );
}

/** `/lotes/[id]/preguntas`: todas las preguntas del lote en una pantalla y, al final, el presupuesto. */
export function BatchQuestions({ batchId }: { batchId: number }) {
  const board = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => api<BatchViewJson>(`/api/lotes/${batchId}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
    refetchInterval: (q) => (q.state.data?.auto.status === "preguntas" && !q.state.data.auto.readyToConfirm ? 4000 : false),
  });
  const auto = board.data?.auto;
  const questions = useQuery({
    queryKey: ["batch-questions", batchId, auto?.questions ?? 0, auto?.steps.preguntas ?? 0],
    queryFn: () => api<{ questions: BatchQuestionJson[] }>(`/api/lotes/${batchId}/preguntas`),
    enabled: auto?.status === "preguntas",
  });
  const back = { href: `/lotes/${batchId}`, label: board.data?.batch.name ?? "Lote" };

  if (board.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-label="Cargando">
        <Skeleton className="mt-7 h-9 w-72" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (board.isError || !board.data || !auto) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={{ href: "/lotes", label: "Lotes" }} title="Lote no encontrado" />
        <EmptyState icon={SearchX} title="Este lote no existe" />
      </div>
    );
  }

  const rows = board.data.rows;
  const list = questions.data?.questions ?? [];
  const waiting = auto.total - auto.steps.preguntas - new Set(list.map((q) => q.videoId)).size;

  if (auto.status !== "preguntas") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title="Preguntas del lote" />
        <EmptyState
          icon={Check}
          tone="success"
          title="Preguntas respondidas"
          action={
            <Link href={`/lotes/${batchId}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Ver el lote
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={back} title="Preguntas del lote">
        <p className="text-sm text-muted-foreground tabular-nums">
          {list.length === 1 ? "1 pregunta" : `${list.length} preguntas`} · {auto.steps.preguntas}/{auto.total} vídeos listos
        </p>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {list.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Preguntas">
            {list.map((question) => (
              <QuestionItem key={`${question.videoId}:${question.key}`} batchId={batchId} question={question} row={rows.find((row) => row.id === question.videoId)} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={auto.readyToConfirm ? PartyPopper : Loader2} tone={auto.readyToConfirm ? "success" : "busy"} title={auto.readyToConfirm ? "Sin preguntas" : "Desglosando…"} />
        )}
        {/* Lotes nuevos: con todo respondido se autoriza solo y empieza a generar (sin «Confirmar»). */}
        {auto.autoConfirm ? null : <BudgetPanel batchId={batchId} ready={auto.readyToConfirm} waiting={Math.max(0, waiting)} />}
      </div>
    </div>
  );
}
