"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Clapperboard, CircleAlert, Compass, Ellipsis, Images, Languages, Loader2, MapPin, PackageX, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { countryLabels, isProductTab, languageLabel, type ProductTab, type ProductView } from "./labels";
import { PhotoCount, PhotoManager } from "./photo-uploader";
import { ProductFields, type ProductValues } from "./product-fields";
import { VideoList } from "@/components/videos/video-list";
import { DefaultAvatar } from "./default-avatar";
import { VariantsPanel } from "./variants-panel";
import { EmojiButton } from "./emoji-picker";
import { FocusPanel } from "./focus-panel";
import { IntakePanel } from "./intake-panel";
import type { AuthUser } from "@/server/auth";

const CHIP = "inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5 text-sm";

/** Idioma y países como fichas, con su icono. */
function MarketChips({ product }: { product: ProductView }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Idioma y países">
      <li className={CHIP}>
        <Languages className="size-3.5 text-muted-foreground" aria-label="Idioma" />
        {languageLabel(product.language)}
      </li>
      {countryLabels(product.countries).map((country) => (
        <li key={country} className={CHIP}>
          <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
          {country}
        </li>
      ))}
    </ul>
  );
}

/** Editar nombre, qué hace, idioma y países de un producto ya creado. */
function EditProductDialog({ product }: { product: ProductView }) {
  const client = useQueryClient();
  const initial = (): ProductValues => ({
    name: product.name,
    summary: product.summary,
    language: product.language,
    countries: product.countries,
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProductValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/productos/${product.id}`, { method: "PATCH", body: JSON.stringify(values) });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["product", String(product.id)] }),
        client.invalidateQueries({ queryKey: ["products"] }),
      ]);
      toast.success("Producto guardado.");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el producto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initial());
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 gap-2 px-4">
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-6 p-6 sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-lg">Editar producto</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          <ProductFields values={values} onChange={setValues} />
          {error ? (
            <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-10 px-4" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="h-10 px-4">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Menú del dueño: archivar o desarchivar (no se borra nada). */
function OwnerMenu({ product }: { product: ProductView }) {
  const client = useQueryClient();
  const archived = product.archivedAt !== null;

  async function toggle() {
    try {
      await api(`/api/productos/${product.id}`, { method: "PATCH", body: JSON.stringify({ archived: !archived }) });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["product", String(product.id)] }),
        client.invalidateQueries({ queryKey: ["products"] }),
      ]);
      toast.success(archived ? "Desarchivado." : "Archivado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="size-10 p-0" aria-label="Más acciones">
          <Ellipsis className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void toggle()}>
          {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {archived ? "Desarchivar" : "Archivar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** La pestaña elegida queda en la dirección (`?pestana=videos`): al volver de un vídeo se abre la misma. */
function rememberTab(tab: ProductTab) {
  const url = new URL(window.location.href);
  if (tab === "fotos") url.searchParams.delete("pestana");
  else url.searchParams.set("pestana", tab);
  window.history.replaceState(window.history.state, "", url);
}

export function ProductDetail({ id, initialTab = "fotos" }: { id: string; initialTab?: ProductTab }) {
  const [tab, setTab] = useState<ProductTab>(initialTab);
  const query = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<{ product: ProductView }>(`/api/productos/${id}`),
    // Un producto que no existe o no es tuyo no mejora por reintentar.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  // La misma consulta que la pestaña Vídeos (comparten caché): el número se ve en la pestaña.
  const videos = useQuery({
    queryKey: ["videos", Number(id)],
    queryFn: () => api<{ videos: unknown[] }>(`/api/productos/${id}/videos`),
    enabled: /^[1-9]\d{0,15}$/.test(id),
  });
  const videoCount = videos.data?.videos.length ?? 0;
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: AuthUser | null }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
  const isOwner = me.data?.user?.role === "dueno";
  const product = query.data?.product;
  const back = { href: "/productos", label: "Productos" };

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-label="Cargando el producto">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-5 w-[28rem] max-w-full" />
          <Skeleton className="h-7 w-72" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (query.isError || !product) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title={notFound ? "Producto no encontrado" : "No se pudo abrir el producto"} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <PackageX className="size-5" aria-hidden />
          </span>
          <Link href="/productos" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
            Ver todos los productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={back}
        title={
          <span className="flex items-center gap-2">
            <EmojiButton product={product} />
            <span className="min-w-0">{product.name}</span>
          </span>
        }
        actions={
          <>
            <EditProductDialog product={product} />
            {isOwner ? <OwnerMenu product={product} /> : null}
          </>
        }
      >
        <p className="max-w-[70ch] text-[15px] text-pretty text-muted-foreground">{product.summary}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {product.archivedAt ? (
            <span className={cn(CHIP, "text-muted-foreground")}>
              <Archive className="size-3.5" aria-hidden />
              Archivado
            </span>
          ) : null}
          <MarketChips product={product} />
          <DefaultAvatar product={product} />
        </div>
      </PageHeader>

      <IntakePanel productId={product.id} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (!isProductTab(value)) return;
          setTab(value);
          rememberTab(value);
        }}
      >
        <TabsList aria-label="Contenido del producto">
          <TabsTrigger value="fotos">
            <Images className="size-4" aria-hidden />
            Fotos
            {photoCount === null ? null : <PhotoCount count={photoCount} />}
          </TabsTrigger>
          <TabsTrigger value="videos">
            <Clapperboard className="size-4" aria-hidden />
            Vídeos
            {videoCount ? <span className="text-sm text-muted-foreground tabular-nums">{videoCount}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="nicho">
            <Compass className="size-4" aria-hidden />
            Nicho y ángulos
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fotos" className="flex flex-col gap-6">
          <Panel>
            <PhotoManager productId={product.id} onCount={setPhotoCount} />
          </Panel>
          <VariantsPanel productId={product.id} />
        </TabsContent>
        <TabsContent value="videos">
          <VideoList productId={product.id} />
        </TabsContent>
        <TabsContent value="nicho">
          <FocusPanel product={product} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
