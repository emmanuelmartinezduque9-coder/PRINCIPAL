import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Cabecera común de cada pantalla: enlace para volver, título y, a la derecha, las acciones.
 * La fila del enlace se reserva aunque no haya enlace: así el título queda a la misma altura
 * en todas las pantallas.
 */
export function PageHeader({
  title,
  actions,
  back,
  className,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
  /** Datos breves bajo el título (fichas, una frase del propio contenido). */
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      <div className="flex h-7 items-center">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 inline-flex h-7 items-center gap-1 rounded-md pr-2 pl-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl leading-10 font-semibold tracking-tight text-balance break-words">{title}</h1>
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
