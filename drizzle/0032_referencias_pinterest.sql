CREATE TABLE "pinterest_images" (
	"sha256" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"object_key" text,
	"data" "bytea",
	"source_url" text NOT NULL,
	"pin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pinterest_searches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"via" text,
	"results" jsonb,
	"agent_task_id" bigint,
	"error" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pinterest_searches_query_unique" UNIQUE("query"),
	CONSTRAINT "pinterest_searches_status_valid" CHECK ("pinterest_searches"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "video_pinterest_refs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"analysis_id" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scene" jsonb,
	"queries" jsonb,
	"refs" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_pinterest_refs_video_analysis" UNIQUE("video_id","analysis_id"),
	CONSTRAINT "video_pinterest_refs_status_valid" CHECK ("video_pinterest_refs"."status" in ('pending', 'searching', 'waiting_mac', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "pinterest_searches" ADD CONSTRAINT "pinterest_searches_agent_task_id_agent_tasks_id_fk" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_pinterest_refs" ADD CONSTRAINT "video_pinterest_refs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_pinterest_refs" ADD CONSTRAINT "video_pinterest_refs_analysis_id_video_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."video_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_pinterest_search" ON "agent_tasks" USING btree ("url") WHERE "agent_tasks"."kind" = 'pinterest_search' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download', 'montaje', 'media_fetch', 'profile_fetch', 'pinterest_search'));