import { ElevenLabsUnknownOutcomeError, type ElevenLabsPort } from "./port";

const BASE = "https://api.elevenlabs.io/v1/dubbing";
export function createElevenLabsPort(options: { apiKey?: string; fetch?: typeof fetch } = {}): ElevenLabsPort {
  const request = async (suffix: string, init: RequestInit = {}) => {
    const key = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("Falta ELEVENLABS_API_KEY");
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(BASE + suffix, {
        ...init, headers: { "xi-api-key": key }, signal: AbortSignal.timeout(120_000), redirect: "error",
      });
    } catch {
      if (init.method === "POST") throw new ElevenLabsUnknownOutcomeError();
      throw new Error("No se pudo conectar con ElevenLabs");
    }
    if (!response.ok) {
      if (init.method === "POST" && response.status >= 500) throw new ElevenLabsUnknownOutcomeError();
      throw new Error(`ElevenLabs HTTP ${response.status}`);
    }
    return response;
  };
  return {
    async submitDubbing(_userId, input) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(input.bytes)], { type: input.contentType }), input.filename);
      for (const [key, value] of Object.entries({
        target_lang: input.targetLanguage, source_lang: "auto", num_speakers: "0",
        watermark: "false", drop_background_audio: "true",
      })) form.append(key, value);
      const response = await request("", { method: "POST", body: form });
      try {
        const data = await response.json();
        if (typeof data.dubbing_id !== "string" || !data.dubbing_id) throw new Error();
        return { dubbingId: data.dubbing_id };
      } catch { throw new ElevenLabsUnknownOutcomeError(); }
    },
    async status(_userId, id, pollSeconds = 15) {
      if (pollSeconds > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(pollSeconds, 15) * 1000));
      const response = await request("/" + encodeURIComponent(id));
      try {
        const data = await response.json();
        if (typeof data.status !== "string") throw new Error();
        return data.status === "dubbed" ? "dubbed" : data.status === "failed" ? "failed" : "processing";
      } catch { throw new Error("Respuesta de estado de ElevenLabs inválida"); }
    },
    async audio(_userId, id, language) {
      const response = await request("/" + encodeURIComponent(id) + "/audio/" + encodeURIComponent(language));
      try { return new Uint8Array(await response.arrayBuffer()); }
      catch { throw new Error("No se pudo descargar el audio de ElevenLabs"); }
    },
  };
}
