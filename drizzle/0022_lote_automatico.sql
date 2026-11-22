ALTER TABLE "batches" ADD COLUMN "status" text DEFAULT 'borrador' NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "budget_credits" integer;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "estimates" jsonb;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "pause" jsonb;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "resumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "advancing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "answers" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "owner_answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "auto_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "batches_status" ON "batches" USING btree ("status");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_status_valid" CHECK ("batches"."status" in ('borrador', 'preguntas', 'imagenes', 'revision_imagenes', 'clips', 'listo', 'pausado'));--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_budget_valid" CHECK ("batches"."budget_credits" is null or "batches"."budget_credits" >= 0);