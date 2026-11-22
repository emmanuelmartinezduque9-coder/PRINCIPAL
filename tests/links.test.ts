import { describe, expect, it } from "vitest";
import { linkLabel, linkOf, parsePastedLinks } from "@/lib/links";

describe("enlaces pegados", () => {
  it("una tarjeta enseña el sitio y el código, no la dirección entera", () => {
    expect(linkLabel("https://www.instagram.com/reel/DAbc123/?igsh=xyz")).toEqual({ host: "instagram.com", code: "reel/DAbc123" });
    expect(linkLabel("https://vm.tiktok.com/ZM8abc/")).toEqual({ host: "vm.tiktok.com", code: "ZM8abc" });
    expect(linkLabel("https://www.tiktok.com/@marca/video/7301234567890")).toEqual({ host: "tiktok.com", code: "@marca/video/7301234567890" });
    expect(linkLabel("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toEqual({ host: "youtube.com", code: "dQw4w9WgXcQ" });
    expect(linkLabel("https://youtu.be/dQw4w9WgXcQ")).toEqual({ host: "youtu.be", code: "dQw4w9WgXcQ" });
    expect(linkLabel("https://m.facebook.com/watch/?v=123")).toEqual({ host: "facebook.com", code: "watch" });
    expect(linkLabel(`https://www.instagram.com/reel/${"a".repeat(80)}/`).code).toHaveLength(48);
    expect(linkLabel("no es un enlace")).toEqual({ host: "no es un enlace", code: "" });
  });

  it("al pegar varios, separa los que valen (normalizados y sin repetir) de los que no", () => {
    const pasted = [
      "https://www.instagram.com/reel/abc/",
      "  https://vm.tiktok.com/xyz  ",
      "",
      "https://www.instagram.com/reel/abc/",
      "https://evil.test/video",
      "hola",
      "https://WWW.Instagram.com/reel/def/ https://youtu.be/q",
      "hola",
    ].join("\n");
    expect(parsePastedLinks(pasted)).toEqual({
      links: ["https://www.instagram.com/reel/abc/", "https://vm.tiktok.com/xyz", "https://www.instagram.com/reel/def/", "https://youtu.be/q"],
      invalid: ["https://evil.test/video", "hola"],
    });
    expect(parsePastedLinks("   \n  ")).toEqual({ links: [], invalid: [] });
    // Lo que da por bueno es exactamente lo que acepta el servidor.
    for (const link of parsePastedLinks(pasted).links) expect(linkOf(link)).toBe(link);
  });
});
