"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BatchSummaryJson } from "./labels";

function NewBatchLink() {
  return (
    <Link href="/lotes/nuevo" className={cn(buttonVariants(), "h-10 gap-2 px-4")}>
      <Plus className="size-4" aria-hidden />
      Nuevo lote
    </Link>
  );
}

/** `/lotes`: los lotes que ve la persona, con vídeos, avance (clips terminados) y fecha. */
export function BatchList() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<{ batches: BatchSummaryJson[] }>("/api/lotes"),
  });
  const batches = query.data?.batches ?? [];
  const someoneElse = batches.some((batch) => !batch.mine);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lotes" actions={<NewBatchLink />} />

      {query.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Cargando lotes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-5 py-4 text-sm">
          No se pudieron cargar los lotes. Recarga la página.
        </p>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Layers className="size-5" aria-hidden />
          </span>
          <p className="font-medium">Todavía no hay lotes</p>
          <NewBatchLink />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Lote</TableHead>
                {someoneElse ? <TableHead>De</TableHead> : null}
                <TableHead className="text-right">Vídeos</TableHead>
                <TableHead className="w-64">Clips</TableHead>
                <TableHead className="text-right">Fecha</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const href = `/lotes/${batch.id}`;
                const pct = batch.videos > 0 ? Math.round((batch.done / batch.videos) * 100) : 0;
                return (
                  <TableRow key={batch.id} className="h-12 cursor-pointer" onClick={() => router.push(href)}>
                    <TableCell className="max-w-0 pl-4 font-medium sm:max-w-none">
                      <Link href={href} className="block truncate rounded outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                        {batch.name}
                      </Link>
                    </TableCell>
                    {someoneElse ? (
                      <TableCell className="text-muted-foreground">{batch.mine ? "Tú" : (batch.creatorName ?? "Otra persona")}</TableCell>
                    ) : null}
                    <TableCell className="text-right tabular-nums">{batch.videos}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={pct} aria-label={`${batch.done} de ${batch.videos} clips terminados`} className="w-40" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {batch.done}/{batch.videos}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      <time dateTime={batch.createdAt}>{format(new Date(batch.createdAt), "d MMM yyyy", { locale: es })}</time>
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">
                      <ChevronRight className="size-4" aria-hidden />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
