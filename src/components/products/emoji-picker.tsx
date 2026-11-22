"use client";

import { useQueryClient } from "@tanstack/react-query";
import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PRODUCT_EMOJIS, type ProductView } from "./labels";

/** Botón con el emoji del producto: abre la cuadrícula, un campo para pegar otro y «Quitar». */
export function EmojiButton({ product }: { product: ProductView }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(emoji: string | null) {
    setBusy(true);
    try {
      await api(`/api/productos/${product.id}`, { method: "PATCH", body: JSON.stringify({ emoji }) });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["product", String(product.id)] }),
        client.invalidateQueries({ queryKey: ["products"] }),
      ]);
      setOpen(false);
      setCustom("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={product.emoji ? `Emoji ${product.emoji}` : "Poner emoji"}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg text-2xl outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            !product.emoji && "border border-dashed text-muted-foreground",
          )}
        >
          {product.emoji ?? <SmilePlus className="size-5" aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-3">
        <div className="grid grid-cols-8 gap-1" role="group" aria-label="Emoji">
          {PRODUCT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={busy}
              onClick={() => save(emoji)}
              aria-pressed={product.emoji === emoji}
              className="grid size-8 place-items-center rounded-md text-xl outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-foreground/20"
            >
              {emoji}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (custom.trim()) void save(custom.trim());
          }}
        >
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Pega un emoji"
            aria-label="Otro emoji"
            className="h-9 text-base"
          />
          <Button type="submit" variant="outline" className="h-9 px-3" disabled={busy || !custom.trim()}>
            OK
          </Button>
        </form>
        {product.emoji ? (
          <Button type="button" variant="ghost" className="h-8 self-start px-2 text-muted-foreground" disabled={busy} onClick={() => save(null)}>
            Quitar
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
