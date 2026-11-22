import { Copy, Shuffle, UserRoundCheck, UserRoundX, UsersRound, type LucideIcon } from "lucide-react";
import type { AvatarMode, VideoKind } from "@/server/videos/brief";

/** Lo mismo que admite el servidor (`src/server/videos/brief.ts`). */
export const MAX_ADAPTATION = 12_000;
export const MAX_NOTE = 6_000;
export const MAX_PRODUCT_NOTES = 4_000;

export const KINDS: readonly VideoKind[] = ["replicar", "adaptacion_concepto"];

export const KIND_LABELS: Record<VideoKind, { long: string; short: string; icon: LucideIcon }> = {
  replicar: { long: "Replicar vídeo", short: "Replicar", icon: Copy },
  adaptacion_concepto: { long: "Adaptación de concepto", short: "Adaptación", icon: Shuffle },
};

export const AVATAR_MODE_LABELS: Record<AvatarMode, { label: string; icon: LucideIcon }> = {
  elegido: { label: "Avatar", icon: UserRoundCheck },
  sin_sustitucion: { label: "Sin sustitución", icon: UsersRound },
  nadie: { label: "No aparece nadie", icon: UserRoundX },
};

export const kindOf = (value: string): VideoKind => (value === "adaptacion_concepto" ? "adaptacion_concepto" : "replicar");
export const avatarModeOf = (value: string): AvatarMode =>
  value === "sin_sustitucion" || value === "nadie" ? value : "elegido";
