CREATE TABLE "songs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"number" integer,
	"sections" text[] DEFAULT '{}'::text[] NOT NULL,
	"duration_ms" integer NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"drop_ms" integer,
	"start_ms" integer DEFAULT 0 NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_title_length" CHECK (char_length("songs"."title") between 1 and 200),
	CONSTRAINT "songs_size_valid" CHECK ("songs"."size" > 0 and "songs"."size" <= 26214400),
	CONSTRAINT "songs_mime_valid" CHECK ("songs"."mime" in ('audio/mpeg', 'audio/mp4', 'audio/wav')),
	CONSTRAINT "songs_duration_valid" CHECK ("songs"."duration_ms" > 0),
	CONSTRAINT "songs_drop_valid" CHECK ("songs"."drop_ms" is null or ("songs"."drop_ms" >= 0 and "songs"."drop_ms" <= "songs"."duration_ms")),
	CONSTRAINT "songs_start_valid" CHECK ("songs"."start_ms" >= 0 and "songs"."start_ms" <= "songs"."duration_ms"),
	CONSTRAINT "songs_number_valid" CHECK ("songs"."number" is null or "songs"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "song_id" bigint;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "audio_mode" text DEFAULT 'original' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "songs_sha256" ON "songs" USING btree ("sha256");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_song" ON "videos" USING btree ("song_id");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_audio_mode_valid" CHECK ("videos"."audio_mode" in ('cancion', 'original'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_audio_mode_song" CHECK (("videos"."song_id" is null) = ("videos"."audio_mode" = 'original'));