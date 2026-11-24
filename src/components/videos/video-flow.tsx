"use client";

import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Eye, Film, ImageIcon, ScanSearch, Scissors, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { productLabel, productTabHref, type ProductView } from "@/components/products/labels";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/server/auth";
import { AutoQuestion } from "./auto-status";
import { CostSummary } from "./cost-summary";
import { RUNNING_STATUSES, type FlowStep, type ProductPhoto, type VideoViewJson } from "./labels";
import { StepBreakdown, type PromptDraft } from "./step-breakdown";
import { StepClip } from "./step-clip";
import { StepEdit } from "./step-edit";
import { StepFrame } from "./step-frame";
import { StepReference } from "./step-reference";
import { TechnicalDetails } from "./technical-details";
import { useReferenceUpload } from "./upload-provider";
import { Stepper, type Step } from "./stepper";

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
  // Un enlace que el Mac está trayendo (o va a traer).
  if (view.link && view.link.status !== "failed") return 3000;
  const status = view.analysis?.status;
  if (status === "queued" || status === "running") return 2000;
  if (status === "paused") return 10_000;
  // Las referencias de Pinterest de la imagen buscándose (o esperando al Mac).
  if (view.pinterest && ["pending", "searching", "waiting_mac"].includes(view.pinterest.status)) return 4000;
  const generations = [view.frame.current?.status, view.clip.current?.status];
  if (generations.some((s) => s !== undefined && RUNNING_STATUSES.includes(s))) return 3000;
  if (generations.includes("unknown")) return 15_000;
  // Un montaje en la cola o montándose.
  if (view.edit.status === "en_cola" || view.edit.status === "montando") return 5000;
  // El flujo automático va a pedir lo siguiente (desglose, imagen, clip o montaje).
  if (view.auto.state === "working" || view.auto.state === "off") return 3000;
  return false;
}

/**
 * Qué pasos se pueden abrir. Imagen: con el último desglose terminado y de la referencia actual, o
 * si ya hay alguna ronda de imagen (una en marcha o en duda nunca se esconde). Clip: con una imagen
 * aprobada, o si ya hay algún clip (aunque luego cambie la referencia, se sigue viendo y descargando).
 */
function reachableSteps(view: VideoViewJson): FlowStep[] {
  const steps: FlowStep[] = ["referencia", "desglose"];
  // El desglose va por dentro (24/11/2026): con la referencia lista, lo siguiente que se ve es la imagen.
  if (view.analysis !== null || view.video.referenceStatus === "ready" || view.frame.current !== null) steps.push("imagen");
  if (view.frame.approvedResultId !== null || view.clip.current !== null) steps.push("clip");
  // Montaje: con el clip hecho (se puede montar) o si ya se pidió alguno.
  if (view.edit.canStart || view.edit.latest !== null || view.edit.status !== "none") steps.push("montaje");
  return steps;
}

/** El paso con el que se abre el vídeo: el más avanzado en el que ya hay algo hecho. */
function firstStep(view: VideoViewJson, referenceDone: boolean): FlowStep {
  const reachable = reachableSteps(view);
  if (reachable.includes("montaje") && (view.edit.latest !== null || view.edit.status !== "none")) return "montaje";
  if (reachable.includes("clip")) return "clip";
  if (reachable.includes("imagen") && view.frame.current !== null) return "imagen";
  return view.analysis || referenceDone ? "imagen" : "referencia";
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
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: AuthUser | null }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });

  const back = { href: productTabHref(productId, "videos"), label: product.data ? productLabel(product.data.product) : "Producto" };

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

  return (
    <FlowBody
      view={data}
      photos={photos.data?.photos ?? []}
      upload={upload}
      back={back}
      initialStep={initialStep}
      isOwner={me.data?.user?.role === "dueno"}
    />
  );
}

/**
 * El vídeo ya cargado. Mientras la persona no elige un paso, la pantalla sigue al flujo automático
 * (el paso más avanzado con algo hecho: al llegar la imagen, pasa a «Imagen»). En cuanto elige uno,
 * se queda ahí. Un paso que deja de poderse abrir (p. ej. se rechaza la imagen aprobada en otra
 * pestaña) cede al último que sí se puede.
 */
function FlowBody({
  view: data,
  photos,
  upload,
  back,
  initialStep,
  isOwner,
}: {
  view: VideoViewJson;
  photos: ProductPhoto[];
  upload: ReturnType<typeof useReferenceUpload>;
  back: { href: string; label: string };
  initialStep?: FlowStep;
  isOwner: boolean;
}) {
  const { video, analysis, imageManifest } = data;
  const referenceDone =
    video.referenceStatus === "ready" &&
    !data.referenceOutdated &&
    (!["elegido", "biblioteca"].includes(video.avatarMode) || imageManifest.some((item) => item.role === "avatar")) &&
    (video.kind !== "adaptacion_concepto" || !!video.adaptation?.trim());
  const breakdownDone = analysis?.status === "done" && !analysis.stale;
  const [chosen, setChosen] = useState<FlowStep | null>(initialStep ?? null);
  const [draft, setDraft] = useState<PromptDraft>({});
  const select = (step: FlowStep) => {
    setChosen(step);
    rememberStep(step);
  };

  // Solo los pasos que ya se pueden abrir: ninguno bloqueado ni «próximamente».
  const reachable = reachableSteps(data);
  const followed = firstStep(data, referenceDone);
  const wanted = chosen ?? followed;
  const current = reachable.includes(wanted) ? wanted : reachable[reachable.length - 1];
  const allSteps: Step<FlowStep>[] = [
    { key: "referencia", label: "Referencia", icon: Film, done: referenceDone },
    { key: "desglose", label: "Desglose", icon: ScanSearch, done: breakdownDone },
    { key: "imagen", label: "Imagen", icon: ImageIcon, done: data.frame.approvedResultId !== null },
    { key: "clip", label: "Clip", icon: Clapperboard, done: data.clip.approvedResultId !== null },
    { key: "montaje", label: "Montaje", icon: Scissors, done: data.edit.latest !== null },
  ];
  // «Desglose» no se enseña (se hace por dentro); solo se abre a propósito con `?paso=desglose`.
  const steps = allSteps.filter((step) => reachable.includes(step.key) && (step.key !== "desglose" || current === "desglose"));
  const spent = data.costs.higgsfieldCredits > 0 || data.costs.claudeMicros > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={back} title={video.title} />

      {!data.mine ? (
        <p role="status" className="flex items-center gap-2.5 rounded-xl bg-info/10 px-4 py-3 text-sm ring-1 ring-info/20">
          <Eye className="size-4 shrink-0 text-info-ink" aria-hidden />
          Este vídeo es de {data.creatorName ?? "otra persona"}. Puedes verlo, pero solo esa persona puede continuarlo.
        </p>
      ) : null}

      <Stepper steps={steps} current={current} onSelect={select} />

      {/* La única pregunta obligatoria con la que se paró (en Imagen y Clip va junto al resultado). */}
      {current !== "imagen" && current !== "clip" ? <AutoQuestion view={data} /> : null}

      {current === "referencia" ? (
        <StepReference view={data} photos={photos} upload={upload.state} onUpload={upload.start} />
      ) : current === "desglose" ? (
        <StepBreakdown view={data} draft={draft} setDraft={setDraft} onGoToReference={() => select("referencia")} />
      ) : current === "imagen" ? (
        <StepFrame view={data} onGoToClip={() => select("clip")} />
      ) : current === "clip" ? (
        <StepClip view={data} onGoToFrame={() => select("imagen")} />
      ) : (
        <StepEdit view={data} />
      )}

      {spent || isOwner ? (
        <footer className="flex flex-col gap-4 border-t pt-5">
          {spent ? <CostSummary costs={data.costs} /> : null}
          {isOwner ? <TechnicalDetails videoId={video.id} /> : null}
        </footer>
      ) : null}
    </div>
  );
}
