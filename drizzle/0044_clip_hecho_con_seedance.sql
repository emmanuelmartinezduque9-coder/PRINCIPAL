-- Los vídeos que pasaron a Seedance y cuyo clip ya se pidió con Seedance (lote 3, vídeos 3 y 4; el
-- del 4 salió bien) se quedan en Seedance: su desglose se escribió para Seedance y la tarjeta debe
-- decir con qué se hizo. La 0043 los había devuelto a «Automático».
UPDATE "videos" v SET "clip_model" = 'seedance_2_5', "updated_at" = now()
WHERE v."clip_model" = 'auto'
  AND v."owner_answers" @> '[{"key": "sys:modelo-bloqueado"}]'::jsonb
  AND EXISTS (SELECT 1 FROM "generations" g WHERE g."video_id" = v."id" AND g."kind" = 'clip' AND g."request"->>'model' = 'seedance_2_5');
