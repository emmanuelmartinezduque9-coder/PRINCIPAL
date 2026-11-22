import { describe, expect, it } from "vitest";
import { audienceFromText, avatarTarget, closestAvatarNames, pickAvatar, type ChoosableAvatar, type PersonaRef } from "@/lib/avatar-choice";
import { countryTraits, normalizeTag } from "@/lib/avatar-groups";

/** La elección automática del avatar: en código, siempre igual para los mismos datos. */

let next = 0;
const avatar = (over: Partial<ChoosableAvatar> & Pick<ChoosableAvatar, "group">): ChoosableAvatar => {
  next += 1;
  return { id: next, name: `${over.group} ${next}`, number: next, ageYears: null, tags: [], ...over };
};

const ref = (gender: PersonaRef["gender"], approxAge: number | null): PersonaRef => ({ present: true, gender, approxAge, notes: "" });
const target = (personaRef: PersonaRef | null, texts: string[] = [], angleAudience: Parameters<typeof avatarTarget>[0]["angleAudience"] = null) =>
  avatarTarget({ texts, personaRef, angleAudience });

describe("a quién se busca", () => {
  it("sin indicaciones: el sexo y la edad de la persona de la referencia", () => {
    expect(target(ref("mujer", 31))).toEqual({ group: "mujer", age: 31, source: "referencia", label: null });
    expect(target(ref("hombre", 9))).toMatchObject({ group: "nino", age: 9 });
  });

  it("si la referencia no muestra a nadie (o no se sabe el sexo) y nada lo pide, no hay a quién buscar", () => {
    expect(target({ present: false, gender: "desconocido", approxAge: null, notes: "" })).toBeNull();
    expect(target(ref("desconocido", 30))).toBeNull();
    expect(target(null)).toBeNull();
  });

  it("una palabra de público en las indicaciones manda sobre la referencia: «abuelas» es una abuela aunque la referencia muestre a alguien de 30", () => {
    expect(target(ref("mujer", 30), ["Para abuelas que hacen helado con los nietos"])).toEqual({
      group: "mujer",
      age: 70,
      source: "indicaciones",
      label: "abuela",
    });
    expect(target(ref("mujer", 30), ["Ángulo: hombre mayor jubilado"])).toMatchObject({ group: "hombre", age: 65 });
    expect(target(ref("hombre", 40), ["que lo use una niña"])).toMatchObject({ group: "nina", age: 8 });
    expect(target(ref("hombre", 40), ["Pensado para mamás ocupadas"])).toMatchObject({ group: "mujer", age: 35, label: "mamá" });
  });

  it("el vídeo va antes que el lote: el primer texto con un público decide", () => {
    expect(audienceFromText([null, "para abuelos", "para mamás"])).toMatchObject({ label: "abuelo" });
    expect(audienceFromText(["sin público", "", "para mamás"])).toMatchObject({ label: "mamá" });
    expect(audienceFromText(["Ein Junge hält das Glas", "padres e hijos"])).toBeNull();
  });

  it("sin palabra clave, el público que Claude ve en el encargo manda y lo que falte sale de la referencia", () => {
    expect(target(ref("mujer", 30), [], { gender: "mujer", approxAge: 68, label: "Omas" })).toEqual({
      group: "mujer",
      age: 68,
      source: "angulo",
      label: "Omas",
    });
    expect(target(ref("hombre", 45), [], { gender: null, approxAge: 25, label: "estudiantes" })).toMatchObject({ group: "hombre", age: 25 });
    // La palabra clave gana a lo que diga Claude.
    expect(target(ref("mujer", 30), ["para abuelos"], { gender: "mujer", approxAge: 30, label: "x" })).toMatchObject({ group: "hombre", age: 70 });
  });
});

describe("qué avatar", () => {
  const mujer25 = avatar({ group: "mujer", ageYears: 25 });
  const mujer34 = avatar({ group: "mujer", ageYears: 34 });
  const mujer38Aleman = avatar({ group: "mujer", ageYears: 38, tags: ["aleman"] });
  const mujer70 = avatar({ group: "mujer", ageYears: 70, tags: ["aleman"] });
  const hombre30 = avatar({ group: "hombre", ageYears: 30 });
  const hombreSinEdad = avatar({ group: "hombre" });
  const all = [mujer25, mujer34, mujer38Aleman, mujer70, hombre30, hombreSinEdad];

  it("el mismo sexo y la edad más cercana", () => {
    expect(pickAvatar({ group: "mujer", age: 33, source: "referencia", label: null }, all, ["IT"])).toBe(mujer34);
    expect(pickAvatar({ group: "hombre", age: 33, source: "referencia", label: null }, all, ["IT"])).toBe(hombre30);
  });

  it("prefiere los rasgos del país (DE/AT/CH → aleman) dentro del margen de edad", () => {
    expect(countryTraits(["DE", "AT"])).toEqual(["aleman"]);
    expect(pickAvatar({ group: "mujer", age: 33, source: "referencia", label: null }, all, ["DE"])).toBe(mujer38Aleman);
    // Fuera del margen (±12 años) el rasgo no basta.
    expect(pickAvatar({ group: "mujer", age: 22, source: "referencia", label: null }, all, ["DE"])).toBe(mujer25);
  });

  it("una abuela es la de 70, nunca una de 30 aunque la referencia fuera joven", () => {
    const t = target(ref("mujer", 30), ["für Omas"]);
    expect(pickAvatar(t, all, ["DE"])).toBe(mujer70);
    expect(pickAvatar(t, all.filter((a) => a !== mujer70), ["DE"])).toBeNull();
  });

  it("los de edad sin poner valen para un adulto de 18 a 55, no para un mayor ni para un niño", () => {
    expect(pickAvatar({ group: "hombre", age: 50, source: "referencia", label: null }, [hombreSinEdad], ["DE"])).toBe(hombreSinEdad);
    expect(pickAvatar({ group: "hombre", age: 70, source: "indicaciones", label: "abuelo" }, [hombreSinEdad], ["DE"])).toBeNull();
    expect(pickAvatar({ group: "nino", age: 8, source: "indicaciones", label: "niño" }, all, ["DE"])).toBeNull();
  });

  it("sin nadie a quién buscar o sin avatares de ese grupo, ninguno (no se adivina)", () => {
    expect(pickAvatar(null, all, ["DE"])).toBeNull();
    expect(pickAvatar({ group: "nina", age: 8, source: "indicaciones", label: "niña" }, all, ["DE"])).toBeNull();
  });

  it("siempre igual: a igualdad, el número más bajo", () => {
    const a = avatar({ group: "mujer", ageYears: 30, number: 5 });
    const b = avatar({ group: "mujer", ageYears: 30, number: 2 });
    const t = { group: "mujer" as const, age: 30, source: "referencia" as const, label: null };
    expect(pickAvatar(t, [a, b], ["DE"])).toBe(b);
    expect(pickAvatar(t, [b, a], ["DE"])).toBe(b);
  });

  it("las opciones de la pregunta: primero su grupo y por cercanía de edad", () => {
    const t = { group: "mujer" as const, age: 68, source: "indicaciones" as const, label: "abuela" };
    expect(closestAvatarNames(t, all, 3)).toEqual([mujer70.name, mujer38Aleman.name, mujer34.name]);
    expect(closestAvatarNames(null, all, 2)).toEqual([mujer25.name, mujer34.name]);
  });
});

it("los rasgos se guardan en minúsculas y sin tildes", () => {
  expect(normalizeTag(" Alemán ")).toBe("aleman");
  expect(normalizeTag("Nórdico claro")).toBe("nordico_claro");
  expect(normalizeTag("¿?")).toBe("");
});
