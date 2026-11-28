import type { PersonaRef } from "@/lib/avatar-choice";

export interface ReferencePerson extends Omit<PersonaRef, "present"> {
  id: string;
  opening: boolean;
  appearances: Array<{ startS: number; endS: number; shot?: number }>;
}
export interface AutoPersonAvatar {
  personId: string;
  avatarId: number;
}
