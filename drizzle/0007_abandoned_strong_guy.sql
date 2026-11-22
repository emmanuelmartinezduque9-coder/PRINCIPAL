CREATE TABLE "job_steps" (
	"key" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"user_id" bigint NOT NULL,
	"product_id" bigint,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "job_steps_status" ON "job_steps" USING btree ("status");