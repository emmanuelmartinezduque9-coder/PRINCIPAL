"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GenerationDetail } from "@/server/videos/details";

/**
 * «Detalles técnicos» (solo el dueño): las generaciones del vídeo con su petición y la respuesta
 * en crudo de Higgsfield, sin claves. Se piden al abrirlo, no con cada consulta del vídeo.
 */
export function TechnicalDetails({ videoId }: { videoId: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const details = useQuery({
    queryKey: ["video-details", videoId],
    queryFn: () => api<{ generations: GenerationDetail[] }>(`/api/videos/${videoId}/detalles`),
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const text = details.data ? JSON.stringify(details.data.generations, null, 2) : null;

  // «Copiado» vuelve a «Copiar» al poco, para poder copiar otra vez.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <details
      className="panel group"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        Detalles técnicos
        {details.data ? (
          <span className="text-muted-foreground tabular-nums">{details.data.generations.length}</span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-3 border-t px-5 py-4">
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 gap-1.5" disabled={!text} onClick={copy}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button
            variant="ghost"
            className="h-9 gap-1.5"
            disabled={details.isFetching}
            onClick={() => {
              setCopied(false);
              void details.refetch();
            }}
          >
            <RefreshCw data-icon="inline-start" className={cn(details.isFetching && "animate-spin")} />
            Actualizar
          </Button>
        </div>
        {details.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Cargando" />
        ) : details.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {details.error instanceof Error ? details.error.message : "No se pudieron leer los detalles."}
          </p>
        ) : text ? (
          <pre className="max-h-[480px] overflow-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
            {text}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
