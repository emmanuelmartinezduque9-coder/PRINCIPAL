import { runPool } from "./run-pool";

/** El presupuesto de una fila: lo que devuelve `POST /api/videos/[id]/{imagen|clip}/presupuesto`. */
export interface Quote {
  credits: number;
  balance: number;
}

/** El presupuesto de una fila tal como está en la caché: sin pedir aún, bien o con su error. */
export type QuoteState = { ok: true; value: Quote } | { ok: false; error: unknown } | undefined;

export type SendState = { kind: "pending" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Envíos a la vez, como mucho. */
export const PARALLEL = 2;

export const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * Qué se envía: cada fila con presupuesto, con SU precio como `expectedCredits`; las demás se
 * quedan sin enviar con el motivo (el error del presupuesto o, si no lo hay, `fallback`).
 */
export function planSend(
  rows: ReadonlyArray<{ id: number }>,
  quotes: Readonly<Record<number, QuoteState>>,
  fallback: string,
): { send: Array<{ id: number; expectedCredits: number }>; skipped: Record<number, string> } {
  const send: Array<{ id: number; expectedCredits: number }> = [];
  const skipped: Record<number, string> = {};
  for (const row of rows) {
    const quote = quotes[row.id];
    if (quote?.ok) send.push({ id: row.id, expectedCredits: quote.value.credits });
    else skipped[row.id] = quote ? errorText(quote.error, fallback) : fallback;
  }
  return { send, skipped };
}

/**
 * Envía el plan de 2 en 2 (`post` con el id y su `expectedCredits`) y avisa del estado de cada fila.
 * Devuelve, por fila enviada, `null` si fue bien o el mensaje del error; un fallo no para a las demás.
 */
export async function sendPlan(
  send: ReadonlyArray<{ id: number; expectedCredits: number }>,
  post: (id: number, expectedCredits: number) => Promise<unknown>,
  onState: (id: number, state: SendState) => void = () => {},
): Promise<Record<number, string | null>> {
  const results = await runPool(send, PARALLEL, async ({ id, expectedCredits }) => {
    onState(id, { kind: "sending" });
    await post(id, expectedCredits);
  });
  const report: Record<number, string | null> = {};
  send.forEach(({ id }, index) => {
    const result = results[index];
    report[id] = result.ok ? null : errorText(result.error, "No se pudo enviar.");
    onState(id, report[id] === null ? { kind: "sent" } : { kind: "error", message: report[id] as string });
  });
  return report;
}
