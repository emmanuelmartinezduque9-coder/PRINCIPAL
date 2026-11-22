import { beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import { imagePart, textPart, type LlmContent } from "@/llm/content";
import { createGateway } from "@/llm/gateway";
import type { AuthUser } from "@/server/auth";
import { fakeMessages } from "./helpers/fake-llm";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

describe("bloques de contenido para la pasarela", () => {
  it("textPart devuelve un bloque de texto", () => {
    expect(textPart("Fotograma 1 — 0,0 s")).toEqual({ type: "text", text: "Fotograma 1 — 0,0 s" });
  });

  it("imagePart devuelve un bloque de imagen en base64 con su tipo", () => {
    expect(imagePart(Buffer.from("abc"), "image/jpeg")).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "YWJj" },
    });
    expect(imagePart(Buffer.from("abc"), "image/png")).toMatchObject({ source: { media_type: "image/png" } });
  });
});

describe("lo que reservan las imágenes", () => {
  let ana: AuthUser;

  beforeEach(async () => {
    await truncateAll();
    ana = await makeUser("colaborador");
  });

  async function reservedFor(content: LlmContent): Promise<number> {
    const { client } = fakeMessages([{ text: "vale" }]);
    const result = await createGateway({ client }).call({
      tier: "medium",
      stepKey: "prueba:imagenes",
      userId: ana.id,
      productId: null,
      rules: [],
      instructions: "Describe lo que ves.",
      content,
      maxTokens: 1_000,
    });
    const { rows } = await getPool().query<{ reserved: string }>("select reserved_micros as reserved from spend_entries where id = $1", [
      result.spendEntryId,
    ]);
    return Number(rows[0].reserved);
  }

  it("24 imágenes reservan lo de 24 × 5 000 tokens de entrada", async () => {
    const base: LlmContent = [textPart("Mira estas imágenes.")];
    const images = Array.from({ length: 24 }, () => imagePart(Buffer.from("abc"), "image/jpeg"));
    const without = await reservedFor(base);
    const withImages = await reservedFor([...base, ...images]);
    // Escritura en caché del mediano y de su reserva (2,50 US$ por millón cada uno) y recargo del 10 %.
    expect(Math.abs(withImages - without - 660_000)).toBeLessThanOrEqual(10);
  });
});
