CREATE TABLE "agent_tasks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'link_download' NOT NULL,
	"video_id" bigint NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_by" bigint NOT NULL,
	"agent_id" bigint,
	"lease_expires_at" timestamp with time zone,
	"leased_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download')),
	CONSTRAINT "agent_tasks_status_valid" CHECK ("agent_tasks"."status" in ('queued', 'leased', 'done', 'failed')),
	CONSTRAINT "agent_tasks_lease_complete" CHECK ("agent_tasks"."status" <> 'leased' or ("agent_tasks"."agent_id" is not null and "agent_tasks"."lease_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"info" jsonb,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "upload_sessions" ALTER COLUMN "total_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "link_task_id" bigint;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tasks_queue" ON "agent_tasks" USING btree ("status","created_by","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_per_video" ON "agent_tasks" USING btree ("video_id") WHERE "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
CREATE INDEX "agents_created_by" ON "agents" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_agent_task_id_agent_tasks_id_fk" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_link_task_id_agent_tasks_id_fk" FOREIGN KEY ("link_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_sessions_agent_task" ON "upload_sessions" USING btree ("agent_task_id");--> statement-breakpoint
CREATE INDEX "videos_link_task" ON "videos" USING btree ("link_task_id");