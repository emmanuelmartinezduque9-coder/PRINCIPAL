CREATE TABLE "dubs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"source_sha256" text NOT NULL,
	"language" text DEFAULT 'deu' NOT NULL,
	"status" text DEFAULT 'submitting' NOT NULL,
	"media_id" text,
	"job_id" text,
	"quoted_credits" integer NOT NULL,
	"credits_spent" integer,
	"storage_key" text,
	"error" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dubs_status_valid" CHECK ("dubs"."status" in ('submitting', 'submitted', 'done', 'failed', 'unknown')),
	CONSTRAINT "dubs_credits_valid" CHECK ("dubs"."quoted_credits" >= 0 and ("dubs"."credits_spent" is null or "dubs"."credits_spent" >= 0))
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "dub_dialogue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "dub_dialogue" boolean;--> statement-breakpoint
ALTER TABLE "dubs" ADD CONSTRAINT "dubs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dubs_one_live" ON "dubs" USING btree ("video_id","source_sha256","language") WHERE "dubs"."status" in ('submitting', 'submitted', 'done');--> statement-breakpoint
CREATE INDEX "dubs_video" ON "dubs" USING btree ("video_id","id");