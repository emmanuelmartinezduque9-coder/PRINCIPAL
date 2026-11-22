CREATE TABLE "video_reference_audio" (
	"video_id" bigint PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_reference_audio_size" CHECK ("video_reference_audio"."size" between 1 and 5242880)
);
--> statement-breakpoint
ALTER TABLE "video_reference_audio" ADD CONSTRAINT "video_reference_audio_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;