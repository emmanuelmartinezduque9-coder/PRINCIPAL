import { Copy, FishingHook, Shuffle, UserRoundCheck, UserRoundX, UsersRound, type LucideIcon } from "lucide-react";
import type { AvatarMode, VideoKind } from "@/server/videos/brief";

/** Lo mismo que admite el servidor (`src/server/videos/brief.ts`). */
export const MAX_ADAPTATION = 12_000;
export const MAX_NOTE = 6_000;
export const MAX_PRODUCT_NOTES = 4_000;
export const MIN_HOOK_SECONDS = 2;
export const MAX_HOOK_SECONDS = 8;
export const DEFAULT_HOOK_SECONDS = 4;
/** Cuerpos que puede llevar un vídeo «Solo gancho» (`MAX_VIDEO_BODIES` en el servidor). */
export const MAX_VIDEO_BODIES = 10;

export const KINDS: readonly VideoKind[] = ["replicar", "adaptacion_concepto", "solo_gancho"];

export const KIND_LABELS: Record<VideoKind, { long: string; short: string; icon: LucideIcon }> = {
  replicar: { long: "Replicar vídeo", short: "Replicar", icon: Copy },
  adaptacion_concepto: { long: "Adaptación de concepto", short: "Adaptación", icon: Shuffle },
  solo_gancho: { long: "Solo gancho", short: "Gancho", icon: FishingHook },
};

export const AVATAR_MODE_LABELS: Record<AvatarMode, { label: string; icon: LucideIcon }> = {
  elegido: { label: "Avatar", icon: UserRoundCheck },
  sin_sustitucion: { label: "Sin sustitución", icon: UsersRound },
  nadie: { label: "No aparece nadie", icon: UserRoundX },
};

export const kindOf = (value: string): VideoKind => (value === "adaptacion_concepto" || value === "solo_gancho" ? value : "replicar");
export const avatarModeOf = (value: string): AvatarMode =>
  value === "sin_sustitucion" || value === "nadie" ? value : "elegido";
