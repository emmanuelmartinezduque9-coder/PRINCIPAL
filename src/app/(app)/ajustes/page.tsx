import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Ajustes · PRINCIPAL" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Resultado de la vuelta de Higgsfield (`?higgsfield=conectado|cancelado|error&motivo=…`).
  return <SettingsView result={one(params.higgsfield)} reason={one(params.motivo)} />;
}
