CREATE TABLE "spend_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"user_id" bigint NOT NULL,
	"product_id" bigint,
	"provider" text NOT NULL,
	"model" text,
	"step_key" text NOT NULL,
	"status" text NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"cost_micros" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"detail" jsonb
);
--> statement-breakpoint
CREATE INDEX "spend_entries_created" ON "spend_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "spend_entries_step" ON "spend_entries" USING btree ("step_key");