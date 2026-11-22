import { isCloud } from "@/lib/cloud-env";
import { createHiggsfieldPort } from "./adapter";
import { createFakeHiggsfield, type FakeHiggsfield } from "./fake";
import type { HiggsfieldPort } from "./port";

export * from "./port";
export {
  clientMetadata,
  completeAuth,
  disconnect,
  HiggsfieldOAuthError,
  HiggsfieldStateError,
  sanitizeOAuthCode,
  startAuth,
} from "./oauth";

/** Modo simulado: solo en el propio ordenador y con `PRINCIPAL_HIGGSFIELD_FAKE=1`. En la nube, nunca. */
export function higgsfieldFakeMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.PRINCIPAL_HIGGSFIELD_FAKE === "1" && !isCloud(env);
}

const holder = globalThis as unknown as { __principalHiggsfield?: HiggsfieldPort; __principalHiggsfieldFake?: FakeHiggsfield };

/** El real; con `PRINCIPAL_HIGGSFIELD_FAKE=1` y fuera de la nube, uno simulado en memoria. */
export function getHiggsfield(): HiggsfieldPort {
  if (higgsfieldFakeMode()) return (holder.__principalHiggsfieldFake ??= createFakeHiggsfield({}, { autoComplete: true })).port;
  return (holder.__principalHiggsfield ??= createHiggsfieldPort());
}
