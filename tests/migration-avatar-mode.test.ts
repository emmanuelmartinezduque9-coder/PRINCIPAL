import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, expect, it } from "vitest";

/**
 * Migración 0016 (Lotes v2) sobre datos de antes: «no aparece nadie» (`no_person`) pasa a
 * `avatar_mode = 'nadie'` en los vídeos y en sus desgloses, el resto queda `elegido` con su
 * avatar, y todo vídeo queda `replicar`. Se aplica en una base aparte: primero hasta la 0015 y
 * después la 0016.
 */

const DATABASE = "prueba_migracion_0016";
const url = process.env.DATABASE_URL!.replace(/\/[^/]+$/, `/${DATABASE}`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migraciones-0015-"));

async function admin(sql: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function migrateWith(folder: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await admin(`drop database if exists ${DATABASE}`);
});

it("«no aparece nadie» pasa a avatar_mode = nadie en vídeos y desgloses; lo demás, elegido y replicar; los lotes viejos sin desglose automático", async () => {
  await admin(`drop database if exists ${DATABASE}`);
  await admin(`create database ${DATABASE}`);

  // Las migraciones tal como estaban en Lotes v1 (hasta la 0015).
  const source = path.resolve(process.cwd(), "drizzle");
  fs.cpSync(source, dir, { recursive: true });
  const journalFile = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalFile, "utf8")) as { entries: Array<{ idx: number }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 15);
  fs.writeFileSync(journalFile, JSON.stringify(journal));
  await migrateWith(dir);

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const product = await db.query("insert into products (name, summary, created_by) values ('P', 'Hace algo', 1) returning id");
    const productId = product.rows[0].id;
    const photo = await db.query(
      "insert into product_photos (product_id, role, mime, size, data, created_by) values ($1, 'avatar', 'image/jpeg', 1, '\\x00', 1) returning id",
      [productId],
    );
    const videos = await db.query(
      `insert into videos (product_id, created_by, title, avatar_photo_id, no_person, note) values
        ($1, 1, 'Con avatar', $2, false, null),
        ($1, 1, 'Sin nadie', null, true, 'Más luz'),
        ($1, 1, 'Sin elegir', null, false, null),
        ($1, 1, 'Nadie con foto', $2, true, null)
       returning id`,
      [productId, photo.rows[0].id],
    );
    const [withAvatar, nobody, unchosen, nobodyWithPhoto] = videos.rows.map((row) => row.id);
    // Un lote de Lotes v1 que ya existía.
    const oldBatch = (await db.query("insert into batches (name, created_by) values ('Pedido 54', 1) returning id")).rows[0].id;
    for (const videoId of [withAvatar, nobody]) {
      await db.query("insert into video_analyses (video_id, version, status, reference_media_id, created_by) values ($1, 1, 'done', 'm', 1)", [videoId]);
    }

    await migrateWith(source);

    const after = await db.query("select id, avatar_mode, avatar_photo_id, kind, adaptation, note from videos order by id");
    expect(after.rows).toEqual([
      { id: withAvatar, avatar_mode: "elegido", avatar_photo_id: photo.rows[0].id, kind: "replicar", adaptation: null, note: null },
      { id: nobody, avatar_mode: "nadie", avatar_photo_id: null, kind: "replicar", adaptation: null, note: "Más luz" },
      { id: unchosen, avatar_mode: "elegido", avatar_photo_id: null, kind: "replicar", adaptation: null, note: null },
      // Un «nadie» antiguo que conservaba una foto: se queda sin ella (si no, el check no entraría).
      { id: nobodyWithPhoto, avatar_mode: "nadie", avatar_photo_id: null, kind: "replicar", adaptation: null, note: null },
    ]);
    // Los lotes que ya existían no pasan a desglosar solos; los nuevos, sí.
    expect((await db.query("select auto_analyze from batches where id = $1", [oldBatch])).rows[0].auto_analyze).toBe(false);
    const newBatch = (await db.query("insert into batches (name, created_by) values ('Nuevo', 1) returning auto_analyze")).rows[0];
    expect(newBatch.auto_analyze).toBe(true);
    // Los desgloses tampoco admiten valores fuera de lista.
    await expect(db.query("update video_analyses set kind = 'gancho' where video_id = $1", [withAvatar])).rejects.toThrow(/video_analyses_kind_valid/);
    await expect(db.query("update video_analyses set avatar_mode = 'alguien' where video_id = $1", [withAvatar])).rejects.toThrow(
      /video_analyses_avatar_mode_valid/,
    );
    const columns = await db.query("select column_name from information_schema.columns where table_name = 'videos' and column_name = 'no_person'");
    expect(columns.rows).toEqual([]);
    // Los desgloses de antes no llevaban indicaciones: los de un vídeo con «Cambios específicos» quedan por repetir.
    const analyses = await db.query("select video_id, kind, avatar_mode, note, adaptation from video_analyses order by video_id");
    expect(analyses.rows).toEqual([
      { video_id: withAvatar, kind: "replicar", avatar_mode: "elegido", note: null, adaptation: null },
      { video_id: nobody, kind: "replicar", avatar_mode: "nadie", note: null, adaptation: null },
    ]);
    // La base ya no deja un avatar con otro modo ni valores fuera de lista.
    await expect(db.query("update videos set avatar_mode = 'sin_sustitucion' where id = $1", [withAvatar])).rejects.toThrow(/videos_avatar_only_chosen/);
    await expect(db.query("update videos set kind = 'gancho' where id = $1", [withAvatar])).rejects.toThrow(/videos_kind_valid/);
    await expect(db.query("update videos set adaptation = repeat('x', 12001) where id = $1", [withAvatar])).rejects.toThrow(/videos_adaptation_length/);
  } finally {
    await db.end();
  }
});
