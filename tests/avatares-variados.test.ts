import { describe, expect, it } from "vitest";
import { pickAvatar, type AvatarUsage, type ChoosableAvatar } from "@/lib/avatar-choice";
import type { ReferencePerson } from "@/lib/video-people";
import { clipManifest, clipPromptFor, imageManifest, importedPeoplePrompt, openingPeoplePrompt, remapPeopleReferences, type ManifestRefs } from "@/server/videos/manifest";
import type { Video } from "@/server/videos/videos";

const target = { group: "mujer", age: 30, source: "referencia", label: null } as const;
const avatars: ChoosableAvatar[] = [1, 2, 3].map((id) => ({ id, name: `mujer ${id}`, number: id, group: "mujer", ageYears: null, tags: ["aleman"] }));
const use = (avatarId: number, productId = 10, usedAt = 1, batchId: number | null = null): AvatarUsage => ({ avatarId, productId, usedAt, batchId });
const people: ReferencePerson[] = [
  { id: "conductora", gender: "mujer", approxAge: 30, notes: "pelo castaño", opening: true, appearances: [{ startS: 0, endS: 2, shot: 1 }] },
  { id: "companera", gender: "mujer", approxAge: 28, notes: "pelo rubio", opening: false, appearances: [{ startS: 2, endS: 5, shot: 2 }, { startS: 7, endS: 9, shot: 4 }] },
];
const video = { avatarMode: "automatico", avatarPhotoId: null, environmentPhotoId: null, frameUse: "start_image", clipModel: "hf_mult_motion_control" } as Video;
const refs: ManifestRefs = { photos: [{ id: 50, role: "articulo", mime: "image/jpeg", size: 1 }], variant: null,
  avatar: { kind: "library", avatarId: 1 }, people, autoAvatars: [{ personId: "conductora", avatarId: 1 }, { personId: "companera", avatarId: 2 }] };

describe("variedad con edades antiguas sin rellenar", () => {
  it("no repite el último del producto aunque sea el menos usado globalmente", () => {
    expect(pickAvatar(target, avatars, ["DE"], { productId: 10, usage: [use(1, 10, 3), use(2, 20), use(2, 20), use(3, 20), use(3, 20)] })?.id).toBe(2);
  });
  it("evita todos los reservados del lote si hay alternativas", () => {
    expect(pickAvatar(target, avatars, ["DE"], { productId: 10, batchId: 7, usage: [use(1, 20, 1, 7), use(2, 30, 1, 7)] })?.id).toBe(3);
  });
  it("cuenta uso local antes del global y respeta sexo y edad", () => {
    expect(pickAvatar(target, avatars, ["DE"], { productId: 10, usage: [use(1, 10, 2), use(2, 10), use(2, 10), use(3, 20)] })?.id).toBe(3);
    expect(pickAvatar({ ...target, age: 70 }, avatars, ["DE"])).toBeNull();
    expect(pickAvatar({ ...target, group: "hombre" }, avatars, ["DE"])).toBeNull();
  });
});

describe("personas y numeración real del manifiesto", () => {
  it("solo apertura en la imagen; todas las personas distintas con sus tiempos en el clip", () => {
    const initial = imageManifest(video, refs);
    expect(initial.filter((i) => i.role === "avatar").map((i) => i.source)).toEqual([{ kind: "avatar", avatarId: 1 }]);
    expect(openingPeoplePrompt(initial, people)).toContain("conductora: image 2");
    const manifest = clipManifest(video, refs);
    expect(manifest.filter((i) => i.role === "avatar").map((i) => i.source)).toEqual([{ kind: "avatar", avatarId: 1 }, { kind: "avatar", avatarId: 2 }]);
    const prompt = clipPromptFor("Use image [2] for identity.", manifest);
    expect(prompt).toContain("image [3] only as the identity of person companera");
    expect(prompt).toContain("2s to 5s, shot 2; 7s to 9s, shot 4");
    expect(prompt).toContain("face distinct");
    expect(prompt).toContain("action, location");
    expect(prompt).toContain("do not add them to the opening");
  });
  it("imagen importada: nunca adjunta avatar de apertura, solo la compañera posterior", () => {
    const manifest = clipManifest(video, { ...refs, importedOpening: true });
    expect(manifest.filter((i) => i.role === "avatar").map((i) => i.source)).toEqual([{ kind: "avatar", avatarId: 2 }]);
    const prompt = clipPromptFor("", manifest) + importedPeoplePrompt(people);
    expect(prompt).toContain("image [2] only as the identity of person companera");
    expect(prompt).toContain("preserve their exact faces");
    expect(prompt).toContain("Person conductora keeps the identity from image [1]");
    const before = clipManifest(video, { ...refs, people: undefined, autoAvatars: undefined });
    expect(remapPeopleReferences("Opening person image [2]; product image [3].", before, manifest, true)).toBe("Opening person image [1]; product image [3].");
    const legacy = clipManifest(video, { ...refs, people: undefined, autoAvatars: undefined, importedOpening: true });
    expect(legacy.some((i) => i.role === "avatar")).toBe(false);
  });
  it("remapea producto al añadir personas sin confundirlo con un retrato", () => {
    const old = clipManifest(video, { ...refs, people: undefined, autoAvatars: undefined });
    const current = clipManifest(video, refs);
    expect(remapPeopleReferences("Product image [3].", old, current)).toBe("Product image [4].");
  });
  it("sin persona en la apertura no añade retrato a la imagen inicial", () => {
    expect(imageManifest(video, { ...refs, people: people.map((p) => ({ ...p, opening: false })) }).some((i) => i.role === "avatar")).toBe(false);
  });
});
