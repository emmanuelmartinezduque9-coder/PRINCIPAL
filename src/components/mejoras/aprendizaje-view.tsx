"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LearningBatch, LearningView } from "@/server/videos/aprendizaje/medicion";

type View = Serialized<LearningView>;
type Batch = Serialized<LearningBatch>;

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`);
const num = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-ES", { maximumFractionDigits: 1 }));

const SCOPE: Record<string, string> = { global: "Siempre", producto: "En", pais: "En", toma: "En tomas de" };
const COUNTRIES: Record<string, string> = { DE: "Alemania", AT: "Austria", CH: "Suiza", IT: "Italia", FR: "Francia", ES: "España", US: "EE. UU.", GB: "Reino Unido" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const OUTCOME: Record<string, { label: string; tone: string }> = {
  aprobado: { label: "aprobado", tone: "text-success" },
  corregido: { label: "corregido", tone: "text-destructive" },
};

function VideoLink({ id, products }: { id: number; products: Record<number, number> }) {
  const product = products[id];
  return product ? (
    <Link href={`/productos/${product}/videos/${id}`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
      #{id}
    </Link>
  ) : (
    <span>#{id}</span>
  );
}

/**
 * Correcciones por vídeo de cada lote (barra: repetidas abajo, nuevas encima) y aprobados a la primera (puntos).
 * Lo que tiene que verse si aprende: la parte repetida baja lote a lote.
 */
function CorrectionsChart({ batches }: { batches: Batch[] }) {
  const shown = batches.filter((b) => b.videos > 0);
  if (shown.length === 0) return null;
  const W = 640;
  const H = 200;
  const pad = { l: 34, r: 34, t: 12, b: 34 };
  const max = Math.max(1, ...shown.map((b) => b.correctionsPerVideo ?? 0));
  const top = Math.ceil(max);
  const slot = (W - pad.l - pad.r) / shown.length;
  const bar = Math.min(44, slot * 0.6);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const yPct = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v);
  const points = shown
    .map((b, i) => (b.firstPass === null ? null : `${pad.l + slot * i + slot / 2},${yPct(b.firstPass)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <figure className="panel flex flex-col gap-2 px-4 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Correcciones por vídeo en cada lote">
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} style={{ stroke: "var(--border)" }} strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="text-[10px] tabular-nums" style={{ fill: "var(--muted-foreground)" }}>
              {num(v)}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((v) => (
          <text key={v} x={W - pad.r + 6} y={yPct(v) + 4} className="text-[10px] tabular-nums" style={{ fill: "var(--muted-foreground)" }}>
            {Math.round(v * 100)}%
          </text>
        ))}
        {shown.map((b, i) => {
          const per = b.correctionsPerVideo ?? 0;
          const repeatedPer = b.videos > 0 ? b.repeated / b.videos : 0;
          const x = pad.l + slot * i + (slot - bar) / 2;
          return (
            <g key={b.batchId}>
              <title>{`Lote ${b.batchId}: ${b.corrections} correcciones en ${b.videos} vídeos (${b.repeated} repetidas); aprobados a la primera ${pct(b.firstPass)}`}</title>
              <rect x={x} y={y(per)} width={bar} height={y(0) - y(per)} rx={2} style={{ fill: "var(--primary)", fillOpacity: 0.35 }} />
              <rect x={x} y={y(repeatedPer)} width={bar} height={y(0) - y(repeatedPer)} rx={2} style={{ fill: "var(--primary)" }} />
              <text x={x + bar / 2} y={H - pad.b + 14} textAnchor="middle" className="text-[11px]" style={{ fill: "var(--foreground)" }}>
                Lote {b.batchId}
              </text>
              <text x={x + bar / 2} y={H - pad.b + 27} textAnchor="middle" className="text-[10px]" style={{ fill: "var(--muted-foreground)" }}>
                {b.videos} vídeos
              </text>
            </g>
          );
        })}
        {points ? <polyline points={points} fill="none" style={{ stroke: "var(--success)" }} strokeWidth={2} /> : null}
        {shown.map((b, i) =>
          b.firstPass === null ? null : <circle key={b.batchId} cx={pad.l + slot * i + slot / 2} cy={yPct(b.firstPass)} r={3.5} style={{ fill: "var(--success)" }} />,
        )}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--primary)" }} aria-hidden /> Correcciones repetidas por vídeo (ya pedidas en un lote anterior)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--primary)", opacity: 0.35 }} aria-hidden /> Correcciones nuevas por vídeo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: "var(--success)" }} aria-hidden /> Aprobados a la primera (escala derecha)
        </span>
      </figcaption>
    </figure>
  );
}

function BatchCard({ batch, products }: { batch: Batch; products: Record<number, number> }) {
  return (
    <li className="panel flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-medium">
          Lote {batch.batchId} · {batch.name}
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {plural(batch.videos, "vídeo", "vídeos")} · {plural(batch.corrections, "corrección", "correcciones")} ({batch.repeated} {batch.repeated === 1 ? "repetida" : "repetidas"}) · {pct(batch.firstPass)} aprobados a la primera
        </span>
      </div>

      {batch.learned.length === 0 ? (
        <p className="text-sm text-muted-foreground">De este lote no ha salido ninguna preferencia nueva.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {batch.learned.map(({ preference: p, appliedIn }) => (
            <li key={p.id} className={cn("flex flex-col gap-1 border-l-2 pl-3", p.status === "activa" ? "border-primary" : "border-border opacity-70")}>
              <span className="text-sm">
                <span className="text-muted-foreground">
                  {SCOPE[p.scope] ?? ""} {p.scope === "global" ? "" : `${p.scope === "pais" ? (COUNTRIES[p.scopeLabel] ?? p.scopeLabel) : p.scopeLabel}: `}
                </span>
                {p.directive}
              </span>
              <span className="text-xs text-muted-foreground">
                Peso {Math.round(p.weight * 100)} % · {p.supports} a favor, {p.contradicts} en contra
                {p.status === "retirada" ? " · retirada porque no funcionaba" : ""} · Se usó en{" "}
                {appliedIn.length === 0 ? (
                  "ningún vídeo todavía"
                ) : (
                  <span>
                    {appliedIn.map((a, i) => (
                      <span key={`${a.videoId}-${a.stage}`}>
                        {i > 0 ? " · " : ""}
                        <VideoLink id={a.videoId} products={products} />
                        {a.batchId ? ` (lote ${a.batchId}, ${a.stage}` : ` (${a.stage}`}
                        {a.outcome ? <span className={OUTCOME[a.outcome]?.tone}>{`, ${OUTCOME[a.outcome]?.label ?? a.outcome}`}</span> : null})
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {batch.videoDetail.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Vídeo a vídeo</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {batch.videoDetail.map((v) => (
              <li key={v.videoId} className="flex flex-col gap-0.5">
                <span className="font-medium">
                  <VideoLink id={v.videoId} products={products} /> {v.title}
                </span>
                {v.signals.length > 0 ? (
                  <ul className="text-xs text-muted-foreground">
                    {v.signals.map((s) => (
                      <li key={s.id}>
                        <span className={s.polarity < 0 ? "text-destructive" : s.polarity > 0 ? "text-success" : undefined}>{s.label}</span>
                        {s.text ? `: «${s.text}»` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {v.applied.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Llevó: {v.applied.map((a) => `${a.directive} (${a.stage}${a.outcome ? `, ${OUTCOME[a.outcome]?.label ?? a.outcome}` : ""})`).join(" · ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/**
 * «Qué ha aprendido»: lo que el motor saca de cada lote y vídeo (aprobaciones, rechazos, instrucciones, cambios y
 * elecciones), dónde lo usó después y si las correcciones repetidas bajan. Solo se mira; no hay nada que confirmar.
 */
export function AprendizajeSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["mejoras", "aprendizaje"],
    queryFn: () => api<View>("/api/mejoras/aprendizaje"),
    refetchInterval: 60_000,
  });
  return (
    <section className="flex flex-col gap-3" aria-labelledby="que-ha-aprendido">
      <h2 id="que-ha-aprendido" className="text-base font-semibold">
        Qué ha aprendido
      </h2>
      <p className="text-sm text-muted-foreground">
        Cada aprobación, rechazo, instrucción, cambio y elección de cada vídeo se guarda. Al cerrar cada lote, y cada día, se convierte en preferencias que el
        motor aplica solo en los vídeos siguientes; su peso sube cuando se aprueban y baja cuando se corrigen.
      </p>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : error || !data ? (
        <p className="text-sm text-destructive">{error?.message ?? "No se pudo cargar."}</p>
      ) : data.batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay lotes con señales.</p>
      ) : (
        <>
          <CorrectionsChart batches={data.batches} />
          <ul className="flex flex-col gap-3">
            {[...data.batches].reverse().map((b) => (
              <BatchCard key={b.batchId} batch={b} products={data.videoProducts} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
