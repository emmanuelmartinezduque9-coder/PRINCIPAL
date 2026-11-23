CREATE TABLE "video_references" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"video_id" bigint NOT NULL,
	"sha256" text NOT NULL,
	"role" text DEFAULT 'fondo' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_references_role_valid" CHECK ("video_references"."role" in ('fondo', 'ambiente', 'ropa', 'realismo', 'otro'))
);
--> statement-breakpoint
ALTER TABLE "video_references" ADD CONSTRAINT "video_references_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_references" ADD CONSTRAINT "video_references_sha256_pinterest_images_sha256_fk" FOREIGN KEY ("sha256") REFERENCES "public"."pinterest_images"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_references_video" ON "video_references" USING btree ("video_id","position");