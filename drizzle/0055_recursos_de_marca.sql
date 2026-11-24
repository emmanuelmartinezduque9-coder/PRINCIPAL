CREATE TABLE "product_brand_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"variant_id" bigint,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"job_id" text,
	"credits" integer,
	"photo_id" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_brand_assets_kind_valid" CHECK ("product_brand_assets"."kind" in ('marca', 'logo_web', 'caja')),
	CONSTRAINT "product_brand_assets_status_valid" CHECK ("product_brand_assets"."status" in ('pendiente', 'enviado', 'hecho', 'fallido'))
);
--> statement-breakpoint
ALTER TABLE "product_photos" DROP CONSTRAINT "product_photos_role_valid";--> statement-breakpoint
ALTER TABLE "product_brand_assets" ADD CONSTRAINT "product_brand_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_brand_assets" ADD CONSTRAINT "product_brand_assets_photo_id_product_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."product_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_brand_assets_one" ON "product_brand_assets" USING btree ("product_id","kind",coalesce("variant_id", 0));--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_role_valid" CHECK ("product_photos"."role" in ('articulo', 'embalaje', 'avatar', 'entorno', 'funcionamiento', 'marca', 'logo_web', 'otro'));