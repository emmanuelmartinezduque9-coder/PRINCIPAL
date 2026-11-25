"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink, FlaskConical, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PieceStat } from "@/server/videos/cerebro/modelo";
import type { CerebroView } from "@/server/videos/cerebro/vista";

type View = Serialized<CerebroView>;
type Stat = Serialized<PieceStat>;
type Post = View["accounts"][number]["recent"][number];

const KEY_LABELS: Record<string, string> = { angulo: "Ángulos y ganchos", fondo: "Fondos", texto: "Textos en pantalla", cancion: "Canciones" };
const PILLAR_LABELS: Record<string, string> = { gancho: "Gancho", texto: "Texto", fondo: "Fondo", cancion: "Canción" };
const VERDICT: Record<string, { label: string; tone: string }> = {
  recomendado: { label: "Funciona", tone: "text-success" },
  evitar: { label: "Evitar", tone: "text-destructive" },
  por_probar: { label: "Por probar", tone: "text-muted-foreground" },
};
const STATUS: Record<string, string> = { en_marcha: "En marcha", ganador: "Volvió a funcionar", perdedor: "No volvió a funcionar", pendiente: "Pendiente", cancelado: "Cancelado" };

const n = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: 0 }));
const pct = (v: number) => `${Math.round(v * 100)} %`;
const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM", { locale: es }) : "—");

function Prob({ stat }: { stat: Stat }) {
  const v = VERDICT[stat.verdict];
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate" title={stat.value}>
          {stat.value}
        </span>
        <span className={cn("shrink-0 text-xs tabular-nums", v.tone)}>
          {pct(stat.p)} · {v.label}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(stat.p * 100)}%`, background: stat.verdict === "evitar" ? "var(--destructive)" : stat.verdict === "recomendado" ? "var(--success)" : "var(--muted-foreground)" }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {stat.hits} de {stat.n} {stat.n === 1 ? "reel superó" : "reels superaron"} la mediana de su cuenta
      </span>
    </li>
  );
}

function ReelLink({ post, label }: { post: Pick<Post, "url" | "shortcode">; label?: string }) {
  return post.url ? (
    <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground">
      {label ?? post.shortcode}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  ) : (
    <span>{label ?? post.shortcode}</span>
  );
}

function SplitSection({ data }: { data: View }) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (postId: number) => api<{ batchId: number; sent: boolean }>("/api/cerebro/split-test", { method: "POST", body: JSON.stringify({ postId }) }),
    onSuccess: (r) => {
      toast.success(r.sent ? "Split test creado y enviado como lote." : "Split test creado como lote (quedó en borrador).");
      void qc.invalidateQueries({ queryKey: ["cerebro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="flex flex-col gap-3" aria-labelledby="split">
      <h2 id="split" className="flex items-center gap-2 text-base font-semibold">
        <FlaskConical className="size-4" aria-hidden />
        Split tests
      </h2>
      <p className="text-sm text-muted-foreground">
        Reels propios que superan 1,5 veces la mediana de su cuenta. Regla: primero cambia solo el gancho; si vuelve a funcionar, se varía el texto, después el fondo y la canción.
      </p>
      {data.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay reels propios que superen claramente su mediana con al menos 48 h.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.candidates.map((c) => (
            <li key={c.post.id} className="panel flex flex-col gap-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">@{c.handle}</span>
                <span className="text-sm tabular-nums text-success">{c.post.ratio ? `${c.post.ratio.toLocaleString("es-ES", { maximumFractionDigits: 1 })}× su mediana` : ""}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                <ReelLink post={c.post} /> · {day(c.post.publishedAt)} · {n(c.post.v72)} vistas a 72 h{c.post.v72Exact ? "" : " (estimadas)"}
                {c.post.dna.angulo ? ` · ${c.post.dna.angulo}` : ""}
              </span>
              <p className="text-sm">
                {c.pillar ? <span className="mr-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">Cambiar: {PILLAR_LABELS[c.pillar]}</span> : null}
                {c.why}
              </p>
              {c.pillar && !c.running ? (
                <div>
                  <Button size="sm" disabled={create.isPending} onClick={() => create.mutate(c.post.id)}>
                    {create.isPending && create.variables === c.post.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
                    Crear split test
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {data.tests.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {data.tests.map((t) => (
            <li key={t.id} className="text-muted-foreground">
              Paso {t.step} · {PILLAR_LABELS[t.pillar]} · @{data.postAccounts[t.basePostId]} ·{" "}
              {t.batchId ? (
                <Link href={`/lotes/${t.batchId}`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                  lote {t.batchId}
                </Link>
              ) : null}{" "}
              · <span className={t.status === "ganador" ? "text-success" : t.status === "perdedor" ? "text-destructive" : undefined}>{STATUS[t.status] ?? t.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AccountCard({ account }: { account: View["accounts"][number] }) {
  return (
    <li className="panel flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-medium">
          <a href={`https://www.instagram.com/${account.handle}/`} target="_blank" rel="noreferrer" className="hover:underline">
            @{account.handle}
          </a>
          {account.product ? <span className="font-normal text-muted-foreground"> · {account.product}</span> : null}
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {account.reels} {account.reels === 1 ? "reel" : "reels"} · mediana {n(account.median)} vistas a 72 h
          {account.countFrom ? ` · cuenta desde el ${day(account.countFrom)}` : ""}
        </span>
      </div>
      {account.works.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {account.inherited ? "Aún sin reels propios medidos: hereda lo que funciona en su producto y en las demás cuentas." : "Qué funciona aquí:"}
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {account.works.slice(0, 6).map((s) => (
              <li key={`${s.key}-${s.value}`} className={cn("rounded-md border px-2 py-0.5 text-xs", VERDICT[s.verdict].tone)} title={`${KEY_LABELS[s.key]}: ${s.hits}/${s.n}`}>
                {s.value} · {pct(s.p)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {account.recent.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Reel</th>
                <th className="py-1 pr-3 font-medium">Publicado</th>
                <th className="py-1 pr-3 text-right font-medium">24 h</th>
                <th className="py-1 pr-3 text-right font-medium">48 h</th>
                <th className="py-1 pr-3 text-right font-medium">72 h</th>
                <th className="py-1 pr-3 text-right font-medium">Coment./1.000</th>
                <th className="py-1 pr-3 text-right font-medium">Frente a la mediana</th>
              </tr>
            </thead>
            <tbody>
              {account.recent.map((p) => (
                <tr key={p.id} className={cn("border-t align-top", p.excluded && "opacity-50")}>
                  <td className="py-1.5 pr-3">
                    <ReelLink post={p} label={p.dna.angulo ?? p.shortcode} />
                    {p.videoId ? <span className="ml-1 text-xs text-muted-foreground">#{p.videoId}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{day(p.publishedAt)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{n(p.w24)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{n(p.w48)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.w72 !== null ? n(p.w72) : p.v72 !== null ? `≈${n(p.v72)}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.cpk === null ? "—" : p.cpk.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</td>
                  <td className={cn("py-1.5 pr-3 text-right tabular-nums", p.hit === true ? "text-success" : p.hit === false ? "text-muted-foreground" : undefined)}>
                    {p.excluded ? "no cuenta" : p.ratio === null ? "—" : `${p.ratio.toLocaleString("es-ES", { maximumFractionDigits: 1 })}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay lecturas de esta cuenta: el Mac la lee cada 6 h.</p>
      )}
    </li>
  );
}

/**
 * «Cerebro de cuentas»: qué funciona en las cuentas del dueño y qué probar, con probabilidades (beta-binomial
 * jerárquico: cuenta → producto → global). Solo se mira; el único botón crea un split test como lote.
 */
export function CerebroPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["cerebro"], queryFn: () => api<View>("/api/cerebro"), refetchInterval: 120_000 });
  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) return <p className="text-sm text-destructive">{error?.message ?? "No se pudo cargar."}</p>;
  const keys = (["angulo", "fondo", "texto", "cancion"] as const).filter((k) => data.global[k].length > 0);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Cerebro de cuentas">
        <p className="text-sm text-muted-foreground">Qué funciona en tus cuentas, con qué probabilidad, y qué probar después.</p>
      </PageHeader>

      <div className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm" role="note">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <strong>Se miden vistas y comentarios, no ventas.</strong> Un reel «funciona» si supera la mediana de vistas a 72 h de su cuenta. Con pocos reels, cada cuenta se apoya en su
          producto y en las demás cuentas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [data.totals.accounts, "Cuentas propias"],
          [data.totals.reels, "Reels medidos"],
          [data.totals.readings, "Lecturas de vistas"],
          [data.totals.withDna, "Reels con ADN"],
        ].map(([value, label]) => (
          <div key={label} className="panel flex flex-col gap-0.5 px-4 py-3">
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="global">
        <h2 id="global" className="text-base font-semibold">
          Qué funciona en todas las cuentas
        </h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay reels con ADN y vistas suficientes.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {keys.map((k) => (
              <div key={k} className="panel flex flex-col gap-3 px-4 py-3">
                <h3 className="text-sm font-medium">{KEY_LABELS[k]}</h3>
                <ul className="flex flex-col gap-3">
                  {data.global[k].map((s) => (
                    <Prob key={`${k}-${s.value}`} stat={s} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <SplitSection data={data} />

      {data.texts.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="textos">
          <h2 id="textos" className="text-base font-semibold">
            Textos que han funcionado
          </h2>
          <ul className="flex flex-col gap-2">
            {data.texts.map((t) => (
              <li key={t.postId} className="flex items-baseline justify-between gap-4 border-l-2 pl-3 text-sm" style={{ borderColor: "var(--success)" }}>
                <span className="whitespace-pre-line">{t.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t.ratio.toLocaleString("es-ES", { maximumFractionDigits: 1 })}× · @{data.postAccounts[t.postId]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="cuentas">
        <h2 id="cuentas" className="text-base font-semibold">
          Por cuenta
        </h2>
        <ul className="flex flex-col gap-3">
          {data.accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </ul>
        {data.totals.competitors > 0 ? (
          <p className="text-xs text-muted-foreground">
            También se leen {data.totals.competitors} cuentas de referencia y competidores; sirven de contexto, no cuentan para lo que funciona en tus cuentas.
          </p>
        ) : null}
      </section>
    </div>
  );
}
