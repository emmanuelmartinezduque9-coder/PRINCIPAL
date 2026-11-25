"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { PHOTO_ROLE_LABELS } from "@/components/products/labels";
import { Textarea } from "@/components/ui/textarea";
import type { PhotoRole } from "@/lib/photo-roles";
import { cn } from "@/lib/utils";
import type { ManifestItem } from "@/server/videos/manifest";
import type { PromptIssue } from "@/server/videos/prompt-check";

/** Miles con punto, como en español (4.873). */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const MANIFEST_ROLE: Record<ManifestItem["role"], string> = {
  composicion: "Composición",
  video_referencia: "Referencia",
  imagen_aprobada: "Imagen aprobada",
  pinterest: "Referencia de Pinterest",
  referencia: "Referencia subida a mano",
  ...(PHOTO_ROLE_LABELS as Record<PhotoRole, string>),
};

/**
 * Un prompt editable con sus referencias (qué es cada «image N» / «@ImageN»), su contador de
 * caracteres (en ámbar fuera del margen que piden las reglas) y, debajo, sus errores y avisos.
 */
export function PromptEditor({
  label,
  value,
  onChange,
  issues,
  manifest,
  range,
  readOnly,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues: PromptIssue[];
  manifest: ManifestItem[];
  /** Margen de caracteres recomendado: `[mínimo, máximo]`. */
  range: [number, number];
  readOnly?: boolean;
  /** Ctrl/⌘ + Intro guarda. */
  onSubmit?: () => void;
}) {
  const id = useId();
  const length = value.length;
  const outside = length < range[0] || length > range[1];
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "aviso");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <span
          className={cn("text-xs tabular-nums", outside ? "font-medium text-warning-ink" : "text-muted-foreground")}
          title={range[0] > 0 ? `Entre ${thousands(range[0])} y ${thousands(range[1])} caracteres` : `Hasta ${thousands(range[1])} caracteres`}
          data-testid="char-count"
        >
          {thousands(length)} / {range[0] > 0 ? `${thousands(range[0])}–${thousands(range[1])}` : thousands(range[1])}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label={`Referencias de ${label.toLowerCase()}`}>
        {manifest.map((item) => (
          <li key={item.tag} className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-xs">
            <span className="font-mono font-medium">{item.tag}</span>
            <span className="text-muted-foreground">{item.ownerSelected || item.role === "entorno" ? "Tu imagen de entorno (manda)" : MANIFEST_ROLE[item.role]}</span>
          </li>
        ))}
      </ul>
      <Textarea
        id={id}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        aria-invalid={errors.length > 0 || undefined}
        aria-describedby={issues.length > 0 ? `${id}-avisos` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (onSubmit && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className="h-72 resize-y leading-relaxed md:text-[13px]"
      />
      {issues.length > 0 ? (
        <ul id={`${id}-avisos`} className="flex flex-col gap-1" aria-live="polite">
          {[...errors, ...warnings].map((issue) => (
            <li key={`${issue.level}-${issue.message}`} className="flex gap-2 text-sm">
              {issue.level === "error" ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" role="img" aria-label="Error" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" role="img" aria-label="Aviso" />
              )}
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
