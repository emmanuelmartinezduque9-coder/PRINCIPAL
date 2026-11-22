"use client";

import { Check, Sparkles } from "lucide-react";
import { useAvatars } from "@/components/avatars/avatars-screen";
import { avatarImageUrl } from "@/components/avatars/labels";
import { cn } from "@/lib/utils";
import { onRadioKeyDown, radioTabIndex } from "./radio-keys";

/**
 * Los avatares de la biblioteca en casillas: el elegido lleva borde y marca; el que eligió
 * «Automático», una chispa. Un clic elige otro (pasa a «biblioteca»). Los retirados no salen,
 * salvo el que ya lleva el vídeo.
 */
export function LibraryPick({
  selectedId,
  autoId,
  onSelect,
  readOnly,
  dimmed,
}: {
  selectedId: number | null;
  autoId: number | null;
  onSelect: (avatarId: number) => void;
  readOnly?: boolean;
  dimmed?: boolean;
}) {
  const query = useAvatars();
  const options = (query.data?.avatars ?? []).filter((avatar) => !avatar.retired || avatar.id === selectedId || avatar.id === autoId);
  if (options.length === 0) return null;
  const selectedIndex = options.findIndex((avatar) => avatar.id === selectedId);
  return (
    <ul
      role={readOnly ? undefined : "radiogroup"}
      aria-label="Biblioteca de avatares"
      className={cn("grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto p-0.5", dimmed && "opacity-45")}
    >
      {options.map((avatar, index) => {
        const selected = avatar.id === selectedId;
        const auto = avatar.id === autoId;
        const ring = selected ? "ring-3 ring-foreground" : auto ? "ring-2 ring-foreground/60" : "ring-1 ring-foreground/10";
        const title = `${avatar.name}${avatar.ageYears === null ? "" : ` · ${avatar.ageYears}`}`;
        const image = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarImageUrl(avatar.id)} alt="" loading="lazy" className="absolute inset-0 size-full rounded-[inherit] object-cover" />
            {selected || auto ? (
              <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-foreground text-background shadow-sm">
                {selected ? <Check className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
              </span>
            ) : null}
            <span className="absolute inset-x-0 bottom-0 truncate rounded-b-[inherit] bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-0.5 text-[11px] font-medium text-white">
              {avatar.name}
            </span>
          </>
        );
        return (
          <li key={avatar.id}>
            {readOnly ? (
              <div title={title} className={cn("relative aspect-[3/4] rounded-md bg-muted", ring, !selected && !auto && "opacity-40")}>
                {image}
              </div>
            ) : (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={auto ? `${title} (automático)` : title}
                title={title}
                tabIndex={radioTabIndex(index, selectedIndex)}
                onClick={() => !selected && onSelect(avatar.id)}
                onKeyDown={(event) => onRadioKeyDown(event, (next) => onSelect(options[next].id))}
                className={cn(
                  "relative block aspect-[3/4] w-full rounded-md bg-muted transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-3 focus-visible:ring-ring",
                  ring,
                )}
              >
                {image}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
