CREATE TABLE "edits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"duration_ms" integer NOT NULL,
	"self_check" jsonb,
	"task_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edits_video_version" UNIQUE("video_id","version"),
	CONSTRAINT "edits_size_valid" CHECK ("edits"."size" > 0 and "edits"."size" <= 209715200),
	CONSTRAINT "edits_version_valid" CHECK ("edits"."version" >= 1),
	CONSTRAINT "edits_duration_valid" CHECK ("edits"."duration_ms" > 0)
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_target_valid";--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "batches_status_valid";--> statement-breakpoint
DROP INDEX "agent_tasks_one_active_per_video";--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_status" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_error" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_task_id" bigint;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_main_text" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_cta_text" text;--> statement-breakpoint
ALTER TABLE "edits" ADD CONSTRAINT "edits_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_edit_task_id_agent_tasks_id_fk" FOREIGN KEY ("edit_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_montaje" ON "agent_tasks" USING btree ("video_id") WHERE "agent_tasks"."kind" = 'montaje' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_per_video" ON "agent_tasks" USING btree ("video_id") WHERE "agent_tasks"."kind" = 'link_download' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download', 'montaje'));--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_target_valid" CHECK (("agent_tasks"."kind" in ('link_download', 'montaje')) = ("agent_tasks"."video_id" is not null));--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_status_valid" CHECK ("batches"."status" in ('borrador', 'preguntas', 'imagenes', 'revision_imagenes', 'clips', 'listo', 'montado', 'pausado'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_edit_status_valid" CHECK ("videos"."edit_status" is null or "videos"."edit_status" in ('en_marcha', 'hecho', 'fallido'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_edit_texts_length" CHECK (("videos"."edit_main_text" is null or char_length("videos"."edit_main_text") <= 200) and ("videos"."edit_cta_text" is null or char_length("videos"."edit_cta_text") <= 200));