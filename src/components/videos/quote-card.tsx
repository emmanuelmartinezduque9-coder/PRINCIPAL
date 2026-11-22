"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Coins, Loader2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { HIGGSFIELD_CONNECT } from "@/lib/error-codes";
import { cn } from "@/lib/utils";
import { creditsLabel, formatCredits, KIND_PATH, type GenerationKind } from "./labels";

interface Quote {
  credits: number;
  balance: number;
  enough: boolean;
  round: number;
  regenerationsLeft: number;
}

/**
 * Tarjeta de precio antes de gastar: «Esto cuesta 4 créditos. Tienes 1.234.» y el botón. El botón
 * manda `expectedCredits` con la cifra mostrada; si el servidor dice que el precio o el vídeo
 * cambiaron (409), el presupuesto se vuelve a pedir y se ve el nuevo. Sin saldo, «Te faltan N
 * créditos», el botón desactivado y «Reintentar» (y se vuelve a pedir al volver a la pestaña, por
 * si la persona ha recargado créditos). `refreshKey` cambia cuando algo del vídeo cambia el precio;
 * `blocked` desactiva el botón mientras se guarda algo que lo cambia (la resolución del clip).
 */
export function QuoteCard({
  videoId,
  kind,
  label,
  refreshKey,
  onGoToBreakdown,
  blocked = false,
  children,
}: {
  videoId: number;
  kind: GenerationKind;
  label: string;
  refreshKey: string;
  onGoToBreakdown?: () => void;
  blocked?: boolean;
  children?: React.ReactNode;
}) {
  const client = useQueryClient();
  const path = `/api/videos/${videoId}/${KIND_PATH[kind]}`;
  const queryKey = ["quote", videoId, kind, refreshKey];
  const quote = useQuery({
    queryKey,
    queryFn: () => api<Quote>(`${path}/presupuesto`, { method: "POST" }),
    retry: false,
    // «always»: aunque el presupuesto sea reciente (la caché lo da por fresco 30 s), sin saldo se vuelve a pedir al volver.
    refetchOnWindowFocus: (q) => (q.state.data?.enough === false ? "always" : false),
  });
  // Un doble clic no manda dos peticiones (el servidor también lo impide, pero así no hay un 409 de más).
  const sending = useRef(false);
  const generate = useMutation({
    mutationFn: (expectedCredits: number) =>
      api<{ generationId: number }>(`${path}/generar`, { method: "POST", body: JSON.stringify({ expectedCredits }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["video", videoId] }),
    onSettled: () => {
      sending.current = false;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo generar.");
      // Precio, saldo o vídeo cambiados: presupuesto nuevo a la vista antes de volver a confirmar.
      if (error instanceof ApiError && error.status === 409) {
        void quote.refetch();
        void client.invalidateQueries({ queryKey: ["video", videoId] });
      }
    },
  });

  const data = quote.data;
  const missing = data ? data.credits - data.balance : 0;

  return (
    <section aria-label="Precio" className="panel flex flex-col gap-4 p-5">
      {children}
      {quote.isLoading ? (
        <div className="flex flex-col gap-3" aria-label="Calculando el precio">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : quote.isError || !data ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {quote.error instanceof Error ? quote.error.message : "No se pudo calcular el precio."}
          </p>
          <div className="flex flex-wrap gap-2">
            {quote.error instanceof ApiError && quote.error.code === HIGGSFIELD_CONNECT ? (
              <Link href="/ajustes" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                Ir a Ajustes
              </Link>
            ) : quote.error instanceof ApiError && quote.error.status === 400 && onGoToBreakdown ? (
              <Button variant="outline" className="h-9 px-3" onClick={onGoToBreakdown}>
                Ir al desglose
              </Button>
            ) : null}
            <Button variant="ghost" className="h-9 gap-1.5 px-3" disabled={quote.isFetching} onClick={() => void quote.refetch()}>
              <RefreshCw data-icon="inline-start" className={cn(quote.isFetching && "animate-spin")} />
              Reintentar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="flex items-start gap-2.5 text-sm text-pretty">
            <Coins className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Esto cuesta <strong className="font-semibold tabular-nums">{creditsLabel(data.credits)}</strong>. Tienes{" "}
              <span className="tabular-nums">{formatCredits(data.balance)}</span>.
            </span>
          </p>
          {data.enough ? null : (
            <div className="flex items-center justify-between gap-3">
              <p role="alert" className="text-sm font-medium text-destructive">
                Te faltan {creditsLabel(missing)}
              </p>
              <Button variant="ghost" className="h-8 gap-1.5 px-2.5" disabled={quote.isFetching} onClick={() => void quote.refetch()}>
                <RefreshCw data-icon="inline-start" className={cn(quote.isFetching && "animate-spin")} />
                Reintentar
              </Button>
            </div>
          )}
          <Button
            className="h-11 w-full gap-2"
            disabled={!data.enough || blocked || generate.isPending || quote.isFetching}
            onClick={() => {
              if (sending.current) return;
              sending.current = true;
              generate.mutate(data.credits);
            }}
          >
            {generate.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            {label}
          </Button>
        </>
      )}
    </section>
  );
}
