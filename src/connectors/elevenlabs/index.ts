import { createElevenLabsPort } from "./adapter";
import type { ElevenLabsPort } from "./port";
export * from "./port";
let port: ElevenLabsPort | undefined;
export const getElevenLabs = (): ElevenLabsPort => port ??= createElevenLabsPort();
