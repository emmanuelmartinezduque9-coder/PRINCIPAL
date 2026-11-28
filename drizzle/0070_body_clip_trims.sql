ALTER TABLE "videos" ADD COLUMN "body_clip_trims" jsonb DEFAULT '{}'::jsonb NOT NULL;
