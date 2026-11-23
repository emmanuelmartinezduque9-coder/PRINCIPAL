ALTER TABLE "dubs" DROP CONSTRAINT "dubs_status_valid";--> statement-breakpoint
DROP INDEX "dubs_one_live";--> statement-breakpoint
CREATE UNIQUE INDEX "dubs_one_live" ON "dubs" USING btree ("video_id","source_sha256","language") WHERE "dubs"."status" in ('submitting', 'submitted', 'done', 'skipped');--> statement-breakpoint
ALTER TABLE "dubs" ADD CONSTRAINT "dubs_status_valid" CHECK ("dubs"."status" in ('submitting', 'submitted', 'done', 'failed', 'unknown', 'skipped'));