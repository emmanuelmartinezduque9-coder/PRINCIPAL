CREATE TABLE "learned_preferences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"scope_value" text DEFAULT '' NOT NULL,
	"stages" text[] NOT NULL,
	"directive" text NOT NULL,
	"directive_en" text NOT NULL,
	"polarity" smallint NOT NULL,
	"choice" jsonb,
	"topic" text NOT NULL,
	"weight" real DEFAULT 0.5 NOT NULL,
	"supports" integer DEFAULT 0 NOT NULL,
	"contradicts" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'activa' NOT NULL,
	"retired_by" text,
	"first_batch_id" bigint,
	"source_signal_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learned_preferences_key_unique" UNIQUE("key"),
	CONSTRAINT "learned_preferences_scope" CHECK ("learned_preferences"."scope" in ('global','producto','pais','toma') and ("learned_preferences"."scope" <> 'global' or "learned_preferences"."scope_value" = '')),
	CONSTRAINT "learned_preferences_stages" CHECK (cardinality("learned_preferences"."stages") > 0 and "learned_preferences"."stages" <@ ARRAY['desglose','imagen','pinterest','clip','rotulos','doblaje','montaje','variante','cancion','avatar']::text[]),
	CONSTRAINT "learned_preferences_polarity" CHECK ("learned_preferences"."polarity" in (-1,1)),
	CONSTRAINT "learned_preferences_status" CHECK ("learned_preferences"."status" in ('activa','retirada')),
	CONSTRAINT "learned_preferences_retired" CHECK ("learned_preferences"."retired_by" is null or "learned_preferences"."retired_by" in ('peso','dueno')),
	CONSTRAINT "learned_preferences_weight" CHECK ("learned_preferences"."weight" between 0 and 1 and "learned_preferences"."supports" >= 0 and "learned_preferences"."contradicts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "learning_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_key" text NOT NULL,
	"trigger" text NOT NULL,
	"batch_id" bigint,
	"signal_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "learning_runs_run_key_unique" UNIQUE("run_key"),
	CONSTRAINT "learning_runs_trigger" CHECK ("learning_runs"."trigger" in ('lote','diario'))
);
--> statement-breakpoint
CREATE TABLE "learning_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"stage" text NOT NULL,
	"polarity" smallint NOT NULL,
	"video_id" bigint,
	"batch_id" bigint,
	"product_id" bigint,
	"country" text DEFAULT '' NOT NULL,
	"shot_type" text,
	"user_id" bigint NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"value" jsonb,
	"topic" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"distilled_at" timestamp with time zone,
	CONSTRAINT "learning_signals_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "learning_signals_polarity" CHECK ("learning_signals"."polarity" in (-1,0,1)),
	CONSTRAINT "learning_signals_text_length" CHECK (char_length("learning_signals"."text") <= 4000),
	CONSTRAINT "learning_signals_kind" CHECK ("learning_signals"."kind" in ('rechazado','aprobado','candidata_descartada','instruccion_tarjeta','instruccion_lote','respuesta','cambio_pedido','reporte','montaje_aprobado','montaje_rechazado','eleccion')),
	CONSTRAINT "learning_signals_stage" CHECK ("learning_signals"."stage" in ('desglose','imagen','pinterest','clip','rotulos','doblaje','montaje','variante','cancion','avatar'))
);
--> statement-breakpoint
CREATE TABLE "preference_applications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"preference_id" bigint NOT NULL,
	"video_id" bigint NOT NULL,
	"batch_id" bigint,
	"stage" text NOT NULL,
	"outcome" text,
	"signal_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "preference_applications_once" UNIQUE("preference_id","video_id","stage"),
	CONSTRAINT "preference_applications_outcome" CHECK ("preference_applications"."outcome" is null or "preference_applications"."outcome" in ('aprobado','corregido')),
	CONSTRAINT "preference_applications_stage" CHECK ("preference_applications"."stage" in ('desglose','imagen','pinterest','clip','rotulos','doblaje','montaje','variante','cancion','avatar'))
);
--> statement-breakpoint
ALTER TABLE "learning_signals" ADD CONSTRAINT "learning_signals_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_applications" ADD CONSTRAINT "preference_applications_preference_id_learned_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."learned_preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_applications" ADD CONSTRAINT "preference_applications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_applications" ADD CONSTRAINT "preference_applications_signal_id_learning_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."learning_signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_signals_video" ON "learning_signals" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "learning_signals_batch" ON "learning_signals" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "learning_signals_distilled" ON "learning_signals" USING btree ("distilled_at");--> statement-breakpoint
CREATE INDEX "preference_applications_video" ON "preference_applications" USING btree ("video_id");