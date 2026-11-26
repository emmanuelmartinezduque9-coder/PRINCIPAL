ALTER TABLE "generations" ADD COLUMN "owner_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "owner_redo" jsonb;