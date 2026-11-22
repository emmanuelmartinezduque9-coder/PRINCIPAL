"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Serialized } from "@/lib/api";
import { formatUsd, MICROS_PER_USD } from "@/lib/money";
import type { PersonRow } from "@/server/people";
import { AssignDialog } from "./assign-dialog";

export type PersonView = Serialized<PersonRow>;
export type ProductOption = { id: number; name: string };

/** Importe para el campo del tope: `12,5` en lugar de `12500000`. */
const capText = (micros: number | null) => (micros === null ? "" : String(micros / MICROS_PER_USD).replace(".", ","));

function useChange(person: PersonView) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(body: object, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/personas/${person.id}`, { method: "PUT", body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["people"] });
      toast.success(done);
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
        <Button variant="outline" className="h-11 gap-2 px-3 text-base">
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
        <Button variant="destructive" className="h-11 px-3 text-base">
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

export function PersonCard({ person, products }: { person: PersonView; products: ProductOption[] }) {
  const reactivate = useChange(person);
  const isOwner = person.role === "dueno";
  const names = new Map(products.map((p) => [p.id, p.name]));
  const assigned = person.productIds.map((id) => names.get(id)).filter((n): n is string => !!n);

  return (
    <Card className={person.disabled ? "gap-3 p-4 opacity-80" : "gap-3 p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold break-words">{person.name}</p>
          <p className="text-sm break-all text-muted-foreground">{person.email}</p>
        </div>
        {isOwner ? <Badge>Dueño</Badge> : person.disabled ? <Badge variant="outline">Desactivada</Badge> : null}
      </div>

      {isOwner ? (
        <p className="text-sm text-muted-foreground">Ve todos los productos. Solo cuenta el tope global.</p>
      ) : (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">Gastado este mes </span>
            <span className="font-medium">{formatUsd(person.spentMicros)}</span>
            {person.capMicros !== null ? <span className="text-muted-foreground"> de {formatUsd(person.capMicros)}</span> : null}
          </p>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">Productos asignados</p>
            {assigned.length === 0 ? (
              <p className="text-sm">Ninguno todavía</p>
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
          <div className="flex flex-wrap gap-2 pt-1">
            {person.disabled ? (
              <>
                <Button
                  className="h-11 px-3 text-base"
                  disabled={reactivate.busy}
                  onClick={() => reactivate.run({ disabled: false }, "Persona reactivada.")}
                >
                  {reactivate.busy ? <Loader2 className="animate-spin" /> : null}
                  Reactivar
                </Button>
                {reactivate.error ? <p role="alert" className="w-full text-sm text-destructive">{reactivate.error}</p> : null}
              </>
            ) : (
              <>
                <AssignDialog person={person} products={products} />
                <CapDialog person={person} />
                <DisableDialog person={person} />
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
