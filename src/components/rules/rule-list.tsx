"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ApiError, api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { listRules } from "@/server/rules";

type RuleItem = Serialized<Awaited<ReturnType<typeof listRules>>[number]>;

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Lista de reglas (columna izquierda en el ordenador; pantalla propia en el móvil). */
function RuleList({ activeSlug }: { activeSlug: string | null }) {
  const query = useRules();
  const rules = query.data?.rules ?? [];

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2 p-2" aria-label="Cargando las reglas">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }
  if (query.error instanceof ApiError && query.error.status === 403) {
    return <p className="p-4 text-sm text-muted-foreground">Solo para el dueño.</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="m-2 rounded-lg bg-destructive/10 px-3 py-3 text-sm">
        No se pudieron cargar las reglas. Recarga la página.
      </p>
    );
  }
  if (rules.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Todavía no hay reglas.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5 p-1.5">
      {rules.map((rule) => {
        const active = rule.slug === activeSlug;
        return (
          <li key={rule.slug}>
            <Link
              href={`/reglas/${rule.slug}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-3 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-foreground/[0.06]" : "hover:bg-muted/70",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm leading-snug", active ? "font-semibold" : "font-medium")}>{rule.title}</span>
                  {/* Solo cuando ya se ha cambiado: una «v1» en todas no dice nada. */}
                  {rule.version > 1 ? (
                    <span
                      className="mt-px shrink-0 rounded bg-foreground/[0.06] px-1.5 text-xs leading-5 text-muted-foreground tabular-nums"
                      title={`Versión ${rule.version} · ${formatDateTime(rule.updatedAt)}`}
                    >
                      v{rule.version}
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{rule.description}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Pantalla de reglas en dos paneles: la lista a la izquierda y la regla abierta a la derecha.
 * En el móvil se ve una cosa cada vez (la lista, o la regla con un enlace para volver).
 */
export function RulesWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const match = pathname.match(/^\/reglas\/([^/]+)/);
  const activeSlug = match ? decodeURIComponent(match[1]) : null;
  const rules = useRules();

  // Un colaborador que llega aquí por la dirección: un solo aviso, sin paneles vacíos.
  if (rules.error instanceof ApiError && rules.error.status === 403) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reglas" />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Lock className="size-5" aria-hidden />
          </span>
          <p className="font-medium">Solo para el dueño</p>
          <Link href="/productos" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
            Ir a Productos
          </Link>
        </div>
      </div>
    );
  }

  // Desde 768 px la pantalla llena el alto de la ventana: la lista y el texto se desplazan
  // dentro de su panel (columnas flexibles, sin alturas calculadas a mano).
  return (
    <div className="flex flex-col gap-6 md:min-h-[32rem] md:flex-1">
      {/* Con una regla abierta, en el móvil y a media pantalla manda el enlace «‹ Reglas». */}
      <PageHeader title="Reglas" className={activeSlug ? "hidden shrink-0 lg:flex" : "shrink-0"} />
      <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside
          aria-label="Lista de reglas"
          className={cn(
            // El contenido va posicionado sobre el panel: una lista larga se desplaza dentro
            // y no estira la página.
            "panel md:relative md:min-h-0 md:flex-1",
            activeSlug ? "hidden lg:block" : undefined,
          )}
        >
          <div className="md:absolute md:inset-0 md:overflow-y-auto">
            <RuleList activeSlug={activeSlug} />
          </div>
        </aside>
        <div className={cn("min-w-0 flex-col md:min-h-0 md:flex-1", activeSlug ? "flex" : "hidden lg:flex")}>{children}</div>
      </div>
    </div>
  );
}

function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: () => api<{ rules: RuleItem[] }>("/api/reglas"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 1,
  });
}

/**
 * Panel derecho cuando todavía no se ha elegido ninguna regla. En el ordenador se abre
 * directamente la primera, para no dejar media pantalla vacía; en el móvil se queda la lista.
 */
export function NoRuleSelected() {
  const router = useRouter();
  const first = useRules().data?.rules[0]?.slug;
  useEffect(() => {
    if (first && window.matchMedia("(min-width: 1024px)").matches) router.replace(`/reglas/${first}`);
  }, [first, router]);

  return (
    <div className="flex min-h-[26rem] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <BookOpen className="size-5" aria-hidden />
      </span>
      <p className="font-medium">Elige una regla</p>
    </div>
  );
}
