"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, CircleCheck, CircleMinus, CircleX, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, type Serialized } from "@/lib/api";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CheckStage, SystemCheckStatus } from "@/jobs/system-check";

type Status = Serialized<SystemCheckStatus>;

const STAGES = [
  { key: "cola", label: "Cola" },
  { key: "reglas", label: "Reglas" },
  { key: "pasarela", label: "Claude" },
  { key: "libro", label: "Libro" },
] as const;

function StageIcon({ stage, running }: { stage: CheckStage | null | undefined; running: boolean }) {
  if (running) return <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />;
  if (!stage) return <CircleMinus className="size-6 text-muted-foreground/50" aria-hidden />;
  return stage.ok ? (
    <CircleCheck className="size-6 text-emerald-600 dark:text-emerald-500" aria-hidden />
  ) : (
    <CircleX className="size-6 text-destructive" aria-hidden />
  );
}

/** Tarjeta del dueño: un botón que hace una llamada real diminuta y enseña cada etapa con ✓ o ✗. */
export function SystemCheck() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["gasto", "comprobar"],
    queryFn: () => api<Status>("/api/gasto/comprobar"),
    // Mientras corre, se mira cada 2 segundos si ha terminado.
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });
  const press = useMutation({
    mutationFn: () => api<Status>("/api/gasto/comprobar", { method: "POST" }),
    onSuccess: (status) => client.setQueryData(["gasto", "comprobar"], status),
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo lanzar la comprobación."),
  });

  const status = query.data;
  const running = Boolean(status?.running) || press.isPending;
  const last = status?.last ?? null;

  // El gasto cambia con cada comprobación: cuando una termina, se refresca el resumen.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) void client.invalidateQueries({ queryKey: ["gasto"], exact: true });
    wasRunning.current = running;
  }, [running, client]);

  return (
    <section
      aria-label="Comprobar el sistema"
      className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">Sistema</h2>
        <Button
          className="h-9 gap-1.5 px-3"
          disabled={running}
          onClick={() => press.mutate()}
        >
          {running ? <Loader2 className="animate-spin" /> : <Activity />}
          {running ? "Comprobando…" : "Comprobar el sistema"}
        </Button>
      </div>

      <ol className="grid grid-cols-4 gap-2">
        {STAGES.map(({ key, label }, index) => {
          const stage = last?.stages[key];
          return (
            <li key={key} className="flex flex-col items-center gap-1.5 rounded-lg bg-muted/50 px-1 py-3 text-center">
              <StageIcon stage={stage} running={running} />
              <span className="text-xs font-medium">{label}</span>
              <span className="sr-only">
                {running ? "en curso" : !stage ? "sin comprobar" : stage.ok ? "correcto" : "con error"}
              </span>
              {index === 2 && !running && last?.model ? (
                <span className="max-w-full px-1 text-[11px] break-words text-muted-foreground">{last.model}</span>
              ) : null}
              {index === 3 && !running && last?.stages.libro?.ok ? (
                <span className="text-[11px] text-muted-foreground tabular-nums">{formatUsd(last.costMicros)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {running ? null : last ? (
        <p
          role={last.ok ? "status" : "alert"}
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            last.ok ? "bg-emerald-600/10 text-foreground" : "bg-destructive/10 text-foreground",
          )}
        >
          {last.ok ? (
            <>
              <span className="font-medium">Todo funciona</span>
              <span className="text-muted-foreground">
                {" "}
                · coste {formatUsd(last.costMicros)} · hace {formatDistanceToNowStrict(new Date(last.at), { locale: es })}
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">{last.error ?? "Algo ha fallado."}</span>
              <span className="text-muted-foreground">
                {" "}
                · hace {formatDistanceToNowStrict(new Date(last.at), { locale: es })}
              </span>
            </>
          )}
        </p>
      ) : query.isError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          No se pudo leer el estado de la comprobación.
        </p>
      ) : null}
    </section>
  );
}
