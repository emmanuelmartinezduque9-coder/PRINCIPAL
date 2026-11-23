/**
 * Sube la fuente de los rótulos (TikTok Display Medium) al almacén de objetos, donde la busca el
 * montaje en la nube (`FONT_KEY` en `src/server/videos/montaje-nube.ts`). Se hace una vez:
 *
 *   railway run npx tsx scripts/subir-fuente.ts "/ruta/a/TikTok-Display-Medium.ttf"
 *
 * Necesita las variables del bucket (`BUCKET_*`); `railway run` las trae del servicio.
 */
import fs from "node:fs/promises";
import { S3Store, s3ConfigFromEnv } from "../src/lib/object-store";
import { FONT_KEY } from "../src/server/videos/montaje-nube";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Uso: npx tsx scripts/subir-fuente.ts "/ruta/a/la/fuente.ttf"');
  const head = (await fs.readFile(file)).subarray(0, 4);
  // TrueType (00 01 00 00) u OpenType («OTTO»).
  if (!(head.equals(Buffer.from([0, 1, 0, 0])) || head.toString("latin1") === "OTTO")) throw new Error("Eso no es una fuente TTF/OTF.");
  const config = s3ConfigFromEnv();
  if (!config) throw new Error("Faltan las variables del almacén (BUCKET_*). Lánzalo con `railway run`.");
  const store = new S3Store(config);
  await store.putFile(FONT_KEY, file, { contentType: "font/ttf" });
  console.log(`Fuente subida: ${FONT_KEY} (${await store.head(FONT_KEY)} bytes).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
