CREATE TABLE "reference_bank" (
	"sha256" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"thumb" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_bank" ADD CONSTRAINT "reference_bank_sha256_pinterest_images_sha256_fk" FOREIGN KEY ("sha256") REFERENCES "public"."pinterest_images"("sha256") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Las búsquedas nuevas en Pinterest se retiran (orden del dueño, 23/11): las imágenes reutilizan el banco de aprobadas.
DELETE FROM "video_pinterest_refs";
