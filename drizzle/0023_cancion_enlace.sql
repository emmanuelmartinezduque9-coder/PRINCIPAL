ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "agent_tasks" ALTER COLUMN "video_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "song_id" bigint;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "upload_id" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "upload_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_reference_url" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_song_link" ON "agent_tasks" USING btree ("created_by","url") WHERE "agent_tasks"."kind" = 'song_download' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_target_valid" CHECK (("agent_tasks"."kind" = 'link_download') = ("agent_tasks"."video_id" is not null));--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_edit_reference_url_valid" CHECK ("videos"."edit_reference_url" is null or (char_length("videos"."edit_reference_url") <= 2000 and "videos"."edit_reference_url" like 'https://%'));