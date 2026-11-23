ALTER TABLE "videos" ALTER COLUMN "clip_model" SET DEFAULT 'hf_mult_motion_control';--> statement-breakpoint
-- Regla fija de Emmanuel (24/11/2026): por defecto, Genjutsu Motion Transfer. «Automático» ya
-- resolvía a Motion Transfer (o a Seedance con un tramo de menos de 3 s, que Motion Transfer sigue
-- haciendo), así que el modelo con el que sale cada vídeo no cambia.
UPDATE "videos" SET "clip_model" = 'hf_mult_motion_control' WHERE "clip_model" = 'auto';
--> statement-breakpoint
UPDATE "batch_products" SET "clip_model" = 'hf_mult_motion_control' WHERE "clip_model" = 'auto';
