"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProductView } from "./labels";
import { PhotoCount, PhotoPicker, uploadPhotos, type PendingPhoto } from "./photo-uploader";
import { ProductFields, type ProductValues } from "./product-fields";

export function ProductForm() {
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
      />

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
