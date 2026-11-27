export interface ElevenLabsDubRequest {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  targetLanguage: string;
}
export interface ElevenLabsPort {
  submitDubbing(userId: number, request: ElevenLabsDubRequest): Promise<{ dubbingId: string }>;
  status(userId: number, dubbingId: string, pollSeconds?: number): Promise<"dubbed" | "failed" | "processing">;
  audio(userId: number, dubbingId: string, language: string): Promise<Uint8Array>;
}
export class ElevenLabsUnknownOutcomeError extends Error {
  constructor() { super("No se sabe si ElevenLabs recibió el doblaje"); }
}
