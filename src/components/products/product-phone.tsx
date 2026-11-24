"use client";

import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ProductView } from "./labels";

/**
 * «Móvil y cuentas»: el móvil que publica los vídeos de este producto y sus cuentas. Sin móvil, solo el
 * selector (el producto no se publica solo); con móvil, sus cuentas de Instagram y de Facebook (vacía: la
 * que esté abierta en el móvil) y las horas entre un vídeo y el siguiente (3 por defecto, máximo 2 al día).
 * Se guarda al cambiar.
 */
export function ProductPhone({ product }: { product: ProductView }) {
  const { data } = useQuery({ queryKey: ["phone-options"], queryFn: () => api<{ phones: { id: number; name: string }[] }>("/api/moviles") });
  const [value, setValue] = useState({ phoneId: product.phoneId, instagramAccount: product.instagramAccount, facebookAccount: product.facebookAccount, publishGapHours: product.publishGapHours });
  const [busy, setBusy] = useState(false);
  async function save(next: typeof value) {
    setBusy(true);
    try {
      await api(`/api/productos/${product.id}/movil`, { method: "PUT", body: JSON.stringify(next) });
      setValue(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  const account = (field: "instagramAccount" | "facebookAccount", label: string) => (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {label}
      <Input
        key={value[field] ?? ""}
        defaultValue={value[field] ?? ""}
        placeholder="La abierta en el móvil"
        disabled={busy}
        onBlur={(event) => {
          const next = event.target.value.trim().replace(/^@/, "") || null;
          if (next !== value[field]) void save({ ...value, [field]: next });
        }}
      />
    </label>
  );
  return (
    <Panel title="Móvil y cuentas">
      <div className="grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Móvil que publica
          <span className="relative">
            <Smartphone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <select
              className="h-9 w-full appearance-none rounded-md border bg-background pr-3 pl-9 text-sm text-foreground dark:bg-input/30"
              disabled={busy}
              value={value.phoneId ?? ""}
              onChange={(event) => void save({ ...value, phoneId: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">Ninguno (no se publica solo)</option>
              {data?.phones.map((phone) => (
                <option key={phone.id} value={phone.id}>
                  {phone.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        {/* Las cuentas solo cuentan con un móvil elegido. */}
        {value.phoneId !== null ? (
          <>
            {account("instagramAccount", "Cuenta de Instagram")}
            {account("facebookAccount", "Cuenta de Facebook")}
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Horas entre vídeos
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground dark:bg-input/30"
                disabled={busy}
                value={value.publishGapHours}
                onChange={(event) => void save({ ...value, publishGapHours: Number(event.target.value) })}
              >
                {[1, 2, 3, 4, 6, 8, 12].map((h) => (
                  <option key={h} value={h}>
                    {h === 1 ? "1 hora" : `${h} horas`}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
