"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api";
import type { ProductView } from "./labels";
import { PhotoManager } from "./photo-uploader";
import { ProductMarket } from "./product-list";

export function ProductDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<{ product: ProductView }>(`/api/productos/${id}`),
    // Un producto que no existe o no es tuyo no mejora por reintentar.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const product = query.data?.product;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href="/productos" className="inline-flex h-9 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Productos
      </Link>

      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : query.isError || !product ? (
        <div className="rounded-lg bg-muted px-4 py-6 text-center">
          <p className="font-medium">Producto no encontrado</p>
          <p className="text-sm text-muted-foreground">Puede que ya no exista o que no tengas acceso a él.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{product.name}</h1>
            <p className="text-base break-words text-muted-foreground">{product.summary}</p>
            <ProductMarket product={product} />
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Fotos</h2>
            <PhotoManager productId={product.id} />
          </section>
        </>
      )}
    </div>
  );
}
