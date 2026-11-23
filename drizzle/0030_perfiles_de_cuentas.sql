CREATE TABLE "link_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"agent_task_id" bigint,
	"data" jsonb,
	"error" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_profiles_url_unique" UNIQUE("url"),
	CONSTRAINT "link_profiles_status_valid" CHECK ("link_profiles"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "product_intakes" ADD COLUMN "link_profile_id" bigint;--> statement-breakpoint
ALTER TABLE "product_intakes" ADD COLUMN "reel_urls" text[];--> statement-breakpoint
ALTER TABLE "link_profiles" ADD CONSTRAINT "link_profiles_agent_task_id_agent_tasks_id_fk" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_intakes" ADD CONSTRAINT "product_intakes_link_profile_id_link_profiles_id_fk" FOREIGN KEY ("link_profile_id") REFERENCES "public"."link_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_profile_fetch" ON "agent_tasks" USING btree ("url") WHERE "agent_tasks"."kind" = 'profile_fetch' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download', 'montaje', 'media_fetch', 'profile_fetch'));