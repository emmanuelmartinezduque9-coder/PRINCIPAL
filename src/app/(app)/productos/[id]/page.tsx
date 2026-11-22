import { isProductTab } from "@/components/products/labels";
import { ProductDetail } from "@/components/products/product-detail";

export const metadata = { title: "Producto · PRINCIPAL" };

export default async function ProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { pestana } = await searchParams;
  return <ProductDetail key={`${id}-${String(pestana)}`} id={id} initialTab={isProductTab(pestana) ? pestana : "fotos"} />;
}
