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
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
            <Sparkles className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">PRINCIPAL</span>
            <span className="block text-xs text-muted-foreground">Ángulos de venta</span>
          </span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-xs">
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
      <span className="text-muted-foreground">{label}</span>
      <input
        {...props}
        className="h-11 rounded-lg border bg-background px-3 text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
      />
    </label>
  );
}
