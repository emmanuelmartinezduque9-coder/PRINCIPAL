ALTER TABLE "library_clips" ADD COLUMN "detected_product_id" bigint;--> statement-breakpoint
ALTER TABLE "library_clips" ADD COLUMN "classified_role" text;--> statement-breakpoint
ALTER TABLE "library_clips" ADD COLUMN "confidence" integer;--> statement-breakpoint
ALTER TABLE "library_clips" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "library_clips" ADD COLUMN "classification_method" text;--> statement-breakpoint
ALTER TABLE "product_bodies" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "library_clips" ADD CONSTRAINT "library_clips_detected_product_id_products_id_fk" FOREIGN KEY ("detected_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;