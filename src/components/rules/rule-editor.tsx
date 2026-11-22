"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, type Serialized } from "@/lib/api";
import type { getRule, RuleSnapshot } from "@/server/rules";
import { formatDateTime } from "./rule-list";

type RuleView = Serialized<Awaited<ReturnType<typeof getRule>>>;

export function RuleEditor({ slug }: { slug: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["rule", slug],
    queryFn: () => api<{ rule: RuleView }>(`/api/reglas/${slug}`),
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 1,
  });
  const rule = query.data?.rule;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/reglas" className="inline-flex h-9 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Reglas
      </Link>

      {query.isLoading ? (
        <Skeleton className="h-64" />
      ) : query.isError || !rule ? (
        <div className="rounded-lg bg-muted px-4 py-6 text-center">
          <p className="font-medium">Regla no encontrada</p>
          <p className="text-sm text-muted-foreground">
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
  const [viewing, setViewing] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: (input: { body: string; note: string }) =>
      api<{ rule: RuleSnapshot }>(`/api/reglas/${rule.slug}`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (data) => {
      toast.success(`Guardada como versión ${data.rule.version}.`);
      await Promise.all([onChanged(), client.invalidateQueries({ queryKey: ["rules"] })]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar."),
  });

  const version = useQuery({
    queryKey: ["rule", rule.slug, "version", viewing],
    queryFn: () => api<{ version: RuleSnapshot }>(`/api/reglas/${rule.slug}?version=${viewing}`),
    enabled: viewing !== null,
  });

  const unchanged = body === rule.current.body;
  const busy = save.isPending;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{rule.title}</h1>
        <p className="text-sm text-muted-foreground">{rule.description}</p>
        <div>
          <Badge variant="secondary">Versión vigente: {rule.current.version}</Badge>
        </div>
      </div>

      <p className="flex gap-2 rounded-lg bg-muted px-3 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" />
        Los cambios se aplican a las propuestas nuevas; las ya hechas conservan la versión con la que se hicieron.
      </p>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ body, note });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="regla-texto">Texto de la regla</Label>
          <Textarea
            id="regla-texto"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[55dvh] leading-relaxed"
            spellCheck
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="regla-nota">¿Qué has cambiado?</Label>
          <Input
            id="regla-nota"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Una frase para acordarte después"
            className="h-11 text-base"
          />
        </div>
        <Button type="submit" disabled={unchanged || busy} className="h-11 text-base">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Historial</h2>
        <ul className="flex flex-col gap-3">
          {rule.history.map((item) => {
            const isCurrent = item.version === rule.current.version;
            return (
              <li key={item.version}>
                <Card className="gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">Versión {item.version}</p>
                      {isCurrent ? <Badge>Vigente</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                      {item.authorName ? ` · ${item.authorName}` : ""}
                    </p>
                    {item.note ? <p className="text-sm break-words">{item.note}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 px-4 text-base"
                      onClick={() => setViewing(viewing === item.version ? null : item.version)}
                    >
                      {viewing === item.version ? "Ocultar" : "Ver"}
                    </Button>
                    {isCurrent ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 px-4 text-base"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const { version: old } = await api<{ version: RuleSnapshot }>(
                              `/api/reglas/${rule.slug}?version=${item.version}`,
                            );
                            save.mutate({ body: old.body, note: `Recuperada la versión ${item.version}` });
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "No se pudo recuperar la versión.");
                          }
                        }}
                      >
                        Recuperar esta versión
                      </Button>
                    )}
                  </div>
                  {viewing === item.version ? (
                    version.isLoading ? (
                      <Skeleton className="h-32" />
                    ) : version.data ? (
                      <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-sm break-words whitespace-pre-wrap">
                        {version.data.version.body}
                      </pre>
                    ) : (
                      <p className="text-sm text-destructive">No se pudo cargar esta versión.</p>
                    )
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
