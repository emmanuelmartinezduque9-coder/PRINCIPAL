"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bookmark, CircleAlert, Film, Loader2, Plug, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { productLabel, type ProductView } from "@/components/products/labels";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { HIGGSFIELD_CONNECT } from "@/lib/error-codes";
import { cn } from "@/lib/utils";
import { ClipDialog } from "./clip-dialog";
import { ClipPreview, useHoverPreview } from "./clip-preview";
import { LIBRARY_PAGE, type LibraryClipJson, type LibraryPageJson } from "./labels";

const ALL = "todos";
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2";

/** Una miniatura de la rejilla: al pasar por encima (o con el foco) se ve el vídeo; un clic lo abre en grande. */
function ClipTile({ clip, filterProductId, onOpen }: { clip: LibraryClipJson; filterProductId: number | null; onOpen: () => void }) {
  const preview = useHoverPreview();
  const date = new Date(clip.createdAt);
  // Con el filtro de un producto, el nombre del cuerpo; sin filtro, de qué producto es cuerpo.
  const mark = filterProductId === null ? clip.bodies[0] : clip.bodies.find((body) => body.productId === filterProductId);
  const markText = mark ? (filterProductId === null ? mark.productName : mark.label) : null;
  const more = filterProductId === null ? clip.bodies.length - 1 : 0;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        {...preview.handlers}
        aria-label={`Clip del ${format(date, "d 'de' MMMM, HH:mm", { locale: es })}${markText ? `, cuerpo: ${markText}` : ""}`}
        className="group relative block aspect-[9/16] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 outline-none transition-shadow hover:ring-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <ClipPreview thumbUrl={clip.thumbUrl} videoUrl={clip.videoUrl} active={preview.active} />
        {markText ? (
          <span className="absolute top-1.5 left-1.5 inline-flex h-5 max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-full bg-background/90 pr-2 pl-1.5 text-[11px] font-medium text-foreground shadow-sm">
            <Bookmark className="size-3 shrink-0 fill-current" aria-hidden />
            <span className="truncate">{markText}</span>
            {more > 0 ? <span className="shrink-0 text-muted-foreground tabular-nums">+{more}</span> : null}
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 text-[11px] font-medium text-white tabular-nums">
          <time dateTime={clip.createdAt}>{format(date, "d MMM", { locale: es })}</time>
        </span>
      </button>
    </li>
  );
}

function Empty({ icon: Icon, title, children, spin }: { icon: typeof Film; title: string; children?: React.ReactNode; spin?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className={cn("size-5", spin && "animate-spin")} aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

const SettingsLink = ({ className }: { className?: string }) => (
  <Link href="/ajustes" className={cn(buttonVariants({ variant: "outline" }), className)}>
    Ir a Ajustes
  </Link>
);

/**
 * `/biblioteca`: los clips del Higgsfield de la persona, servidos de la caché (cargan al momento).
 * «Actualizar» trae lo nuevo, y la pantalla lo hace sola al abrirse si nunca se actualizó o hace
 * más de 10 minutos. El filtro por producto enseña los clips marcados como cuerpo de ese producto.
 */
export function LibraryScreen({ initialProductId }: { initialProductId: number | null }) {
  const client = useQueryClient();
  const [productId, setProductId] = useState<number | null>(initialProductId);
  const [openId, setOpenId] = useState<number | null>(null);
  /** Higgsfield sin conectar (o caducado): lo dijo la última actualización. */
  const [needsConnection, setNeedsConnection] = useState(false);

  const products = useQuery({ queryKey: ["products"], queryFn: () => api<{ products: ProductView[] }>("/api/productos") });
  const productList = products.data?.products ?? [];

  const library = useInfiniteQuery({
    queryKey: ["library", productId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limite: String(LIBRARY_PAGE) });
      if (pageParam) query.set("cursor", pageParam);
      if (productId !== null) query.set("producto", String(productId));
      return api<LibraryPageJson>(`/api/biblioteca?${query}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const first = library.data?.pages[0];
  const clips = library.data?.pages.flatMap((page) => page.clips) ?? [];

  // La variable dice quién la pidió: «manual» (el botón) avisa del resultado; «auto» (al abrir), no.
  const refresh = useMutation<{ added: number; skipped: boolean }, Error, "auto" | "manual">({
    mutationFn: () => api<{ added: number; skipped: boolean }>("/api/biblioteca/actualizar", { method: "POST" }),
    onSuccess: async ({ added, skipped }, how) => {
      setNeedsConnection(false);
      await client.invalidateQueries({ queryKey: ["library"] });
      if (how !== "manual") return;
      // `skipped`: ya se actualizó hace menos de 30 s (otra pestaña, otro clic); el servidor no ha vuelto a preguntar.
      if (skipped) toast.success("Ya está al día");
      else toast.success(added === 0 ? "Sin clips nuevos" : added === 1 ? "1 clip nuevo" : `${added} clips nuevos`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === HIGGSFIELD_CONNECT) setNeedsConnection(true);
      else toast.error(error instanceof Error ? error.message : "No se pudo actualizar.");
    },
  });

  // Al abrir la pantalla, una sola vez: si la caché está vacía o vieja, se actualiza sola.
  const autoRefreshed = useRef(false);
  const stale = first?.stale;
  const { mutate: runRefresh } = refresh;
  useEffect(() => {
    if (stale === undefined || autoRefreshed.current) return;
    autoRefreshed.current = true;
    if (stale) runRefresh("auto");
  }, [stale, runRefresh]);

  function chooseProduct(value: string) {
    const next = value === ALL ? null : Number(value);
    setProductId(next);
    setOpenId(null);
    const url = new URL(window.location.href);
    if (next === null) url.searchParams.delete("producto");
    else url.searchParams.set("producto", String(next));
    window.history.replaceState(null, "", url);
  }

  const openClip = openId === null ? null : (clips.find((clip) => clip.id === openId) ?? null);
  const filterProduct = productList.find((product) => product.id === productId);
  const filterName = filterProduct ? productLabel(filterProduct) : undefined;
  const notFound = library.error instanceof ApiError && library.error.status === 404;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Biblioteca"
        actions={
          <>
            <Select value={productId === null ? ALL : String(productId)} onValueChange={chooseProduct}>
              <SelectTrigger aria-label="Filtrar por producto" className="h-9 w-56 max-w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>Todos mis clips</SelectItem>
                  {productList.map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      <Bookmark className="size-3.5 fill-current text-muted-foreground" aria-hidden />
                      {productLabel(product)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-9 gap-2 px-3" disabled={refresh.isPending} onClick={() => refresh.mutate("manual")}>
              {refresh.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              Actualizar
            </Button>
          </>
        }
      >
        {productId !== null ? (
          // Con el filtro, cuántos cuerpos tiene el producto (un «+» si aún quedan por cargar).
          clips.length > 0 ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {clips.length === 1 && !library.hasNextPage ? "1 cuerpo" : `${clips.length.toLocaleString("es-ES")}${library.hasNextPage ? "+" : ""} cuerpos`}
            </p>
          ) : null
        ) : first && first.total > 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
            <span>{first.total === 1 ? "1 clip" : `${first.total.toLocaleString("es-ES")} clips`}</span>
            {first.refreshedAt ? (
              <>
                <span aria-hidden>·</span>
                <time dateTime={first.refreshedAt} title={format(new Date(first.refreshedAt), "d MMM yyyy, HH:mm", { locale: es })}>
                  {formatDistanceToNow(new Date(first.refreshedAt), { locale: es, addSuffix: true })}
                </time>
              </>
            ) : null}
          </p>
        ) : null}
      </PageHeader>

      {needsConnection && clips.length > 0 ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm">
          <Plug className="size-4 shrink-0 text-amber-600" aria-hidden />
          <span className="min-w-0 flex-1">Conecta tu Higgsfield para traer los clips nuevos.</span>
          <SettingsLink className="h-8 bg-background" />
        </div>
      ) : null}

      {library.isLoading ? (
        <div className={GRID} aria-label="Cargando la biblioteca">
          {Array.from({ length: 21 }, (_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
          ))}
        </div>
      ) : library.isError ? (
        <Empty icon={CircleAlert} title={notFound ? "Producto no encontrado" : "No se pudo cargar la biblioteca"}>
          {notFound ? (
            <Button variant="outline" className="h-10 px-4" onClick={() => chooseProduct(ALL)}>
              Ver todos mis clips
            </Button>
          ) : (
            <Button variant="outline" className="h-10 gap-2 px-4" onClick={() => void library.refetch()}>
              <RefreshCw data-icon="inline-start" />
              Reintentar
            </Button>
          )}
        </Empty>
      ) : clips.length === 0 && productId !== null ? (
        <Empty icon={Bookmark} title={filterName ? `${filterName} aún no tiene cuerpos` : "Aún no tiene cuerpos"}>
          <Button variant="outline" className="h-10 px-4" onClick={() => chooseProduct(ALL)}>
            Ver todos mis clips
          </Button>
        </Empty>
      ) : clips.length === 0 && refresh.isPending ? (
        <Empty icon={Loader2} spin title="Trayendo tus clips de Higgsfield…" />
      ) : clips.length === 0 && needsConnection ? (
        <Empty icon={Plug} title="Conecta tu Higgsfield">
          <SettingsLink className="h-10 px-4" />
        </Empty>
      ) : clips.length === 0 ? (
        <Empty icon={Film} title="Aún no hay clips en tu Higgsfield" />
      ) : (
        <>
          <ul className={GRID} aria-label={filterName ? `Cuerpos de ${filterName}` : "Clips"}>
            {clips.map((clip) => (
              <ClipTile key={clip.id} clip={clip} filterProductId={productId} onOpen={() => setOpenId(clip.id)} />
            ))}
          </ul>
          {library.hasNextPage ? (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="outline" className="h-10 gap-2 px-5" disabled={library.isFetchingNextPage} onClick={() => void library.fetchNextPage()}>
                {library.isFetchingNextPage ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Cargar más
              </Button>
              {productId === null && first ? (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {clips.length.toLocaleString("es-ES")} de {first.total.toLocaleString("es-ES")}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <ClipDialog clip={openClip} products={productList} filterProductId={productId} onClose={() => setOpenId(null)} />
    </div>
  );
}
