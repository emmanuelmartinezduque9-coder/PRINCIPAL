CREATE TABLE "higgsfield_probe_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" bigint NOT NULL,
	"ok" boolean NOT NULL,
	"refreshed" boolean NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "oauth_pending" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"verifier_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "higgsfield_probe_log_user" ON "higgsfield_probe_log" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "oauth_pending_user" ON "oauth_pending" USING btree ("user_id");