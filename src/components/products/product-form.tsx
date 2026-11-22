"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { COUNTRY_LABELS, LANGUAGE_LABELS, type ProductView } from "./labels";
import { PhotoPicker, uploadPhotos } from "./photo-uploader";

const DEFAULT_COUNTRIES = ["DE", "AT", "CH"];

export function ProductForm() {
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [language, setLanguage] = useState("de");
  const [countries, setCountries] = useState<string[]>(DEFAULT_COUNTRIES);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { product } = await api<{ product: ProductView }>("/api/productos", {
        method: "POST",
        body: JSON.stringify({ name, summary, language, countries }),
      });
      // El producto ya existe: si alguna foto no vale, se avisa y se sigue en su pantalla.
      const failed = files.length ? await uploadPhotos(product.id, files) : 0;
      await client.invalidateQueries({ queryKey: ["products"] });
      if (failed === 0) toast.success("Producto creado.");
      else toast.message("Producto creado, pero alguna foto no se pudo subir. Puedes añadirla desde aquí.");
      router.push(failed === 0 ? "/productos" : `/productos/${product.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el producto.");
      setBusy(false);
    }
  }

  function toggleCountry(code: string, on: boolean) {
    setCountries((current) => (on ? [...current, code] : current.filter((c) => c !== code)));
  }

  const submitLabel = busy && files.length ? "Guardando y subiendo fotos…" : busy ? "Guardando…" : "Crear producto";

  return (
    <form id="product-form" onSubmit={submit} className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/productos", label: "Productos" }}
        title="Nuevo producto"
        description="Rellena los datos y añade unas fotos. Podrás añadir más fotos después."
        actions={
          <>
            <Link href="/productos" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Cancelar
            </Link>
            <Button type="submit" disabled={busy} className="h-10 px-4">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </>
        }
      />

      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {error}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Panel title="Datos del producto" description="Lo que necesitamos para buscarle ángulos de venta.">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre del producto</Label>
            <Input id="name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoComplete="off" autoFocus />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="summary">¿Qué hace? (una frase)</Label>
            <Textarea id="summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} required placeholder="Por ejemplo: hace helado en 2 minutos sin hielo" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="language">Idioma en el que se vende</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="language" className="w-full data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Países donde se vende</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(COUNTRY_LABELS).map(([code, label]) => {
                const on = countries.includes(code);
                return (
                  <label
                    key={code}
                    className={cn(
                      "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                      on ? "border-foreground/70 bg-foreground/[0.04] text-foreground" : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <input type="checkbox" className="size-4 accent-foreground" checked={on} onChange={(e) => toggleCountry(code, e.target.checked)} />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Fotos" description="La primera será la portada. Se suben al crear el producto.">
          <PhotoPicker files={files} onChange={setFiles} />
        </Panel>
      </div>
    </form>
  );
}
