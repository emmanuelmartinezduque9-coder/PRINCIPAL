import { notFound } from "next/navigation";
import { isFlowStep } from "@/components/videos/labels";
import { VideoFlow } from "@/components/videos/video-flow";

export const metadata = { title: "Vídeo · PRINCIPAL" };

// Solo dígitos: "1e3" o "12abc" no se convierten en otro id válido.
const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : null);

export default async function VideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; videoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, videoId } = await params;
  const { paso } = await searchParams;
  const productId = parseId(id);
  const video = parseId(videoId);
  if (productId === null || video === null) notFound();
  return <VideoFlow key={video} productId={productId} videoId={video} initialStep={isFlowStep(paso) ? paso : undefined} />;
}
