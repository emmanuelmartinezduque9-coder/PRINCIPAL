import { beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import type { AuthUser } from "@/server/auth";
import { analysisInstructions } from "@/server/videos/analysis";
import { analysisStaleness, briefOf, checkKindInput, isVideoKind, type BriefSource } from "@/server/videos/brief";
import { clipDurationSeconds } from "@/server/videos/clip";
import { createVideo, getVideoFor, referenceOutdated, segmentMsFor, updateVideoChoices } from "@/server/videos/videos";
import { PUT as putVideo } from "@/app/api/videos/[videoId]/route";
import { makeProduct, makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

/** El tipo «Solo gancho»: validación, tramo de la referencia, desglose y cuándo deja de valer. */

const source = (over: Partial<BriefSource> = {}): BriefSource & { referenceMediaId: string | null } => ({
  kind: "replicar",
  avatarMode: "elegido",
  note: null,
  adaptation: null,
  hookSeconds: 4,
  productNotes: null,
  referenceMediaId: "media-1",
  ...over,
});

describe("tipo «Solo gancho»: validación", () => {
  let ana: AuthUser;
  let videoId: number;

  beforeEach(async () => {
    await truncateAll();
    ana = await makeUser("colaborador");
    videoId = (await createVideo(ana, (await makeProduct(ana)).id)).id;
  });

  it("es uno de los tres tipos; otro valor, 400", async () => {
    expect(["replicar", "adaptacion_concepto", "solo_gancho"].every(isVideoKind)).toBe(true);
    expect(isVideoKind("solo_cuerpo")).toBe(false);
    expect((await updateVideoChoices(ana, videoId, { kind: "solo_gancho" })).kind).toBe("solo_gancho");
    await expect(updateVideoChoices(ana, videoId, { kind: "solo_cuerpo" })).rejects.toMatchObject({ status: 400 });
    // La base de datos tampoco admite otro tipo.
    await expect(getPool().query("update videos set kind = 'solo_cuerpo' where id = $1", [videoId])).rejects.toThrow(/videos_kind_valid/);
    await expect(getPool().query("update videos set kind = 'solo_gancho' where id = $1", [videoId])).resolves.toBeDefined();
  });

  it("el gancho dura de 2 a 8 segundos enteros; por defecto, 4", async () => {
    expect((await getVideoFor(ana, videoId)).hookSeconds).toBe(4);
    for (const seconds of [2, 8, 5]) {
      expect((await updateVideoChoices(ana, videoId, { hookSeconds: seconds })).hookSeconds).toBe(seconds);
    }
    for (const bad of [1, 9, 0, -3, 3.5, "4", null, Number.NaN]) {
      await expect(updateVideoChoices(ana, videoId, { hookSeconds: bad })).rejects.toMatchObject({
        status: 400,
        message: "El gancho dura entre 2 y 8 segundos.",
      });
    }
    expect((await getVideoFor(ana, videoId)).hookSeconds).toBe(5);
    await expect(getPool().query("update videos set hook_seconds = 9 where id = $1", [videoId])).rejects.toThrow(/videos_hook_seconds_valid/);
    expect(checkKindInput({ kind: "solo_gancho", hookSeconds: 3 })).toEqual({ kind: "solo_gancho", hookSeconds: 3 });
  });

  it("la adaptación sigue siendo solo de «Adaptación de concepto»", async () => {
    await expect(updateVideoChoices(ana, videoId, { kind: "solo_gancho", adaptation: "Una idea" })).rejects.toMatchObject({ status: 400 });
  });

  it("PUT /api/videos/[id] guarda el tipo y la duración del gancho", async () => {
    process.env.PRINCIPAL_AUTH = "off";
    try {
      // Sin inicio de sesión manda el dueño local (id 0): el vídeo tiene que ser suyo.
      const local: AuthUser = { id: 0, email: "local", name: "Este ordenador", role: "dueno" };
      const own = await createVideo(local, (await makeProduct(local)).id);
      const params = { params: Promise.resolve({ videoId: String(own.id) }) };
      const put = (body: unknown) => putVideo(new Request("http://localhost/api/videos/x", { method: "PUT", body: JSON.stringify(body) }), params);
      const ok = await put({ kind: "solo_gancho", hookSeconds: 6 });
      expect(ok.status).toBe(200);
      expect((await ok.json()).video).toMatchObject({ kind: "solo_gancho", hookSeconds: 6, bodyClipIds: [] });
      expect((await put({ hookSeconds: 12 })).status).toBe(400);
      expect((await put({ bodyClipIds: [123] })).status).toBe(400);
    } finally {
      delete process.env.PRINCIPAL_AUTH;
    }
  });
});

describe("tipo «Solo gancho»: tramo de la referencia", () => {
  const video = (over: Record<string, unknown> = {}) => ({
    kind: "replicar",
    hookSeconds: 4,
    referenceStatus: "ready",
    referenceDurationMs: 12_000 as number | null,
    segmentDurationMs: 12_000 as number | null,
    ...over,
  });

  it("el tramo es min(duración, gancho); sin «Solo gancho», hasta 30 s", () => {
    expect(segmentMsFor({ kind: "solo_gancho", hookSeconds: 4 }, 12_000)).toBe(4000);
    expect(segmentMsFor({ kind: "solo_gancho", hookSeconds: 8 }, 6_100)).toBe(6100);
    expect(segmentMsFor({ kind: "solo_gancho", hookSeconds: 2 }, 2_000)).toBe(2000);
    expect(segmentMsFor({ kind: "replicar", hookSeconds: 4 }, 12_000)).toBe(12_000);
    expect(segmentMsFor({ kind: "adaptacion_concepto", hookSeconds: 4 }, 45_000)).toBe(30_000);
  });

  it("el clip dura lo que el gancho (Seedance no baja de 4 s)", () => {
    expect(clipDurationSeconds(segmentMsFor({ kind: "solo_gancho", hookSeconds: 6 }, 20_000))).toBe(6);
    expect(clipDurationSeconds(segmentMsFor({ kind: "solo_gancho", hookSeconds: 8 }, 20_000))).toBe(8);
    expect(clipDurationSeconds(segmentMsFor({ kind: "solo_gancho", hookSeconds: 2 }, 20_000))).toBe(4);
  });

  it("la referencia deja de valer si se preparó con otro tramo, y vuelve a valer si se deshace el cambio", () => {
    expect(referenceOutdated(video())).toBe(false);
    // Lista como «replicar» y se pasa a «Solo gancho».
    expect(referenceOutdated(video({ kind: "solo_gancho" }))).toBe(true);
    // Lista como gancho de 4 s: cambiar los segundos o el tipo la deja sin valer.
    const hook = { kind: "solo_gancho", segmentDurationMs: 4000 };
    expect(referenceOutdated(video(hook))).toBe(false);
    expect(referenceOutdated(video({ ...hook, hookSeconds: 5 }))).toBe(true);
    expect(referenceOutdated(video({ ...hook, hookSeconds: 3 }))).toBe(true);
    expect(referenceOutdated(video({ ...hook, kind: "replicar" }))).toBe(true);
    expect(referenceOutdated(video({ ...hook, kind: "adaptacion_concepto" }))).toBe(true);
    // Una referencia más corta que el gancho ya se usa entera: cambiar el gancho por encima de ella no pide nada.
    const short = { kind: "solo_gancho", referenceDurationMs: 3000, segmentDurationMs: 3000 };
    expect(referenceOutdated(video({ ...short, hookSeconds: 4 }))).toBe(false);
    expect(referenceOutdated(video({ ...short, hookSeconds: 6 }))).toBe(false);
    expect(referenceOutdated(video({ ...short, kind: "replicar" }))).toBe(false);
    expect(referenceOutdated(video({ ...short, hookSeconds: 2 }))).toBe(true);
    // Sin referencia lista no hay nada que volver a subir.
    expect(referenceOutdated(video({ kind: "solo_gancho", referenceStatus: "none", referenceDurationMs: null, segmentDurationMs: null }))).toBe(false);
    expect(referenceOutdated(video({ kind: "solo_gancho", referenceStatus: "processing" }))).toBe(false);
  });
});

describe("tipo «Solo gancho»: desglose", () => {
  it("las instrucciones dicen que es SOLO el gancho, de N segundos, y que el cuerpo ya existe", () => {
    const text = analysisInstructions(briefOf(source({ kind: "solo_gancho", hookSeconds: 5 })));
    expect(text).toContain("Tipo de vídeo: solo gancho.");
    expect(text).toContain("SOLO el gancho del anuncio: sus primeros 5 segundos");
    expect(text).toContain("El cuerpo del anuncio ya existe");
    expect(text).toContain("no lo diseñes, no lo describas y no lo continúes");
    expect(text).toContain("únicamente esos 5 segundos");
    for (const kind of ["replicar", "adaptacion_concepto"]) {
      expect(analysisInstructions(briefOf(source({ kind, adaptation: "Idea" })))).not.toContain("solo gancho");
    }
  });

  it("la duración del gancho solo cuenta con «Solo gancho»", () => {
    expect(briefOf(source({ kind: "solo_gancho", hookSeconds: 6 }))).toMatchObject({ kind: "solo_gancho", hookSeconds: 6, adaptation: null });
    expect(briefOf(source({ kind: "replicar", hookSeconds: 6 })).hookSeconds).toBeNull();
  });

  it("el desglose deja de valer si cambia el tipo o la duración del gancho, igual que con las demás indicaciones", () => {
    const done = source({ kind: "solo_gancho", hookSeconds: 4 });
    expect(analysisStaleness(done, source({ kind: "solo_gancho", hookSeconds: 4 }))).toBeNull();
    expect(analysisStaleness(done, source({ kind: "solo_gancho", hookSeconds: 5 }))).toBe("brief");
    expect(analysisStaleness(done, source({ kind: "replicar", hookSeconds: 4 }))).toBe("brief");
    expect(analysisStaleness(source({ kind: "replicar", hookSeconds: null }), source({ kind: "solo_gancho", hookSeconds: 4 }))).toBe("brief");
    // Un desglose de «replicar» (guardado sin gancho) no se entera de que cambie el gancho del vídeo.
    expect(analysisStaleness(source({ kind: "replicar", hookSeconds: null }), source({ kind: "replicar", hookSeconds: 7 }))).toBeNull();
    // Y una referencia nueva manda sobre todo lo demás.
    expect(analysisStaleness(done, { ...source({ kind: "solo_gancho", hookSeconds: 4 }), referenceMediaId: "media-2" })).toBe("reference");
  });
});
