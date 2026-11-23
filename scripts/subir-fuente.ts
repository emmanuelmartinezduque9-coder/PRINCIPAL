/**
 * Sube al almacén de objetos la fuente de los rótulos (TikTok Display Medium, `FONT_KEY`) o, con
 * `--emojis`, la de los emojis del iPhone (Apple Color Emoji, `EMOJI_FONT_KEY`), donde las busca el
 * montaje en la nube (`src/server/videos/montaje-nube.ts`). Se hace una vez:
 *
 *   railway run --service principal npx tsx scripts/subir-fuente.ts "/ruta/a/TikTok-Display-Medium.ttf"
 *   railway run --service principal npx tsx scripts/subir-fuente.ts --emojis "/System/Library/Fonts/Apple Color Emoji.ttc"
 *
 * Necesita las variables del bucket (`BUCKET_*`); `railway run` las trae del servicio.
 */
import fs from "node:fs/promises";
import { S3Store, s3ConfigFromEnv } from "../src/lib/object-store";
import { EMOJI_FONT_KEY, FONT_KEY } from "../src/server/videos/montaje-nube";

async function main() {
  const args = process.argv.slice(2);
  const emojis = args[0] === "--emojis";
  const file = emojis ? args[1] : args[0];
  if (!file) throw new Error('Uso: npx tsx scripts/subir-fuente.ts [--emojis] "/ruta/a/la/fuente.ttf"');
  const handle = await fs.open(file, "r");
  const head = Buffer.alloc(4);
  await handle.read(head, 0, 4, 0);
  await handle.close();
  // TrueType (00 01 00 00), OpenType («OTTO») o colección («ttcf», la de emojis de Apple).
  if (!(head.equals(Buffer.from([0, 1, 0, 0])) || ["OTTO", "ttcf"].includes(head.toString("latin1")))) throw new Error("Eso no es una fuente TTF/OTF/TTC.");
  const key = emojis ? EMOJI_FONT_KEY : FONT_KEY;
  const config = s3ConfigFromEnv();
  if (!config) throw new Error("Faltan las variables del almacén (BUCKET_*). Lánzalo con `railway run`.");
  const store = new S3Store(config);
  await store.putFile(key, file, { contentType: emojis ? "font/collection" : "font/ttf" });
  console.log(`Fuente subida: ${key} (${await store.head(key)} bytes).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
