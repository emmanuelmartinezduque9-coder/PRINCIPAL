import { cn } from "@/lib/utils";

/** Monograma de PRINCIPAL: una «P» de trazo grueso sobre un cuadrado oscuro. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path
        d="M11.5 24V8.5h6.25a4.75 4.75 0 0 1 0 9.5H11.5"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-background"
      />
    </svg>
  );
}

/** Logotipo completo: monograma y nombre. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-[0.08em]">PRINCIPAL</span>
    </span>
  );
}
