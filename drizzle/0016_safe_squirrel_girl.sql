ALTER TABLE "video_analyses" ADD COLUMN "kind" text DEFAULT 'replicar' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "avatar_mode" text DEFAULT 'elegido' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "adaptation" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "avatar_mode" text DEFAULT 'elegido' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "kind" text DEFAULT 'replicar' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "adaptation" text;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_kind_valid" CHECK ("videos"."kind" in ('replicar', 'adaptacion_concepto'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_adaptation_length" CHECK ("videos"."adaptation" is null or char_length("videos"."adaptation") <= 12000);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_mode_valid" CHECK ("videos"."avatar_mode" in ('elegido', 'sin_sustitucion', 'nadie'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_only_chosen" CHECK ("videos"."avatar_mode" = 'elegido' or "videos"."avatar_photo_id" is null);--> statement-breakpoint
UPDATE "videos" SET "avatar_mode" = 'nadie' WHERE "no_person";--> statement-breakpoint
UPDATE "video_analyses" SET "avatar_mode" = 'nadie' FROM "videos" WHERE "videos"."id" = "video_analyses"."video_id" AND "videos"."no_person";--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "no_person";--> statement-breakpoint
CREATE TABLE "batch_products" (
	"batch_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"notes" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_products_batch_id_product_id_pk" PRIMARY KEY("batch_id","product_id"),
	CONSTRAINT "batch_products_notes_length" CHECK (char_length("batch_products"."notes") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT "videos_note_length";--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "auto_analyze" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_avatar_mode" text DEFAULT 'elegido' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_avatar_photo_id" bigint;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "product_notes" text;--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_avatar_photo_id_product_photos_id_fk" FOREIGN KEY ("default_avatar_photo_id") REFERENCES "public"."product_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_avatar_mode_valid" CHECK ("products"."default_avatar_mode" in ('elegido', 'sin_sustitucion', 'nadie'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_avatar_only_chosen" CHECK ("products"."default_avatar_mode" = 'elegido' or "products"."default_avatar_photo_id" is null);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_note_length" CHECK ("videos"."note" is null or char_length("videos"."note") <= 6000);