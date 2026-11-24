"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { VideoViewJson } from "./labels";

type PinterestJson = NonNullable<VideoViewJson["pinterest"]>;

const WAITING: Record<string, string> = {
  pending: "Eligiendo referencias aprobadas…",
  searching: "Eligiendo referencias aprobadas…",
  waiting_mac: "Eligiendo referencias aprobadas…",
};

/**
 * «Referencias de Pinterest»: las fotos reales que acompañan a la imagen inicial (regla fija del
 * dueño: siempre, salvo una referencia de entorno puesta a mano). Miniaturas pequeñas; clic amplía.
 * No pide nada: solo enseña lo que se adjunta.
 */
export function PinterestRefs({ pinterest, compact = false }: { pinterest: PinterestJson | null | undefined; compact?: boolean }) {
  const [zoomed, setZoomed] = useState<PinterestJson["refs"][number] | null>(null);
  if (!pinterest) return null;
  const waiting = WAITING[pinterest.status];
  return (
    <section className={compact ? "flex flex-col gap-1.5" : "panel flex flex-col gap-2 p-4"} aria-label="Referencias de Pinterest">
      <h3 className="text-xs font-medium text-muted-foreground">Referencias que se usan (elegidas solas de tus aprobadas · no hay que hacer nada)</h3>
      {pinterest.refs.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {pinterest.refs.map((ref) => (
            <li key={ref.sha256}>
              <button
                type="button"
                className="block overflow-hidden rounded-md ring-1 ring-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setZoomed(ref)}
                title={ref.reason}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado del almacén */}
                <img src={ref.url} alt={ref.reason} className={compact ? "h-14 w-auto max-w-24 object-cover" : "h-20 w-auto max-w-32 object-cover"} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : waiting ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {pinterest.status === "pending" && pinterest.error?.startsWith("Sin saldo") ? pinterest.error : waiting}
        </p>
      ) : pinterest.status === "failed" ? (
        <p className="text-xs text-pretty text-muted-foreground">{pinterest.error ?? "No se eligió ninguna."} Se vuelve a intentar sola.</p>
      ) : null}
      {!compact && pinterest.scene && pinterest.refs.length > 0 ? (
        <p className="text-xs text-pretty text-muted-foreground">{pinterest.scene.place}</p>
      ) : null}
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="text-sm font-medium">Referencia que se usa</DialogTitle>
          {zoomed ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado del almacén */}
              <img src={zoomed.url} alt={zoomed.reason} className="max-h-[70vh] w-auto max-w-full rounded-lg" />
              <p className="text-sm text-pretty text-muted-foreground">
                {zoomed.reason}
              </p>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
