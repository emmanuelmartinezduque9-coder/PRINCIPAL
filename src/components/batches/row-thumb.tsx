import { CircleAlert, Film, Loader2 } from "lucide-react";
import { frameUrl } from "@/components/videos/labels";
import { cn } from "@/lib/utils";
import type { BatchRowJson } from "./labels";

/** Miniatura 9:16 de la referencia (su primer fotograma) o un icono de su estado. */
export function RowThumb({ row, className, busy }: { row: BatchRowJson; className?: string; busy?: boolean }) {
  return (
    <div className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground", className)}>
      {row.referenceStatus === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frameUrl(row.id, 0, row.updatedAt)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : busy || row.referenceStatus === "processing" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : row.referenceStatus === "failed" ? (
        <CircleAlert className="size-4 text-destructive" aria-hidden />
      ) : (
        <Film className="size-4" aria-hidden />
      )}
    </div>
  );
}
