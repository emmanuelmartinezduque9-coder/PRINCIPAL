import { cn } from "@/lib/utils";

/** Fracción gastada del tope, de 0 a 1 (con tope 0 cuenta como agotado). */
export function capFraction(spentMicros: number, capMicros: number): number {
  if (capMicros <= 0) return 1;
  return Math.min(1, Math.max(0, spentMicros / capMicros));
}

export type CapTone = "ok" | "warn" | "full";

/** Verde hasta el 80 %, ámbar desde el 80 % y rojo al llegar al 100 %. */
export function capTone(spentMicros: number, capMicros: number): CapTone {
  if (capMicros <= 0 || spentMicros >= capMicros) return "full";
  return spentMicros / capMicros >= 0.8 ? "warn" : "ok";
}

export const TONE_FILL: Record<CapTone, string> = {
  ok: "bg-emerald-600 dark:bg-emerald-500",
  warn: "bg-amber-500",
  full: "bg-red-600 dark:bg-red-500",
};

/** Barra de gasto frente a un tope. `label` es lo que lee un lector de pantalla. */
export function CapBar({
  spentMicros,
  capMicros,
  label,
  className,
}: {
  spentMicros: number;
  capMicros: number;
  label: string;
  className?: string;
}) {
  const fraction = capFraction(spentMicros, capMicros);
  const tone = capTone(spentMicros, capMicros);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      data-tone={tone}
      className={cn("h-3 w-full overflow-hidden rounded-full bg-foreground/[0.08]", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", TONE_FILL[tone])}
        // Un gasto mínimo sigue viéndose como un trazo.
        style={{ width: `${spentMicros > 0 ? Math.max(fraction * 100, 1.5) : 0}%` }}
      />
    </div>
  );
}
