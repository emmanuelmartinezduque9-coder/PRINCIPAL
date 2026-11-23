ALTER TABLE "product_photos" DROP CONSTRAINT "product_photos_role_valid";--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_role_valid" CHECK ("product_photos"."role" in ('articulo', 'embalaje', 'avatar', 'entorno', 'funcionamiento', 'otro'));--> statement-breakpoint
-- La foto «funcionamiento» importada del sistema anterior con papel «otro» (FalterPfote: el perro con las alas de mariposa proyectadas) pasa a su papel, que sí se adjunta.
UPDATE "product_photos" SET "role" = 'funcionamiento' WHERE "role" = 'otro' AND encode(sha256("data"), 'hex') IN ('c67c4de4926b85034d54fa09c393ef9aa85610f82964b7486980e1d6c3345225');--> statement-breakpoint
-- Se rehacen los prompts con sala con la sustitución explícita del producto y su foto de funcionamiento.
DELETE FROM "video_pinterest_refs";
