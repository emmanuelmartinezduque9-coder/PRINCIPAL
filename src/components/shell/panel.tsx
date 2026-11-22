import { cn } from "@/lib/utils";

/** Bloque con título dentro de una pantalla (datos, fotos…), con acciones o datos a la derecha. */
export function Panel({
  title,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("panel flex flex-col gap-5 p-5 md:p-6", className)}>
      {title ? (
        <div className="flex min-h-6 items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
