CREATE TABLE "social_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"handle" text NOT NULL,
	"kind" text NOT NULL,
	"product_id" bigint,
	"country" text DEFAULT 'DE' NOT NULL,
	"count_from" timestamp with time zone,
	"count_last" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_network_handle" UNIQUE("network","handle"),
	CONSTRAINT "social_accounts_network" CHECK ("social_accounts"."network" in ('instagram','tiktok','facebook')),
	CONSTRAINT "social_accounts_kind" CHECK ("social_accounts"."kind" in ('propia','competidor')),
	CONSTRAINT "social_accounts_count_last" CHECK ("social_accounts"."count_last" is null or "social_accounts"."count_last" > 0),
	CONSTRAINT "social_accounts_handle" CHECK (char_length("social_accounts"."handle") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "social_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"post_id" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"views" bigint,
	"comments" bigint,
	"likes" bigint,
	"age_hours" real,
	"rounded" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "social_metrics_post_observed_source" UNIQUE("post_id","observed_at","source"),
	CONSTRAINT "social_metrics_counts" CHECK (("social_metrics"."views" is null or "social_metrics"."views" >= 0) and ("social_metrics"."comments" is null or "social_metrics"."comments" >= 0) and ("social_metrics"."likes" is null or "social_metrics"."likes" >= 0)),
	CONSTRAINT "social_metrics_age" CHECK ("social_metrics"."age_hours" is null or "social_metrics"."age_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"network" text NOT NULL,
	"shortcode" text NOT NULL,
	"url" text NOT NULL,
	"product_id" bigint,
	"video_id" bigint,
	"publication_id" bigint,
	"published_at" timestamp with time zone,
	"caption" text,
	"thumb_text" text,
	"thumbnail" text,
	"dna" jsonb,
	"dna_source" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'perfil' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_network_shortcode" UNIQUE("network","shortcode"),
	CONSTRAINT "social_posts_network" CHECK ("social_posts"."network" in ('instagram','tiktok','facebook')),
	CONSTRAINT "social_posts_source" CHECK ("social_posts"."source" in ('perfil','importado','movil')),
	CONSTRAINT "social_posts_dna_source" CHECK ("social_posts"."dna_source" is null or "social_posts"."dna_source" in ('principal','estimado','importado'))
);
--> statement-breakpoint
CREATE TABLE "split_tests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"base_post_id" bigint NOT NULL,
	"pillar" text NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"batch_id" bigint,
	"post_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'en_marcha' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "split_tests_batch" UNIQUE("batch_id"),
	CONSTRAINT "split_tests_step" CHECK ("split_tests"."step" between 1 and 4),
	CONSTRAINT "split_tests_pillar" CHECK ("split_tests"."pillar" in ('gancho','texto','fondo','cancion')),
	CONSTRAINT "split_tests_status" CHECK ("split_tests"."status" in ('en_marcha','ganador','perdedor','pendiente','cancelado'))
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_metrics" ADD CONSTRAINT "social_metrics_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_base_post_id_social_posts_id_fk" FOREIGN KEY ("base_post_id") REFERENCES "public"."social_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_tests" ADD CONSTRAINT "split_tests_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_metrics_post_age" ON "social_metrics" USING btree ("post_id","age_hours");--> statement-breakpoint
CREATE INDEX "social_posts_account_date" ON "social_posts" USING btree ("account_id","published_at");--> statement-breakpoint
CREATE INDEX "social_posts_product" ON "social_posts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "split_tests_base" ON "split_tests" USING btree ("base_post_id");--> statement-breakpoint
-- Las cuentas existen aunque el producto aún no se haya dado de alta.
INSERT INTO social_accounts (network, handle, kind, product_id, country, count_last)
VALUES
 ('instagram', 'eiswerrk', 'propia', (SELECT id FROM products WHERE lower(name) = lower('EisWerk') ORDER BY id LIMIT 1), 'DE', NULL),
 ('instagram', 'siilvenaa', 'propia', (SELECT id FROM products WHERE lower(name) = lower('FalterPfote') ORDER BY id LIMIT 1), 'DE', NULL),
 ('instagram', 'haarzauberr', 'propia', (SELECT id FROM products WHERE lower(name) = lower('HaarZauber') ORDER BY id LIMIT 1), 'DE', NULL),
 ('instagram', 'itswollzauber', 'propia', (SELECT id FROM products WHERE lower(name) = lower('WollZauber') ORDER BY id LIMIT 1), 'DE', 2)
ON CONFLICT (network, handle) DO NOTHING;
