-- «Enviar lote» autoriza las imágenes (regla 2 del motor, como Codex): ningún lote espera un «Confirmar».
UPDATE "batches" SET "auto_confirm" = true;
