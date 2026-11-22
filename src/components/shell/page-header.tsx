import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Cabecera común de cada pantalla: enlace para volver (opcional), título, una frase de
 * explicación y, a la derecha, las acciones de la pantalla.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
  /** Contenido extra bajo el título (etiquetas, datos breves). */
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex h-7 w-fit items-center gap-1 rounded-md pr-2 pl-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">{title}</h1>
          {description ? <p className="max-w-[70ch] text-sm text-pretty text-muted-foreground">{description}</p> : null}
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
