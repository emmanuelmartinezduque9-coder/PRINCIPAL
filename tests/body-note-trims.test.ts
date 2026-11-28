import { describe, it, expect, vi } from "vitest";
import { bodyTrimFromNote } from "@/server/videos/body-note-trims";
import type { LlmGateway } from "@/llm/gateway";

function setup(note: string) {
  const call = vi.fn(async (request) => {
    const { boundaries } = JSON.parse(request.content);
    return { data: { trim: { fromS: boundaries.at(-3), toS: boundaries.at(-1) } } };
  });
  const inspect = vi.fn(async () => ({ durationS: 12, cutsS: [2, 5, 9] }));
  return { input: { note, bodyId: 7, userId: 1, productId: 2, inspect, gateway: { call } as unknown as LlmGateway }, call, inspect };
}

describe("indicaciones de cuerpos para montaje", () => {
  it("usa los dos últimos planos y marca el tramo automático", async () => {
    const { input, call } = setup("utiliza del cuerpo los dos últimos clips");
    expect(await bodyTrimFromNote(input)).toEqual({ fromS: 5, toS: 12, automatic: true });
    expect(call).not.toHaveBeenCalled(); // «los dos últimos clips» se calcula con los cortes, sin Claude
  });
  it("no analiza ni sustituye un tramo manual", async () => {
    const { input, call, inspect } = setup("utiliza del cuerpo los dos últimos clips");
    const existing = { fromS: 1, toS: 3 };
    expect(await bodyTrimFromNote({ ...input, existing })).toBe(existing);
    expect(call).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });
  it.each(["", "Texto: oferta de Navidad"])("sin indicaciones de cuerpos conserva el comportamiento: %s", async (note) => {
    const { input, call, inspect } = setup(note);
    expect(await bodyTrimFromNote(input)).toBeUndefined();
    expect(call).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });
  it("ignora tiempos inventados fuera de los cortes sin tumbar el montaje", async () => {
    const { input } = setup("cuerpo: últimos planos");
    input.gateway.call = vi.fn(async () => ({ data: { trim: { fromS: 3, toS: 12 } } })) as unknown as LlmGateway["call"];
    await expect(bodyTrimFromNote(input)).resolves.toBeUndefined();
  });
});

describe("«los N últimos/primeros clips» sin Claude (KreuzKapuze 16)", () => {
  it("calcula el tramo directamente con los cortes", async () => {
    const { lastOrFirstShots } = await import("@/server/videos/body-note-trims");
    const b = [0, 2.917, 4.5, 6, 6.708, 8.042, 10.375, 13.042];
    expect(lastOrFirstShots("del cuerpo que te adjunte solo usa los dos ultimos clips que es donde se lo esta poniendo", b)).toEqual({ fromS: 8.042, toS: 13.042 });
    expect(lastOrFirstShots("usa los 3 primeros planos del cuerpo", b)).toEqual({ fromS: 0, toS: 6 });
    expect(lastOrFirstShots("usa el último clip", b)).toBeNull();
    expect(lastOrFirstShots("nada de cuerpos", b)).toBeNull();
  });
});
