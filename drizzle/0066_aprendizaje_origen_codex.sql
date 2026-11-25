ALTER TABLE "learning_signals" DROP CONSTRAINT "learning_signals_kind";--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD COLUMN "origin" text DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD COLUMN "origin_ref" jsonb;--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD COLUMN "explicit_general" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "learned_preferences" ADD CONSTRAINT "learned_preferences_origin" CHECK ("learned_preferences"."origin" in ('principal','codex'));--> statement-breakpoint
ALTER TABLE "learning_signals" ADD CONSTRAINT "learning_signals_kind" CHECK ("learning_signals"."kind" in ('rechazado','aprobado','candidata_descartada','instruccion_tarjeta','instruccion_lote','respuesta','cambio_pedido','reporte','montaje_aprobado','montaje_rechazado','eleccion','codex'));