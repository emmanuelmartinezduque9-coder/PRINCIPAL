"use client";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Coins, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { creditsLabel, formatCredits, KIND_PATH, type GenerationKind } from "@/components/videos/labels";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { errorText, PARALLEL, planSend, sendPlan, type Quote, type QuoteState, type SendState } from "./bulk-plan";
import type { BatchRowJson } from "./labels";
import { RowThumb } from "./row-thumb";
import { createLimiter } from "./run-pool";

const TEXT: Record<GenerationKind, { button: string; title: string; quoteFailed: string }> = {
  frame: { button: "Generar imágenes", title: "Generar imágenes", quoteFailed: "No se pudo calcular el precio." },
  clip: { button: "Generar clips", title: "Generar clips", quoteFailed: "No se pudo calcular el precio." },
};

/** Un solo turno para todos los presupuestos del tablero: como mucho 2 a la vez. */
const quoteTurn = createLimiter(PARALLEL);

/** Lo que puede cambiar el precio de una fila: el vídeo (prompts, resolución), su ronda o la imagen aprobada. */
const priceSignature = (kind: GenerationKind, row: BatchRowJson) => {
  const generation = kind === "frame" ? row.frame : row.clip;
  return `${row.updatedAt}.${generation.current?.id ?? 0}.${generation.current?.status ?? ""}.${row.frame.approvedResultId ?? 0}`;
};

/**
 * «Generar imágenes (N)» (o clips): al abrir, presupuesta cada fila lista (una consulta por fila,
 * todas por el mismo turno de 2), enseña la suma y el saldo y, con una sola confirmación, envía
 * cada fila con SU precio (`expectedCredits`), de 2 en 2. Lo que falle (precio o vídeo cambiado,
 * sin saldo, cualquier otro error) se queda en su fila con su mensaje y las demás siguen. Con los
 * precios ya calculados, el botón añade «· X créditos». Los resultados por fila van al tablero.
 */
export function BulkGenerate({
  kind,
  rows,
  disabled,
  onRunning,
  onResults,
}: {
  kind: GenerationKind;
  rows: BatchRowJson[];
  /** Otra acción en bloque en marcha. */
  disabled: boolean;
  onRunning: (running: boolean) => void;
  onResults: (results: Record<number, string | null>) => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  /** Lo que se está enviando o se envió: se queda fijo aunque el tablero cambie mientras tanto. */
  const [plan, setPlan] = useState<{ rows: BatchRowJson[]; credits: Record<number, number>; state: Record<number, SendState> } | null>(null);
  const inFlight = useRef(false);
  const queries = useQueries({
    queries: rows.map((row) => ({
      queryKey: ["quote", kind, row.id, priceSignature(kind, row)],
      queryFn: () => quoteTurn(() => api<Quote>(`/api/videos/${row.id}/${KIND_PATH[kind]}/presupuesto`, { method: "POST" })),
      enabled: open,
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  if (rows.length === 0 && !plan) return null;

  const byRow: Record<number, QuoteState> = {};
  rows.forEach((row, index) => {
    const query = queries[index];
    if (query.data) byRow[row.id] = { ok: true, value: query.data };
    else if (query.error) byRow[row.id] = { ok: false, error: query.error };
  });
  const fetching = queries.some((query) => query.isFetching);
  const settled = rows.every((row) => byRow[row.id] !== undefined);
  const priced = rows.filter((row) => byRow[row.id]?.ok);
  const total = priced.reduce((sum, row) => sum + (byRow[row.id] as { value: Quote }).value.credits, 0);
  const balances = priced.map((row) => (byRow[row.id] as { value: Quote }).value.balance);
  const balance = balances.length > 0 ? Math.min(...balances) : null;
  const sending = plan !== null && Object.values(plan.state).some((s) => s.kind === "pending" || s.kind === "sending");

  async function send() {
    if (inFlight.current || plan || priced.length === 0) return;
    inFlight.current = true;
    onRunning(true);
    try {
      // Cada fila con SU precio; las que no tienen se quedan sin enviar con su motivo (también en el tablero).
      const { send: entries, skipped } = planSend(rows, byRow, TEXT[kind].quoteFailed);
      const credits = Object.fromEntries(entries.map((entry) => [entry.id, entry.expectedCredits]));
      const state: Record<number, SendState> = Object.fromEntries(
        rows.map((row) => [row.id, row.id in skipped ? { kind: "error", message: skipped[row.id] } : { kind: "pending" }] as [number, SendState]),
      );
      setPlan({ rows, credits, state });
      const report = await sendPlan(
        entries,
        (id, expectedCredits) =>
          api(`/api/videos/${id}/${KIND_PATH[kind]}/generar`, { method: "POST", body: JSON.stringify({ expectedCredits }) }),
        (id, value) => setPlan((p) => (p ? { ...p, state: { ...p.state, [id]: value } } : p)),
      );
      onResults({ ...skipped, ...report });
      await client.invalidateQueries({ queryKey: ["batch"] });
      // Solo las filas enviadas necesitan precio nuevo (un 409 de precio no cambia la fila ni su clave).
      // Se marcan viejas sin pedirlas ya: se vuelven a pedir al abrir otra vez el diálogo.
      for (const entry of entries) void client.invalidateQueries({ queryKey: ["quote", kind, entry.id], refetchType: "none" });
    } finally {
      inFlight.current = false;
      onRunning(false);
    }
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
      <Button className="h-9 gap-1.5 px-3" disabled={rows.length === 0 || disabled} onClick={() => setOpen(true)}>
        <Sparkles data-icon="inline-start" />
        {label}
        {settled && rows.length > 0 ? <span className="font-normal opacity-80 tabular-nums">· {creditsLabel(total)}</span> : null}
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
                    {!plan && !quote ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Calculando" /> : null}
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
                <Button
                  variant="ghost"
                  className="h-10 gap-1.5 px-3 sm:mr-auto"
                  disabled={fetching}
                  onClick={() => void client.refetchQueries({ queryKey: ["quote", kind], type: "active" })}
                >
                  <RefreshCw data-icon="inline-start" className={cn(fetching && "animate-spin")} />
                  Recalcular
                </Button>
                <DialogClose asChild>
                  <Button variant="outline" className="h-10 px-4">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button className="h-10 gap-2 px-4" disabled={priced.length === 0 || fetching || !settled} onClick={() => void send()}>
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
