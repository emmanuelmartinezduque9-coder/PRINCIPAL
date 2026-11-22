import { notFound } from "next/navigation";
import { BatchBoard } from "@/components/batches/batch-board";

export const metadata = { title: "Lote · PRINCIPAL" };

// Solo dígitos: "1e3" o "12abc" no se convierten en otro id válido.
const parseId = (value: string) => (/^[1-9]\d{0,15}$/.test(value) ? Number(value) : null);

export default async function LotePage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) notFound();
  return <BatchBoard key={id} batchId={id} />;
}
