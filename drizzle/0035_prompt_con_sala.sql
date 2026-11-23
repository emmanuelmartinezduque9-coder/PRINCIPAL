ALTER TABLE "video_pinterest_refs" ADD COLUMN "frame_prompt" text;--> statement-breakpoint
ALTER TABLE "video_pinterest_refs" ADD COLUMN "base_prompt_sha" text;--> statement-breakpoint
-- Se rehacen todas con el método aprobado (orden del dueño, 23/11).
DELETE FROM "video_pinterest_refs";
