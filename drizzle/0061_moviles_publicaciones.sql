CREATE TABLE "phones" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"wda_url" text,
	"paused" boolean DEFAULT false NOT NULL,
	"activity" text DEFAULT 'Esperando' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"screenshot" "bytea",
	"screenshot_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"edit_id" bigint NOT NULL,
	"phone_id" bigint NOT NULL,
	"network" text NOT NULL,
	"account" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'en_cola' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"gap_hours" integer DEFAULT 3 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result_url" text,
	"screenshot" "bytea",
	"error" text,
	"agent_task_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_edit_network" UNIQUE("edit_id","network"),
	CONSTRAINT "publications_network_valid" CHECK ("publications"."network" in ('instagram', 'facebook')),
	CONSTRAINT "publications_status_valid" CHECK ("publications"."status" in ('en_cola', 'publicando', 'publicada', 'fallida', 'cancelada'))
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_kind_valid";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "phone_id" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "instagram_account" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "facebook_account" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "publish_gap_hours" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_review" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "edit_review_reason" text;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_edit_id_edits_id_fk" FOREIGN KEY ("edit_id") REFERENCES "public"."edits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_phone_id_phones_id_fk" FOREIGN KEY ("phone_id") REFERENCES "public"."phones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_agent_task_id_agent_tasks_id_fk" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_queue" ON "publications" USING btree ("phone_id","status","scheduled_for");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_phone_id_phones_id_fk" FOREIGN KEY ("phone_id") REFERENCES "public"."phones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_kind_valid" CHECK ("agent_tasks"."kind" in ('link_download', 'song_download', 'montaje', 'media_fetch', 'profile_fetch', 'pinterest_search', 'market_data', 'claude_code', 'phone_publish', 'phone_screen'));--> statement-breakpoint
WITH phone AS (
 INSERT INTO phones (name) VALUES ('iPhone 1') RETURNING id
) UPDATE products SET phone_id = (SELECT id FROM phone), instagram_account = 'sofaleiste', facebook_account = NULL WHERE id = 59;
