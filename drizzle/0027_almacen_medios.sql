CREATE TABLE "stored_media" (
	"job_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_until" timestamp with time zone,
	"original_key" text,
	"thumb_key" text,
	"preview_key" text,
	"mime" text,
	"size" bigint,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stored_at" timestamp with time zone,
	CONSTRAINT "stored_media_kind_valid" CHECK ("stored_media"."kind" in ('video', 'image')),
	CONSTRAINT "stored_media_status_valid" CHECK ("stored_media"."status" in ('pending', 'done', 'failed')),
	CONSTRAINT "stored_media_done_complete" CHECK ("stored_media"."status" <> 'done' or ("stored_media"."original_key" is not null and "stored_media"."thumb_key" is not null and "stored_media"."preview_key" is not null))
);
--> statement-breakpoint
CREATE INDEX "stored_media_due" ON "stored_media" USING btree ("status","next_attempt_at");