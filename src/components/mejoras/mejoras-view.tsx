"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Circle, Code2, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AprendizajeSection } from "@/components/mejoras/aprendizaje-view";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Serialized } from "@/lib/api";
import { FIX_KINDS, isProblemType, PROBLEM_TYPES, REPORT_STAGES, REPORT_STATUSES, type FixKind, type ReportStatus } from "@/lib/mejoras";
import { cn } from "@/lib/utils";
import type { CorrectionView, MejorasView, ReportView } from "@/server/videos/mejoras/reports";
import type { Evaluation, SideStats } from "@/server/videos/mejoras/metrics";

type View = Serialized<MejorasView>;
type Report = Serialized<ReportView>;
type Correction = Serialized<CorrectionView>;

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`);
const num = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-ES", { maximumFractionDigits: 2 }));
const typeLabel = (type: string | null) => (type && isProblemType(type) ? PROBLEM_TYPES[type] : "Sin clasificar");
const when = (iso: string) => format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });

const STAGE_LABELS: Record<Correction["stage"], string> = {
  frame: "imagen inicial",
  clip: "clip",
  montaje: "rótulos del montaje",
  doblaje: "doblaje (habla o canción)",
};

const STAGE_HOW: Record<Correction["stage"], string> = {
  frame: "El motor la añade al final del prompt; se cuenta como «después» cada vídeo cuyo prompt la llevó.",
  clip: "El motor la añade al final del prompt; se cuenta como «después» cada vídeo cuyo prompt la llevó.",
  montaje: "Claude la cumple al leer y adaptar los rótulos; se cuenta como «después» cada vídeo cuyo primer montaje la usó (rehacer el montaje cuenta como regeneración).",
  doblaje: "Claude la cumple al decidir si la voz es habla o canción; se cuenta como «después» cada vídeo cuyo primer montaje la usó.",
};

const VERDICT: Record<Evaluation["verdict"], { label: string; tone: string }> = {
  mejora: { label: "Aprendido: mejora con números", tone: "bg-success/15 text-success" },
  no_mejora: { label: "No mejora: no cuenta como aprendido", tone: "bg-destructive/10 text-destructive" },
  midiendo: { label: "Midiendo", tone: "bg-muted text-muted-foreground" },
};

/** Enlaces a los vídeos en los que se basa una cifra. */
function VideoRefs({ ids, products, max = 12 }: { ids: number[]; products: Record<number, number>; max?: number }) {
  if (ids.length === 0) return <span className="text-muted-foreground">ninguno</span>;
  const shown = ids.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-x-1.5">
      {shown.map((id) => {
        const product = products[id];
        return product ? (
          <Link key={id} href={`/productos/${product}/videos/${id}`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
            #{id}
          </Link>
        ) : (
          <span key={id}>#{id}</span>
        );
      })}
      {ids.length > max ? <span>y {ids.length - max} más</span> : null}
    </span>
  );
}

/** Antes y después, con los vídeos citados. */
function EvidenceTable({ evaluation, products, typeName }: { evaluation: Serialized<Evaluation>; products: Record<number, number>; typeName: string }) {
  const sides: Array<[string, Serialized<SideStats>]> = [
    ["Antes", evaluation.before],
    ["Después", evaluation.after],
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-20 py-1 pr-4 font-medium" />
              <th className="py-1 pr-3 font-medium">Vídeos</th>
              <th className="py-1 pr-3 font-medium">Aceptados a la primera</th>
              <th className="py-1 pr-3 font-medium">Regeneraciones por vídeo</th>
              <th className="py-1 pr-3 font-medium">Con «{typeName}»</th>
            </tr>
          </thead>
          <tbody>
            {sides.map(([label, side]) => (
              <tr key={label} className="border-t align-top">
                <th scope="row" className="w-20 py-1.5 pr-4 text-left font-medium">
                  {label}
                </th>
                <td className="py-1.5 pr-3 tabular-nums">{side.videos}</td>
                <td className="py-1.5 pr-3 tabular-nums">{pct(side.firstPassRate)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{num(side.regenerationsPerVideo)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{pct(side.typeRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{evaluation.reason}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Casos en que se basa</summary>
        <div className="mt-1 flex flex-col gap-1">
          <span>
            Antes: <VideoRefs ids={evaluation.before.videoIds} products={products} /> · con el problema: <VideoRefs ids={evaluation.before.withProblem} products={products} />
          </span>
          <span>
            Después: <VideoRefs ids={evaluation.after.videoIds} products={products} /> · con el problema: <VideoRefs ids={evaluation.after.withProblem} products={products} />
          </span>
        </div>
      </details>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Evaluation["verdict"] }) {
  const v = VERDICT[verdict];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", v.tone)}>{v.label}</span>;
}

function CorrectionCard({ correction, owner, products }: { correction: Correction; owner: boolean; products: Record<number, number> }) {
  const client = useQueryClient();
  const toggle = useMutation({
    mutationFn: (active: boolean) => api(`/api/mejoras/correcciones/${encodeURIComponent(correction.key)}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mejoras"] }),
    onError: (error) => toast.error(error.message),
  });
  const typeName = typeLabel(correction.problemType);
  return (
    <li className="panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{typeName}</span>
        <span className="text-sm text-muted-foreground">
          · {STAGE_LABELS[correction.stage]} · {correction.productName ? `solo ${correction.productName}` : "todos los productos"} · v{correction.current.version}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {correction.active ? <VerdictBadge verdict={correction.evaluation.verdict} /> : <span className="text-xs text-muted-foreground">Retirada</span>}
        </span>
      </div>
      <p className="text-sm">{correction.current.note}</p>
      <div className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed">{correction.current.directive}</div>
      <p className="text-xs text-muted-foreground">
        {correction.current.automatic ? "Aplicada sola" : "Escrita a mano"} el {when(correction.current.createdAt)}
        {correction.reportIds.length ? ` · sale de ${correction.reportIds.map((id) => `#${id}`).join(", ")}` : ""}. {STAGE_HOW[correction.stage]}
      </p>
      <EvidenceTable evaluation={correction.evaluation} products={products} typeName={typeName} />
      {correction.versions.length > 1 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Versiones anteriores</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {correction.versions.slice(1).map((v) => (
              <li key={v.version}>
                v{v.version} ({when(v.createdAt)}): {v.directive}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {owner ? (
        <div>
          <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(!correction.active)}>
            {toggle.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {correction.active ? "Retirar" : "Volver a aplicar"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

const STEPS: Array<{ key: string; label: string }> = [
  { key: "recibido", label: "Recibido" },
  { key: "causa", label: "Causa" },
  { key: "cambio", label: "Cambio aplicado" },
  { key: "comprobado", label: "Comprobado" },
];

/** Hasta qué paso del recorrido ha llegado. */
function reached(status: string): number {
  if (status === "comprobado") return 4;
  if (status === "aplicado" || status === "no_mejora") return 3;
  if (status === "clasificado" || status === "sin_arreglo") return 2;
  return 1;
}

function Journey({ status }: { status: string }) {
  const done = reached(status);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label="Recorrido">
      {STEPS.map((step, i) => (
        <li key={step.key} className={cn("flex items-center gap-1", i < done ? "text-foreground" : "text-muted-foreground/60")}>
          {i < done ? <Check className="size-3.5 text-success" aria-hidden /> : <Circle className="size-3" aria-hidden />}
          {step.label}
          {i < STEPS.length - 1 ? <span className="px-1 text-muted-foreground/40">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

function CommitForm({ report }: { report: Report }) {
  const client = useQueryClient();
  const [commit, setCommit] = useState(report.codeCommit ?? "");
  const save = useMutation({
    mutationFn: (codeCommit: string) => api(`/api/mejoras/${report.id}`, { method: "PATCH", body: JSON.stringify({ codeCommit }) }),
    onSuccess: () => {
      toast.success("Apuntado. Desde ahora se mide si baja el problema.");
      return client.invalidateQueries({ queryKey: ["mejoras"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(commit.trim());
      }}
    >
      <Input value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Commit del arreglo" className="h-8 w-44 font-mono text-xs" aria-label="Commit del arreglo" />
      <Button type="submit" size="sm" variant="outline" disabled={save.isPending || commit.trim() === (report.codeCommit ?? "")}>
        Guardar
      </Button>
    </form>
  );
}

function ReportItem({ report, owner, products }: { report: Report; owner: boolean; products: Record<number, number> }) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api(`/api/mejoras/${report.id}`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mejoras"] }),
    onError: (error) => toast.error(error.message),
  });
  const videoHref = report.videoId && products[report.videoId] ? `/productos/${products[report.videoId]}/videos/${report.videoId}` : null;
  return (
    <li className="panel flex flex-col gap-2.5 p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">#{report.id}</span>
        <span className="text-muted-foreground">
          {REPORT_STAGES[report.stage as keyof typeof REPORT_STAGES] ?? report.stage}
          {report.versionLabel ? ` · ${report.versionLabel}` : ""}
          {owner ? ` · ${report.authorName}` : ""} · {when(report.createdAt)} · web {report.appVersion}
        </span>
        <span className="ml-auto text-xs font-medium">{REPORT_STATUSES[report.status as ReportStatus] ?? report.status}</span>
      </div>
      <p className="text-sm whitespace-pre-line">{report.body}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {videoHref ? (
          <Link href={videoHref} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
            Vídeo #{report.videoId}
            {report.videoTitle ? ` «${report.videoTitle}»` : ""}
          </Link>
        ) : report.videoId ? (
          <span>Vídeo #{report.videoId}</span>
        ) : null}
        {report.batchId ? (
          <Link href={`/lotes/${report.batchId}`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
            Lote #{report.batchId}
          </Link>
        ) : null}
        {report.hasScreenshot ? (
          <a href={`/api/mejoras/${report.id}/captura`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground">
            <ImageIcon className="size-3.5" aria-hidden />
            Captura
          </a>
        ) : null}
        {report.page ? <span>{report.page}</span> : null}
      </div>
      <Journey status={report.status} />
      {report.cause ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Causa ({typeLabel(report.problemType)}{report.fixKind ? ` · ${FIX_KINDS[report.fixKind as FixKind] ?? report.fixKind}` : ""}):</span> {report.cause}
        </p>
      ) : report.status === "recibido" ? (
        <p className="text-sm text-muted-foreground">Buscando la causa…{report.classifyError ? ` (${report.classifyError})` : ""}</p>
      ) : null}
      {report.correctionKey ? <p className="text-xs text-muted-foreground">Cambio: corrección del motor (ver «Lo aprendido»).</p> : null}
      {report.fixKind === "codigo" ? (
        <div className="flex flex-col gap-2 text-sm">
          {report.codeCommit ? (
            <p className="text-xs text-muted-foreground">
              Arreglado en el commit <span className="font-mono">{report.codeCommit}</span>
              {report.codeFixedAt ? ` (${when(report.codeFixedAt)})` : ""}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">En la cola de arreglos de código.</p>
          )}
          {report.codeEvaluation ? (
            <>
              <VerdictBadge verdict={report.codeEvaluation.verdict} />
              <EvidenceTable evaluation={report.codeEvaluation} products={products} typeName={typeLabel(report.problemType)} />
            </>
          ) : null}
          {owner ? <CommitForm report={report} /> : null}
        </div>
      ) : null}
      {owner && report.status === "recibido" && report.classifyError ? (
        <div>
          <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()}>
            <RotateCcw data-icon="inline-start" />
            Volver a intentar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="panel flex flex-col gap-0.5 px-4 py-3">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * «Mejoras»: cada reporte con su recorrido (recibido → causa → cambio aplicado → comprobado) y, para
 * cada cambio, los números de antes y después con los vídeos en que se basan. Algo solo cuenta como
 * aprendido si los números mejoran.
 */
export function MejorasPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["mejoras"], queryFn: () => api<View>("/api/mejoras"), refetchInterval: 30_000 });
  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) return <p className="text-sm text-destructive">{error?.message ?? "No se pudo cargar."}</p>;
  const queue = data.reports.filter((r) => data.codeQueue.includes(r.id));
  const others = data.reports.filter((r) => !data.codeQueue.includes(r.id));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Mejoras">
        <p className="text-sm text-muted-foreground">
          {data.owner ? "Cada problema reportado" : "Tus reportes"} y lo que se ha cambiado. Algo solo cuenta como aprendido si los números mejoran.
        </p>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat value={data.totals.reports} label="Reportes" />
        <Stat value={data.totals.applied} label="Con cambio aplicado" />
        <Stat value={data.totals.learned} label="Aprendido (mejora)" />
        <Stat value={data.totals.measuring} label="Midiendo" />
        <Stat value={data.totals.notImproving} label="Sin mejora" />
      </div>

      <AprendizajeSection />

      {data.corrections.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="aprendido">
          <h2 id="aprendido" className="text-base font-semibold">
            Lo aprendido
          </h2>
          <ul className="flex flex-col gap-3">
            {data.corrections.map((c) => (
              <CorrectionCard key={c.key} correction={c} owner={data.owner} products={data.videoProducts} />
            ))}
          </ul>
        </section>
      ) : null}

      {data.owner && queue.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="cola">
          <h2 id="cola" className="flex items-center gap-2 text-base font-semibold">
            <Code2 className="size-4" aria-hidden />
            Arreglos de código pendientes ({queue.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Los arregla una sesión de Claude (el coordinador lee esta cola en <span className="font-mono">/api/mejoras/cola</span>). Al arreglarlo se apunta el commit y se mide si baja el problema.
          </p>
          <ul className="flex flex-col gap-3">
            {queue.map((r) => (
              <ReportItem key={r.id} report={r} owner={data.owner} products={data.videoProducts} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="reportes">
        <h2 id="reportes" className="text-base font-semibold">
          Reportes
        </h2>
        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay reportes. Se reporta con «Reportar un problema» junto a la imagen, el clip, el montaje, el lote o abajo en el menú.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {others.map((r) => (
              <ReportItem key={r.id} report={r} owner={data.owner} products={data.videoProducts} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
