CREATE TABLE "avatars" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group" text NOT NULL,
	"number" integer,
	"age_years" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"higgsfield_media_id" text,
	"retired" boolean DEFAULT false NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_group_valid" CHECK ("avatars"."group" in ('mujer', 'hombre', 'nina', 'nino', 'otro')),
	CONSTRAINT "avatars_name_length" CHECK (char_length("avatars"."name") between 1 and 60),
	CONSTRAINT "avatars_age_valid" CHECK ("avatars"."age_years" is null or "avatars"."age_years" between 0 and 120),
	CONSTRAINT "avatars_number_valid" CHECK ("avatars"."number" is null or "avatars"."number" > 0),
	CONSTRAINT "avatars_description_length" CHECK ("avatars"."description" is null or char_length("avatars"."description") <= 500),
	CONSTRAINT "avatars_size_valid" CHECK ("avatars"."size" > 0 and "avatars"."size" <= 8388608),
	CONSTRAINT "avatars_mime_valid" CHECK ("avatars"."mime" in ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"name" text NOT NULL,
	"article_photo_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"packaging_photo_id" bigint,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_name_length" CHECK (char_length("product_variants"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "video_analyses" DROP CONSTRAINT "video_analyses_avatar_mode_valid";--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT "videos_avatar_mode_valid";--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "avatar_photo_id" bigint;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "avatar_library_id" bigint;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "variant_id" bigint;--> statement-breakpoint
ALTER TABLE "video_analyses" ADD COLUMN "auto_avatar_id" bigint;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "avatar_library_id" bigint;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "variant_id" bigint;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_packaging_photo_id_product_photos_id_fk" FOREIGN KEY ("packaging_photo_id") REFERENCES "public"."product_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_sha256" ON "avatars" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_name" ON "avatars" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_name" ON "product_variants" USING btree ("product_id","name");--> statement-breakpoint
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_auto_avatar_id_avatars_id_fk" FOREIGN KEY ("auto_avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_library_id_avatars_id_fk" FOREIGN KEY ("avatar_library_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_variant" ON "videos" USING btree ("variant_id");--> statement-breakpoint
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_avatar_mode_valid" CHECK ("video_analyses"."avatar_mode" in ('elegido', 'biblioteca', 'automatico', 'sin_sustitucion', 'nadie'));--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_library_only_biblioteca" CHECK ("videos"."avatar_mode" = 'biblioteca' or "videos"."avatar_library_id" is null);--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_avatar_mode_valid" CHECK ("videos"."avatar_mode" in ('elegido', 'biblioteca', 'automatico', 'sin_sustitucion', 'nadie'));