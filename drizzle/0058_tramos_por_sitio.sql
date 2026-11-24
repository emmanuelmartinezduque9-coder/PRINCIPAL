-- Sitios de la referencia (regla de Emmanuel, 24/11/2026): cada sitio extra lleva su apertura, su tramo y sus fotos de Pinterest.
ALTER TABLE "video_pinterest_refs" DROP CONSTRAINT "video_pinterest_refs_video_analysis";--> statement-breakpoint
ALTER TABLE "generations" DROP CONSTRAINT "generations_kind_valid";--> statement-breakpoint
ALTER TABLE "video_pinterest_refs" ADD COLUMN "tramo" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "tramo_approvals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "video_pinterest_refs" ADD CONSTRAINT "video_pinterest_refs_video_analysis_tramo" UNIQUE("video_id","analysis_id","tramo");--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_kind_valid" CHECK ("generations"."kind" ~ '^(frame|clip|upscale)(:[1-9][0-9]?)?$');