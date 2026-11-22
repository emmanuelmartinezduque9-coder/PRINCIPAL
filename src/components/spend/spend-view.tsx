"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { OctagonAlert, Package, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Serialized } from "@/lib/api";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SpendSummary } from "@/server/spend";
import { CapBar, capFraction, capTone, TONE_FILL } from "./cap-bar";
import { CapDialog } from "./cap-dialog";
import { SystemCheck } from "./system-check";

interface PausedRow {
  jobName: string;
  label: string;
  userId: number;
  userName: string;
  productId: number | null;
  productName: string | null;
  since: string;
  reason: "global" | "persona" | null;
}

interface SpendData {
  role: "dueno" | "colaborador";
  summary: Serialized<SpendSummary>;
  paused: PausedRow[];
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

/** Una fila: nombre, barra y cifra. Con tope, la barra cambia de color; sin él, es la parte del total. */
function Row({
  icon: Icon,
  name,
  micros,
  capMicros,
  totalMicros,
}: {
  icon: typeof Package;
  name: string;
  micros: number;
  capMicros?: number | null;
  totalMicros: number;
}) {
  const hasCap = typeof capMicros === "number";
  const fraction = hasCap ? capFraction(micros, capMicros) : totalMicros > 0 ? micros / totalMicros : 0;
  const fill = hasCap ? TONE_FILL[capTone(micros, capMicros)] : "bg-foreground/40";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,9rem)_12rem] items-center gap-x-4 px-5 py-3 max-md:grid-cols-[minmax(0,1fr)_auto]">
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-sm font-medium">{name}</span>
      </span>
      <span aria-hidden className="h-2 overflow-hidden rounded-full bg-foreground/[0.08] max-md:order-3 max-md:col-span-2 max-md:mt-2">
        <span className={cn("block h-full rounded-full", fill)} style={{ width: `${micros > 0 ? Math.max(fraction * 100, 3) : 0}%` }} />
      </span>
      <span className="text-right text-sm whitespace-nowrap tabular-nums">
        <span className="font-medium">{formatUsd(micros)}</span>
        {hasCap ? <span className="text-muted-foreground"> / {formatUsd(capMicros)}</span> : null}
      </span>
    </li>
  );
}

function Block({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="border-b px-5 py-3 text-sm font-semibold tracking-tight">{title}</h2>
      {empty ? <p className="px-5 py-6 text-sm text-muted-foreground">Sin gasto este mes</p> : <ul className="divide-y">{children}</ul>}
    </section>
  );
}

function PausedNotice({ paused, capMicros, spentMicros }: { paused: PausedRow[]; capMicros: number; spentMicros: number }) {
  const n = paused.length;
  const jobs = n === 1 ? "1 trabajo esperando" : `${n} trabajos esperando`;
  return (
    <section
      role="alert"
      className="overflow-hidden rounded-xl bg-warning/10 ring-1 ring-warning/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="flex items-start gap-2.5 text-sm">
          <OctagonAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
          <span>
            Hay {jobs} porque se ha llegado al tope. Se reanudan solos al subirlo o al empezar el mes.
          </span>
        </p>
        <div className="flex gap-2">
            {paused.some((job) => job.reason === "global") ? <CapDialog capMicros={capMicros} spentMicros={spentMicros} variant="default" label="Subir tope" /> : null}
            {paused.some((job) => job.reason === "persona") ? (
              <Link href="/personas" className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-1.5 px-3")}>
                <User />
                Subir su tope
              </Link>
            ) : null}
        </div>
      </div>
      <ul className="divide-y divide-warning/20 border-t border-warning/20 bg-card/60">
        {paused.map((job) => (
          <li
            key={`${job.jobName}-${job.userId}-${job.productId}-${job.since}`}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_15rem] items-center gap-x-4 px-5 py-2.5 text-sm max-md:grid-cols-1 max-md:gap-y-0.5"
          >
            <span className="flex items-center gap-2 truncate">
              <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {job.userName}
            </span>
            <span className="flex items-center gap-2 truncate">
              <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {job.productName ?? "—"}
            </span>
            <span className="truncate">{job.label}</span>
            <span className="text-xs text-muted-foreground md:text-right">
              {job.reason === "global" ? "Tope global" : job.reason === "persona" ? "Tope de la persona" : "Esperando saldo"} · hace {formatDistanceToNowStrict(new Date(job.since), { locale: es })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pantalla del dueño. La API sirve también a un colaborador, pero él no tiene esta pantalla: vuelve a Productos. */
export function SpendView() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["gasto"], queryFn: () => api<SpendData>("/api/gasto") });
  const data = query.data;
  const notOwner = data !== undefined && data.role !== "dueno";
  useEffect(() => {
    if (notOwner) router.replace("/productos");
  }, [notOwner, router]);

  if (notOwner) return null;
  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Gasto" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.isError || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Gasto" />
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-3 text-sm">
          No se pudo cargar el gasto. Recarga la página para volver a intentarlo.
        </p>
      </div>
    );
  }

  const { summary, paused } = data;
  const tone = capTone(summary.spentMicros, summary.capMicros);
  const percent = Math.round(capFraction(summary.spentMicros, summary.capMicros) * 100);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Gasto" actions={<CapDialog capMicros={summary.capMicros} spentMicros={summary.spentMicros} />} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel flex flex-col justify-between gap-5 p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground first-letter:uppercase">{monthLabel(summary.month)}</h2>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                tone === "full" ? "text-destructive" : tone === "warn" ? "text-warning-ink" : "text-muted-foreground",
              )}
            >
              {percent} %
            </span>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-3 tabular-nums">
            <span className="text-4xl font-semibold tracking-tight">{formatUsd(summary.spentMicros)}</span>
            <span className="text-lg text-muted-foreground">de {formatUsd(summary.capMicros)}</span>
          </p>
          <CapBar
            spentMicros={summary.spentMicros}
            capMicros={summary.capMicros}
            label={`Gastado este mes: ${percent} % del tope`}
            className="h-4"
          />
        </section>
        <SystemCheck />
      </div>

      {paused.length > 0 ? <PausedNotice paused={paused} capMicros={summary.capMicros} spentMicros={summary.spentMicros} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Por producto" empty={summary.byProduct.length === 0}>
          {summary.byProduct.map((row) => (
            <Row key={`${row.productId}-${row.name}`} icon={Package} name={row.name} micros={row.micros} totalMicros={summary.spentMicros} />
          ))}
        </Block>
        <Block title="Por persona" empty={summary.byUser.length === 0}>
          {summary.byUser.map((row) => (
            <Row
              key={row.userId}
              icon={User}
              name={row.name}
              micros={row.micros}
              capMicros={row.capMicros}
              totalMicros={summary.spentMicros}
            />
          ))}
        </Block>
      </div>
    </div>
  );
}
