"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Coins, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { creditsLabel, formatCredits, KIND_PATH, type GenerationKind } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BatchRowJson } from "./labels";
import { RowThumb } from "./row-thumb";
import { runPool } from "./run-pool";

interface Quote {
  credits: number;
  balance: number;
}

type QuoteResult = { ok: true; value: Quote } | { ok: false; error: unknown };
type SendState = { kind: "pending" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Envíos a la vez, como mucho. */
const PARALLEL = 2;

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const TEXT: Record<GenerationKind, { button: string; title: string; quoteFailed: string }> = {
  frame: { button: "Generar imágenes", title: "Generar imágenes", quoteFailed: "No se pudo calcular el precio." },
  clip: { button: "Generar clips", title: "Generar clips", quoteFailed: "No se pudo calcular el precio." },
};

/**
 * «Generar imágenes (N) · X créditos» (o clips): presupuesta cada fila lista (de 2 en 2), enseña la
 * suma y el saldo y, con una sola confirmación, envía cada fila con SU precio (`expectedCredits`),
 * de 2 en 2. Lo que falle (precio o vídeo cambiado, sin saldo, cualquier otro error) se queda en su
 * fila con su mensaje y las demás siguen. Los resultados por fila se pasan al tablero (`onResults`).
 */
export function BulkGenerate({
  kind,
  rows,
  onResults,
}: {
  kind: GenerationKind;
  rows: BatchRowJson[];
  onResults: (results: Record<number, string | null>) => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  /** Lo que se está enviando o se envió: se queda fijo aunque el tablero cambie mientras tanto. */
  const [plan, setPlan] = useState<{ rows: BatchRowJson[]; credits: Record<number, number>; state: Record<number, SendState> } | null>(null);
  const generation = (row: BatchRowJson) => (kind === "frame" ? row.frame : row.clip);
  // Cambia cuando cambia algo que puede cambiar el precio: el vídeo (prompts, resolución) o su ronda.
  const signature = rows
    .map((row) => `${row.id}.${row.updatedAt}.${generation(row).current?.id ?? 0}.${generation(row).current?.status ?? ""}.${row.frame.approvedResultId ?? 0}`)
    .join("|");
  const quotes = useQuery({
    queryKey: ["batch-quote", kind, signature],
    queryFn: async () => {
      const list = await runPool(rows, PARALLEL, (row) =>
        api<Quote>(`/api/videos/${row.id}/${KIND_PATH[kind]}/presupuesto`, { method: "POST" }),
      );
      return Object.fromEntries(rows.map((row, index) => [row.id, list[index]])) as Record<number, QuoteResult>;
    },
    enabled: rows.length > 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (rows.length === 0 && !plan) return null;

  const byRow = quotes.data ?? {};
  const priced = rows.filter((row) => byRow[row.id]?.ok);
  const total = priced.reduce((sum, row) => sum + (byRow[row.id] as { value: Quote }).value.credits, 0);
  const balances = priced.map((row) => (byRow[row.id] as { value: Quote }).value.balance);
  const balance = balances.length > 0 ? Math.min(...balances) : null;
  const sending = plan !== null && Object.values(plan.state).some((s) => s.kind === "pending" || s.kind === "sending");

  async function send() {
    if (plan || priced.length === 0) return;
    const credits = Object.fromEntries(priced.map((row) => [row.id, (byRow[row.id] as { value: Quote }).value.credits]));
    // Las filas sin precio no se envían y se quedan con su motivo, también en el tablero.
    const unpriced: Record<number, string> = Object.fromEntries(
      rows
        .filter((row) => !(row.id in credits))
        .map((row) => {
          const quote = byRow[row.id];
          return [row.id, quote && !quote.ok ? errorText(quote.error, TEXT[kind].quoteFailed) : TEXT[kind].quoteFailed];
        }),
    );
    const state: Record<number, SendState> = Object.fromEntries(
      rows.map((row) => [row.id, row.id in unpriced ? { kind: "error", message: unpriced[row.id] } : { kind: "pending" }] as [number, SendState]),
    );
    setPlan({ rows, credits, state });
    const mark = (id: number, value: SendState) => setPlan((p) => (p ? { ...p, state: { ...p.state, [id]: value } } : p));
    const results = await runPool(priced, PARALLEL, async (row) => {
      mark(row.id, { kind: "sending" });
      await api(`/api/videos/${row.id}/${KIND_PATH[kind]}/generar`, {
        method: "POST",
        body: JSON.stringify({ expectedCredits: credits[row.id] }),
      });
    });
    const report: Record<number, string | null> = { ...unpriced };
    priced.forEach((row, index) => {
      const result = results[index];
      if (result.ok) {
        mark(row.id, { kind: "sent" });
        report[row.id] = null;
      } else {
        const message = errorText(result.error, "No se pudo enviar.");
        mark(row.id, { kind: "error", message });
        report[row.id] = message;
      }
    });
    onResults(report);
    // Primero el tablero nuevo (las filas enviadas dejan de estar listas) y después precios nuevos
    // para las que siguen listas: un 409 de precio no cambia el estado de la fila ni su clave.
    await client.invalidateQueries({ queryKey: ["batch"] });
    client.removeQueries({ queryKey: ["batch-quote", kind] });
  }

  function close(next: boolean) {
    if (sending) return;
    setOpen(next);
    if (!next) setPlan(null);
  }

  const listed = plan ? plan.rows : rows;
  const label = `${TEXT[kind].button} (${rows.length})`;

  return (
    <>
      <Button className="h-9 gap-1.5 px-3" disabled={rows.length === 0} onClick={() => setOpen(true)}>
        <Sparkles data-icon="inline-start" />
        {label}
        <span className="font-normal opacity-80 tabular-nums">
          · {quotes.isFetching && !quotes.data ? "…" : creditsLabel(total)}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{TEXT[kind].title}</DialogTitle>
          </DialogHeader>
          <ul className="-mx-1 flex max-h-[55vh] flex-col divide-y overflow-y-auto px-1" aria-label="Vídeos">
            {listed.map((row) => {
              const quote = byRow[row.id];
              const state = plan?.state[row.id];
              const credits = plan ? (plan.credits[row.id] ?? null) : quote?.ok ? quote.value.credits : null;
              const quoteError = !plan && quote && !quote.ok ? errorText(quote.error, TEXT[kind].quoteFailed) : null;
              return (
                <li key={row.id} className="flex items-center gap-3 py-2">
                  <RowThumb row={row} className="h-12 w-7" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {row.title} <span className="font-normal text-muted-foreground">· {row.productName}</span>
                    </span>
                    {quoteError || state?.kind === "error" ? (
                      <span className="text-xs text-pretty text-destructive">{quoteError ?? (state as { message: string }).message}</span>
                    ) : null}
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
                    {credits !== null ? <span className={cn(state?.kind === "error" && "text-muted-foreground line-through")}>{formatCredits(credits)}</span> : null}
                    {!plan && quotes.isFetching && !quote ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Calculando" /> : null}
                    {state?.kind === "sending" ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Enviando" /> : null}
                    {state?.kind === "sent" ? <Check className="size-4 text-emerald-600" aria-label="Enviado" /> : null}
                    {state?.kind === "error" || quoteError ? <CircleAlert className="size-4 text-destructive" aria-label="Error" /> : null}
                  </span>
                </li>
              );
            })}
          </ul>

          {plan ? null : (
            <p className="flex items-center gap-2.5 border-t pt-4 text-sm">
              <Coins className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                Total <strong className="font-semibold tabular-nums">{creditsLabel(total)}</strong>
                {balance !== null ? (
                  <>
                    . Tienes <span className="tabular-nums">{formatCredits(balance)}</span>.
                  </>
                ) : null}
              </span>
              {balance !== null && total > balance ? (
                <span role="alert" className="ml-auto font-medium text-destructive">
                  Te faltan {creditsLabel(total - balance)}
                </span>
              ) : null}
            </p>
          )}

          <DialogFooter>
            {plan ? (
              <DialogClose asChild>
                <Button className="h-10 px-4" disabled={sending}>
                  {sending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  {sending ? "Enviando…" : "Cerrar"}
                </Button>
              </DialogClose>
            ) : (
              <>
                <Button variant="ghost" className="h-10 gap-1.5 px-3 sm:mr-auto" disabled={quotes.isFetching} onClick={() => void quotes.refetch()}>
                  <RefreshCw data-icon="inline-start" className={cn(quotes.isFetching && "animate-spin")} />
                  Recalcular
                </Button>
                <DialogClose asChild>
                  <Button variant="outline" className="h-10 px-4">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button className="h-10 gap-2 px-4" disabled={priced.length === 0 || quotes.isFetching} onClick={() => void send()}>
                  <Sparkles data-icon="inline-start" />
                  Generar {priced.length} · {creditsLabel(total)}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
