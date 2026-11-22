import { notFound } from "next/navigation";
import { ReviewImages } from "@/components/batches/review-images";

export const metadata = { title: "Revisar imágenes · PRINCIPAL" };

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : null);

export default async function RevisarPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) notFound();
  return <ReviewImages key={id} batchId={id} />;
}
