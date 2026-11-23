-- Orden de Emmanuel (24/11/2026): el modelo (y el tipo) se eligen en cada vídeo, nunca en el grupo
-- del lote. Los grupos dejan de guardar un modelo que se herede; los vídeos conservan el suyo.
DELETE FROM "batch_products" WHERE "notes" IS NULL AND "edit_reference_url" IS NULL;
--> statement-breakpoint
UPDATE "batch_products" SET "clip_model" = NULL WHERE "clip_model" IS NOT NULL;
