import { Brand } from "@/components/shell/brand";

/** Marco común de las pantallas de entrada. */
export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-[25rem]">
        <Brand className="mb-6 justify-center" />
        <div className="rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.10)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function AuthField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        {...props}
        className="h-11 rounded-lg border bg-background px-3 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}
