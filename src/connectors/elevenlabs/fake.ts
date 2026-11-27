import type { ElevenLabsPort, ElevenLabsDubRequest } from "./port";
export function createFakeElevenLabs(options: { autoComplete?: boolean } = {}) {
  const calls: Array<{ method: string; args: { request?: ElevenLabsDubRequest; dubbingId?: string } }> = [];
  const state = { jobs: {} as Record<string, "dubbed" | "failed" | "processing"> };
  let failure: Error | undefined;
  const port: ElevenLabsPort = {
    async submitDubbing(_userId, request) {
      calls.push({ method: "submitDubbing", args: { request } });
      if (failure) { const error = failure; failure = undefined; throw error; }
      const dubbingId = `dub-${calls.filter((c) => c.method === "submitDubbing").length}`;
      state.jobs[dubbingId] = options.autoComplete ? "dubbed" : "processing";
      return { dubbingId };
    },
    async status(_userId, dubbingId) {
      calls.push({ method: "status", args: { dubbingId } });
      return state.jobs[dubbingId] ?? "failed";
    },
    async audio(_userId, dubbingId) {
      calls.push({ method: "audio", args: { dubbingId } });
      return Buffer.from("VOZ-DOBLADA");
    },
  };
  return { port, state, calls, failNext(_method: "submitDubbing", error: Error) { failure = error; } };
}
export type FakeElevenLabs = ReturnType<typeof createFakeElevenLabs>;
