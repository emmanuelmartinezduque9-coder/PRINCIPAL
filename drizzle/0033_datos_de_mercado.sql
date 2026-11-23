ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "product_research" DROP CONSTRAINT "product_research_status_valid";--> statement-breakpoint
ALTER TABLE "product_research" ADD COLUMN "candidates" jsonb;--> statement-breakpoint
ALTER TABLE "product_research" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "product_research" ADD COLUMN "data_task_id" bigint;--> statement-breakpoint
ALTER TABLE "product_research" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_research" ADD COLUMN "available_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_one_active_market_data" ON "agent_tasks" USING btree ("url") WHERE "agent_tasks"."kind" = 'market_data' and "agent_tasks"."status" in ('queued', 'leased');--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download', 'montaje', 'media_fetch', 'profile_fetch', 'pinterest_search', 'market_data'));--> statement-breakpoint
ALTER TABLE "product_research" ADD CONSTRAINT "product_research_status_valid" CHECK ("product_research"."status" in ('en_cola', 'buscando', 'esperando_datos', 'hecho', 'fallido'));