-- Los lotes en marcha autorizan también el margen de las 2 regeneraciones permitidas: rechazar una imagen la regenera sin parar el lote.
UPDATE "batches" SET "budget_credits" = "budget_credits" * 3 WHERE "status" IN ('imagenes', 'revision_imagenes', 'clips') AND "budget_credits" IS NOT NULL;
