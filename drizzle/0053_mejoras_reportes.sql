-- «Reportar un problema» y «Mejoras» (24/11/2026): reportes, correcciones aprendidas versionadas y tipo de cada rechazo.
CREATE TABLE "learned_corrections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"stage" text NOT NULL,
	"problem_type" text NOT NULL,
	"product_id" bigint,
	"directive" text NOT NULL,
	"note" text NOT NULL,
	"status" text DEFAULT 'activa' NOT NULL,
	"source_report_id" bigint,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "learned_corrections_key_version" UNIQUE("key","version"),
	CONSTRAINT "learned_corrections_stage_valid" CHECK ("learned_corrections"."stage" in ('frame', 'clip')),
	CONSTRAINT "learned_corrections_status_valid" CHECK ("learned_corrections"."status" in ('activa', 'retirada'))
);
--> statement-breakpoint
CREATE TABLE "problem_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage" text NOT NULL,
	"body" text NOT NULL,
	"screenshot_mime" text,
	"screenshot" "bytea",
	"video_id" bigint,
	"generation_id" bigint,
	"result_id" bigint,
	"edit_id" bigint,
	"batch_id" bigint,
	"product_id" bigint,
	"page" text,
	"version_label" text,
	"app_version" text NOT NULL,
	"status" text DEFAULT 'recibido' NOT NULL,
	"problem_type" text,
	"fix_kind" text,
	"cause" text,
	"correction_id" bigint,
	"classified_at" timestamp with time zone,
	"classify_attempts" integer DEFAULT 0 NOT NULL,
	"classify_after" timestamp with time zone,
	"classify_error" text,
	"code_commit" text,
	"code_fixed_at" timestamp with time zone,
	"code_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_reports_stage_valid" CHECK ("problem_reports"."stage" in ('imagen', 'clip', 'montaje', 'lote', 'desglose', 'pantalla')),
	CONSTRAINT "problem_reports_status_valid" CHECK ("problem_reports"."status" in ('recibido', 'clasificado', 'aplicado', 'comprobado', 'no_mejora', 'sin_arreglo')),
	CONSTRAINT "problem_reports_fix_kind_valid" CHECK ("problem_reports"."fix_kind" is null or "problem_reports"."fix_kind" in ('regla', 'codigo', 'uso'))
);
--> statement-breakpoint
CREATE TABLE "rejection_types" (
	"generation_id" bigint PRIMARY KEY NOT NULL,
	"problem_type" text NOT NULL,
	"reason" text NOT NULL,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_result_id_generation_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."generation_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_edit_id_edits_id_fk" FOREIGN KEY ("edit_id") REFERENCES "public"."edits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejection_types" ADD CONSTRAINT "rejection_types_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learned_corrections_active" ON "learned_corrections" USING btree ("stage","status");--> statement-breakpoint
CREATE INDEX "problem_reports_status" ON "problem_reports" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "problem_reports_user" ON "problem_reports" USING btree ("created_by","id");--> statement-breakpoint
CREATE INDEX "problem_reports_video" ON "problem_reports" USING btree ("video_id");