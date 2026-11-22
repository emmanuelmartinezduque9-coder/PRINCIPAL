CREATE TABLE "batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "batch_id" bigint;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "batches_created_by" ON "batches" USING btree ("created_by","created_at");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_batch" ON "videos" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_note_length" CHECK ("videos"."note" is null or char_length("videos"."note") <= 300);