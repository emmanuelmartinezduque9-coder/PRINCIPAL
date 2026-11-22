"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COUNTRY_LABELS, LANGUAGE_LABELS } from "./labels";

export interface ProductValues {
  name: string;
  summary: string;
  language: string;
  countries: string[];
}

/** Campos de un producto (nombre, qué hace, idioma y países), para crearlo y para editarlo. */
export function ProductFields({
  values,
  onChange,
  autoFocus,
}: {
  values: ProductValues;
  onChange: (values: ProductValues) => void;
  autoFocus?: boolean;
}) {
  const set = (patch: Partial<ProductValues>) => onChange({ ...values, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          className="h-10"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={200}
          required
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">Qué hace</Label>
        <Textarea
          id="summary"
          rows={3}
          value={values.summary}
          onChange={(e) => set({ summary: e.target.value })}
          maxLength={1000}
          required
          placeholder="Hace helado en 2 minutos sin hielo"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="language">Idioma</Label>
        <Select value={values.language} onValueChange={(language) => set({ language })}>
          <SelectTrigger id="language" className="w-full data-[size=default]:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Países</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(COUNTRY_LABELS).map(([code, label]) => {
            const on = values.countries.includes(code);
            return (
              <label
                key={code}
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  on ? "border-foreground/70 bg-foreground/[0.04] text-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={on}
                  onChange={(e) =>
                    set({ countries: e.target.checked ? [...values.countries, code] : values.countries.filter((c) => c !== code) })
                  }
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
