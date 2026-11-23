ALTER TABLE "batch_products" DROP CONSTRAINT "batch_products_not_empty";--> statement-breakpoint
ALTER TABLE "batch_products" ADD COLUMN "clip_model" text;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "clip_model" text;--> statement-breakpoint
-- Cómo se genera la réplica (regla 6 del motor). Los vídeos que ya existen se hicieron con Seedance:
-- se quedan en Seedance (no se reinterpreta lo ya hecho, como en Codex). Los nuevos nacen en «Automático».
ALTER TABLE "videos" ADD COLUMN "clip_model" text DEFAULT 'seedance_2_5' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "clip_model" SET DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_clip_model_valid" CHECK ("batch_products"."clip_model" is null or "batch_products"."clip_model" in ('auto', 'seedance_2_5', 'hf_mult_motion_control', 'hf_mult_replace_object', 'wan3_0_prime'));--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_not_empty" CHECK ("batch_products"."notes" is not null or "batch_products"."edit_reference_url" is not null or "batch_products"."clip_model" is not null);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_clip_model_valid" CHECK ("videos"."clip_model" in ('auto', 'seedance_2_5', 'hf_mult_motion_control', 'hf_mult_replace_object', 'wan3_0_prime'));