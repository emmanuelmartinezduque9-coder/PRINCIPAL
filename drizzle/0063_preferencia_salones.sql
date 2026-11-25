-- Aprendizaje (25/11/2026): el destilado diario unió «no uses fondos de salones repetidos» (lote 6), «cambia los fondos
-- en todos los vídeos» (lote 10) y la tarjeta del vídeo 41 («salón navideño») en «cambiar el fondo de cada vídeo por un
-- salón navideño distinto». Eso cambiaría tomas de otros sitios a un salón (regla fija: cada toma conserva su sitio) y
-- generaliza lo de un solo vídeo. Se deja lo que él pidió para el producto: salones distintos, sin cambiar el sitio.
UPDATE "learned_preferences" SET
  "directive" = 'Cuando una toma es en un salón, que cada vídeo del producto use un salón distinto, con aspecto de casa alemana real. No cambies el sitio de las tomas que no son en un salón.',
  "directive_en" = 'When a shot takes place in a living room, each video of this product uses a different living room that looks like a real German home. Never change the place of shots that are not in a living room.',
  "updated_at" = now()
WHERE "key" = 'fondos-salon:producto:2:desglose';
