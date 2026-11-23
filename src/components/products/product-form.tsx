"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Link2, Loader2, PencilLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { COUNTRY_LABELS, type ProductView } from "./labels";
import { PhotoCount, PhotoPicker, uploadPhotos, type PendingPhoto } from "./photo-uploader";
import { ProductFields, type ProductValues } from "./product-fields";

type Mode = "enlace" | "mano";

/** «Nuevo producto»: pegando un enlace (por defecto) o escribiendo los datos a mano. */
export function ProductForm() {
  const [mode, setMode] = useState<Mode>("enlace");
  const toggle = (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => (value === "enlace" || value === "mano" ? setMode(value) : undefined)}
      aria-label="Cómo crear el producto"
    >
      <ToggleGroupItem value="enlace" className="gap-1.5 px-3">
        <Link2 className="size-4" aria-hidden /> Pegar un enlace
      </ToggleGroupItem>
      <ToggleGroupItem value="mano" className="gap-1.5 px-3">
        <PencilLine className="size-4" aria-hidden /> A mano
      </ToggleGroupItem>
    </ToggleGroup>
  );
  return mode === "enlace" ? <LinkProductForm toggle={toggle} /> : <ManualProductForm toggle={toggle} />;
}

/**
 * Crear pegando solo un enlace (reel o cuenta de Instagram/TikTok, AliExpress o una tienda) y el
 * país. El resto (qué es, qué hace, marca, mockup) lo rellena el sistema en la pantalla del producto.
 */
function LinkProductForm({ toggle }: { toggle: React.ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("DE");
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { product } = await api<{ product: ProductView }>("/api/productos/desde-enlace", {
        method: "POST",
        body: JSON.stringify({ url, country, esperarFotos: files.length > 0 }),
      });
      if (files.length > 0) {
        // Las fotos van antes del análisis: así Claude también las mira.
        await uploadPhotos(product.id, files);
        await api(`/api/productos/${product.id}/alta/empezar`, { method: "POST", body: "{}" });
      }
      await client.invalidateQueries({ queryKey: ["products"] });
      toast.success("Producto creado. Lo estamos analizando.");
      router.push(`/productos/${product.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el producto.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/productos", label: "Productos" }}
        title="Nuevo producto"
        actions={
          <>
            <Link href="/productos" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Cancelar
            </Link>
            <Button type="submit" disabled={busy || !url.trim()} className="h-10 px-4">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Creando…" : "Crear producto"}
            </Button>
          </>
        }
      >
        {toggle}
      </PageHeader>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {error}
        </p>
      ) : null}

      <Panel title="Enlace y país" className="max-w-2xl">
        <div className="flex flex-col gap-2">
          <Label htmlFor="url">Enlace</Label>
          <Input
            id="url"
            className="h-10"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/… · una cuenta · AliExpress"
            inputMode="url"
            autoComplete="off"
            autoFocus
            required
          />
          <p className="text-sm text-muted-foreground">
            Un reel o una cuenta de Instagram o TikTok, un producto de AliExpress o una tienda. No hace falta nombre, explicación ni fotos:
            el sistema entra en el enlace, entiende el producto, le pone una marca y prepara el mockup sobre fondo gris.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">País</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <label
                key={code}
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  country === code
                    ? "border-foreground bg-foreground/[0.07] font-medium text-foreground ring-1 ring-foreground"
                    : "text-muted-foreground hover:border-foreground/30 hover:bg-muted/50",
                )}
              >
                <input type="radio" name="country" className="size-4 accent-foreground" checked={country === code} onChange={() => setCountry(code)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel title="Foto o captura (opcional)" actions={<PhotoCount count={files.length} />} className="max-w-2xl">
        <p className="-mt-2 text-sm text-muted-foreground">
          No hace falta. Ayuda cuando el enlace no deja ver el producto (AliExpress suele bloquear, y una cuenta de Instagram sin reels concretos
          también): una captura del producto basta.
        </p>
        <PhotoPicker files={files} onChange={setFiles} />
      </Panel>
    </form>
  );
}

function ManualProductForm({ toggle }: { toggle: React.ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const [values, setValues] = useState<ProductValues>({ name: "", summary: "", language: "de", countries: ["DE", "AT", "CH"] });
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { product } = await api<{ product: ProductView }>("/api/productos", {
        method: "POST",
        body: JSON.stringify(values),
      });
      // El producto ya existe: si alguna foto no vale, se avisa y se sigue en su pantalla.
      const failed = files.length ? await uploadPhotos(product.id, files) : 0;
      await client.invalidateQueries({ queryKey: ["products"] });
      if (failed === 0) toast.success("Producto creado.");
      else toast.message("Producto creado. Alguna foto no se pudo subir.");
      router.push(failed === 0 ? "/productos" : `/productos/${product.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el producto.");
      setBusy(false);
    }
  }

  return (
    <form id="product-form" onSubmit={submit} className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/productos", label: "Productos" }}
        title="Nuevo producto"
        actions={
          <>
            <Link href="/productos" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
              Cancelar
            </Link>
            <Button type="submit" disabled={busy} className="h-10 px-4">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Guardando…" : "Crear producto"}
            </Button>
          </>
        }
      >
        {toggle}
      </PageHeader>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {error}
        </p>
      ) : null}

      {/* Los dos paneles terminan a la misma altura: la zona de fotos llena el alto libre. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Panel title="Datos">
          <ProductFields values={values} onChange={setValues} autoFocus />
        </Panel>

        <Panel title="Fotos" actions={<PhotoCount count={files.length} />}>
          <PhotoPicker files={files} onChange={setFiles} />
        </Panel>
      </div>
    </form>
  );
}
