import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { LlmGateway } from "@/llm/gateway";
import type { PinCandidate } from "@/server/pinterest-searches";
const mock = vi.hoisted(() => ({ store: vi.fn() }));
vi.mock("@/server/avatars", () => ({ storeRealAvatar: mock.store }));
vi.mock("@/server/media/ffmpeg", () => ({ makeThumbnail: async (b: Buffer) => b }));
import { findRealAvatar } from "@/server/videos/pinterest";
const photo = Buffer.from("real Pinterest photograph");
const candidate: PinCandidate = { pinId: "real-pin", imageUrl: "https://i.pinimg.com/originals/portrait.jpg", thumbUrl: "https://i.pinimg.com/474x/portrait.jpg", mediumUrl: null, width: 1200, height: 1800, title: "selfie" };
const input = { target: { group: "mujer", age: 25, source: "referencia", label: null } as const, countries: ["DE"], userId: 1, productId: 2, key: "avatar:1:a" };
beforeEach(() => { vi.resetAllMocks(); mock.store.mockResolvedValue({ avatar: { id: 90 } }); });
describe("Pinterest: solo fotos reales elegidas con visión", () => {
  it("busca sexo/edad/mercado, descarta horizontal y guarda edad, grupo, etiquetas y procedencia", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ready", candidates: [{ ...candidate, width: 1800, height: 1200 }, candidate] });
    const call = vi.fn().mockResolvedValue({ data: { n: 1, age: 26, description: "Pelo castaño, luz cotidiana" } });
    const fetchImage = vi.fn().mockResolvedValue(photo);
    expect(await findRealAvatar(input, { search, fetchImage, gateway: { call } as unknown as LlmGateway })).toEqual({ id: 90 });
    expect(search.mock.calls[0][0]).toContain("deutsche German Frau woman 25 selfie iphone");
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].instructions).toContain("Rechaza IA");
    expect(mock.store).toHaveBeenCalledWith(1, photo, expect.objectContaining({ group: "mujer", ageYears: 26, tags: expect.arrayContaining(["aleman", "de", "foto_real"]), description: expect.stringContaining(candidate.imageUrl) }));
  });
  it("si visión rechaza todas, no guarda ni genera una cara", async () => {
    const call = vi.fn().mockResolvedValue({ data: { n: 0, age: 25, description: "IA" } });
    await expect(findRealAvatar(input, { search: vi.fn().mockResolvedValue({ status: "ready", candidates: [candidate] }), fetchImage: async () => photo, gateway: { call } as unknown as LlmGateway })).rejects.toThrow("Ningún retrato real");
    expect(mock.store).not.toHaveBeenCalled();
  });
  it("excluye la foto de una persona ya usada por su huella antes de elegir", async () => {
    await expect(findRealAvatar({ ...input, excludedHashes: [createHash("sha256").update(photo).digest("hex")] }, { search: vi.fn().mockResolvedValue({ status: "ready", candidates: [candidate] }), fetchImage: async () => photo })).rejects.toThrow("no se inventan caras");
    expect(mock.store).not.toHaveBeenCalled();
  });
});
