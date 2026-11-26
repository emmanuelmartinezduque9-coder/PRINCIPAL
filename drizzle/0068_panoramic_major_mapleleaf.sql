CREATE TABLE "song_lyrics" (
	"song_id" bigint PRIMARY KEY NOT NULL,
	"lyrics" text NOT NULL,
	"sections" jsonb NOT NULL,
	"words" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kind" text DEFAULT 'fisico' NOT NULL;--> statement-breakpoint
ALTER TABLE "song_lyrics" ADD CONSTRAINT "song_lyrics_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_kind_valid" CHECK ("products"."kind" in ('fisico', 'cancion'));