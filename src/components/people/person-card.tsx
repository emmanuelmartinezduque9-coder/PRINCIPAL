"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Serialized } from "@/lib/api";
import { formatUsd, MICROS_PER_USD } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PersonRow } from "@/server/people";
import { AssignDialog } from "./assign-dialog";

export type PersonView = Serialized<PersonRow>;
export type ProductOption = { id: number; name: string };

/** Importe para el campo del tope: `12,5` en lugar de `12500000`. */
const capText = (micros: number | null) => (micros === null ? "" : String(micros / MICROS_PER_USD).replace(".", ","));

function useChange(person: PersonView, successText?: string) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(body: object, done: string | undefined = successText): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/personas/${person.id}`, { method: "PUT", body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["people"] });
      toast.success(done ?? "Cambio guardado.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function CapDialog({ person }: { person: PersonView }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(capText(person.capMicros));
  const { busy, error, setError, run } = useChange(person);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(capText(person.capMicros));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-1.5 px-2.5">
          <Wallet className="size-4" />
          Cambiar tope
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tope mensual de {person.name}</DialogTitle>
          <DialogDescription>Lo máximo que puede gastar cada mes en dólares. Al llegar, se detiene hasta el mes siguiente.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run({ capUsd: value }, "Tope guardado.")) setOpen(false);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`cap-${person.id}`}>Tope en dólares (US$)</Label>
            <Input id={`cap-${person.id}`} inputMode="decimal" className="h-11 text-base" value={value} onChange={(e) => setValue(e.target.value)} placeholder="10 o 12,50" autoComplete="off" required />
          </div>
          {error ? (
            <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-12 text-base">
            {busy ? <Loader2 className="animate-spin" /> : null}
            Guardar tope
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ person }: { person: PersonView }) {
  const [open, setOpen] = useState(false);
  const { busy, error, setError, run } = useChange(person);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" className="h-9 px-2.5">
          Desactivar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Desactivar a {person.name}?</DialogTitle>
          <DialogDescription>
            Se le cerrará la sesión ahora mismo y se borrarán sus accesos a otras herramientas (como Higgsfield). Su gasto
            queda registrado. Podrás reactivarla, pero tendrá que conectar de nuevo esas herramientas.
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">{error}</p> : null}
        <Button
          variant="destructive"
          disabled={busy}
          className="h-12 text-base"
          onClick={async () => {
            if (await run({ disabled: true }, "Persona desactivada.")) setOpen(false);
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Sí, desactivar
        </Button>
        <Button variant="outline" className="h-11 text-base" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Rejilla compartida por la cabecera y las filas: en escritorio es una tabla; en móvil, una tarjeta apilada. */
export const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_6.5rem_26rem] lg:items-center lg:gap-x-4";

export function PersonCard({ person, products }: { person: PersonView; products: ProductOption[] }) {
  const reactivate = useChange(person, "Persona reactivada. Tendrá que volver a conectar Higgsfield y las demás herramientas.");
  const isOwner = person.role === "dueno";
  const names = new Map(products.map((p) => [p.id, p.name]));
  const assigned = person.productIds.map((id) => names.get(id)).filter((n): n is string => !!n);

  return (
    <div className={cn("flex flex-col gap-3 px-4 py-4", ROW_GRID, person.disabled && "bg-muted/40")}>
      <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
        <div className="min-w-0">
          <p className="text-base font-semibold break-words">{person.name}</p>
          <p className="text-sm break-all text-muted-foreground">{person.email}</p>
        </div>
        <div className="flex shrink-0 gap-1.5 lg:mt-1.5">
          {isOwner ? <Badge>Dueño</Badge> : <Badge variant="secondary">Colaborador</Badge>}
          {person.disabled ? <Badge variant="outline">Sin acceso</Badge> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-sm text-muted-foreground lg:hidden">Productos asignados</p>
        {isOwner ? (
          <p className="text-sm text-muted-foreground">Ve todos los productos</p>
        ) : assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguno todavía</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assigned.map((name) => (
              <Badge key={name} variant="secondary" className="max-w-full truncate">
                {name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <p className="text-sm">
        {isOwner ? (
          <span className="text-muted-foreground">Solo cuenta el tope global</span>
        ) : (
          <>
            <span className="text-muted-foreground lg:hidden">Gastado este mes </span>
            <span className="font-medium tabular-nums">{formatUsd(person.spentMicros)}</span>
            {person.capMicros !== null ? (
              <span className="text-muted-foreground tabular-nums">
                {" "}
                <span className="lg:block">de {formatUsd(person.capMicros)}</span>
              </span>
            ) : null}
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:justify-end">
        {isOwner ? null : person.disabled ? (
          <div className="flex flex-col gap-2 lg:items-end">
            <Button className="h-10 px-3" disabled={reactivate.busy} onClick={() => reactivate.run({ disabled: false })}>
              {reactivate.busy ? <Loader2 className="animate-spin" /> : null}
              Reactivar
            </Button>
            <p className="text-sm text-muted-foreground lg:max-w-48 lg:text-right">
              Al reactivarla tendrá que volver a conectar Higgsfield.
            </p>
            {reactivate.error ? <p role="alert" className="text-sm text-destructive">{reactivate.error}</p> : null}
          </div>
        ) : (
          <>
            <AssignDialog person={person} products={products} />
            <CapDialog person={person} />
            <DisableDialog person={person} />
          </>
        )}
      </div>
    </div>
  );
}
