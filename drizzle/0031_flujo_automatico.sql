ALTER TABLE "batches" ADD COLUMN "frame_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "auto_confirm" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Los lotes que ya existían siguen esperando su «Confirmar»: publicar no autoriza gasto por ellos.
UPDATE "batches" SET "auto_confirm" = false;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "frame_count" integer;--> statement-breakpoint
-- Sin valor para los vídeos que ya existían (no van solos hasta que quien los creó los abre); los nuevos nacen con la fecha.
ALTER TABLE "videos" ADD COLUMN "auto_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "auto_since" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "auto_stop" text;
