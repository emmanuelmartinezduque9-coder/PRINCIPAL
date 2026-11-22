import { Sparkles } from "lucide-react";

/** Marco común de las pantallas de entrada. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-[25rem]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">PRINCIPAL</span>
            <span className="block text-xs text-muted-foreground">Vídeos y ángulos de venta</span>
          </span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.10)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
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
        className="h-11 rounded-lg border bg-background px-3 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}
