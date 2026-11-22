import { LibraryScreen } from "@/components/library/library-screen";

export const metadata = { title: "Biblioteca · PRINCIPAL" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // `?producto=7`: abre ya filtrada por los cuerpos de ese producto (desde el selector de cuerpos).
  const product = one((await searchParams).producto);
  return <LibraryScreen initialProductId={/^[1-9]\d{0,15}$/.test(product) ? Number(product) : null} />;
}
