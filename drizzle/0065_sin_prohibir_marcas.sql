-- Regla fija de Emmanuel (25/11/2026): en marketing orgánico se permite nombrar y mostrar marcas, tiendas, películas y
-- personajes de terceros; nunca se quitan. La corrección sembrada en 0056 los prohibía en los rótulos: se retira.
UPDATE "learned_corrections" SET "status" = 'retirada', "retired_at" = now()
WHERE "key" = 'semilla-marcas-rotulos' AND "status" = 'activa';
