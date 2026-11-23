-- Un vídeo de un lote en marcha que quedó fuera con «Saltar» cuando el lote se paró por un prompt
-- interno (23/11/2026, lote 3: «Falta decir para qué sirve image [4]») vuelve al lote: su imagen ya
-- está aprobada y su clip aún no se pidió. Desde ahora esos fallos se corrigen solos y no se pregunta.
UPDATE "videos" v SET "auto_skipped" = false, "updated_at" = now()
FROM "batches" b
WHERE v."batch_id" = b."id"
  AND v."auto_skipped" = true
  AND b."status" IN ('imagenes', 'revision_imagenes', 'clips', 'pausado')
  AND v."approved_frame_result_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "generations" g WHERE g."video_id" = v."id" AND g."kind" = 'clip');
