"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Clapperboard, Copy, Loader2, Plug, RefreshCw, Stethoscope, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HiggsfieldStatus } from "@/server/higgsfield";

const STATUS_KEY = ["higgsfield", "estado"];

/** `1.234` también con cuatro cifras (en español, por defecto, no se agrupan). */
const formatCredits = (n: number) => new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(n);
const planLabel = (plan: string) => plan.charAt(0).toUpperCase() + plan.slice(1);

function useConnect() {
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>("/api/higgsfield/conectar", { method: "POST" });
      window.location.assign(authorizeUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo empezar la conexión.");
      setBusy(false);
    }
  }
  return { busy, connect };
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "off" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 rounded-full",
        tone === "ok" && "bg-success",
        tone === "warn" && "bg-warning",
        tone === "off" && "bg-foreground/25",
      )}
    />
  );
}

function DisconnectButton() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/higgsfield/desconectar", { method: "POST" });
      await client.invalidateQueries({ queryKey: STATUS_KEY });
      setOpen(false);
      toast.success("Higgsfield desconectado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo desconectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 px-2.5 text-muted-foreground">
          <Unplug data-icon="inline-start" />
          Desconectar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Desconectar Higgsfield?</DialogTitle>
          <DialogDescription>No se podrán generar imágenes ni vídeos hasta volver a conectar.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="h-9">
              Cancelar
            </Button>
          </DialogClose>
          <Button variant="destructive" className="h-9 gap-1.5" disabled={busy} onClick={disconnect}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Unplug data-icon="inline-start" />}
            Desconectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectButton({ label, variant = "default" }: { label: string; variant?: "default" | "outline" }) {
  const { busy, connect } = useConnect();
  return (
    <Button variant={variant} className="h-10 gap-2 px-4" disabled={busy} onClick={connect}>
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plug data-icon="inline-start" />}
      {label}
    </Button>
  );
}

/** Tarjeta de la conexión de Higgsfield de la persona de la sesión: estado, saldo y acciones. */
export function HiggsfieldCard() {
  const query = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api<HiggsfieldStatus>("/api/higgsfield/estado"),
  });
  const status = query.data;
  const tone = !status?.connected ? "off" : status.needsReconnect || status.error ? "warn" : "ok";
  const stateLabel = !status?.connected ? "Sin conectar" : status.needsReconnect ? "Caducada" : "Conectado";

  return (
    <section aria-labelledby="hf-title" className="panel flex flex-col">
      <header className="flex items-center gap-3 border-b px-5 py-4 md:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground text-background">
          <Clapperboard className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="hf-title" className="text-base font-semibold tracking-tight">
            Higgsfield
          </h2>
          {status ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <StatusDot tone={tone} />
              {stateLabel}
            </span>
          ) : null}
        </div>
        {status?.connected && !status.needsReconnect ? (
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Actualizar"
            title="Actualizar"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-5 px-5 py-6 md:px-6">
        {query.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
        ) : query.isError || !status ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm">No se pudo leer el estado. Recarga la página.</p>
        ) : !status.connected ? (
          <div className="flex flex-col items-start gap-4">
            <p className="max-w-[48ch] text-sm text-muted-foreground">
              Conecta tu cuenta de Higgsfield para generar imágenes y vídeos con tus créditos.
            </p>
            <ConnectButton label="Conectar Higgsfield" />
          </div>
        ) : status.needsReconnect ? (
          <>
            <div className="flex items-start gap-3 rounded-lg bg-warning/12 px-4 py-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-medium">Tu conexión ha caducado</p>
                {status.email ? <p className="truncate text-sm text-muted-foreground">{status.email}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConnectButton label="Volver a conectar" />
              <DisconnectButton />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {status.credits !== null ? (
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatCredits(status.credits)}</span>
                  <span className="text-base text-muted-foreground">créditos</span>
                  {status.plan ? (
                    <Badge variant="secondary" className="ml-1 self-center">
                      Plan {planLabel(status.plan)}
                    </Badge>
                  ) : null}
                </p>
              ) : null}
              {status.error ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning/12 px-3 py-2.5 text-sm">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
                  {status.error}
                </p>
              ) : null}
              <p className="truncate text-sm text-muted-foreground">
                Conectado como <span className="font-medium text-foreground">{status.email ?? "tu cuenta"}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <DisconnectButton />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Solo el dueño: respuestas en crudo de Higgsfield (sin gastar) para copiar y enviar. */
export function DiagnosticsPanel() {
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setCopied(false);
    try {
      const body = await api<Record<string, unknown>>("/api/higgsfield/diagnostico", { method: "POST" });
      setReport(JSON.stringify(body, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo hacer el diagnóstico.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <Panel
      title="Diagnóstico"
      actions={
        <div className="flex shrink-0 gap-2">
          {report ? (
            <Button variant="outline" className="h-9 gap-1.5" onClick={copy}>
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          ) : null}
          <Button variant={report ? "ghost" : "outline"} className="h-9 gap-1.5" disabled={busy} onClick={run}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Stethoscope data-icon="inline-start" />}
            {report ? "Repetir" : "Ejecutar"}
          </Button>
        </div>
      }
    >
      {report ? (
        <pre className="max-h-[420px] overflow-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
          {report}
        </pre>
      ) : null}
    </Panel>
  );
}
