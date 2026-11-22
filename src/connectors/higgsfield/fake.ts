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
  /** La próxima llamada a ese método lanza `error`. */
  failNext(method: keyof HiggsfieldPort, error: Error): void;
}

/** Por defecto 1 000 créditos, plan "plus". */
export function createFakeHiggsfield(initial: Partial<FakeHiggsfield["state"]> = {}): FakeHiggsfield {
  const calls: FakeHiggsfield["calls"] = [];
  const state = { credits: 1000, plan: "plus" as string | null, ...initial };
  const failures = new Map<keyof HiggsfieldPort, Error>();

  function record(method: keyof HiggsfieldPort, userId: number, args: unknown): void {
    calls.push({ method, userId, args });
    const error = failures.get(method);
    if (error) {
      failures.delete(method);
      throw error;
    }
  }

  const port: HiggsfieldPort = {
    async balance(userId) {
      record("balance", userId, {});
      return { credits: state.credits, plan: state.plan };
    },
    async diagnostics(userId) {
      record("diagnostics", userId, {});
      return { simulado: true, tools: ["balance"], balance: { credits: state.credits, plan: state.plan } };
    },
  };

  return { port, calls, state, failNext: (method, error) => void failures.set(method, error) };
}
