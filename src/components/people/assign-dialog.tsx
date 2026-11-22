"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AssignDialog({
  person,
  products,
}: {
  person: { id: number; name: string; productIds: number[] };
  products: Array<{ id: number; name: string }>;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(person.productIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelected(person.productIds);
      setError(null);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/personas/${person.id}/productos`, { method: "PUT", body: JSON.stringify({ productIds: selected }) });
      await client.invalidateQueries({ queryKey: ["people"] });
      toast.success("Productos guardados.");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los productos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-1.5 px-2.5">
          <Package className="size-4" />
          Productos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Productos de {person.name}</DialogTitle>
          <DialogDescription>Solo verá y podrá trabajar con los que marques.</DialogDescription>
        </DialogHeader>
        {products.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-3 text-sm">Todavía no hay productos. Crea uno primero en Productos.</p>
        ) : (
          <fieldset className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            <legend className="sr-only">Productos</legend>
            {products.map((product) => {
              const on = selected.includes(product.id);
              return (
                <label
                  key={product.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-base has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    on ? "border-foreground bg-foreground/[0.04]" : "text-muted-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-foreground"
                    checked={on}
                    onChange={(e) =>
                      setSelected((current) => (e.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id)))
                    }
                  />
                  <span className="min-w-0 break-words">{product.name}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {error ? (
          <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
          </p>
        ) : null}
        <Button onClick={save} disabled={busy} className="h-12 text-base">
          {busy ? <Loader2 className="animate-spin" /> : null}
          Guardar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
