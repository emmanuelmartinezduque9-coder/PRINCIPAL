ALTER TABLE "products" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_emoji_length" CHECK ("products"."emoji" is null or char_length("products"."emoji") between 1 and 16);