"use client";

import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Eye, Film, ImageIcon, ScanSearch, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { productTabHref, type ProductView } from "@/components/products/labels";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { type FlowStep, type ProductPhoto, type VideoViewJson } from "./labels";
import { StepBreakdown } from "./step-breakdown";
import { StepReference, useReferenceUpload } from "./step-reference";
import { Stepper, type Step } from "./stepper";

const LOCKED = "Disponible en cuanto termine el desglose";

/** El paso elegido queda en la dirección (`?paso=desglose`) para que recargar no lo pierda. */
function rememberStep(step: FlowStep) {
  const url = new URL(window.location.href);
  url.searchParams.set("paso", step);
  window.history.replaceState(window.history.state, "", url);
}

/** Mientras algo se prepara en segundo plano, el vídeo se vuelve a pedir solo. */
function pollEvery(view: VideoViewJson | undefined): number | false {
  if (!view) return false;
  if (view.video.referenceStatus === "processing") return 2000;
  const status = view.analysis?.status;
  if (status === "queued" || status === "running") return 2000;
  if (status === "paused") return 10_000;
  return false;
}

function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-label="Cargando el vídeo">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export function VideoFlow({ productId, videoId, initialStep }: { productId: number; videoId: number; initialStep?: FlowStep }) {
  const view = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => api<VideoViewJson>(`/api/videos/${videoId}`),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
    refetchInterval: (q) => pollEvery(q.state.data),
  });
  const product = useQuery({
    queryKey: ["product", String(productId)],
    queryFn: () => api<{ product: ProductView }>(`/api/productos/${productId}`),
  });
  const photos = useQuery({
    queryKey: ["photos", productId],
    queryFn: () => api<{ photos: ProductPhoto[] }>(`/api/productos/${productId}/fotos`),
  });
  const upload = useReferenceUpload(videoId);

  const back = { href: productTabHref(productId, "videos"), label: product.data?.product.name ?? "Producto" };

  if (view.isLoading) return <Loading />;
  const data = view.data;
  if (view.isError || !data || data.video.productId !== productId) {
    const notFound = (view.error instanceof ApiError && view.error.status === 404) || (data && data.video.productId !== productId);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={back} title={notFound ? "Vídeo no encontrado" : "No se pudo abrir el vídeo"} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-5" aria-hidden />
          </span>
          <Link href={back.href} className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
            Ver los vídeos del producto
          </Link>
        </div>
      </div>
    );
  }

  return <FlowBody view={data} photos={photos.data?.photos ?? []} upload={upload} back={back} initialStep={initialStep} />;
}

/**
 * El vídeo ya cargado. El paso que se abre se decide una sola vez al llegar (el desglose si ya hay
 * uno o si la referencia está completa; si no, la referencia): elegir el avatar no cambia de paso.
 */
function FlowBody({
  view: data,
  photos,
  upload,
  back,
  initialStep,
}: {
  view: VideoViewJson;
  photos: ProductPhoto[];
  upload: ReturnType<typeof useReferenceUpload>;
  back: { href: string; label: string };
  initialStep?: FlowStep;
}) {
  const { video, analysis, imageManifest } = data;
  const referenceDone = video.referenceStatus === "ready" && (video.noPerson || imageManifest.some((item) => item.role === "avatar"));
  const breakdownDone = analysis?.status === "done" && !analysis.stale;
  const [current, setCurrent] = useState<FlowStep>(() => initialStep ?? (analysis || referenceDone ? "desglose" : "referencia"));
  const select = (step: FlowStep) => {
    setCurrent(step);
    rememberStep(step);
  };

  const steps: Step<FlowStep | "imagen" | "clip">[] = [
    { key: "referencia", label: "Referencia", icon: Film, done: referenceDone },
    { key: "desglose", label: "Desglose", icon: ScanSearch, done: breakdownDone },
    { key: "imagen", label: "Imagen", icon: ImageIcon, done: false, locked: LOCKED },
    { key: "clip", label: "Clip", icon: Clapperboard, done: false, locked: LOCKED },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={back} title={video.title} />

      {!data.mine ? (
        <p role="status" className="flex items-center gap-2.5 rounded-xl bg-sky-500/10 px-4 py-3 text-sm ring-1 ring-sky-500/20">
          <Eye className="size-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden />
          Este vídeo es de {data.creatorName ?? "otra persona"}. Puedes verlo, pero solo esa persona puede continuarlo.
        </p>
      ) : null}

      <Stepper steps={steps} current={current} onSelect={(key) => (key === "referencia" || key === "desglose") && select(key)} />

      {current === "referencia" ? (
        <StepReference view={data} photos={photos} upload={upload.state} onUpload={(file) => void upload.start(file)} />
      ) : (
        <StepBreakdown view={data} onGoToReference={() => select("referencia")} />
      )}
    </div>
  );
}
