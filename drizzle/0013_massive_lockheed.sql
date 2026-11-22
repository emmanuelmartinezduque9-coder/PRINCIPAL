CREATE TABLE "generation_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"generation_id" bigint NOT NULL,
	"index" integer NOT NULL,
	"job_id" text NOT NULL,
	"ok" boolean NOT NULL,
	"url" text,
	"error" text,
	"thumb_mime" text,
	"thumb" "bytea",
	CONSTRAINT "generation_results_generation_index" UNIQUE("generation_id","index")
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"round" integer NOT NULL,
	"status" text DEFAULT 'intent' NOT NULL,
	"user_id" bigint NOT NULL,
	"request" jsonb NOT NULL,
	"count" integer NOT NULL,
	"quoted_credits" integer NOT NULL,
	"credits_spent" integer,
	"job_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"reject_reason" text,
	"raw" jsonb,
	"intent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submit_started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	CONSTRAINT "generations_kind_valid" CHECK ("generations"."kind" in ('frame', 'clip')),
	CONSTRAINT "generations_status_valid" CHECK ("generations"."status" in ('intent', 'submitting', 'submitted', 'done', 'failed', 'not_sent', 'unknown')),
	CONSTRAINT "generations_count_valid" CHECK ("generations"."count" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "approved_frame_result_id" bigint;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "approved_clip_result_id" bigint;--> statement-breakpoint
ALTER TABLE "generation_results" ADD CONSTRAINT "generation_results_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generations_video_kind_round" ON "generations" USING btree ("video_id","kind","round") WHERE "generations"."status" <> 'not_sent';--> statement-breakpoint
CREATE INDEX "generations_status" ON "generations" USING btree ("status");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_approved_frame_result_id_generation_results_id_fk" FOREIGN KEY ("approved_frame_result_id") REFERENCES "public"."generation_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_approved_clip_result_id_generation_results_id_fk" FOREIGN KEY ("approved_clip_result_id") REFERENCES "public"."generation_results"("id") ON DELETE set null ON UPDATE no action;