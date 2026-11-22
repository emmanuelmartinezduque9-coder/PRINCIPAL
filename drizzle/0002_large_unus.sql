CREATE TABLE "product_assignments" (
	"product_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"assigned_by" bigint NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_assignments_product_id_user_id_pk" PRIMARY KEY("product_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"countries" text[] DEFAULT '{DE,AT,CH}'::text[] NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_assignments" ADD CONSTRAINT "product_assignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_assignments" ADD CONSTRAINT "product_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_assignments_user" ON "product_assignments" USING btree ("user_id");