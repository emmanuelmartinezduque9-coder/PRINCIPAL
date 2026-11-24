-- Orden de Emmanuel (24/11/2026): todos los clips se generan a 480p y se suben a 1080p con Topaz, como en Codex.
ALTER TABLE "generations" DROP CONSTRAINT "generations_kind_valid";--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_kind_valid" CHECK ("generations"."kind" in ('frame', 'clip', 'upscale'));