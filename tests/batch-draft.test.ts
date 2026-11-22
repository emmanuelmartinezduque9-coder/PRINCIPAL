import { describe, expect, it } from "vitest";
import { emptyDraft, hasContent, newGroup, parseDraft, serializeDraft, type Draft, type Row } from "@/components/batches/draft";

const row = (over: Partial<Row>): Row => ({
  key: "fila-1",
  source: { type: "link", url: "https://www.instagram.com/reel/abc/" },
  avatar: null,
  variant: null,
  kind: "replicar",
  adaptation: "",
  hookSeconds: 4,
  bodies: [],
  note: "",
  editReference: "",
  song: null,
  open: false,
  error: null,
  ...over,
});

/** Lo que haría `localStorage`: texto JSON de ida y vuelta. */
const roundTrip = (draft: Draft) => parseDraft(JSON.parse(JSON.stringify(serializeDraft(draft))));

describe("borrador de «Nuevo lote»", () => {
  it("un borrador vacío no se guarda ni cuenta como borrador", () => {
    expect(hasContent(emptyDraft())).toBe(false);
    expect(roundTrip(emptyDraft())).toBeNull();
  });

  it("guarda nombre, «Desglosar al subir», grupos y tarjetas tal cual", () => {
    const song = { id: 7, title: "Drop", number: 3, sections: [], durationMs: 1000, dropMs: 200, startMs: 0, mime: "audio/mpeg", size: 10, sha256: "x", createdAt: "2026-11-22T00:00:00.000Z" };
    const draft: Draft = {
      name: "Pedido 55",
      autoAnalyze: false,
      batchId: null,
      groups: [
        {
          ...newGroup(12),
          notes: "Más luz",
          kind: "solo_gancho",
          hookSeconds: 6,
          variant: 5,
          rows: [
            row({ key: "a", kind: "solo_gancho", hookSeconds: 6, bodies: [3, 4], note: "Más corto", avatar: 9, song, open: true, editReference: "https://www.tiktok.com/@a/video/1" }),
            row({ key: "b", kind: "adaptacion_concepto", adaptation: "Para perros", avatar: "nadie" }),
          ],
        },
      ],
    };
    expect(roundTrip(draft)).toEqual(draft);
  });

  it("los archivos no se guardan: vuelven como tarjetas por volver a arrastrar, con su nombre y tamaño", () => {
    const file = new File([new Uint8Array(2048)], "ref.mp4", { type: "video/mp4" });
    const draft: Draft = {
      ...emptyDraft(),
      groups: [{ ...newGroup(1), rows: [row({ key: "f", source: { type: "file", file, preview: "blob:x" }, note: "Nota", error: "Pesa más de 100 MB." })] }],
    };
    const stored = JSON.stringify(serializeDraft(draft));
    expect(stored).not.toContain("blob:");
    const back = parseDraft(JSON.parse(stored))!;
    expect(back.groups[0].rows[0]).toMatchObject({ key: "f", source: { type: "missing", name: "ref.mp4", size: 2048 }, note: "Nota", error: null });
  });

  it("descarta lo que no vale y rellena con los valores por defecto", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ v: 2, name: "x" })).toBeNull();
    const parsed = parseDraft({
      v: 1,
      name: 5,
      batchId: -1,
      groups: [
        {
          productId: "1",
          notes: "Algo",
          kind: "otro",
          hookSeconds: 99,
          rows: [{ source: { type: "file" } }, { source: { type: "link", url: "https://x.test/a" }, avatar: "x", bodies: [1, "2", -3], kind: "solo_gancho" }],
        },
      ],
    })!;
    expect(parsed.name).toBe("");
    expect(parsed.autoAnalyze).toBe(true);
    expect(parsed.batchId).toBeNull();
    expect(parsed.groups[0]).toMatchObject({ productId: null, notes: "Algo", kind: "replicar", hookSeconds: 4, variant: null });
    expect(parsed.groups[0].rows).toHaveLength(1);
    expect(parsed.groups[0].rows[0]).toMatchObject({ avatar: null, bodies: [1], kind: "solo_gancho", editReference: "" });
  });

  it("un lote ya creado a medias se conserva para seguir con «Añadir y subir»", () => {
    expect(roundTrip({ ...emptyDraft(), batchId: 42 })?.batchId).toBe(42);
  });
});
