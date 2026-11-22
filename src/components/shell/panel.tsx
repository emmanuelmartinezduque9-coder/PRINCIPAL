import { cn } from "@/lib/utils";

/** Bloque con título dentro de una pantalla (datos, fotos, historial…). */
export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
