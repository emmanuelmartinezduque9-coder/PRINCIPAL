-- «Mejoras» también aprende de los rótulos del montaje y del doblaje (24/11/2026, encargo de Emmanuel).
ALTER TABLE "learned_corrections" DROP CONSTRAINT "learned_corrections_stage_valid";--> statement-breakpoint
ALTER TABLE "edit_runs" ADD COLUMN "learned_corrections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "learned_corrections" ADD CONSTRAINT "learned_corrections_stage_valid" CHECK ("learned_corrections"."stage" in ('frame', 'clip', 'montaje', 'doblaje'));--> statement-breakpoint
-- Casos reales del 24/11/2026 sembrados como correcciones activas (se miden igual que las demás). El del lugar
-- (lote 7, vídeo 24, «in den USA») no: ya es la regla 6c de la lectura de la edición, con su reporte en Mejoras.
INSERT INTO "learned_corrections" ("key", "version", "stage", "problem_type", "directive", "note") VALUES
  ('semilla-marcas-rotulos', 1, 'montaje', 'rotulos', 'Ningún rótulo puede nombrar marcas, personajes, películas o franquicias de terceros (p. ej. Harry Potter): sustitúyelos por una descripción genérica o por nuestro producto.', 'Rótulos con marcas de terceros (Harry Potter) copiados de la referencia.'),
  ('semilla-habla-canto', 1, 'doblaje', 'audio', 'Una frase dicha por una persona sobre la música (comentario, pregunta, exclamación, reacción) es HABLA aunque salga de la pista de música o suene rítmica; marca CANTO solo si reconoces la letra de una canción concreta.', 'Lote 6, vídeo 22: quedó sin doblar porque el diálogo se tomó por una canción.')
ON CONFLICT ("key", "version") DO NOTHING;
