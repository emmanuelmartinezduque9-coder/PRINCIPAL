import type { HiggsfieldPort } from "./port";

/**
 * Higgsfield simulado en memoria: lo usan las pruebas y el modo local
 * (`PRINCIPAL_HIGGSFIELD_FAKE=1`, nunca en la nube). No sabe nada de permisos: quien lo usa ya
 * comprobó que la persona está conectada.
 */

export interface FakeHiggsfield {
  port: HiggsfieldPort;
  calls: Array<{ method: string; userId: number; args: unknown }>;
  state: { credits: number; plan: string | null };
  /**
   * La próxima llamada a ese método lanza `error`. Llamarlo varias veces encadena fallos: cada
   * llamada al método consume el primero que quede.
   */
  failNext(method: keyof HiggsfieldPort, error: Error): void;
}

/** Por defecto 1 000 créditos, plan "plus". `uploadMedia` devuelve `media-1`, `media-2`… en orden. */
export function createFakeHiggsfield(initial: Partial<FakeHiggsfield["state"]> = {}): FakeHiggsfield {
  const calls: FakeHiggsfield["calls"] = [];
  const state = { credits: 1000, plan: "plus" as string | null, ...initial };
  const failures = new Map<keyof HiggsfieldPort, Error[]>();
  let uploads = 0;

  function record(method: keyof HiggsfieldPort, userId: number, args: unknown): void {
    calls.push({ method, userId, args });
    const error = failures.get(method)?.shift();
    if (error) throw error;
  }

  const port: HiggsfieldPort = {
    async balance(userId) {
      record("balance", userId, {});
      return { credits: state.credits, plan: state.plan };
    },
    async uploadMedia(userId, file) {
      record("uploadMedia", userId, { ...file });
      uploads += 1;
      return { mediaId: `media-${uploads}` };
    },
    async diagnostics(userId) {
      record("diagnostics", userId, {});
      return { tools: ["balance"], balance: { credits: state.credits, plan: state.plan } };
    },
  };

  return {
    port,
    calls,
    state,
    failNext: (method, error) => void failures.set(method, [...(failures.get(method) ?? []), error]),
  };
}
