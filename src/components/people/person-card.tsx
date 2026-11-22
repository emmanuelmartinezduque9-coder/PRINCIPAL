"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, ShieldCheck, UserMinus, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Serialized } from "@/lib/api";
import { formatUsd, MICROS_PER_USD } from "@/lib/money";
import { cn, initials } from "@/lib/utils";
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
          Tope
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tope mensual de {person.name}</DialogTitle>
          <DialogDescription>Al llegar al tope, se detiene hasta el mes siguiente.</DialogDescription>
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
        <Button
          variant="outline"
          className="h-9 gap-1.5 px-2.5 text-destructive hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
        >
          <UserMinus className="size-4" />
          Desactivar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Desactivar a {person.name}?</DialogTitle>
          <DialogDescription>
            Se cierra su sesión y se borran sus conexiones (como Higgsfield). Su gasto queda registrado.
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

/**
 * Rejilla compartida por la cabecera y las filas: tabla en el ordenador; tarjeta en pantallas
 * estrechas. Columnas fijas para gasto y acciones: así cabecera y filas quedan alineadas.
 */
export const TABLE_COLUMNS = "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_13rem_19.5rem] lg:gap-x-5";
const ROW_GRID = `md:grid md:grid-cols-2 md:items-center md:gap-x-6 md:gap-y-3 lg:gap-y-0 ${TABLE_COLUMNS}`;

/** Importe sin la moneda, para «0,00 de 12,50 US$». */
const amount = (micros: number) => formatUsd(micros).replace(/\s*US\$$/, "");

/** Gasto del mes frente a su tope, con una barra que se llena. */
function Spend({ person }: { person: PersonView }) {
  if (person.capMicros === null) {
    return (
      <p className="text-sm whitespace-nowrap">
        <span className="font-medium tabular-nums">{formatUsd(person.spentMicros)}</span>
        <span className="text-muted-foreground"> · sin tope</span>
      </p>
    );
  }
  const share = person.capMicros > 0 ? Math.min(1, person.spentMicros / person.capMicros) : 1;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm whitespace-nowrap tabular-nums">
        <span className="font-medium">{amount(person.spentMicros)}</span>
        <span className="text-muted-foreground"> de {formatUsd(person.capMicros)} de tope</span>
      </p>
      <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-foreground/[0.14]" aria-hidden>
        <div className={cn("h-full rounded-full", share >= 1 ? "bg-destructive" : "bg-foreground/70")} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

export function PersonCard({ person, products }: { person: PersonView; products: ProductOption[] }) {
  const reactivate = useChange(person, "Persona reactivada. Tendrá que volver a conectar Higgsfield y las demás herramientas.");
  const isOwner = person.role === "dueno";
  const names = new Map(products.map((p) => [p.id, p.name]));
  const assigned = person.productIds.map((id) => names.get(id)).filter((n): n is string => !!n);

  return (
    <div className={cn("flex flex-col gap-3 px-4 py-4", ROW_GRID, person.disabled && "bg-muted/40")}>
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
            isOwner ? "bg-foreground text-background" : "bg-foreground/[0.07] text-foreground",
          )}
        >
          {initials(person.name)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold break-words">
            {person.name}
            {isOwner ? <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-label="Dueño" /> : null}
            {person.disabled ? <Badge variant="outline">Sin acceso</Badge> : null}
          </p>
          <p className="truncate text-sm text-muted-foreground" title={person.email}>
            {person.email}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-1.5 md:order-3 md:col-span-2 lg:order-none lg:col-span-1">
        {isOwner ? (
          <Badge variant="outline">Todos los productos</Badge>
        ) : assigned.length === 0 ? (
          <span className="text-sm text-muted-foreground">Ningún producto</span>
        ) : (
          assigned.map((name) => (
            <Badge key={name} variant="secondary" className="max-w-full truncate">
              {name}
            </Badge>
          ))
        )}
      </div>

      {isOwner ? (
        // El dueño no tiene tope propio: la celda ocupa también la de acciones (no queda vacía).
        <p className="text-sm whitespace-nowrap text-muted-foreground md:order-2 lg:order-none lg:col-span-2">Sin tope propio</p>
      ) : (
        <div className="md:order-2 lg:order-none">
          <Spend person={person} />
        </div>
      )}

      {isOwner ? null : (
        <div className="flex flex-wrap gap-2 md:order-4 md:col-span-2 md:justify-end lg:order-none lg:col-span-1 lg:flex-nowrap">
          {person.disabled ? (
            <>
              <Button className="h-9 px-3" disabled={reactivate.busy} onClick={() => reactivate.run({ disabled: false })}>
                {reactivate.busy ? <Loader2 className="animate-spin" /> : null}
                Reactivar
              </Button>
              {reactivate.error ? <p role="alert" className="text-sm text-destructive">{reactivate.error}</p> : null}
            </>
          ) : (
            <>
              <AssignDialog person={person} products={products} />
              <CapDialog person={person} />
              <DisableDialog person={person} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
