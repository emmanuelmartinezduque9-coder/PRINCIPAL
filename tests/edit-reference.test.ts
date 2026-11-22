import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db/client";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import type { Product } from "@/server/products";
import { addVideoToBatch, batchView, createBatch, duplicateBatchVideo } from "@/server/videos/batches";
import { checkEditReferenceUrl, createVideo, getVideoFor, updateVideoChoices, videoView, type Video } from "@/server/videos/videos";
import { POST as batchVideoRoute } from "@/app/api/lotes/[id]/videos/route";
import { PUT as putVideo } from "@/app/api/videos/[videoId]/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/** «Referencia de edición»: un enlace por vídeo que solo se guarda (lo usará el montador). */

const REEL = "https://www.instagram.com/reel/edicion/";
const BAD = "La referencia de edición tiene que ser un enlace de Instagram, TikTok, YouTube o Facebook.";

let dueno: AuthUser;
let ana: AuthUser;
let producto: Product;
let video: Video;

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  producto = await makeProduct(ana);
  video = await createVideo(ana, producto.id);
});

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const put = (videoId: number, body: unknown) =>
  putVideo(new Request(`http://localhost/api/videos/${videoId}`, { method: "PUT", body: JSON.stringify(body) }), {
    params: Promise.resolve({ videoId: String(videoId) }),
  });

describe("comprobar el enlace", () => {
  it("normaliza los enlaces admitidos y quita con null o vacío", () => {
    expect(checkEditReferenceUrl(undefined)).toBeUndefined();
    expect(checkEditReferenceUrl(null)).toBeNull();
    expect(checkEditReferenceUrl("   ")).toBeNull();
    expect(checkEditReferenceUrl(`  ${REEL}  `)).toBe(REEL);
    expect(checkEditReferenceUrl("https://WWW.TikTok.com/@a/video/1")).toBe("https://www.tiktok.com/@a/video/1");
  });

  it.each([
    "http://www.instagram.com/reel/a/",
    "https://evil.test/x",
    "https://soundcloud.com/a/b",
    "https://www.facebook.com/l.php?u=https%3A%2F%2Fevil.test",
    "javascript:alert(1)",
    `https://www.instagram.com/reel/${"a".repeat(2000)}/`,
    42,
    {},
  ])("rechaza %s", (value) => {
    expect(() => checkEditReferenceUrl(value)).toThrow(BAD);
  });
});

describe("en el vídeo", () => {
  it("el PUT la guarda, la vista la enseña y null la quita", async () => {
    await as(ana);
    const saved = await put(video.id, { editReferenceUrl: REEL });
    expect(saved.status).toBe(200);
    expect((await saved.json()).video.editReferenceUrl).toBe(REEL);
    expect((await videoView(ana, video.id)).video.editReferenceUrl).toBe(REEL);

    const cleared = await put(video.id, { editReferenceUrl: null });
    expect((await cleared.json()).video.editReferenceUrl).toBeNull();
  });

  it("un enlace que no vale da 400 y no se guarda nada de la petición", async () => {
    await as(ana);
    const response = await put(video.id, { title: "Nuevo", editReferenceUrl: "https://evil.test/x" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(BAD);
    expect(await getVideoFor(ana, video.id)).toMatchObject({ title: video.title, editReferenceUrl: null });
  });

  it("solo quien creó el vídeo la cambia", async () => {
    await as(dueno);
    expect((await put(video.id, { editReferenceUrl: REEL })).status).toBeGreaterThanOrEqual(403);
    expect((await getVideoFor(ana, video.id)).editReferenceUrl).toBeNull();
  });

  it("cambiar solo la referencia de edición no despierta el desglose automático de un duplicado", async () => {
    await getDb().update(schema.videos).set({ skipAutoAnalysis: true }).where(eq(schema.videos.id, video.id));
    await updateVideoChoices(ana, video.id, { editReferenceUrl: REEL });
    expect((await getVideoFor(ana, video.id)).skipAutoAnalysis).toBe(true);
    await updateVideoChoices(ana, video.id, { note: "otra cosa" });
    expect((await getVideoFor(ana, video.id)).skipAutoAnalysis).toBe(false);
  });

  it("la base de datos no admite otra cosa que https", async () => {
    await expect(getDb().update(schema.videos).set({ editReferenceUrl: "http://x" }).where(eq(schema.videos.id, video.id))).rejects.toThrow();
  });
});

describe("en el lote", () => {
  it("al añadir un vídeo se guarda, sale en su fila y el duplicado la conserva", async () => {
    const batch = await createBatch(ana, "Lote");
    await as(ana);
    const response = await batchVideoRoute(
      new Request(`http://localhost/api/lotes/${batch.id}/videos`, {
        method: "POST",
        body: JSON.stringify({ productId: producto.id, avatarPhotoId: null, avatarMode: "sin_sustitucion", editReferenceUrl: REEL }),
      }),
      { params: Promise.resolve({ id: String(batch.id) }) },
    );
    expect(response.status).toBe(201);
    const created = (await response.json()).video;
    expect(created.editReferenceUrl).toBe(REEL);

    const copy = await duplicateBatchVideo(ana, batch.id, created.id);
    expect(copy.editReferenceUrl).toBe(REEL);
    const rows = (await batchView(ana, batch.id)).rows;
    expect(rows.map((row) => row.editReferenceUrl)).toEqual([REEL, REEL]);

    // Se cambia por el PUT del vídeo, como el resto de la fila.
    await put(created.id, { editReferenceUrl: "https://youtu.be/otro" });
    expect((await batchView(ana, batch.id)).rows[0].editReferenceUrl).toBe("https://youtu.be/otro");
  });

  it("un enlace que no vale da 400 y no crea el vídeo; sin enviarlo queda vacía", async () => {
    const batch = await createBatch(ana, "Lote");
    const input = { productId: producto.id, avatarPhotoId: null, avatarMode: "sin_sustitucion" };
    await expect(addVideoToBatch(ana, batch.id, { ...input, editReferenceUrl: "https://evil.test/x" })).rejects.toMatchObject({ status: 400, message: BAD });
    expect((await batchView(ana, batch.id)).rows).toEqual([]);
    const plain = await addVideoToBatch(ana, batch.id, input);
    expect(plain.editReferenceUrl).toBeNull();
  });
});
