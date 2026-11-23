import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeHiggsfield, SAMPLE_IMAGE_URL, type FakeHiggsfield } from "@/connectors/higgsfield/fake";
import { getDb, schema } from "@/db/client";
import { createGateway } from "@/llm/gateway";
import { LocalStore } from "@/lib/object-store";
import type { AuthUser } from "@/server/auth";
import {
  advanceIntake,
  classifyLink,
  createProductFromLink,
  intakeViewFor,
  isPrivateAddress,
  latestIntake,
  MAC_WAIT_MS,
  requestMockup,
  shopFacts,
  startIntake,
  type IntakeAnswer,
  type IntakeDeps,
} from "@/server/product-intake";
import { addProductPhoto, listProductPhotos } from "@/server/photos";
import { getProductFor } from "@/server/products";
import { seedRules } from "@/server/rules";
import { fakeMessages, type FakeReply } from "./helpers/fake-llm";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

const PNG = Buffer.from(SAMPLE_IMAGE_URL.split(",")[1], "base64");

const ANSWER: IntakeAnswer = {
  identificado: true,
  motivo: "",
  producto: "Mini máquina de helados rosa",
  queHace: "Hace helado en 2 minutos sin hielo",
  mecanismo: "Recipiente que se congela y pala que remueve",
  nicho: "Postres caseros para niños",
  audiencia: "Madres con niños pequeños",
  anguloActual: "Tarde de verano en casa",
  emoji: "🍦",
  marca: { nombre: "EisZauber", porQue: "Helado + magia, fácil de recordar en alemán.", alternativas: ["EisFreude", "KühlWerk"] },
  referencia: { tipo: "foto_tienda", numero: 1 },
  promptMockup: "Photorealistic product photo of the exact pink mini ice cream maker on medium gray #929396.",
  fuentes: [
    { url: "https://www.aliexpress.com/item/1.html", que: "Ficha del producto" },
    { url: "https://inventada.example/x", que: "Algo que no se vio" },
  ],
};

/** Respuesta de Claude con la búsqueda hecha: los resultados que vio y el JSON al final. */
function claudeReply(answer: IntakeAnswer = ANSWER): FakeReply {
  return {
    blocks: [
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "mini eismaschine" } },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://www.aliexpress.com/item/1.html", title: "x", encrypted_content: "e", page_age: null }] },
    ],
    text: `Lo he encontrado.\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``,
    webSearches: 2,
    usage: { inputTokens: 1000, outputTokens: 500 },
  };
}

const SHOP_HTML = `<html><head><meta property="og:title" content="Mini Ice Cream Maker"><meta property="og:image" content="https://ae01.alicdn.com/kf/foto.png"></head></html>`;

describe("el enlace", () => {
  it("distingue reel, cuenta, AliExpress y tienda; rechaza lo que no vale", () => {
    expect(classifyLink("https://www.instagram.com/reel/ABC123/")?.kind).toBe("reel");
    expect(classifyLink("https://www.instagram.com/p/ABC123/")?.kind).toBe("reel");
    expect(classifyLink("https://www.instagram.com/goldieadvents/")?.kind).toBe("cuenta");
    expect(classifyLink("https://www.tiktok.com/@tienda/video/123")?.kind).toBe("reel");
    expect(classifyLink("https://vm.tiktok.com/ZMabc/")?.kind).toBe("reel");
    expect(classifyLink("https://www.tiktok.com/@tienda")?.kind).toBe("cuenta");
    expect(classifyLink("https://de.aliexpress.com/item/100500.html")?.kind).toBe("aliexpress");
    expect(classifyLink("https://a.aliexpress.com/_mKx")?.kind).toBe("aliexpress");
    expect(classifyLink("https://eiswerk.de/products/x")?.kind).toBe("web");
    expect(classifyLink("http://www.instagram.com/reel/ABC/")).toBeNull();
    expect(classifyLink("https://127.0.0.1/x")).toBeNull();
    expect(classifyLink("https://localhost/x")).toBeNull();
    expect(classifyLink("https://user:pw@shop.de/x")).toBeNull();
    expect(classifyLink("no es un enlace")).toBeNull();
  });

  it("nunca pide direcciones privadas", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "192.168.1.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.1", "2a00:1450::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("saca título e imágenes de una página de AliExpress", () => {
    const html = `${SHOP_HTML}<script>window.runParams={"imagePathList":["https:\\u002F\\u002Fae01.alicdn.com\\u002Fkf\\u002Fdos.jpg","//ae01.alicdn.com/kf/tres.jpg"]}</script>`;
    const facts = shopFacts(html, "https://www.aliexpress.com/item/1.html");
    expect(facts.title).toBe("Mini Ice Cream Maker");
    expect(facts.images).toEqual(["https://ae01.alicdn.com/kf/foto.png", "https://ae01.alicdn.com/kf/dos.jpg", "https://ae01.alicdn.com/kf/tres.jpg"]);
  });
});

describe("alta desde un enlace", () => {
  let dueno: AuthUser;
  let hf: FakeHiggsfield;
  let store: LocalStore;

  beforeEach(async () => {
    await truncateAll();
    await seedRules();
    dueno = await makeUser("dueno");
    hf = createFakeHiggsfield();
    store = new LocalStore(path.join(os.tmpdir(), `objetos-alta-${Math.random().toString(36).slice(2)}`), Buffer.alloc(32, 5));
  });

  function deps(replies: FakeReply[], extra: Partial<IntakeDeps> = {}) {
    const fake = fakeMessages(replies);
    const fetched: string[] = [];
    const d: IntakeDeps = {
      gateway: createGateway({ client: fake.client }),
      higgsfield: hf.port,
      store,
      fetchPublic: async (url) => {
        fetched.push(url);
        if (url.includes("aliexpress.com/item")) return { bytes: Buffer.from(SHOP_HTML), type: "text/html" };
        return { bytes: PNG, type: "image/png" };
      },
      macOnline: async () => false,
      ...extra,
    };
    return { d, calls: fake.calls, fetched };
  }

  it("rechaza un enlace o un país que no valen", async () => {
    await expect(createProductFromLink(dueno, { url: "ftp://x", country: "DE" })).rejects.toMatchObject({ status: 400 });
    await expect(createProductFromLink(dueno, { url: "https://de.aliexpress.com/item/1.html", country: "XX" })).rejects.toMatchObject({ status: 400 });
  });

  it("AliExpress: ficha, marca, fuentes comprobadas y mockup gris en Higgsfield", async () => {
    const { product, intake } = await createProductFromLink(dueno, { url: "https://www.aliexpress.com/item/1.html", country: "DE" });
    expect(product.name).toBe("Producto nuevo");
    expect(product.language).toBe("de");
    expect(intake.status).toBe("analizando");
    const { d, calls } = deps([claudeReply()]);

    await advanceIntake(intake.id, d);

    // Claude: con búsqueda en internet desde Alemania, las reglas del alta y la foto de la tienda.
    expect(calls).toHaveLength(1);
    expect(calls[0].tools?.map((t) => t.type)).toEqual(["web_search_20260209", "web_fetch_20260209"]);
    expect(JSON.stringify(calls[0].tools)).toContain('"country":"DE"');
    expect(calls[0].output_config?.format).toBeUndefined();
    const sent = JSON.stringify(calls[0].messages);
    expect(sent).toContain("Foto de la tienda 1");
    expect(sent).toContain("Mini Ice Cream Maker");

    const saved = await getProductFor(dueno, product.id);
    expect(saved).toMatchObject({ name: "EisZauber", summary: "Hace helado en 2 minutos sin hielo", emoji: "🍦", niche: "Postres caseros para niños", audience: "Madres con niños pequeños" });

    let view = await intakeViewFor(dueno, product.id);
    expect(view?.result?.fuentes).toEqual([
      { url: "https://www.aliexpress.com/item/1.html", que: "Ficha del producto", comprobada: true },
      { url: "https://inventada.example/x", que: "Algo que no se vio", comprobada: false },
    ]);
    // Mockup: 1 imagen 1:1 2K con la foto de la tienda como referencia y el prompt de Claude.
    expect(view?.status).toBe("mockup");
    expect(view?.mockupStatus).toBe("enviado");
    const submit = hf.calls.find((c) => c.method === "submitImages")!;
    expect(submit.args).toMatchObject({ request: { aspectRatio: "1:1", resolution: "2k", prompt: ANSWER.promptMockup }, count: 1 });

    // Higgsfield termina: la foto entra como «Artículo» y el alta queda lista.
    const jobId = Object.keys(hf.state.jobs)[0];
    hf.state.jobs[jobId] = { ...hf.state.jobs[jobId], status: "done", urls: ["https://cdn.higgsfield.ai/r.png"] };
    await advanceIntake(intake.id, d);
    view = await intakeViewFor(dueno, product.id);
    expect(view).toMatchObject({ status: "listo", mockupStatus: "hecho" });
    const photos = await listProductPhotos(dueno, product.id);
    expect(photos.map((p) => p.role).sort()).toEqual(["articulo", "otro"]);
    expect(view?.mockupPhotoId).toBe(photos.find((p) => p.role === "articulo")!.id);
  });

  it("si Claude no lo identifica, lo dice claro y no gasta en Higgsfield", async () => {
    const { product, intake } = await createProductFromLink(dueno, { url: "https://www.instagram.com/cuentarara/", country: "IT" });
    expect(intake.kind).toBe("cuenta");
    const { d } = deps([claudeReply({ ...ANSWER, identificado: false, motivo: "la cuenta es privada" })]);
    await advanceIntake(intake.id, d);
    const view = await intakeViewFor(dueno, product.id);
    expect(view?.status).toBe("fallido");
    expect(view?.message).toContain("la cuenta es privada");
    expect(hf.calls.filter((c) => c.method === "submitImages")).toHaveLength(0);
  });

  it("un mockup más caro de lo normal espera el OK con el coste", async () => {
    const { product, intake } = await createProductFromLink(dueno, { url: "https://www.aliexpress.com/item/1.html", country: "DE" });
    const quote = hf.port.quoteImages;
    hf.port.quoteImages = async (...args) => ({ ...(await quote(...args)), credits: 40 });
    const { d } = deps([claudeReply()]);
    await advanceIntake(intake.id, d);
    let view = await intakeViewFor(dueno, product.id);
    expect(view).toMatchObject({ status: "listo", mockupStatus: "pendiente", mockupCredits: 40 });
    expect(view?.mockupNote).toContain("40 créditos");
    expect(hf.calls.filter((c) => c.method === "submitImages")).toHaveLength(0);

    await requestMockup(dueno, product.id, 40);
    await advanceIntake(intake.id, d);
    view = await intakeViewFor(dueno, product.id);
    expect(view?.mockupStatus).toBe("enviado");
    expect(hf.calls.filter((c) => c.method === "submitImages")).toHaveLength(1);
  });

  it("reel de Instagram: sin Mac lo dice y, pasado el tiempo, sigue sin el vídeo", async () => {
    // Un Mac del dueño que no da señales.
    await getDb().insert(schema.agents).values({ name: "Mac", tokenHash: "h", createdBy: dueno.id, lastSeenAt: new Date(Date.now() - 3_600_000) });
    const { product, intake } = await createProductFromLink(dueno, { url: "https://www.instagram.com/reel/ABC123/", country: "DE" });
    expect(intake.status).toBe("trayendo");
    let now = new Date();
    const { d, calls } = deps([claudeReply({ ...ANSWER, referencia: { tipo: "ninguna", numero: 0 } })], {
      runYtDlp: async () => ({ ok: false, error: "login required" }),
      now: () => now,
    });
    await advanceIntake(intake.id, d);
    let view = await intakeViewFor(dueno, product.id);
    expect(view?.status).toBe("trayendo");
    expect(view?.message).toContain("tu Mac no responde");
    const [task] = await getDb().select().from(schema.agentTasks).where(eq(schema.agentTasks.kind, "media_fetch"));
    expect(task?.url).toBe("https://www.instagram.com/reel/ABC123/");

    now = new Date(Date.now() + MAC_WAIT_MS + 1_000);
    await advanceIntake(intake.id, d);
    view = await intakeViewFor(dueno, product.id);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0].messages)).toContain("No se pudo traer el vídeo");
    expect(view).toMatchObject({ status: "listo", mockupStatus: "omitido" });
    expect(view?.result?.sinVideo).toBe(true);
  });

  it("con una captura subida: espera a las fotos, Claude la ve y sirve de referencia del mockup", async () => {
    const { product, intake } = await createProductFromLink(dueno, { url: "https://www.instagram.com/tienda/", country: "DE", waitForPhotos: true });
    const { d, calls } = deps([claudeReply({ ...ANSWER, referencia: { tipo: "foto_subida", numero: 1 } })]);
    await advanceIntake(intake.id, d);
    expect(calls).toHaveLength(0); // todavía esperando a las fotos
    const photo = await addProductPhoto(dueno, product.id, PNG, "articulo");
    await startIntake(dueno, product.id);
    await advanceIntake(intake.id, d);
    expect(JSON.stringify(calls[0].messages)).toContain("Foto subida 1");
    const view = await intakeViewFor(dueno, product.id);
    expect(view?.result?.referenciaFotoId).toBe(photo.id);
    expect(view?.mockupStatus).toBe("enviado");
    // No se duplica la foto: la referencia es la misma que subió.
    expect(await listProductPhotos(dueno, product.id)).toHaveLength(1);
  });

  it("repetir el avance no vuelve a pagar a Claude", async () => {
    const { intake } = await createProductFromLink(dueno, { url: "https://www.aliexpress.com/item/1.html", country: "DE" });
    const { d, calls } = deps([claudeReply()]);
    await advanceIntake(intake.id, d);
    await getDb().update(schema.productIntakes).set({ status: "analizando" }).where(eq(schema.productIntakes.id, intake.id));
    await advanceIntake(intake.id, d);
    expect(calls).toHaveLength(1);
    expect((await latestIntake(intake.productId))?.status).not.toBe("fallido");
  });
});
