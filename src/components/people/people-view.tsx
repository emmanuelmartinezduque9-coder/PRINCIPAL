"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, type Serialized } from "@/lib/api";
import type { listPeople } from "@/server/people";
import { InviteDialog } from "./invite-dialog";
import { PersonCard, type ProductOption } from "./person-card";

type PeopleData = Serialized<Awaited<ReturnType<typeof listPeople>>> & { products: ProductOption[] };

const formatDate = (iso: string) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(iso));

export function PeopleView() {
  const query = useQuery({
    queryKey: ["people"],
    queryFn: () => api<PeopleData>("/api/personas"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 1,
  });
  const data = query.data;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  // Orden: activas primero (el dueño arriba), desactivadas al final.
  const users = [...(data?.users ?? [])].sort((a, b) => Number(a.disabled) - Number(b.disabled));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
        <p className="text-sm text-muted-foreground">Quién entra en la aplicación, qué productos ve y cuánto puede gastar al mes.</p>
      </div>

      {forbidden ? (
        <p className="rounded-lg bg-muted px-3 py-3 text-sm">Solo el dueño puede ver y cambiar las personas.</p>
      ) : (
        <>
          <InviteDialog />

          {query.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : query.isError || !data ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-3 text-sm">
              No se pudieron cargar las personas. Recarga la página para volver a intentarlo.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {users.map((person) => (
                  <li key={person.id}>
                    <PersonCard person={person} products={data.products} />
                  </li>
                ))}
              </ul>

              {data.pending.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold">Invitaciones pendientes</h2>
                  <ul className="flex flex-col gap-2">
                    {data.pending.map((invite) => (
                      <li key={`${invite.email}-${invite.expiresAt}`} className="rounded-lg border px-3 py-2">
                        <p className="text-base font-medium break-words">{invite.name}</p>
                        <p className="text-sm break-all text-muted-foreground">{invite.email}</p>
                        <p className="text-sm text-muted-foreground">Caduca el {formatDate(invite.expiresAt)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
