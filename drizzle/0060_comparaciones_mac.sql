CREATE TABLE "llm_comparisons" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_task_id" bigint NOT NULL,
	"upload_id" text NOT NULL,
	"step_key" text NOT NULL,
	"paso" text NOT NULL,
	"claude_ms" integer,
	"codex_ms" integer,
	"claude_text" text,
	"codex_text" text,
	"codex_error" text,
	"codex_valid" boolean,
	"codex_truncated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_comparisons_agent_task_id_unique" UNIQUE("agent_task_id")
);
