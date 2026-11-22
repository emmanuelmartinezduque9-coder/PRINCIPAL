"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, type Serialized } from "@/lib/api";
import type { listRules } from "@/server/rules";

type RuleItem = Serialized<Awaited<ReturnType<typeof listRules>>[number]>;

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function RuleList() {
  const query = useQuery({
    queryKey: ["rules"],
    queryFn: () => api<{ rules: RuleItem[] }>("/api/reglas"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 1,
  });
  const rules = query.data?.rules ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reglas</h1>
        <p className="text-sm text-muted-foreground">
          Los textos que guían la búsqueda de ángulos de venta. Puedes afinarlos cuando quieras: cada cambio guarda una
          versión nueva y las anteriores se conservan.
        </p>
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : query.error instanceof ApiError && query.error.status === 403 ? (
        <p className="rounded-lg bg-muted px-3 py-3 text-sm">Solo el dueño puede ver y cambiar las reglas.</p>
      ) : query.isError ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-3 text-sm">
          No se pudieron cargar las reglas. Recarga la página para volver a intentarlo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((rule) => (
            <li key={rule.slug}>
              <Link
                href={`/reglas/${rule.slug}`}
                className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="flex-row items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="text-base font-semibold">{rule.title}</p>
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">Versión {rule.version}</Badge>
                      <span>Cambiada el {formatDateTime(rule.updatedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
