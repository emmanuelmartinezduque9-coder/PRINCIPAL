import { RuleEditor } from "@/components/rules/rule-editor";

export const metadata = { title: "Regla · PRINCIPAL" };

export default async function ReglaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RuleEditor slug={slug} />;
}
