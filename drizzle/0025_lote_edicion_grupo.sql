ALTER TABLE "batch_products" DROP CONSTRAINT "batch_products_notes_length";--> statement-breakpoint
ALTER TABLE "batch_products" ALTER COLUMN "notes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "auto_retry" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batch_products" ADD COLUMN "edit_reference_url" text;--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_edit_reference_url_valid" CHECK ("batch_products"."edit_reference_url" is null or (char_length("batch_products"."edit_reference_url") <= 2000 and "batch_products"."edit_reference_url" like 'https://%'));--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_not_empty" CHECK ("batch_products"."notes" is not null or "batch_products"."edit_reference_url" is not null);--> statement-breakpoint
ALTER TABLE "batch_products" ADD CONSTRAINT "batch_products_notes_length" CHECK ("batch_products"."notes" is null or char_length("batch_products"."notes") between 1 and 4000);