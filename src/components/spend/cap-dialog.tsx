"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, Wallet } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatUsd, MICROS_PER_USD, parseUsd } from "@/lib/money";

/** Importe para el campo: `45` o `12,5` en lugar de `45000000`. */
const capText = (micros: number) => String(micros / MICROS_PER_USD).replace(".", ",");

/** Botón y ventana para cambiar el tope mensual global. Al guardar, los trabajos en pausa con saldo se reanudan. */
export function CapDialog({
  capMicros,
  spentMicros,
  variant = "outline",
  label = "Cambiar tope",
}: {
  capMicros: number;
  /** Lo gastado este mes, para avisar si el tope nuevo no lo cubre. */
  spentMicros: number;
  variant?: ComponentProps<typeof Button>["variant"];
  label?: string;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(capText(capMicros));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/gasto/tope", { method: "PUT", body: JSON.stringify({ capUsd: value }) });
      await client.invalidateQueries({ queryKey: ["gasto"] });
      toast.success("Tope guardado.");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el tope.");
    } finally {
      setBusy(false);
    }
  }

  const typed = parseUsd(value);
  const warning =
    typed === null ? null : typed === 0 ? "Con 0 se detiene todo el gasto." : typed < spentMicros ? "Es menos de lo ya gastado: se detiene todo el gasto." : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValue(capText(capMicros));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} className="h-9 gap-1.5 px-3">
          <Wallet />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Tope mensual</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={save}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tope-global">US$ al mes</Label>
            <Input
              id="tope-global"
              inputMode="decimal"
              className="h-11 text-base"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="45 o 12,50"
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">Gastado este mes: {formatUsd(spentMicros)}</p>
          {warning ? (
            <p role="status" className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" /> {warning}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11 text-base">
            {busy ? <Loader2 className="animate-spin" /> : null}
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
