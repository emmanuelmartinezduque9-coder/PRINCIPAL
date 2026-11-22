CREATE TABLE "video_analyses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"result" jsonb,
	"reference_media_id" text,
	"rule_versions" jsonb,
	"spend_entry_id" bigint,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_analyses_video_version" UNIQUE("video_id","version"),
	CONSTRAINT "video_analyses_status_valid" CHECK ("video_analyses"."status" in ('queued', 'running', 'done', 'failed', 'paused'))
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "image_prompt" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "video_prompt" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "frame_use" text DEFAULT 'start_image' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_analyses_one_active" ON "video_analyses" USING btree ("video_id") WHERE "video_analyses"."status" in ('queued', 'running', 'paused');--> statement-breakpoint
CREATE INDEX "video_analyses_status" ON "video_analyses" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_frame_use_valid" CHECK ("videos"."frame_use" in ('start_image', 'contextual_reference'));