"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ExternalLink, Loader2, Pause, Play, Settings2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Serialized } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { listPhones } from "@/server/phones";
import type { publicationsForPhone } from "@/server/videos/publications";

type Publication = Serialized<Awaited<ReturnType<typeof publicationsForPhone>>>[number];
type Phone = Serialized<Awaited<ReturnType<typeof listPhones>>[number]> & { online: boolean; publications: Publication[] };

export const publicationTime = (at: string) =>
  new Date(at).toLocaleString("es-ES", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const networkName = (network: string) => (network === "instagram" ? "Instagram" : "Facebook");
const accountName = (account: string) => account || "la cuenta abierta en el móvil";

/** Estado del móvil en una etiqueta: en pausa, conectado o sin conexión. */
function PhoneState({ phone }: { phone: Phone }) {
  const [label, tone] = phone.paused
    ? ["En pausa", "bg-warning/15 text-warning-ink"]
    : phone.online
      ? ["Conectado", "bg-success/15 text-success"]
      : ["Sin conexión", "bg-muted text-muted-foreground"];
  return <Badge className={cn("gap-1.5 font-medium", tone)}>{label}</Badge>;
}

/** «Ajustes del móvil» (solo el dueño): nombre y dirección de WDA, plegados para no estorbar. */
function PhoneSettings({ phone, busy, save }: { phone: Phone; busy: boolean; save: (body: object) => Promise<void> }) {
  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <Settings2 className="size-3.5" aria-hidden />
        Ajustes del móvil
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Nombre
          <Input
            key={phone.name}
            defaultValue={phone.name}
            disabled={busy}
            onBlur={(event) => {
              if (event.target.value.trim() && event.target.value !== phone.name) void save({ name: event.target.value.trim() });
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Dirección de WDA
          <Input
            key={phone.wdaUrl ?? ""}
            defaultValue={phone.wdaUrl ?? ""}
            placeholder="http://192.168.1.139:8100"
            disabled={busy}
            onBlur={(event) => {
              if ((event.target.value || null) !== phone.wdaUrl) void save({ wdaUrl: event.target.value || null });
            }}
          />
        </label>
      </div>
    </details>
  );
}

function PublicationLine({ p }: { p: Publication }) {
  return (
    <li className="flex flex-col gap-0.5 py-2.5 text-sm">
      <span className="font-medium">
        {p.productName} · {networkName(p.network)}
      </span>
      <span className="text-muted-foreground">
        {accountName(p.account)} · {p.status === "publicando" ? "publicándose ahora" : publicationTime(p.scheduledFor)}
      </span>
    </li>
  );
}

function PhoneCard({ phone, owner }: { phone: Phone; owner: boolean }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (body: object) => {
    setBusy(true);
    try {
      await api(`/api/moviles/${phone.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["phones"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  const queue = phone.publications.filter((p) => p.status === "en_cola" || p.status === "publicando").reverse();
  const published = phone.publications.filter((p) => p.status === "publicada");
  const failed = phone.publications.filter((p) => p.status === "fallida");

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2.5">
          {phone.name}
          <PhoneState phone={phone} />
        </span>
      }
      actions={
        <Button variant="outline" className="h-9 gap-1.5 px-3" disabled={busy} onClick={() => void save({ paused: !phone.paused })}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : phone.paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
          {phone.paused ? "Reanudar" : "Pausar"}
        </Button>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {phone.online ? (
            // eslint-disable-next-line @next/next/no-img-element -- Pantalla WDA que cambia cada cinco segundos.
            <img
              className="aspect-[9/19] w-full rounded-2xl bg-muted object-contain ring-1 ring-foreground/10"
              src={`/api/moviles/${phone.id}/pantalla?t=${phone.screenshotAt}`}
              alt={`Pantalla de ${phone.name}`}
            />
          ) : (
            <div className="grid aspect-[9/19] place-items-center rounded-2xl bg-muted px-4 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
              Sin conexión con el móvil
            </div>
          )}
          {/* Qué está haciendo, solo si se sabe (conectado). */}
          {phone.online ? <p className="text-sm text-pretty">{phone.activity}</p> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Cola">
            <h3 className="text-sm font-semibold">Próximas publicaciones</h3>
            {queue.length > 0 ? (
              <ul className="divide-y">{queue.map((p) => <PublicationLine key={p.id} p={p} />)}</ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No hay nada en la cola.</p>
            )}
          </section>

          {failed.length > 0 ? (
            <section aria-label="Fallos">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <CircleAlert className="size-4" aria-hidden />
                Fallos
              </h3>
              <ul className="divide-y">
                {failed.map((p) => (
                  <li key={p.id} className="flex gap-3 py-2.5 text-sm">
                    {p.hasScreenshot ? (
                      <a href={`/api/publicaciones/${p.id}/captura`} target="_blank" rel="noreferrer" className="shrink-0" aria-label="Ver la captura del fallo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/publicaciones/${p.id}/captura`} alt="" className="h-20 w-10 rounded-md bg-muted object-cover ring-1 ring-foreground/10" />
                      </a>
                    ) : null}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">
                        {p.productName} · {networkName(p.network)} · {publicationTime(p.scheduledFor)}
                      </span>
                      <span className="text-pretty text-muted-foreground">{p.error ?? "No se pudo publicar."}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Publicados">
            <h3 className="text-sm font-semibold">Publicados</h3>
            {published.length > 0 ? (
              <ul className="divide-y">
                {published.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {p.productName} · {networkName(p.network)}
                      </span>
                      <span className="block text-muted-foreground">
                        {accountName(p.account)} · {publicationTime(p.scheduledFor)}
                      </span>
                    </span>
                    {p.resultUrl ? (
                      <a href={p.resultUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-brand-ink hover:underline">
                        Ver <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : p.hasScreenshot ? (
                      <a href={`/api/publicaciones/${p.id}/captura`} target="_blank" rel="noreferrer" className="shrink-0 text-brand-ink hover:underline">
                        Captura
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Todavía no se ha publicado ningún vídeo.</p>
            )}
          </section>

          {owner ? <PhoneSettings phone={phone} busy={busy} save={save} /> : null}
        </div>
      </div>
    </Panel>
  );
}

export function PhonesView() {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["phones"], queryFn: () => api<{ owner: boolean; phones: Phone[] }>("/api/moviles"), refetchInterval: 5000 });
  async function create() {
    setCreating(true);
    try {
      await api("/api/moviles", { method: "POST", body: JSON.stringify({ name: `iPhone ${(query.data?.phones.length ?? 0) + 1}` }) });
      await client.invalidateQueries({ queryKey: ["phones"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el móvil.");
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Móviles"
        actions={
          query.data?.owner ? (
            <Button variant="outline" className="h-9 px-3" disabled={creating} onClick={() => void create()}>
              Añadir móvil
            </Button>
          ) : null
        }
      />
      {query.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : query.data?.phones.length ? (
        query.data.phones.map((phone) => <PhoneCard key={phone.id} phone={phone} owner={query.data.owner} />)
      ) : (
        <EmptyState icon={Smartphone} title="Todavía no hay móviles" />
      )}
    </div>
  );
}
