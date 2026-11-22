"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageOff, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { COUNTRY_LABELS, LANGUAGE_LABELS, type ProductView } from "./labels";

export function ProductCover({ photoId, className }: { photoId?: number | null; className?: string }) {
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground", className)}>
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/fotos/${photoId}`} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff className="size-6" aria-label="Sin foto" />
      )}
    </div>
  );
}

export function ProductMarket({ product }: { product: ProductView }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{LANGUAGE_LABELS[product.language] ?? product.language}</Badge>
      {product.countries.map((country) => (
        <Badge key={country} variant="outline">
          {COUNTRY_LABELS[country] ?? country}
        </Badge>
      ))}
    </div>
  );
}

export function ProductList() {
  const query = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductView[] }>("/api/productos"),
  });
  const products = query.data?.products ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <Link href="/productos/nuevo" className={cn(buttonVariants(), "h-11 gap-2 px-4 text-base")}>
          <Plus className="size-5" />
          Nuevo producto
        </Link>
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : query.isError ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-3 text-sm">
          No se pudieron cargar los productos. Recarga la página para volver a intentarlo.
        </p>
      ) : products.length === 0 ? (
        <Card className="items-center px-6 py-10 text-center">
          <p className="text-base font-medium">Todavía no hay productos</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Añade el primero con su nombre, una frase que diga qué hace y unas fotos.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((product) => (
            <li key={product.id}>
              <Link href={`/productos/${product.id}`} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <Card className="flex-row gap-3 p-3 transition-colors hover:bg-muted/40">
                  <ProductCover photoId={product.coverPhotoId} className="size-24" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="truncate text-base font-semibold">{product.name}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{product.summary}</p>
                    <ProductMarket product={product} />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
