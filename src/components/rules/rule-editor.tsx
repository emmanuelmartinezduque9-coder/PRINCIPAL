"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, History, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { getRule, RuleSnapshot } from "@/server/rules";
import { formatDateTime } from "./rule-list";

type RuleView = Serialized<Awaited<ReturnType<typeof getRule>>>;

/**
 * Columna de lectura de unos 78 caracteres centrada en el panel. El relleno lateral crece con
 * el ancho, así la barra de desplazamiento queda en el borde del panel y no junto al texto.
 */
const READING = "px-[max(1.5rem,calc((100%_-_78ch)/2))] py-5 text-[15px] leading-7";

/**
 * A partir de 768 px la regla llena el alto de la ventana: cada nivel es una columna flexible
 * (`flex-1 min-h-0`) y solo el texto se desplaza. En el móvil la página fluye con normalidad.
 */
const FILL = "md:min-h-0 md:flex-1";

/**
 * Zona que se desplaza dentro de una columna flexible. El contenido va posicionado sobre la
 * zona para que su largo no empuje la columna (un texto largo no estira la página).
 */
const SCROLL_AREA = "md:relative md:min-h-0 md:flex-1";
const SCROLL_CONTENT = "md:absolute md:inset-0 md:overflow-y-auto";

function BackToList() {
  return (
    <Link
      href="/reglas"
      className="-ml-1 inline-flex h-7 w-fit shrink-0 items-center gap-1 rounded-md pr-2 pl-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
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
    <div className={cn("flex flex-col gap-4", FILL)}>
      <BackToList />
      {query.isLoading ? (
        <div className={cn("flex flex-col gap-4", FILL)} aria-label="Cargando la regla">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className={cn("min-h-[24rem] rounded-xl", FILL)} />
        </div>
      ) : query.isError || !rule ? (
        <div className="flex min-h-[20rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center">
          <p className="font-medium">Regla no encontrada</p>
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
    <article className={cn("flex flex-col gap-3", FILL)}>
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-balance break-words">{rule.title}</h2>
        {latest ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            Versión {rule.current.version} · {formatDateTime(latest.createdAt)}
            {latest.authorName ? ` · ${latest.authorName}` : ""}
          </p>
        ) : null}
      </header>

      <Tabs value={tab} onValueChange={setTab} className={FILL}>
        <TabsList aria-label="Texto o historial de la regla" className="shrink-0">
          <TabsTrigger value="texto">
            Texto
            {unchanged ? null : (
              <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-xs leading-none font-medium text-warning-ink">
                Sin guardar
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial">
            <History className="size-4" aria-hidden />
            Historial
            <span className="text-muted-foreground tabular-nums">{rule.history.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="texto" forceMount className={cn("flex flex-col data-[state=inactive]:hidden", FILL)}>
          <form
            className={cn("panel flex flex-col overflow-hidden", FILL)}
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
                "min-h-[24rem] w-full resize-none bg-transparent outline-none focus-visible:bg-muted/20",
                READING,
                FILL,
              )}
            />
            <div className="flex shrink-0 flex-col gap-3 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center">
              <label htmlFor="regla-nota" className="sr-only">
                Qué has cambiado
              </label>
              <Input
                id="regla-nota"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Qué has cambiado (opcional)"
                className="h-10 min-w-0 flex-1 bg-background"
              />
              <div className="flex items-center gap-3">
                <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-sans text-xs text-muted-foreground xl:inline">
                  Ctrl S
                </kbd>
                <Button type="submit" disabled={unchanged || busy} className="h-10 px-5">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Guardar versión
                </Button>
              </div>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="historial" className={cn("flex flex-col", FILL)}>
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

  // Con una sola versión no hay nada que comparar ni recuperar: una línea basta.
  if (rule.history.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <History className="size-5" aria-hidden />
        </span>
        <p className="font-medium">Todavía no hay versiones anteriores</p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]", FILL)}>
      <div className={cn("panel", SCROLL_AREA)}>
        <ul className={cn("flex flex-col gap-0.5 p-1.5", SCROLL_CONTENT)}>
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
                    {entry.version === rule.current.version ? <Badge className="h-5 px-1.5">Vigente</Badge> : null}
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
      </div>

      <section
        aria-label={`Texto de la versión ${selected}`}
        className="panel flex min-h-[24rem] min-w-0 flex-col overflow-hidden md:min-h-0"
      >
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              Versión {selected}
              {isCurrent ? <Badge className="h-5 px-1.5">Vigente</Badge> : null}
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
              Recuperar
            </Button>
          )}
        </div>
        {!isCurrent && version.isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : text !== undefined ? (
          <div className={SCROLL_AREA}>
            <pre
              tabIndex={0}
              className={cn(
                "font-sans break-words whitespace-pre-wrap outline-none focus-visible:bg-muted/20",
                READING,
                SCROLL_CONTENT,
              )}
            >
              {text}
            </pre>
          </div>
        ) : (
          <p role="alert" className="p-5 text-sm text-destructive">
            No se pudo cargar esta versión.
          </p>
        )}
      </section>
    </div>
  );
}
