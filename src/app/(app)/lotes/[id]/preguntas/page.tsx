import { notFound } from "next/navigation";
import { BatchQuestions } from "@/components/batches/batch-questions";

export const metadata = { title: "Preguntas del lote · PRINCIPAL" };

const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : null);

export default async function PreguntasPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) notFound();
  return <BatchQuestions key={id} batchId={id} />;
}
