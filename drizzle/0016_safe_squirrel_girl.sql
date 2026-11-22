ALTER TABLE "video_analyses" ADD COLUMN "kind" text DEFAULT 'replicar' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "avatar_mode" text DEFAULT 'elegido' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "adaptation" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "avatar_mode" text DEFAULT 'elegido' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "kind" text DEFAULT 'replicar' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "adaptation" text;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_kind_valid" CHECK ("videos"."kind" in ('replicar', 'adaptacion_concepto'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_adaptation_length" CHECK ("videos"."adaptation" is null or char_length("videos"."adaptation") <= 12000);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_mode_valid" CHECK ("videos"."avatar_mode" in ('elegido', 'sin_sustitucion', 'nadie'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_only_chosen" CHECK ("videos"."avatar_mode" = 'elegido' or "videos"."avatar_photo_id" is null);--> statement-breakpoint
UPDATE "videos" SET "avatar_mode" = 'nadie' WHERE "no_person";--> statement-breakpoint
UPDATE "video_analyses" SET "avatar_mode" = 'nadie' FROM "videos" WHERE "videos"."id" = "video_analyses"."video_id" AND "videos"."no_person";--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "no_person";