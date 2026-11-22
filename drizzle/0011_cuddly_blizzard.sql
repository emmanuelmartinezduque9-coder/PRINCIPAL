CREATE TABLE "higgsfield_media" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"sha256" text NOT NULL,
	"type" text NOT NULL,
	"media_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "higgsfield_media_user_sha256" UNIQUE("user_id","sha256"),
	CONSTRAINT "higgsfield_media_type_valid" CHECK ("higgsfield_media"."type" in ('image', 'video'))
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"agent_task_id" bigint,
	"filename" text NOT NULL,
	"total_bytes" integer NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_frames" (
	"video_id" bigint NOT NULL,
	"index" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "video_frames_video_index" UNIQUE("video_id","index")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"title" text NOT NULL,
	"reference_status" text DEFAULT 'none' NOT NULL,
	"reference_error" text,
	"reference_source" text,
	"reference_url" text,
	"reference_duration_ms" integer,
	"reference_width" integer,
	"reference_height" integer,
	"reference_media_id" text,
	"segment_duration_ms" integer,
	"cuts_ms" jsonb,
	"avatar_photo_id" bigint,
	"environment_photo_id" bigint,
	"no_person" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_reference_status_valid" CHECK ("videos"."reference_status" in ('none', 'uploading', 'processing', 'ready', 'failed')),
	CONSTRAINT "videos_reference_source_valid" CHECK ("videos"."reference_source" is null or "videos"."reference_source" in ('file', 'link'))
);
--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_frames" ADD CONSTRAINT "video_frames_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_photo_id_product_photos_id_fk" FOREIGN KEY ("avatar_photo_id") REFERENCES "public"."product_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_environment_photo_id_product_photos_id_fk" FOREIGN KEY ("environment_photo_id") REFERENCES "public"."product_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_sessions_video" ON "upload_sessions" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_created" ON "upload_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "videos_product" ON "videos" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "videos_reference_status" ON "videos" USING btree ("reference_status");