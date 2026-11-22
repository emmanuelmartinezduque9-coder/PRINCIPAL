"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/productos" className="inline-flex h-9 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Productos
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo producto</h1>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre del producto</Label>
        <Input id="name" className="h-11 text-base" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoComplete="off" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">¿Qué hace? (una frase)</Label>
        <Textarea id="summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} required placeholder="Por ejemplo: hace helado en 2 minutos sin hielo" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="language">Idioma en el que se vende</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger id="language" className="h-11 w-full text-base">
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
                  "flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-base has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  on ? "border-foreground bg-foreground/[0.04]" : "text-muted-foreground",
                )}
              >
                <input type="checkbox" className="size-4 accent-foreground" checked={on} onChange={(e) => toggleCountry(code, e.target.checked)} />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label>Fotos del producto</Label>
        <PhotoPicker files={files} onChange={setFiles} />
      </div>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy} className="h-12 text-base">
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy && files.length ? "Guardando y subiendo fotos…" : "Crear producto"}
      </Button>
    </form>
  );
}
