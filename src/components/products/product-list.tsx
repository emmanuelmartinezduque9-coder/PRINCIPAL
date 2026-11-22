"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageOff, Languages, MapPin, Package, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { countryLabels, languageLabel, type ProductView } from "./labels";

export function ProductCover({ photoId, className }: { photoId?: number | null; className?: string }) {
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden bg-muted text-muted-foreground", className)}>
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/fotos/${photoId}`} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff className="size-6" aria-label="Sin foto" />
      )}
    </div>
  );
}

/** Quita tildes y mayúsculas para que «maquina» encuentre «Máquina». */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function ProductCard({ product }: { product: ProductView }) {
  return (
    <Link
      href={`/productos/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-[0_2px_12px_-4px_rgb(0_0_0/0.12)] hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-foreground/70"
    >
      <ProductCover photoId={product.coverPhotoId} className="aspect-[4/3] w-full border-b" />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h2 className="truncate text-[15px] font-semibold tracking-tight">{product.name}</h2>
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{product.summary}</p>
        <dl className="mt-auto flex flex-col gap-1 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt>
              <Languages className="size-3.5" aria-label="Idioma" />
            </dt>
            <dd className="text-foreground/80">{languageLabel(product.language)}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt>
              <MapPin className="size-3.5" aria-label="Países" />
            </dt>
            <dd className="truncate">{countryLabels(product.countries).join(" · ")}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function ProductList() {
  const query = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductView[] }>("/api/productos"),
  });
  const products = useMemo(() => query.data?.products ?? [], [query.data]);
  const [search, setSearch] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const term = normalize(search.trim());
    return term ? products.filter((product) => normalize(product.name).includes(term)) : products;
  }, [products, search]);

  // «/» lleva al buscador desde cualquier parte de la pantalla (como en muchas webs).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasProducts = products.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productos"
        actions={
          <Link href="/productos/nuevo" className={cn(buttonVariants(), "h-10 gap-2 px-4")}>
            <Plus className="size-4" aria-hidden />
            Nuevo producto
          </Link>
        }
      />

      {hasProducts ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={searchInput}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
              placeholder="Buscar por nombre"
              aria-label="Buscar productos por nombre"
              className="h-10 pr-10 pl-9 text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInput.current?.focus();
                }}
                aria-label="Borrar la búsqueda"
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-sans text-xs text-muted-foreground sm:block">
                /
              </kbd>
            )}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {search.trim()
              ? `${visible.length} de ${products.length} ${products.length === 1 ? "producto" : "productos"}`
              : `${products.length} ${products.length === 1 ? "producto" : "productos"}`}
          </p>
        </div>
      ) : null}

      {query.isLoading ? (
        <ul className={GRID} aria-label="Cargando productos">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-5 py-4 text-sm">
          No se pudieron cargar los productos. Recarga la página.
        </p>
      ) : !hasProducts ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Package className="size-5" aria-hidden />
          </span>
          <p className="font-medium">Todavía no hay productos</p>
          <Link href="/productos/nuevo" className={cn(buttonVariants(), "h-10 gap-2 px-4")}>
            <Plus className="size-4" aria-hidden />
            Nuevo producto
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">Ningún producto se llama así</p>
          <button
            type="button"
            onClick={() => setSearch("")}
            className={cn(buttonVariants({ variant: "outline" }), "mt-1 h-9 px-3")}
          >
            Ver todos
          </button>
        </div>
      ) : (
        <ul className={GRID}>
          {visible.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
