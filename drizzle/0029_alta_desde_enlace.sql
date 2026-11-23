CREATE TABLE "product_intakes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"url" text NOT NULL,
	"kind" text NOT NULL,
	"country" text NOT NULL,
	"status" text DEFAULT 'trayendo' NOT NULL,
	"message" text,
	"link_media_id" bigint,
	"result" jsonb,
	"mockup_status" text DEFAULT 'pendiente' NOT NULL,
	"mockup_job_id" text,
	"mockup_credits" integer,
	"mockup_ok_credits" integer,
	"mockup_photo_id" bigint,
	"mockup_note" text,
	"created_by" bigint NOT NULL,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_intakes_kind_valid" CHECK ("product_intakes"."kind" in ('reel', 'cuenta', 'aliexpress', 'web')),
	CONSTRAINT "product_intakes_status_valid" CHECK ("product_intakes"."status" in ('trayendo', 'analizando', 'mockup', 'listo', 'fallido')),
	CONSTRAINT "product_intakes_mockup_valid" CHECK ("product_intakes"."mockup_status" in ('pendiente', 'enviado', 'hecho', 'omitido', 'fallido'))
);
--> statement-breakpoint
CREATE TABLE "product_research" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'en_cola' NOT NULL,
	"note" text,
	"result" jsonb,
	"error" text,
	"spend_entry_id" bigint,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_research_kind_valid" CHECK ("product_research"."kind" in ('nicho', 'angulo', 'audiencia')),
	CONSTRAINT "product_research_status_valid" CHECK ("product_research"."status" in ('en_cola', 'buscando', 'hecho', 'fallido'))
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "niche" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "audience" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "angle" text;--> statement-breakpoint
ALTER TABLE "product_intakes" ADD CONSTRAINT "product_intakes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_intakes" ADD CONSTRAINT "product_intakes_link_media_id_link_media_id_fk" FOREIGN KEY ("link_media_id") REFERENCES "public"."link_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_intakes" ADD CONSTRAINT "product_intakes_mockup_photo_id_product_photos_id_fk" FOREIGN KEY ("mockup_photo_id") REFERENCES "public"."product_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_research" ADD CONSTRAINT "product_research_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_intakes_product_idx" ON "product_intakes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_research_product_idx" ON "product_research" USING btree ("product_id");