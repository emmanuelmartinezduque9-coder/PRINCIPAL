"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Compass, ExternalLink, Loader2, Search, Target, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/panel";
import { api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ResearchResult } from "@/server/product-research";
import type { ProductView } from "./labels";

type Kind = "nicho" | "angulo" | "audiencia";
interface ResearchRow {
  id: number;
  kind: Kind;
  status: "en_cola" | "buscando" | "esperando_datos" | "hecho" | "fallido";
  note: string | null;
  result: Serialized<ResearchResult> | null;
  error: string | null;
  createdAt: string;
}

const KINDS: Array<{ kind: Kind; field: "niche" | "angle" | "audience"; label: string; button: string; icon: typeof Compass }> = [
  { kind: "nicho", field: "niche", label: "Nicho", button: "Buscar nicho diferente", icon: Compass },
  { kind: "angulo", field: "angle", label: "Ángulo", button: "Buscar ángulo diferente", icon: Target },
  { kind: "audiencia", field: "audience", label: "Audiencia", button: "Buscar audiencia diferente", icon: Users },
];
const LEVEL: Record<string, { text: string; className: string }> = {
  ventas_verificadas: { text: "Ventas verificadas", className: "bg-emerald-100 text-emerald-900" },
  senales_de_demanda: { text: "Señales de demanda", className: "bg-sky-100 text-sky-900" },
};
const SATURATION: Record<string, string> = { alta: "muy saturado", media: "algo saturado", baja: "poco saturado", sin_datos: "sin datos suficientes" };

/**
 * Nicho, audiencia y ángulo con los que se trabaja ahora, y los tres botones «Buscar … diferente».
 * Cada búsqueda trae propuestas con pruebas reales (cifra y enlace); la persona elige con «Usar».
 */
export function FocusPanel({ product }: { product: ProductView }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Kind | null>(null);
  const query = useQuery({
    queryKey: ["research", product.id],
    queryFn: () => api<{ research: ResearchRow[] }>(`/api/productos/${product.id}/alternativas`),
    refetchInterval: (q) => (q.state.data?.research.some((r) => ["en_cola", "buscando", "esperando_datos"].includes(r.status)) ? 5_000 : false),
  });
  const rows = query.data?.research ?? [];

  async function search(kind: Kind) {
    setBusy(kind);
    try {
      await api(`/api/productos/${product.id}/alternativas`, { method: "POST", body: JSON.stringify({ tipo: kind, nota: note }) });
      setNote("");
      await client.invalidateQueries({ queryKey: ["research", product.id] });
      toast.success("Buscando con datos de internet. Tarda uno o dos minutos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo empezar la búsqueda.");
    } finally {
      setBusy(null);
    }
  }

  async function use(field: "niche" | "angle" | "audience", value: string) {
    try {
      await api(`/api/productos/${product.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value.slice(0, 300) }) });
      await client.invalidateQueries({ queryKey: ["product", String(product.id)] });
      toast.success("Guardado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Ahora">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {KINDS.map(({ kind, field, label }) => (
            <div key={kind} className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{product[field] ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2">
          <Input
            className="h-10"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Indicación opcional (p. ej. «el del Grinch está saturado en Alemania»)"
            aria-label="Indicación opcional para la búsqueda"
          />
          <div className="flex flex-wrap gap-2">
            {KINDS.map(({ kind, button, icon: Icon }) => (
              <Button key={kind} variant="outline" className="h-10 px-4" disabled={busy !== null} onClick={() => void search(kind)}>
                {busy === kind ? <Loader2 className="animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                {button}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Propone candidatos y tu Mac los mide con cifras reales en el país del producto: Amazon (resultados, valoraciones, compras del último mes), anuncios activos en Meta, vídeos y vistas en YouTube y TikTok. Solo se enseña lo que tiene cifras. Tarda unos minutos y cuesta unos céntimos de Claude.
          </p>
        </div>
      </Panel>

      {rows.map((row) => (
        <ResearchCard key={row.id} row={row} onUse={use} />
      ))}
    </div>
  );
}

function ResearchCard({ row, onUse }: { row: ResearchRow; onUse: (field: "niche" | "angle" | "audience", value: string) => void }) {
  const meta = KINDS.find((k) => k.kind === row.kind)!;
  const date = new Date(row.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
  const title = `${meta.label} diferente · ${date}`;
  if (row.status === "en_cola" || row.status === "buscando" || row.status === "esperando_datos") {
    const text = row.error ?? (row.status === "esperando_datos" ? "Tu Mac está midiendo Amazon, los anuncios de Meta y los vídeos…" : "Buscando candidatos en internet…");
    return (
      <Panel title={title}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {text}
        </p>
      </Panel>
    );
  }
  if (row.status === "fallido" || !row.result) {
    return (
      <Panel title={title}>
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {row.error ?? "La búsqueda no terminó."}
        </p>
      </Panel>
    );
  }
  const { situacionActual: now, limitaciones } = row.result;
  // Solo propuestas con cifras comprobadas (las búsquedas antiguas podían traer «hipótesis»).
  const propuestas = row.result.propuestas.filter((p) => p.pruebas.some((e) => e.comprobada));
  if (propuestas.length === 0) {
    return (
      <Panel title={title}>
        <p className="text-sm text-muted-foreground">Esta búsqueda no trajo cifras reales. Pulsa «Buscar {meta.label.toLowerCase()} diferente» para repetirla con datos medidos.</p>
      </Panel>
    );
  }
  return (
    <Panel title={title}>
      {row.note ? <p className="text-sm text-muted-foreground">Indicación: {row.note}</p> : null}
      <div className="flex flex-col gap-1 text-sm">
        <p>
          <span className="font-medium">Situación actual ({SATURATION[now.saturacion] ?? now.saturacion}):</span> {now.resumen}
        </p>
        <Evidence items={now.pruebas.filter((e) => e.comprobada)} />
      </div>
      <ol className="flex flex-col gap-4">
        {propuestas.map((p, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold">
                {i + 1}. {p.titulo}
              </h3>
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", LEVEL[p.nivel]?.className)}>{LEVEL[p.nivel]?.text ?? p.nivel}</span>
            </div>
            <p className="text-sm">{p.porQue}</p>
            <p className="text-sm text-muted-foreground">En vídeo: {p.enVideo}</p>
            {p.ganchos.length ? (
              <ul className="list-disc pl-5 text-sm">
                {p.ganchos.map((g) => (
                  <li key={g}>«{g}»</li>
                ))}
              </ul>
            ) : null}
            <Evidence items={p.pruebas.filter((e) => e.comprobada)} />
            <div>
              <Button variant="outline" className="h-9 px-3" onClick={() => onUse(meta.field, p.titulo)}>
                <Check className="size-4" aria-hidden /> Usar este {meta.label.toLowerCase()}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {limitaciones ? <p className="text-sm text-muted-foreground">Qué no se pudo comprobar: {limitaciones}</p> : null}
    </Panel>
  );
}

function Evidence({ items }: { items: Array<{ fuente: string; dato: string; url: string; comprobada: boolean }> }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sin pruebas con datos.</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((e, i) => (
        <li key={i} className="flex gap-2">
          <Search className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="font-medium">{e.fuente}:</span> {e.dato}{" "}
            <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
              ver <ExternalLink className="size-3" aria-hidden />
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
