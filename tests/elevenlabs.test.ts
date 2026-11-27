import { describe, expect, it, vi } from "vitest";
import { createElevenLabsPort } from "@/connectors/elevenlabs/adapter";
import { ElevenLabsUnknownOutcomeError } from "@/connectors/elevenlabs";

const input = { bytes: Buffer.from("solo voz"), filename: "dialogue-only.mp4", contentType: "video/mp4", targetLanguage: "de" };

describe("ElevenLabs Dubbing API", () => {
  it("envía multipart de solo voz, consulta estado y descarga con autenticación", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ dubbing_id: "dub-1" }))
      .mockResolvedValueOnce(Response.json({ status: "dubbing" }))
      .mockResolvedValueOnce(Response.json({ status: "dubbed" }))
      .mockResolvedValueOnce(new Response("voz alemana"));
    const port = createElevenLabsPort({ apiKey: "clave-privada", fetch: transport });
    expect(await port.submitDubbing(1, input)).toEqual({ dubbingId: "dub-1" });
    expect(await port.status(1, "dub-1", 0)).toBe("processing");
    expect(await port.status(1, "dub-1", 0)).toBe("dubbed");
    expect(Buffer.from(await port.audio(1, "dub-1", "de")).toString()).toBe("voz alemana");
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "https://api.elevenlabs.io/v1/dubbing",
      "https://api.elevenlabs.io/v1/dubbing/dub-1",
      "https://api.elevenlabs.io/v1/dubbing/dub-1",
      "https://api.elevenlabs.io/v1/dubbing/dub-1/audio/de",
    ]);
    for (const [, init] of transport.mock.calls) {
      expect(init?.headers).toEqual({ "xi-api-key": "clave-privada" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.redirect).toBe("error");
    }
    const form = transport.mock.calls[0][1]?.body as FormData;
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== "file"))).toEqual({
      target_lang: "de", source_lang: "auto", num_speakers: "0", watermark: "false", drop_background_audio: "true",
    });
    expect(await (form.get("file") as File).text()).toBe("solo voz");
  });

  it("un envío con timeout o respuesta sin identificador queda dudoso, sin reintentar ni filtrar secretos", async () => {
    for (const response of [() => Promise.reject(new Error("clave-privada cuerpo-remoto")), () => Promise.resolve(Response.json({}))]) {
      const transport = vi.fn<typeof fetch>(response);
      const port = createElevenLabsPort({ apiKey: "clave-privada", fetch: transport });
      await expect(port.submitDubbing(1, input)).rejects.toBeInstanceOf(ElevenLabsUnknownOutcomeError);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it("no expone cuerpos remotos y reconoce failed", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("clave-privada cuerpo-remoto", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ status: "failed", error: "cuerpo-remoto" }));
    const port = createElevenLabsPort({ apiKey: "clave-privada", fetch: transport });
    await expect(port.submitDubbing(1, input)).rejects.toThrow("ElevenLabs HTTP 401");
    expect(await port.status(1, "dub-1", 0)).toBe("failed");
  });
});
