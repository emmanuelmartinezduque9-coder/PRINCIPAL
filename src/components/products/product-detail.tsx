"use client";

import { useQuery } from "@tanstack/react-query";
import { PackageX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProductView } from "./labels";
import { PhotoManager } from "./photo-uploader";
import { countryLabels, languageLabel } from "./product-list";

const formatDate = (iso: string) => new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(iso));

export function ProductDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<{ product: ProductView }>(`/api/productos/${id}`),
    // Un producto que no existe o no es tuyo no mejora por reintentar.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const product = query.data?.product;
  const back = { href: "/productos", label: "Productos" };

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-label="Cargando el producto">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-80" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (query.isError || !product) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title={notFound ? "Producto no encontrado" : "No se pudo abrir el producto"} />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <PackageX className="size-5" aria-hidden />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {notFound
              ? "Puede que ya no exista o que no tengas acceso a él."
              : "Ha fallado la conexión con el servidor. Recarga la página para volver a intentarlo."}
          </p>
          <Link href="/productos" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
            Ver todos los productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={back} title={product.name} description={product.summary} />

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Panel title="Datos">
          <dl className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Idioma en el que se vende</dt>
              <dd>{languageLabel(product.language)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Países</dt>
              <dd className="flex flex-wrap gap-1.5">
                {countryLabels(product.countries).map((country) => (
                  <span key={country} className="rounded-md border px-2 py-0.5 text-xs">
                    {country}
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Añadido el</dt>
              <dd>{formatDate(product.createdAt)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Fotos" description="La primera es la portada que se ve en la lista.">
          <PhotoManager productId={product.id} />
        </Panel>
      </div>
    </div>
  );
}
