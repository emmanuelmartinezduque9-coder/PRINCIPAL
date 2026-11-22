CREATE TABLE "library_clips" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"job_id" text NOT NULL,
	"thumb_url" text,
	"video_url" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"created_at_hf" timestamp with time zone NOT NULL,
	"prompt" text,
	"video_id" bigint,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_clips_user_job" UNIQUE("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "product_bodies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"library_clip_id" bigint NOT NULL,
	"label" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_bodies_product_clip" UNIQUE("product_id","library_clip_id"),
	CONSTRAINT "product_bodies_label_length" CHECK (char_length("product_bodies"."label") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "video_analyses" DROP CONSTRAINT "video_analyses_kind_valid";--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT "videos_kind_valid";--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "hook_seconds" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hook_seconds" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "body_clip_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "library_clips" ADD CONSTRAINT "library_clips_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bodies" ADD CONSTRAINT "product_bodies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bodies" ADD CONSTRAINT "product_bodies_library_clip_id_library_clips_id_fk" FOREIGN KEY ("library_clip_id") REFERENCES "public"."library_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_clips_user_created" ON "library_clips" USING btree ("user_id","created_at_hf","id");--> statement-breakpoint
CREATE INDEX "product_bodies_clip" ON "product_bodies" USING btree ("library_clip_id");--> statement-breakpoint
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_kind_valid" CHECK ("video_analyses"."kind" in ('replicar', 'adaptacion_concepto', 'solo_gancho'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_hook_seconds_valid" CHECK ("videos"."hook_seconds" between 2 and 8);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_kind_valid" CHECK ("videos"."kind" in ('replicar', 'adaptacion_concepto', 'solo_gancho'));