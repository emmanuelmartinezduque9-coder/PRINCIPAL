import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vacío: un icono grande dentro de anillos (casi una ilustración), una frase y la acción
 * que lo arregla. Sin párrafos.
 */
export function EmptyState({
  icon: Icon,
  title,
  action,
  tone = "default",
  className,
  children,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "success" | "busy";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-5 rounded-2xl border border-dashed bg-surface/50 px-6 py-16 text-center", className)}>
      <span aria-hidden className="relative grid size-24 place-items-center">
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-foreground/[0.05] to-transparent" />
        <span className="absolute inset-3 rounded-full bg-gradient-to-b from-foreground/[0.06] to-transparent ring-1 ring-foreground/[0.04]" />
        <span
          className={cn(
            "relative grid size-12 place-items-center rounded-2xl bg-card shadow-raised ring-1 ring-border",
            tone === "success" ? "text-success" : tone === "busy" ? "text-brand" : "text-muted-foreground",
          )}
        >
          <Icon className={cn("size-5", tone === "busy" && "animate-spin")} />
        </span>
      </span>
      <div className="flex flex-col items-center gap-1">
        <p className="text-base font-medium text-balance">{title}</p>
        {children}
      </div>
      {action}
    </div>
  );
}
