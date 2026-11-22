"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, History, Info, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { getRule, RuleSnapshot } from "@/server/rules";
import { formatDateTime } from "./rule-list";

type RuleView = Serialized<Awaited<ReturnType<typeof getRule>>>;

/** Alto del área de texto y de la vista de versiones: llena la ventana sin que la página salte. */
const TEXT_HEIGHT = "h-[calc(100dvh-23rem)] min-h-[22rem]";

function BackToList() {
  return (
    <Link
      href="/reglas"
      className="-ml-1 inline-flex h-7 w-fit items-center gap-1 rounded-md pr-2 pl-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
    >
      <ChevronLeft className="size-4" aria-hidden /> Reglas
    </Link>
  );
}

export function RuleEditor({ slug }: { slug: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["rule", slug],
    queryFn: () => api<{ rule: RuleView }>(`/api/reglas/${slug}`),
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 1,
  });
  const rule = query.data?.rule;

  return (
    <div className="flex flex-col gap-4">
      <BackToList />
      {query.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Cargando la regla">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className={cn("rounded-xl", TEXT_HEIGHT)} />
        </div>
      ) : query.isError || !rule ? (
        <div className="flex min-h-[20rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center">
          <p className="font-medium">Regla no encontrada</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {query.error instanceof ApiError && query.error.status === 403
              ? "Solo el dueño puede ver y cambiar las reglas."
              : "Puede que ya no exista o que no tengas acceso a ella."}
          </p>
        </div>
      ) : (
        // La clave reinicia el editor al llegar una versión nueva (guardar o recuperar).
        <Loaded key={rule.current.version} rule={rule} onChanged={() => client.invalidateQueries({ queryKey: ["rule", slug] })} />
      )}
    </div>
  );
}

function Loaded({ rule, onChanged }: { rule: RuleView; onChanged: () => Promise<unknown> }) {
  const client = useQueryClient();
  const [body, setBody] = useState(rule.current.body);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("texto");

  const save = useMutation({
    mutationFn: (input: { body: string; note: string }) =>
      api<{ rule: RuleSnapshot }>(`/api/reglas/${rule.slug}`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (data) => {
      toast.success(`Guardada como versión ${data.rule.version}.`);
      await Promise.all([onChanged(), client.invalidateQueries({ queryKey: ["rules"] })]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar."),
  });

  const unchanged = body === rule.current.body;
  const busy = save.isPending;
  const latest = rule.history.find((item) => item.version === rule.current.version);

  function submit() {
    if (!unchanged && !busy) save.mutate({ body, note });
  }

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-balance break-words">{rule.title}</h2>
          <p className="max-w-[70ch] text-sm text-muted-foreground">{rule.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <Badge variant="secondary">Versión vigente: {rule.current.version}</Badge>
          {latest ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatDateTime(latest.createdAt)}
              {latest.authorName ? ` · ${latest.authorName}` : ""}
            </p>
          ) : null}
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Texto o historial de la regla">
          <TabsTrigger value="texto">
            Texto
            {unchanged ? null : (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] leading-none font-medium text-amber-900">
                Sin guardar
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial">
            <History className="size-4" aria-hidden />
            Historial
            <span className="text-xs text-muted-foreground tabular-nums">({rule.history.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="texto" forceMount className="data-[state=inactive]:hidden">
          <form
            className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            onKeyDown={(event) => {
              // Ctrl+S (Cmd+S en Mac) guarda, como en cualquier editor de textos.
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                submit();
              }
            }}
          >
            <label htmlFor="regla-texto" className="sr-only">
              Texto de la regla
            </label>
            <textarea
              id="regla-texto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
              className={cn(
                "w-full resize-none bg-transparent px-6 py-5 text-[15px] leading-7 outline-none placeholder:text-muted-foreground focus-visible:bg-muted/20",
                TEXT_HEIGHT,
              )}
            />
            <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-3 md:flex-row md:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="regla-nota" className="text-xs text-muted-foreground">
                  ¿Qué has cambiado?
                </Label>
                <Input
                  id="regla-nota"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Una frase para acordarte después"
                  className="h-10 bg-background"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground xl:inline">Ctrl + S</span>
                <Button type="submit" disabled={unchanged || busy} className="h-10 px-5">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Guardar versión nueva
                </Button>
              </div>
            </div>
          </form>
          <p className="mt-3 flex gap-2 text-xs text-muted-foreground lg:hidden">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            Los cambios se aplican a las propuestas nuevas; las ya hechas conservan la versión con la que se hicieron.
          </p>
        </TabsContent>

        <TabsContent value="historial">
          <VersionHistory rule={rule} busy={busy} onRestore={(old, version) => save.mutate({ body: old, note: `Recuperada la versión ${version}` })} />
        </TabsContent>
      </Tabs>
    </article>
  );
}

/** Historial: las versiones a la izquierda y el texto de la elegida a la derecha. */
function VersionHistory({
  rule,
  busy,
  onRestore,
}: {
  rule: RuleView;
  busy: boolean;
  onRestore: (body: string, version: number) => void;
}) {
  const [selected, setSelected] = useState(rule.current.version);
  const isCurrent = selected === rule.current.version;
  const item = rule.history.find((entry) => entry.version === selected);

  const version = useQuery({
    queryKey: ["rule", rule.slug, "version", selected],
    queryFn: () => api<{ version: RuleSnapshot }>(`/api/reglas/${rule.slug}?version=${selected}`),
    // El texto vigente ya está en pantalla: no hace falta pedirlo.
    enabled: !isCurrent,
  });
  const text = isCurrent ? rule.current.body : version.data?.version.body;

  return (
    <div className="grid items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <ul className="flex flex-col gap-0.5 rounded-xl bg-card p-1.5 ring-1 ring-foreground/10 md:max-h-[calc(100dvh-19rem)] md:overflow-y-auto">
        {rule.history.map((entry) => {
          const active = entry.version === selected;
          return (
            <li key={entry.version}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(entry.version)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-foreground/[0.06]" : "hover:bg-muted/70",
                )}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className={active ? "font-semibold" : "font-medium"}>Versión {entry.version}</span>
                  {entry.version === rule.current.version ? <Badge className="h-4.5 px-1.5 text-[11px]">Vigente</Badge> : null}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(entry.createdAt)}
                  {entry.authorName ? ` · ${entry.authorName}` : ""}
                </span>
                {entry.note ? <span className="line-clamp-2 text-xs break-words text-foreground/80">{entry.note}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-label={`Texto de la versión ${selected}`} className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Versión {selected}
              {isCurrent ? <span className="font-normal text-muted-foreground"> · la que se usa ahora</span> : null}
            </p>
            {item?.note ? <p className="truncate text-xs text-muted-foreground">{item.note}</p> : null}
          </div>
          {isCurrent ? null : (
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3"
              disabled={busy || !text}
              onClick={() => text && onRestore(text, selected)}
            >
              <RotateCcw className="size-4" aria-hidden />
              Recuperar esta versión
            </Button>
          )}
        </div>
        {!isCurrent && version.isLoading ? (
          <div className={cn("flex flex-col gap-2 p-5", TEXT_HEIGHT)}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : text !== undefined ? (
          <pre
            tabIndex={0}
            className={cn(
              "overflow-auto px-6 py-5 font-sans text-[15px] leading-7 break-words whitespace-pre-wrap outline-none focus-visible:bg-muted/20",
              TEXT_HEIGHT,
            )}
          >
            {text}
          </pre>
        ) : (
          <p role="alert" className="p-5 text-sm text-destructive">
            No se pudo cargar esta versión.
          </p>
        )}
      </section>
    </div>
  );
}
