import { describe, expect, it } from "vitest";
import { detectVideoType } from "@/server/media/detect";

const ftyp = (brand: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}`, "latin1"), Buffer.alloc(12)]);

describe("detectVideoType", () => {
  it("reconoce mp4, quicktime y webm por el contenido", () => {
    expect(detectVideoType(ftyp("isom"))).toBe("video/mp4");
    expect(detectVideoType(ftyp("mp42"))).toBe("video/mp4");
    expect(detectVideoType(ftyp("qt  "))).toBe("video/quicktime");
    expect(detectVideoType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]))).toBe("video/webm");
  });

  it("rechaza lo que no es vídeo, incluidas las imágenes HEIC/AVIF con el mismo contenedor", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const pdf = Buffer.from("%PDF-1.7\n%....", "latin1");
    for (const head of [jpeg, pdf, ftyp("heic"), ftyp("heix"), ftyp("mif1"), ftyp("avif"), Buffer.alloc(0), Buffer.alloc(3)]) {
      expect(detectVideoType(head)).toBeNull();
    }
  });
});
