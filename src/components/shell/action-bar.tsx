import { cn } from "@/lib/utils";

/**
 * Barra de acciones pegada abajo de la columna del contenido: a la izquierda el resumen (o una
 * acción secundaria), a la derecha la acción principal. Siempre a la vista al desplazarse.
 */
export function ActionBar({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("sticky bottom-20 z-20 mt-auto pt-6 md:bottom-4", className)}>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card/95 px-3 py-2.5 shadow-raised backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{aside}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
