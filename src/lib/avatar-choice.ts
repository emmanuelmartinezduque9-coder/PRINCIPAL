import { countryTraits, fold, type AvatarGroup } from "@/lib/avatar-groups";

/**
 * Elección automática del avatar («Automático»), en código y siempre igual para los mismos datos:
 *
 * 1. A quién se busca (`avatarTarget`): si las indicaciones del vídeo nombran un público o un
 *    ángulo («abuela», «mamá», «niño», «hombre mayor»…; `audienceFromText`), eso manda; si no, el
 *    público que Claude dice que pide el encargo (`angleAudience`); y lo que falte, de la persona
 *    principal de la referencia (`personaRef`).
 * 2. Entre los avatares no retirados de ese grupo (`mujer`, `hombre`, y `nina`/`nino` por debajo de
 *    13 años): los de edad conocida a ±12 años, prefiriendo los que llevan los rasgos del país del
 *    producto (DE/AT/CH → `aleman`) y después la edad más cercana. Si no hay ninguno y se busca un
 *    adulto de 18 a 55 años, valen los de edad sin poner (la biblioteca es de adultos jóvenes y
 *    medianos). Si aun así no hay, no se adivina: `avatarId = null` y el desglose pregunta.
 */

export type Gender = "mujer" | "hombre";

/** La persona principal de la referencia, según Claude. */
export interface PersonaRef {
  present: boolean;
  gender: "mujer" | "hombre" | "otro" | "desconocido";
  approxAge: number | null;
  notes: string;
}

/** El público o ángulo que pide el encargo, según Claude (`null` si no pide ninguno). */
export interface AngleAudience {
  gender: "mujer" | "hombre" | null;
  approxAge: number | null;
  label: string;
}

export interface AvatarTarget {
  group: AvatarGroup;
  age: number | null;
  /** De dónde sale: las indicaciones (palabra clave), el ángulo que vio Claude o la referencia. */
  source: "indicaciones" | "angulo" | "referencia";
  /** La palabra o el público que lo decidió («abuela»), si lo hay. */
  label: string | null;
}

export interface ChoosableAvatar {
  id: number;
  name: string;
  group: AvatarGroup;
  number: number | null;
  ageYears: number | null;
  tags: string[];
}

export const AGE_TOLERANCE = 12;
const ADULT_MIN = 18;
const ADULT_MAX = 55;
const CHILD_MAX = 12;

/** Palabras que nombran un público o un ángulo (sin tildes ni mayúsculas), en orden de prioridad. */
const AUDIENCES: Array<{ pattern: RegExp; gender: Gender; age: number; label: string }> = [
  { pattern: /\b(abuelas?|abuelitas?|omas?|grossmutter|grossmutti)\b/, gender: "mujer", age: 70, label: "abuela" },
  { pattern: /\b(abuelos?|abuelitos?|opas?|grossvater|grosspapa)\b/, gender: "hombre", age: 70, label: "abuelo" },
  { pattern: /\b(mujer(es)? mayor(es)?|senoras? mayor(es)?|jubiladas?)\b/, gender: "mujer", age: 65, label: "mujer mayor" },
  { pattern: /\b(hombres? mayor(es)?|senor(es)? mayor(es)?|jubilados?)\b/, gender: "hombre", age: 65, label: "hombre mayor" },
  { pattern: /\b(ninas?|nenas?|madchen)\b/, gender: "mujer", age: 8, label: "niña" },
  { pattern: /\b(ninos?|nenes?)\b/, gender: "hombre", age: 8, label: "niño" },
  { pattern: /\b(mamas?|mamis?|madres?|mutter)\b/, gender: "mujer", age: 35, label: "mamá" },
  { pattern: /\b(papas?|papis?|padre|vater)\b/, gender: "hombre", age: 38, label: "papá" },
];

/** El primer público que nombra alguno de los textos (en orden: el vídeo antes que el lote), o `null`. */
export function audienceFromText(texts: Array<string | null | undefined>): { gender: Gender; age: number; label: string } | null {
  for (const text of texts) {
    if (!text) continue;
    const folded = fold(text);
    for (const audience of AUDIENCES) {
      if (audience.pattern.test(folded)) return { gender: audience.gender, age: audience.age, label: audience.label };
    }
  }
  return null;
}

function groupOf(gender: Gender, age: number | null): AvatarGroup {
  if (age !== null && age <= CHILD_MAX) return gender === "mujer" ? "nina" : "nino";
  return gender;
}

const cleanAge = (age: number | null | undefined) => (typeof age === "number" && Number.isFinite(age) && age >= 0 && age <= 120 ? Math.round(age) : null);

/** A quién se busca, o `null` si no se sabe (ni indicaciones, ni ángulo, ni persona en la referencia). */
export function avatarTarget(input: {
  texts: Array<string | null | undefined>;
  personaRef: PersonaRef | null | undefined;
  angleAudience: AngleAudience | null | undefined;
}): AvatarTarget | null {
  const keyword = audienceFromText(input.texts);
  if (keyword) return { group: groupOf(keyword.gender, keyword.age), age: keyword.age, source: "indicaciones", label: keyword.label };

  const ref = input.personaRef?.present ? input.personaRef : null;
  const refGender = ref && (ref.gender === "mujer" || ref.gender === "hombre") ? ref.gender : null;
  const angle = input.angleAudience;
  const angleAge = cleanAge(angle?.approxAge);
  if (angle && (angle.gender !== null || angleAge !== null)) {
    const gender = angle.gender ?? refGender;
    if (gender === null) return null;
    const age = angleAge ?? cleanAge(ref?.approxAge);
    return { group: groupOf(gender, age), age, source: "angulo", label: angle.label.trim() || null };
  }
  if (!refGender) return null;
  const age = cleanAge(ref!.approxAge);
  return { group: groupOf(refGender, age), age, source: "referencia", label: null };
}

const byNumber = (a: ChoosableAvatar, b: ChoosableAvatar) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id;

/**
 * El avatar más parecido de `avatars` (ya sin los retirados) para `target` y los países del
 * producto, o `null` si ninguno encaja.
 */
export function pickAvatar(target: AvatarTarget | null, avatars: ChoosableAvatar[], countries: readonly string[]): ChoosableAvatar | null {
  if (!target) return null;
  const traits = countryTraits(countries);
  const tagged = (avatar: ChoosableAvatar) => (avatar.tags.some((tag) => traits.includes(tag)) ? 0 : 1);
  const group = avatars.filter((avatar) => avatar.group === target.group);
  if (group.length === 0) return null;

  if (target.age === null) {
    const distance = (avatar: ChoosableAvatar) => (avatar.ageYears === null ? 1 : 0);
    return [...group].sort((a, b) => tagged(a) - tagged(b) || distance(a) - distance(b) || byNumber(a, b))[0];
  }
  const age = target.age;
  const near = group.filter((avatar) => avatar.ageYears !== null && Math.abs(avatar.ageYears - age) <= AGE_TOLERANCE);
  if (near.length > 0) {
    const gap = (avatar: ChoosableAvatar) => Math.abs(avatar.ageYears! - age);
    return near.sort((a, b) => tagged(a) - tagged(b) || gap(a) - gap(b) || byNumber(a, b))[0];
  }
  if (age >= ADULT_MIN && age <= ADULT_MAX) {
    const unknown = group.filter((avatar) => avatar.ageYears === null);
    if (unknown.length > 0) return unknown.sort((a, b) => tagged(a) - tagged(b) || byNumber(a, b))[0];
  }
  return null;
}

/**
 * Opciones para la pregunta cuando no encaja ninguno: hasta `limit` avatares, primero los del grupo
 * buscado y después por cercanía de edad (los de edad sin poner, al final).
 */
export function closestAvatarNames(target: AvatarTarget | null, avatars: ChoosableAvatar[], limit = 6): string[] {
  const sameGroup = (avatar: ChoosableAvatar) => (target && avatar.group === target.group ? 0 : 1);
  const age = target?.age ?? null;
  const gap = (avatar: ChoosableAvatar) => (age === null ? 0 : avatar.ageYears === null ? 1000 : Math.abs(avatar.ageYears - age));
  return [...avatars]
    .sort((a, b) => sameGroup(a) - sameGroup(b) || gap(a) - gap(b) || byNumber(a, b))
    .slice(0, limit)
    .map((avatar) => avatar.name);
}
