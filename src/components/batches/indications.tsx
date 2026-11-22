"use client";

import { ChevronDown, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «Indicaciones» de un producto del lote, plegadas: una línea con su icono y, si hay texto, el
 * principio; al pulsar se despliega el campo (`children`).
 */
export function Indications({
  value,
  open,
  onOpenChange,
  editable = true,
  className,
  children,
}: {
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editable?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const filled = value.trim() !== "";
  if (!editable && !filled) return null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <button
        type="button"
        aria-expanded={open}
        disabled={!editable && !filled}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "group/ind flex h-8 w-fit max-w-full min-w-0 items-center gap-2 rounded-lg px-2 -mx-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          filled ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <MessageSquareText className={cn("size-4 shrink-0", filled ? "text-brand" : "text-muted-foreground")} aria-hidden />
        <span className="shrink-0 font-medium">Indicaciones</span>
        {filled && !open ? <span className="min-w-0 truncate text-muted-foreground">{value.trim().split("\n")[0]}</span> : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-aria-expanded/ind:rotate-180" aria-hidden />
      </button>
      {open ? <div className="animate-in duration-150 fade-in-0 slide-in-from-top-1">{children}</div> : null}
    </div>
  );
}
