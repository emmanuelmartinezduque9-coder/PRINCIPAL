import { ProductDetail } from "@/components/products/product-detail";

export const metadata = { title: "Producto · PRINCIPAL" };

export default async function ProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetail id={id} />;
}
