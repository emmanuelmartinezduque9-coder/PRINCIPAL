"use client";

import { Film } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLIP_MODEL_HINT, CLIP_MODEL_LABEL, CLIP_MODEL_OPTIONS, DEFAULT_CLIP_MODEL_CHOICE, isClipModelChoice, type ClipModelChoice } from "@/lib/clip-models";
import { cn } from "@/lib/utils";

/** Valor del selector del grupo cuando el grupo no elige nada (sus vídeos siguen en «Automático»). */
export const NO_GROUP_CHOICE = "ninguno";

/**
 * «Modelo del vídeo»: cómo se genera la réplica en Higgsfield (las opciones que usaba Emmanuel en
 * Codex). Se guarda al elegir. `resolved`: con «Automático», el modelo con el que sale de verdad.
 */
export function ClipModelSelect({
  value,
  onChange,
  disabled,
  id,
  label = "Modelo del vídeo",
  compact = false,
  allowNone = false,
  inherited,
}: {
  value: string;
  onChange: (next: ClipModelChoice | null) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
  compact?: boolean;
  /** En el grupo del lote: «Sin elegir» (cada vídeo con lo suyo). */
  allowNone?: boolean;
  /** Con «Automático», el modelo que hereda del grupo (se enseña «Del grupo · …»). */
  inherited?: ClipModelChoice;
}) {
  // `auto` (de antes) se enseña como el de por defecto, Motion Transfer.
  const fromGroup = value === "auto" && inherited !== undefined && inherited !== "auto";
  const shown = value === "auto" && !fromGroup ? DEFAULT_CLIP_MODEL_CHOICE : value;
  return (
    <Select
      value={shown}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === shown) return;
        if (allowNone && next === NO_GROUP_CHOICE) onChange(null);
        else if (isClipModelChoice(next)) onChange(next);
      }}
    >
      <SelectTrigger id={id} aria-label={label} className={cn(compact ? "h-8 w-auto gap-1.5 px-2.5 text-sm" : "w-full data-[size=default]:h-10")}>
        {compact ? <Film className="size-3.5 text-muted-foreground" aria-hidden /> : null}
        {fromGroup ? <span className="text-muted-foreground">Del grupo · {CLIP_MODEL_LABEL[inherited!].replace("Genjutsu · ", "")}</span> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NO_GROUP_CHOICE}>Modelo: sin elegir</SelectItem> : null}
        {CLIP_MODEL_OPTIONS.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {compact && !allowNone ? CLIP_MODEL_LABEL[choice] : allowNone ? `Modelo: ${CLIP_MODEL_LABEL[choice]}` : CLIP_MODEL_LABEL[choice]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** La línea bajo el selector: qué hace el modelo y, con «Automático», con cuál sale. */
export function clipModelHint(choice: string, resolved: string): string {
  const hint = isClipModelChoice(choice) ? CLIP_MODEL_HINT[choice] : "";
  if (choice !== "auto") return hint;
  return isClipModelChoice(resolved) ? `Sale con ${CLIP_MODEL_LABEL[resolved]}. ${hint}` : hint;
}
