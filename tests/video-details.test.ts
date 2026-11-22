import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/db/client";
import { stopWorker } from "@/jobs/boss";
import { login, resetLoginAttempts, type AuthUser } from "@/server/auth";
import type { Product } from "@/server/products";
import { generationDetails, redactTokens } from "@/server/videos/details";
import { createVideo, type Video } from "@/server/videos/videos";
import { GET as detailsRoute } from "@/app/api/videos/[videoId]/detalles/route";
import { makeProduct, makeUser, TEST_PASSWORD } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pr_sesion" && cookie.value ? { name, value: cookie.value } : undefined),
  }),
}));

/** «Detalles técnicos» del vídeo: las generaciones con sus respuestas en crudo de Higgsfield, solo para el dueño. */

let dueno: AuthUser;
let ana: AuthUser;
let luis: AuthUser;
let producto: Product;
let v: Video;

const as = async (user: AuthUser) => {
  cookie.value = (await login(user.email, TEST_PASSWORD))!.token;
};
const params = (value: string) => ({ params: Promise.resolve({ videoId: value }) });

async function insertGeneration(video: Video, values: { kind: string; round: number; status: string; raw: unknown }): Promise<number> {
  const { rows } = await getPool().query(
    `insert into generations (video_id, kind, round, status, user_id, request, count, quoted_credits, credits_spent, job_ids, raw, error)
     values ($1, $2, $3, $4, $5, $6, 2, 4, 4, $7, $8, 'algo falló')
     returning id`,
    [
      video.id,
      values.kind,
      values.round,
      values.status,
      video.createdBy,
      JSON.stringify({ model: "nano_banana_2_1", prompt: "Una lámpara.", medias: [{ role: "image_references", value: "media-1" }] }),
      JSON.stringify(["job-1", "job-2"]),
      JSON.stringify(values.raw),
    ],
  );
  return rows[0].id;
}

beforeEach(async () => {
  await truncateAll();
  resetLoginAttempts();
  delete process.env.PRINCIPAL_AUTH;
  cookie.value = undefined;
  dueno = await makeUser("dueno");
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
  producto = await makeProduct(ana);
  v = await createVideo(ana, producto.id);
});

afterAll(async () => {
  await stopWorker();
});

describe("redactTokens", () => {
  it("quita lo que parece una clave: campos con nombre de secreto, cabeceras Bearer, JWT y consultas de direcciones", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJhLWRlLXBydWViYQ";
    const out = redactTokens({
      access_token: "abc",
      refreshToken: "def",
      client_secret: "ghi",
      Authorization: "Bearer xyz",
      apiKey: "k",
      password: "p",
      nested: [{ note: `Bearer sk-1234567890abcdef`, jwt }],
      upload_url: "https://upload.example.com/m1?X-Amz-Signature=abc&X-Amz-Credential=def",
      result_url: "https://d8j0ntlcm91z4.cloudfront.net/user_1/hf_20261122_060226_980c2227.mp4",
      sample: `data:image/png;base64,${"A".repeat(500)}`,
      job_id: "980c2227-9b12-4c14-bc7b-b6d11e5b9a05",
      quote_ref: "quote:abc",
      credits: 4,
      ok: true,
      empty: null,
    });
    expect(out).toEqual({
      access_token: "[oculto]",
      refreshToken: "[oculto]",
      client_secret: "[oculto]",
      Authorization: "[oculto]",
      apiKey: "[oculto]",
      password: "[oculto]",
      nested: [{ note: "Bearer [oculto]", jwt: "[oculto]" }],
      upload_url: "https://upload.example.com/m1?[oculto]",
      result_url: "https://d8j0ntlcm91z4.cloudfront.net/user_1/hf_20261122_060226_980c2227.mp4",
      sample: "data:image/png;base64,… (522 caracteres)",
      job_id: "980c2227-9b12-4c14-bc7b-b6d11e5b9a05",
      quote_ref: "quote:abc",
      credits: 4,
      ok: true,
      empty: null,
    });
  });

  it("también las direcciones dentro de un texto y los parámetros sig=, signature= y token= sueltos", () => {
    expect(
      redactTokens({
        message: "Sube aquí: https://upload.example.com/m1?X-Amz-Signature=abc&x=1 y luego https://cdn.test/a.png?token=zz. Fin.",
        log: "GET /files/a.mp4?sig=abc123&exp=1 200; otro token=secreto&b=2; signature=xyz",
        plain: "https://cdn.test/a.png",
      }),
    ).toEqual({
      message: "Sube aquí: https://upload.example.com/m1?[oculto] y luego https://cdn.test/a.png?[oculto]. Fin.",
      log: "GET /files/a.mp4?sig=[oculto]&exp=1 200; otro token=[oculto]&b=2; signature=[oculto]",
      plain: "https://cdn.test/a.png",
    });
  });

  it("los parámetros sueltos con nombre de secreto también: api_key, apikey, key, password, client_secret y code", () => {
    expect(
      redactTokens({
        log: "POST /oauth/token code=abc123&client_secret=s3cr3t&state=xy; reintento api_key=k1, apikey=k2 key=k3 password=hunter2 exp=1",
        cli: "--x-amz-credential=AKIA/2026 --refresh_token=r1 --client_id=principal",
      }),
    ).toEqual({
      log: "POST /oauth/token code=[oculto]&client_secret=[oculto]&state=xy; reintento api_key=[oculto], apikey=[oculto] key=[oculto] password=[oculto] exp=1",
      cli: "--x-amz-credential=[oculto] --refresh_token=[oculto] --client_id=principal",
    });
  });
});

describe("detalles técnicos", () => {
  it("el dueño ve cada generación con su petición y su respuesta en crudo, sin claves", async () => {
    const first = await insertGeneration(v, { kind: "frame", round: 1, status: "done", raw: { jobs: [{ job_id: "job-1" }], token: "secreto" } });
    const second = await insertGeneration(v, { kind: "clip", round: 1, status: "unknown", raw: null });
    const details = await generationDetails(dueno, v.id);
    expect(details).toMatchObject([
      {
        id: first,
        kind: "frame",
        round: 1,
        status: "done",
        jobIds: ["job-1", "job-2"],
        quotedCredits: 4,
        creditsSpent: 4,
        error: "algo falló",
        request: { model: "nano_banana_2_1", prompt: "Una lámpara." },
        raw: { jobs: [{ job_id: "job-1" }], token: "[oculto]" },
        results: [],
      },
      { id: second, kind: "clip", status: "unknown", raw: null },
    ]);
    expect(typeof details[0].intentAt).toBe("string");
  });

  it("solo el dueño: quien creó el vídeo recibe 403 y un vídeo que el dueño no puede ver (o un id raro), 404", async () => {
    await expect(generationDetails(ana, v.id)).rejects.toMatchObject({ status: 403 });
    await expect(generationDetails(dueno, 999_999)).rejects.toMatchObject({ status: 404 });
  });

  it("GET /api/videos/[id]/detalles: 200 al dueño, 403 a los demás", async () => {
    await insertGeneration(v, { kind: "frame", round: 1, status: "done", raw: { ok: true } });
    await as(dueno);
    const response = await detailsRoute(new Request("http://localhost/x"), params(String(v.id)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).generations).toHaveLength(1);
    expect((await detailsRoute(new Request("http://localhost/x"), params("abc"))).status).toBe(404);
    await as(ana);
    expect((await detailsRoute(new Request("http://localhost/x"), params(String(v.id)))).status).toBe(403);
    await as(luis);
    expect((await detailsRoute(new Request("http://localhost/x"), params(String(v.id)))).status).toBe(403);
  });
});
