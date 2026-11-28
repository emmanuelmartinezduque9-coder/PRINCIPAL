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
    expect(call.mock.calls[0][0]).toMatchObject({ tier: "small", schema: expect.anything() });
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
