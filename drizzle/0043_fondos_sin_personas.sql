-- 23/11/2026, lote 3 (HaarZauber): un póster de una actriz famosa en la pared de la peluquería hizo
-- que Higgsfield bloqueara los clips (ip_detected). La sala del banco de peluquería «con personas»
-- (R14) deja de elegirse sola.
UPDATE "reference_bank" SET "active" = false WHERE "code" = 'R14';
--> statement-breakpoint
-- Los vídeos que el paso automático a Seedance (diagnóstico equivocado, desplegado unos minutos)
-- llegó a cambiar vuelven a «Automático»: la causa era la imagen, no el modelo.
UPDATE "videos" SET "clip_model" = 'auto', "updated_at" = now()
WHERE "clip_model" = 'seedance_2_5' AND "owner_answers" @> '[{"key": "sys:modelo-bloqueado"}]'::jsonb;
