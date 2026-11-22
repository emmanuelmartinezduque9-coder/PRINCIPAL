"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, type Serialized } from "@/lib/api";
import type { listPeople } from "@/server/people";
import { InviteDialog } from "./invite-dialog";
import { PersonCard, TABLE_COLUMNS, type ProductOption } from "./person-card";

type PeopleData = Serialized<Awaited<ReturnType<typeof listPeople>>> & { products: ProductOption[] };

const formatDate = (iso: string) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(iso));

function PendingInvite({ invite }: { invite: PeopleData["pending"][number] }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      await api("/api/personas/invitaciones", { method: "DELETE", body: JSON.stringify({ email: invite.email }) });
      await client.invalidateQueries({ queryKey: ["people"] });
      toast.success("Invitación cancelada: su enlace ya no sirve.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar la invitación.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium break-words">{invite.name}</p>
        <p className="text-sm break-all text-muted-foreground">
          {invite.email} · caduca el {formatDate(invite.expiresAt)}
        </p>
      </div>
      <Button variant="outline" className="h-10 self-start sm:self-auto" disabled={busy} onClick={cancel}>
        Cancelar invitación
      </Button>
    </li>
  );
}

export function PeopleView() {
  const query = useQuery({
    queryKey: ["people"],
    queryFn: () => api<PeopleData>("/api/personas"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 1,
  });
  const data = query.data;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  // Orden: con acceso primero (el dueño arriba), sin acceso al final.
  const users = [...(data?.users ?? [])].sort((a, b) => Number(a.disabled) - Number(b.disabled));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Personas"
        actions={forbidden ? null : <InviteDialog />}
      />

      {forbidden ? (
        <p className="rounded-lg bg-muted px-3 py-3 text-sm">Solo para el dueño.</p>
      ) : query.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : query.isError || !data ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-3 text-sm">
          No se pudieron cargar las personas. Recarga la página.
        </p>
      ) : (
        <>
          <section aria-label="Personas" className="overflow-hidden rounded-xl border bg-card">
            <div className={`hidden border-b bg-muted/50 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid ${TABLE_COLUMNS}`}>
              <span>Persona</span>
              <span>Productos</span>
              <span>Gasto del mes</span>
              <span aria-hidden />
            </div>
            <ul className="divide-y">
              {users.map((person) => (
                <li key={person.id}>
                  <PersonCard person={person} products={data.products} />
                </li>
              ))}
            </ul>
          </section>

          {data.pending.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                Invitaciones pendientes
                <span className="text-sm font-normal text-muted-foreground tabular-nums">{data.pending.length}</span>
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {data.pending.map((invite) => (
                  <PendingInvite key={`${invite.email}-${invite.expiresAt}`} invite={invite} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
