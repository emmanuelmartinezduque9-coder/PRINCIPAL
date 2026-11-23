CREATE TABLE "edit_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"spec" jsonb NOT NULL,
	"requested_by" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"notes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edit_runs_status_valid" CHECK ("edit_runs"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "link_media" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cloud_tried_at" timestamp with time zone,
	"agent_task_id" bigint,
	"object_key" text,
	"mime" text,
	"size" bigint,
	"duration_ms" integer,
	"breakdown" jsonb,
	"breakdown_status" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_media_url_unique" UNIQUE("url"),
	CONSTRAINT "link_media_status_valid" CHECK ("link_media"."status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "link_media_ready_complete" CHECK ("link_media"."status" <> 'ready' or "link_media"."object_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "edits" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "edits" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_run_id" bigint;--> statement-breakpoint
ALTER TABLE "edit_runs" ADD CONSTRAINT "edit_runs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_media" ADD CONSTRAINT "link_media_agent_task_id_agent_tasks_id_fk" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edit_runs_queue" ON "edit_runs" USING btree ("status","available_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "edit_runs_one_active" ON "edit_runs" USING btree ("video_id") WHERE "edit_runs"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_edit_run_id_edit_runs_id_fk" FOREIGN KEY ("edit_run_id") REFERENCES "public"."edit_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_media_fetch" ON "agent_tasks" USING btree ("url") WHERE "agent_tasks"."kind" = 'media_fetch' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download', 'montaje', 'media_fetch'));--> statement-breakpoint
ALTER TABLE "edits" ADD CONSTRAINT "edits_content_present" CHECK ("edits"."data" is not null or "edits"."storage_key" is not null);--> statement-breakpoint
-- El montaje pasa del Mac a la nube: los montajes que esperaban al Mac se cierran (se vuelven a pedir con «Montar»).
UPDATE "agent_tasks" SET "status" = 'failed', "error" = 'Montaje en el Mac retirado: ahora se monta en la nube.', "lease_expires_at" = NULL, "upload_id" = NULL, "updated_at" = now() WHERE "kind" = 'montaje' AND "status" IN ('queued', 'leased');--> statement-breakpoint
UPDATE "videos" SET "edit_status" = 'fallido', "edit_error" = 'El montaje ahora se hace en la nube: pulsa «Volver a montar».' WHERE "edit_status" = 'en_marcha';
