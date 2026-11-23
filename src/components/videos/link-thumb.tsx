"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ThumbJson {
  status: "pending" | "ready" | "failed";
  src: string | null;
}

/**
 * Portada de un enlace de referencia (`/api/enlaces/portada`): en cuanto se pega, para saber cuál
 * es sin abrirlo. Mientras se prepara, «Cargando portada…»; si no hay, el icono del enlace (nunca
 * un error). Ocupa todo su contenedor (que pone el tamaño y el redondeo).
 */
export function LinkThumb({ url, className, compact }: { url: string; className?: string; compact?: boolean }) {
  const [broken, setBroken] = useState(false);
  const thumb = useQuery({
    queryKey: ["link-thumb", url],
    queryFn: () => api<ThumbJson>(`/api/enlaces/portada?url=${encodeURIComponent(url)}`),
    retry: false,
    staleTime: Infinity,
    refetchInterval: (q) => (q.state.data?.status === "pending" || q.state.data === undefined ? 4000 : false),
  });
  const src = thumb.data?.status === "ready" && !broken ? thumb.data.src : null;
  const loading = !thumb.isError && (thumb.data === undefined || thumb.data.status === "pending");
  return (
    <div className={cn("absolute inset-0 grid place-items-center overflow-hidden bg-muted text-muted-foreground", className)} title={url}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Portada del vídeo de referencia" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
      ) : loading && !compact ? (
        <span role="status" className="px-1 text-center text-[10px] leading-tight">
          Cargando portada…
        </span>
      ) : (
        <Link2 className={cn(compact ? "size-4" : "size-5", loading && "animate-pulse")} aria-label={loading ? "Cargando portada…" : undefined} />
      )}
    </div>
  );
}
